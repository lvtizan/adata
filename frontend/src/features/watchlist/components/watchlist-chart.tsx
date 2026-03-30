import { useEffect, useRef, useCallback, useState } from "react";
import { init, dispose, registerOverlay, type Chart } from "klinecharts";
import { useStockChart, useRelativeStrength, useStockPatterns, useChartDrawings } from "@/queries";
import { getKLineStyles, dateToTimestamp } from "@/app/theme/chart-theme";
import { useAppStore } from "@/store";
import { clearLocalDrawings, readLocalDrawings, sanitizeOverlay, writeLocalDrawings } from "@/lib/chart-drawings";
import { clearChartDrawings, saveChartDrawings } from "@/services";
import type { ChartDrawingOverlay } from "@/shared/types";

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  activeTool?: string | null;
  onSelectionChange?: (selection: { id: string | null; locked: boolean; name: string | null }) => void;
  onDrawingsChange?: (overlays: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>) => void;
}

function toTs(v: string): number {
  return dateToTimestamp(v);
}

function loadChartData(chart: Chart, symbol: string, data: Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  turnover?: number;
}>) {
  chart.setSymbol({
    ticker: symbol,
    pricePrecision: 2,
    volumePrecision: 0,
  });
  chart.setPeriod({ type: "day", span: 1 });
  chart.setDataLoader({
    getBars: ({ callback }) => {
      callback(data, false);
    },
  });
  chart.setOffsetRightDistance(0);
  chart.setRightMinVisibleBarCount(0);
  chart.scrollToRealTime();
}

const SYSTEM_OVERLAY_GROUP = "__system__";
const USER_OVERLAY_GROUP = "__user__";

// ── 注册自定义 overlay：压力位红色圆圈 ──
let _circleRegistered = false;
function ensureOverlaysRegistered() {
  if (_circleRegistered) return;
  _circleRegistered = true;
  registerOverlay<{
    text: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }>({
    name: "levelTag",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createYAxisFigures: ({ overlay, coordinates, bounding }) => {
      const point = coordinates[0];
      const data = overlay.extendData;
      if (!point || !data || typeof data !== "object") return [];
      return {
        type: "text" as const,
        attrs: {
          x: bounding.width,
          y: point.y,
          text: data.text,
          align: "right" as const,
          baseline: "middle" as const,
        },
        styles: {
          backgroundColor: data.backgroundColor,
          borderColor: data.borderColor,
          borderSize: 1,
          borderRadius: 4,
          color: data.color,
          size: 10,
          weight: 600,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
        },
        ignoreEvent: true,
      };
    },
  });
  registerOverlay({
    name: "resistanceCircle",
    needDefaultPointFigure: false,
    needDefaultXAxisMark: false,
    needDefaultYAxisMark: false,
    totalStep: 2,
    createPointFigures: ({ overlay }) => {
      const points = overlay.points;
      if (!points || points.length === 0) return [];
      const p = points[0];
      if (p.x == null || p.y == null) return [];
      return [
        {
          type: "circle" as const,
          attrs: { x: p.x, y: p.y, r: 18 },
          styles: {
            style: "stroke_fill" as const,
            color: "rgba(239, 68, 68, 0.25)",
            borderColor: "rgba(239, 68, 68, 0.5)",
            borderSize: 1.5,
          },
        },
      ];
    },
  });
  registerOverlay({
    name: "hhMarker",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "";
      const arrowTipY = point.y - 18;
      const arrowBaseY = point.y - 8;
      const labelY = point.y - 24;
      return [
        {
          type: "polygon" as const,
          attrs: {
            coordinates: [
              { x: point.x, y: arrowTipY },
              { x: point.x - 5, y: arrowBaseY },
              { x: point.x + 5, y: arrowBaseY },
            ],
          },
          styles: {
            style: "stroke_fill" as const,
            color: "#f59e0b",
            borderColor: "#f59e0b",
            borderSize: 1,
          },
          ignoreEvent: true,
        },
        {
          type: "text" as const,
          attrs: {
            x: point.x,
            y: labelY,
            text,
            align: "center" as const,
            baseline: "bottom" as const,
          },
          styles: {
            color: "#f59e0b",
            size: 10,
            weight: 700,
          },
          ignoreEvent: true,
        },
      ];
    },
  });
  registerOverlay({
    name: "drawdownMarker",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "";
      return [
        {
          type: "circle" as const,
          attrs: { x: point.x, y: point.y + 10, r: 4 },
          styles: {
            style: "stroke_fill" as const,
            color: "#ef4444",
            borderColor: "#ef4444",
            borderSize: 1,
          },
          ignoreEvent: true,
        },
        {
          type: "text" as const,
          attrs: {
            x: point.x,
            y: point.y + 20,
            text,
            align: "center" as const,
            baseline: "top" as const,
          },
          styles: {
            color: "#ef4444",
            size: 10,
            weight: 600,
          },
          ignoreEvent: true,
        },
      ];
    },
  });
}

// ═══════════════════════════════════════
//  Canvas 画中画 — 纯 Canvas 绘制 RS 曲线
// ═══════════════════════════════════════

interface RsPipProps {
  rsData: any;
  stockName?: string;
  isDark: boolean;
  emptyReason?: string;
}

function RsPip({ rsData, stockName, isDark, emptyReason }: RsPipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = isDark ? "rgba(15,17,22,0.92)" : "rgba(255,255,255,0.94)";
    ctx.fillRect(0, 0, w, h);

    const stockPts: number[] = (rsData?.stock?.rpsSeries || []).map((p: any) => p.value);
    const sectorPts: number[] = (rsData?.sector?.rpsSeries || []).map((p: any) => p.value);
    const maxLen = Math.max(stockPts.length, sectorPts.length);

    if (maxLen < 2) {
      ctx.fillStyle = isDark ? "#4b5563" : "#9ca3af";
      ctx.font = "10px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(emptyReason || "RS 数据加载中...", w / 2, h / 2);
      return;
    }

    const allVals = [...stockPts, ...sectorPts].filter((v) => Number.isFinite(v));
    let minVal = Math.min(...allVals);
    let maxVal = Math.max(...allVals);
    if (maxVal - minVal < 5) {
      const mid = (maxVal + minVal) / 2;
      minVal = mid - 5;
      maxVal = mid + 5;
    }
    const pad = (maxVal - minVal) * 0.1;
    minVal -= pad;
    maxVal += pad;

    const plotTop = 22;
    const plotBottom = h - 22;
    const plotLeft = 6;
    const plotRight = w - 36;
    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;

    // 网格线
    ctx.strokeStyle = isDark ? "#1e2130" : "#f0f0f0";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = plotTop + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    // 右侧刻度
    ctx.fillStyle = isDark ? "#4b5563" : "#9ca3af";
    ctx.font = "9px SF Mono, Monaco, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = plotTop + (plotH / 4) * i;
      const val = maxVal - ((maxVal - minVal) / 4) * i;
      ctx.fillText(val.toFixed(0), w - 4, y + 3);
    }

    const drawLine = (pts: number[], color: string, lineWidth: number) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = plotLeft + (i / (maxLen - 1)) * plotW;
        const y = plotTop + ((maxVal - pts[i]) / (maxVal - minVal)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 末尾圆点
      const lastX = plotLeft + ((pts.length - 1) / (maxLen - 1)) * plotW;
      const lastY = plotTop + ((maxVal - pts[pts.length - 1]) / (maxVal - minVal)) * plotH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawLine(sectorPts, "#2962ff", 1.2);
    drawLine(stockPts, "#f23645", 1.5);

    // 标题
    ctx.font = "bold 9px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = isDark ? "#6b7280" : "#9ca3af";
    ctx.fillText("RS 相对强度", plotLeft, 13);

    // 最新值标注
    const drawLabel = (pts: number[], color: string, yOffset: number) => {
      if (pts.length === 0) return;
      const val = pts[pts.length - 1];
      const x = plotLeft + ((pts.length - 1) / (maxLen - 1)) * plotW + 6;
      const y = plotTop + ((maxVal - val) / (maxVal - minVal)) * plotH;
      ctx.fillStyle = color;
      ctx.font = "bold 10px SF Mono, Monaco, monospace";
      ctx.textAlign = "left";
      ctx.fillText(val.toFixed(1), Math.min(x, plotRight - 28), y + yOffset);
    };

    if (stockPts.length > 0 && sectorPts.length > 0) {
      const stockLast = stockPts[stockPts.length - 1];
      const sectorLast = sectorPts[sectorPts.length - 1];
      const diff = Math.abs(
        ((maxVal - stockLast) / (maxVal - minVal)) * plotH -
        ((maxVal - sectorLast) / (maxVal - minVal)) * plotH
      );
      if (diff < 14) {
        drawLabel(stockPts, "#f23645", stockLast > sectorLast ? -4 : 12);
        drawLabel(sectorPts, "#2962ff", sectorLast > stockLast ? -4 : 12);
      } else {
        drawLabel(stockPts, "#f23645", 3);
        drawLabel(sectorPts, "#2962ff", 3);
      }
    } else {
      drawLabel(stockPts, "#f23645", 3);
      drawLabel(sectorPts, "#2962ff", 3);
    }

    // 底部图例
    const legendY = h - 6;
    ctx.font = "9px -apple-system, sans-serif";
    ctx.fillStyle = "#f23645";
    ctx.beginPath();
    ctx.arc(plotLeft + 4, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? "#787b86" : "#9aa1ad";
    ctx.textAlign = "left";
    ctx.fillText(stockName || "个股", plotLeft + 10, legendY);

    const sectorLabelX = plotLeft + 10 + ctx.measureText(stockName || "个股").width + 12;
    ctx.fillStyle = "#2962ff";
    ctx.beginPath();
    ctx.arc(sectorLabelX, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? "#787b86" : "#9aa1ad";
    ctx.fillText("板块", sectorLabelX + 6, legendY);
  }, [rsData, stockName, isDark]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}


// ═══════════════════════════════════════
//  主图组件
// ═══════════════════════════════════════

export function WatchlistChart({ tsCode, sectorCode, stockName, activeTool, onSelectionChange, onDrawingsChange }: WatchlistChartProps) {
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const restoredSymbolRef = useRef<string | null>(null);
  const currentSymbolRef = useRef(tsCode);
  const selectedOverlayIdRef = useRef<string | null>(null);
  const selectedOverlayLockedRef = useRef(false);
  const [saveTick, setSaveTick] = useState(0);

  const { data: stockData, isLoading: stockLoading, error: stockError } = useStockChart(tsCode);
  const { data: rsData } = useRelativeStrength(tsCode, sectorCode);
  const { data: patternData } = useStockPatterns(tsCode);
  const { data: drawingsDoc } = useChartDrawings(tsCode, "stock", "1d");

  const loading = stockLoading;
  const error = stockError ? (stockError as Error).message : "";
  const rsReady = ((rsData?.stock?.rpsSeries?.length ?? 0) > 1) && ((rsData?.sector?.rpsSeries?.length ?? 0) > 1);
  const rsEmptyReason = !sectorCode ? "缺少板块映射" : rsReady ? "" : "RS 暂无数据";

  useEffect(() => {
    currentSymbolRef.current = tsCode;
    restoredSymbolRef.current = null;
    selectedOverlayIdRef.current = null;
    selectedOverlayLockedRef.current = false;
    onSelectionChange?.({ id: null, locked: false, name: null });
    onDrawingsChange?.([]);
  }, [tsCode, onSelectionChange, onDrawingsChange]);

  useEffect(() => { ensureOverlaysRegistered(); }, []);

  const updateSelection = useCallback((id: string | null, locked = false, name: string | null = null) => {
    selectedOverlayIdRef.current = id;
    selectedOverlayLockedRef.current = locked;
    onSelectionChange?.({ id, locked, name });
  }, [onSelectionChange]);

  const emitDrawingsChange = useCallback((overlays: ChartDrawingOverlay[]) => {
    onDrawingsChange?.(
      overlays.map((overlay) => ({
        id: overlay.id ?? `${overlay.name}-${Math.random()}`,
        name: overlay.name,
        lock: overlay.lock === true,
        points: Array.isArray(overlay.points) ? overlay.points.length : 0,
        label: typeof overlay.extendData === "string" && overlay.extendData ? overlay.extendData : undefined,
      }))
    );
  }, [onDrawingsChange]);

  const buildOverlayCallbacks = useCallback((overlay: Partial<ChartDrawingOverlay> = {}) => ({
    ...overlay,
    groupId: overlay.groupId ?? USER_OVERLAY_GROUP,
    onDrawEnd: () => {
      setSaveTick((n) => n + 1);
      return true;
    },
    onPressedMoveEnd: () => {
      setSaveTick((n) => n + 1);
      return true;
    },
    onRemoved: () => {
      if (selectedOverlayIdRef.current === overlay.id) updateSelection(null, false, null);
      setSaveTick((n) => n + 1);
      return true;
    },
    onSelected: () => {
      updateSelection(overlay.id ?? null, overlay.lock === true, overlay.name ?? null);
      return true;
    },
    onDeselected: () => {
      if (selectedOverlayIdRef.current === overlay.id) updateSelection(null, false, null);
      return true;
    },
  }), [updateSelection]);

  const snapshotOverlays = useCallback((): ChartDrawingOverlay[] => {
    const chart = chartRef.current as any;
    if (!chart?.getOverlays) return [];
    const raw = chart.getOverlays();
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: unknown) => sanitizeOverlay(item))
      .filter((item: ChartDrawingOverlay | null): item is ChartDrawingOverlay => item != null)
      .filter((item) => item.groupId !== SYSTEM_OVERLAY_GROUP);
  }, []);

  const persistOverlaysNow = useCallback(async (overlays: ChartDrawingOverlay[]) => {
    const symbol = currentSymbolRef.current;
    if (!symbol) return;
    emitDrawingsChange(overlays);
    writeLocalDrawings(symbol, "stock", "1d", overlays);
    try {
      if (overlays.length === 0) {
        await clearChartDrawings(symbol, "stock", "1d");
      } else {
        await saveChartDrawings(symbol, overlays, "stock", "1d");
      }
    } catch {
      // Keep local snapshot even if remote save fails.
    }
  }, [emitDrawingsChange]);

  const schedulePersist = useCallback(() => {
    if (restoringRef.current) return;
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const overlays = snapshotOverlays();
      void persistOverlaysNow(overlays);
    }, 250);
  }, [persistOverlaysNow, snapshotOverlays]);

  useEffect(() => {
    if (!saveTick) return;
    schedulePersist();
  }, [saveTick, schedulePersist]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, {
      styles: getKLineStyles(isDark),
      locale: "zh-CN",
    });
    if (!chart) return;
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(el);

    // 添加成交量子图
    chart.createIndicator("VOL", false, { id: "pane_vol" });

    // ── 填充 K 线数据 ──
    if (stockData) {
      const points = (stockData.points || []).filter(
        (p) => [p.open, p.high, p.low, p.close].every((v) => Number.isFinite(v) && v > 0)
      );

      const klineData = points.map((p) => ({
        timestamp: toTs(p.time),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.amount != null && Number.isFinite(p.amount) ? p.amount : p.volume,
        turnover: p.amount ?? 0,
      }));

      loadChartData(chart, tsCode, klineData);

      // ── 支撑位 — 绿色虚线 ──
      if (patternData?.supports) {
        for (const sup of patternData.supports) {
          chart.createOverlay({
            name: "horizontalStraightLine",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ value: sup.price }],
            styles: {
              line: { color: "#22c55e", size: 1, style: "dashed" as const },
            },
            lock: true,
          });
          chart.createOverlay({
            name: "levelTag",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ value: sup.price }],
            extendData: {
              text: `支撑 x${sup.count}`,
              color: "#16a34a",
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              borderColor: "rgba(34, 197, 94, 0.35)",
            },
            lock: true,
          });
        }
      }

      // ── 压力位 — 红色实线 ──
      if (patternData?.resistances) {
        for (const res of patternData.resistances) {
          chart.createOverlay({
            name: "horizontalStraightLine",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ value: res.price }],
            styles: {
              line: { color: "#ef4444", size: 1, style: "solid" as const },
            },
            lock: true,
          });
          chart.createOverlay({
            name: "levelTag",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ value: res.price }],
            extendData: {
              text: `压力 x${res.count}`,
              color: "#dc2626",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              borderColor: "rgba(239, 68, 68, 0.35)",
            },
            lock: true,
          });

          // 压力顶红圈
          if (res.touches) {
            for (const touch of res.touches) {
              if (!touch.date) continue;
              chart.createOverlay({
                name: "resistanceCircle",
                groupId: SYSTEM_OVERLAY_GROUP,
                points: [{ timestamp: toTs(touch.date), value: touch.price }],
                lock: true,
              });
            }
          }
        }
      }

      // ── HH 信号标注 ──
      if (patternData?.signals) {
        for (const s of patternData.signals) {
          if (!s.date) continue;
          const isBuy = !!s.buySignal;
          const text = isBuy ? `${s.type}★` : s.type;

          chart.createOverlay({
            name: "hhMarker",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ timestamp: toTs(s.date), value: s.price }],
            extendData: text,
            lock: true,
          });
        }
      }

      // ── 回撤标注 ──
      if (patternData?.drawdowns) {
        for (const dd of patternData.drawdowns) {
          if (!dd.date) continue;
          chart.createOverlay({
            name: "drawdownMarker",
            groupId: SYSTEM_OVERLAY_GROUP,
            points: [{ timestamp: toTs(dd.date), value: dd.price }],
            extendData: `${dd.pct > 0 ? "+" : ""}${dd.pct.toFixed(1)}%`,
            lock: true,
          });
        }
      }
    }

    return () => {
      observer.disconnect();
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      dispose(el);
      chartRef.current = null;
    };
  }, [tsCode, stockData, patternData, isDark]);

  useEffect(() => {
    const chart = chartRef.current as any;
    if (!chart?.createOverlay || !stockData) return;
    if (restoredSymbolRef.current === tsCode) return;

    const restore = async () => {
      restoringRef.current = true;
      try {
        const local = readLocalDrawings(tsCode, "stock", "1d");
        const remote = drawingsDoc?.overlays ?? [];
        const source = local.length > 0 ? local : remote;
        emitDrawingsChange(source);
        for (const raw of source) {
          const overlay = sanitizeOverlay(raw);
          if (!overlay) continue;
          chart.createOverlay(buildOverlayCallbacks(overlay));
        }
        restoredSymbolRef.current = tsCode;
      } finally {
        restoringRef.current = false;
      }
    };

    void restore();
  }, [tsCode, stockData, drawingsDoc, buildOverlayCallbacks, emitDrawingsChange]);

  useEffect(() => {
    const chart = chartRef.current as any;
    if (!chart?.createOverlay) return;

    if (activeTool) {
      chart.createOverlay(buildOverlayCallbacks({
        id: `${activeTool}-${Date.now()}`,
        name: activeTool,
      }));
    }
  }, [activeTool, buildOverlayCallbacks]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action: string; overlayId?: string; nextLocked?: boolean }>).detail;
      if (!detail || !chartRef.current || detail.action === "") return;
      const chart = chartRef.current as any;
      if (detail.action === "deleteSelected" && selectedOverlayIdRef.current && chart.removeOverlay) {
        chart.removeOverlay({ id: selectedOverlayIdRef.current });
        updateSelection(null, false, null);
        setSaveTick((n) => n + 1);
      }
      if (detail.action === "deleteById" && detail.overlayId && chart.removeOverlay) {
        chart.removeOverlay({ id: detail.overlayId });
        if (selectedOverlayIdRef.current === detail.overlayId) {
          updateSelection(null, false, null);
        }
        setSaveTick((n) => n + 1);
      }
      if (detail.action === "clearAll") {
        const overlays = snapshotOverlays();
        for (const overlay of overlays) {
          if (overlay.id && chart.removeOverlay) {
            chart.removeOverlay({ id: overlay.id });
          }
        }
        updateSelection(null, false, null);
        clearLocalDrawings(tsCode, "stock", "1d");
        void clearChartDrawings(tsCode, "stock", "1d");
        emitDrawingsChange([]);
        setSaveTick((n) => n + 1);
      }
      if (detail.action === "toggleLock" && selectedOverlayIdRef.current && chart.overrideOverlay) {
        const nextLocked = !selectedOverlayLockedRef.current;
        chart.overrideOverlay({ id: selectedOverlayIdRef.current, lock: nextLocked });
        updateSelection(selectedOverlayIdRef.current, nextLocked, snapshotOverlays().find((o) => o.id === selectedOverlayIdRef.current)?.name ?? null);
        setSaveTick((n) => n + 1);
      }
      if (detail.action === "toggleLockById" && detail.overlayId && chart.overrideOverlay) {
        chart.overrideOverlay({ id: detail.overlayId, lock: detail.nextLocked === true });
        if (selectedOverlayIdRef.current === detail.overlayId) {
          updateSelection(detail.overlayId, detail.nextLocked === true, snapshotOverlays().find((o) => o.id === detail.overlayId)?.name ?? null);
        }
        setSaveTick((n) => n + 1);
      }
      if (detail.action === "addSupportAtClose" || detail.action === "addResistanceAtClose" || detail.action === "addTagAtLatest") {
        const latest = stockData?.points?.[stockData.points.length - 1];
        if (!latest) return;
        if (detail.action === "addSupportAtClose") {
          chart.createOverlay(buildOverlayCallbacks({
            id: `support-${Date.now()}`,
            name: "horizontalStraightLine",
            styles: { line: { color: "#22c55e", size: 1, style: "dashed" as const } },
            points: [{ timestamp: toTs(latest.time), value: latest.close }],
            extendData: `支撑 ${latest.close.toFixed(2)}`,
          }));
        }
        if (detail.action === "addResistanceAtClose") {
          chart.createOverlay(buildOverlayCallbacks({
            id: `resistance-${Date.now()}`,
            name: "horizontalStraightLine",
            styles: { line: { color: "#ef4444", size: 1, style: "solid" as const } },
            points: [{ timestamp: toTs(latest.time), value: latest.close }],
            extendData: `阻力 ${latest.close.toFixed(2)}`,
          }));
        }
        if (detail.action === "addTagAtLatest") {
          chart.createOverlay(buildOverlayCallbacks({
            id: `tag-${Date.now()}`,
            name: "simpleTag",
            points: [{ timestamp: toTs(latest.time), value: latest.close }],
            extendData: `${latest.close.toFixed(2)}`,
          }));
        }
        setSaveTick((n) => n + 1);
      }
    };
    window.addEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
    return () => window.removeEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
  }, [snapshotOverlays, tsCode, updateSelection, emitDrawingsChange, stockData, buildOverlayCallbacks]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            加载中...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-state-up text-sm z-10 bg-canvas/80">
            {error}
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />

        <div
          className="absolute z-20 rounded overflow-hidden opacity-70 hover:opacity-100 transition-opacity"
          style={{
            top: 38,
            left: 8,
            width: 150,
            height: 88,
            border: `1px solid ${isDark ? "rgba(42,46,58,0.6)" : "rgba(215,220,228,0.6)"}`,
          }}
        >
          <RsPip rsData={rsData} stockName={stockName} isDark={isDark} emptyReason={rsEmptyReason} />
        </div>
      </div>
    </div>
  );
}
