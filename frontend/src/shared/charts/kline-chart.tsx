import { useEffect, useRef, useCallback } from "react";
import { init, dispose, registerOverlay, type Chart } from "klinecharts";
import { useAppStore } from "@/store";
import { getKLineStyles, dateToTimestamp } from "@/app/theme/chart-theme";
import type { CandlePoint, FengSignals, ChartDrawingOverlay } from "@/shared/types";
import type { PatternSignal, DrawdownMarker } from "@/services";
import type { SupportLevel, ResistanceLevel } from "@/services/stock.service";

interface KlineChartProps {
  points: CandlePoint[];
  height?: number;
  showVolume?: boolean;
  signals?: PatternSignal[];
  drawdowns?: DrawdownMarker[];
  supports?: SupportLevel[];
  resistances?: ResistanceLevel[];
  fengSignals?: FengSignals;
  /** 画线工具相关 */
  enableDrawing?: boolean;
  activeTool?: string | null;
  initialDrawings?: ChartDrawingOverlay[];
  onDrawingsChange?: (overlays: ChartDrawingOverlay[]) => void;
  /** 暴露 chart 实例给父组件 */
  chartRef?: React.MutableRefObject<Chart | null>;
}

function toTs(v: string): number {
  return dateToTimestamp(v);
}

// ── 全局注册自定义 overlay（只注册一次）──
let _registered = false;

function ensureOverlays() {
  if (_registered) return;
  _registered = true;

  // 支撑/压力/止损/止盈 标签
  registerOverlay<{ text: string; color: string; backgroundColor: string; borderColor: string }>({
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
        type: "text",
        attrs: { x: bounding.width, y: point.y, text: data.text, align: "right", baseline: "middle" },
        styles: {
          backgroundColor: data.backgroundColor, borderColor: data.borderColor,
          borderSize: 1, borderRadius: 4, color: data.color,
          size: 10, weight: 600, paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
        },
        ignoreEvent: true,
      };
    },
  });

  // H1 箭头
  registerOverlay({
    name: "hhMarker",
    needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "";
      return [
        { type: "polygon", attrs: { coordinates: [{ x: point.x, y: point.y - 18 }, { x: point.x - 5, y: point.y - 8 }, { x: point.x + 5, y: point.y - 8 }] }, styles: { style: "stroke_fill" as const, color: "#f59e0b", borderColor: "#f59e0b", borderSize: 1 }, ignoreEvent: true },
        { type: "text", attrs: { x: point.x, y: point.y - 24, text, align: "center", baseline: "bottom" }, styles: { color: "#f59e0b", size: 10, weight: 700 }, ignoreEvent: true },
      ];
    },
  });

  // 回撤红点
  registerOverlay({
    name: "drawdownMarker",
    needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "";
      return [
        { type: "circle", attrs: { x: point.x, y: point.y + 10, r: 4 }, styles: { style: "stroke_fill" as const, color: "#ef4444", borderColor: "#ef4444", borderSize: 1 }, ignoreEvent: true },
        { type: "text", attrs: { x: point.x, y: point.y + 20, text, align: "center", baseline: "top" }, styles: { color: "#ef4444", size: 10, weight: 600 }, ignoreEvent: true },
      ];
    },
  });

  // 压力顶红圈
  registerOverlay({
    name: "resistanceCircle",
    needDefaultPointFigure: false, needDefaultXAxisMark: false, needDefaultYAxisMark: false,
    totalStep: 2,
    createPointFigures: ({ overlay }) => {
      const p = overlay.points?.[0];
      if (!p || p.x == null || p.y == null) return [];
      return [{ type: "circle" as const, attrs: { x: p.x, y: p.y, r: 18 }, styles: { style: "stroke_fill" as const, color: "rgba(239,68,68,0.25)", borderColor: "rgba(239,68,68,0.5)", borderSize: 1.5 } }];
    },
  });

  // W底标记
  registerOverlay({
    name: "fengDoubleBottom",
    needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      return [{ type: "text", attrs: { x: point.x, y: point.y + 10, text: "W", align: "center" as const, baseline: "top" as const }, styles: { color: "#FF9800", size: 13, weight: 800 }, ignoreEvent: true }];
    },
  });

  // 左侧价格标签（贴左边缘）
  registerOverlay<{ text: string; color: string; bg: string }>({
    name: "leftTag",
    needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    totalStep: 1,
    createYAxisFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      const data = overlay.extendData;
      if (!point || !data || typeof data !== "object") return [];
      return {
        type: "text",
        attrs: { x: 4, y: point.y, text: data.text, align: "left" as const, baseline: "middle" as const },
        styles: {
          backgroundColor: data.bg, borderColor: data.bg,
          borderSize: 1, borderRadius: 3, color: data.color,
          size: 10, weight: 600, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2,
        },
        ignoreEvent: true,
      };
    },
  });
}

function loadChartData(chart: Chart, symbol: string, data: Array<{
  timestamp: number; open: number; high: number; low: number; close: number; volume?: number; turnover?: number;
}>) {
  chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
  chart.setPeriod({ type: "day", span: 1 });
  chart.setDataLoader({ getBars: ({ callback }) => { callback(data, false); } });
  chart.setOffsetRightDistance(0);
  chart.setRightMinVisibleBarCount(0);
  chart.scrollToRealTime();
}

const SYSTEM_GROUP = "__system__";

export function KlineChart({
  points, height, showVolume = true, signals, drawdowns, supports, resistances, fengSignals,
  enableDrawing, activeTool, initialDrawings, onDrawingsChange, chartRef: externalChartRef,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  // 暴露 chart 实例
  useEffect(() => {
    if (externalChartRef) externalChartRef.current = chartRef.current;
  });

  // 快照用户画线（排除系统overlay）
  const snapshotUserDrawings = useCallback((): ChartDrawingOverlay[] => {
    const chart = chartRef.current as any;
    if (!chart?.getOverlayById) return [];
    try {
      const all = chart.getOverlaysByType?.() ?? [];
      return all
        .filter((o: any) => o.groupId !== SYSTEM_GROUP && !o.lock)
        .map((o: any) => ({
          id: o.id, name: o.name, points: o.points, styles: o.styles, extendData: o.extendData,
        }));
    } catch { return []; }
  }, []);

  useEffect(() => {
    ensureOverlays();
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, { styles: getKLineStyles(isDark), locale: "zh-CN" });
    if (!chart) return;
    chartRef.current = chart;
    if (externalChartRef) externalChartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    if (showVolume) {
      chart.createIndicator("VOL", false, { id: "pane_vol", height: height ? Math.round(height * 0.2) : 48 });
    }

    // 填充K线数据
    const validPoints = points.filter((p) => p.open > 0 && p.high > 0 && p.low > 0 && p.close > 0 && isFinite(p.open));
    const klineData = validPoints.map((p) => ({
      timestamp: toTs(p.time), open: p.open, high: p.high, low: p.low, close: p.close,
      volume: p.volume, turnover: p.amount ?? 0,
    }));
    loadChartData(chart, "chart", klineData);

    // ── 系统overlay：支撑线（只画最接近当前价的一条）──
    if (supports?.length && validPoints.length) {
      const currentPrice = validPoints[validPoints.length - 1].close;
      const belowSupports = supports.filter((s) => s.price < currentPrice).sort((a, b) => b.price - a.price);
      const nearest = belowSupports[0];
      if (nearest) {
        chart.createOverlay({ name: "horizontalStraightLine", groupId: SYSTEM_GROUP, points: [{ value: nearest.price }], styles: { line: { color: "#22c55e", size: 1, style: "dashed" as const } }, lock: true });
        chart.createOverlay({ name: "levelTag", groupId: SYSTEM_GROUP, points: [{ value: nearest.price }], extendData: { text: `支撑 x${nearest.count}`, color: "#ffffff", backgroundColor: "rgba(34,197,94,0.85)", borderColor: "rgba(34,197,94,0.9)" }, lock: true });
      }
    }

    // ── 系统overlay：压力线（只画最接近当前价的一条）──
    if (resistances?.length && validPoints.length) {
      const currentPrice = validPoints[validPoints.length - 1].close;
      const aboveResistances = resistances.filter((r) => r.price > currentPrice).sort((a, b) => a.price - b.price);
      const nearest = aboveResistances[0];
      if (nearest) {
        chart.createOverlay({ name: "horizontalStraightLine", groupId: SYSTEM_GROUP, points: [{ value: nearest.price }], styles: { line: { color: "#ef4444", size: 1, style: "solid" as const } }, lock: true });
        chart.createOverlay({ name: "levelTag", groupId: SYSTEM_GROUP, points: [{ value: nearest.price }], extendData: { text: `压力 x${nearest.count}`, color: "#ffffff", backgroundColor: "rgba(239,68,68,0.85)", borderColor: "rgba(239,68,68,0.9)" }, lock: true });
      }
    }

    // ── 左峰突破线：刚被突破的前高（蓝色实线）──
    if (resistances?.length && validPoints.length) {
      const currentPrice = validPoints[validPoints.length - 1].close;
      // 找刚被突破的压力位（价格低于当前价 = 已突破）
      const broken = resistances.filter((r) => r.price < currentPrice && r.price > currentPrice * 0.9).sort((a, b) => b.price - a.price);
      const peakLine = broken[0];
      if (peakLine) {
        chart.createOverlay({ name: "horizontalStraightLine", groupId: SYSTEM_GROUP, points: [{ value: peakLine.price }], styles: { line: { color: "#3b82f6", size: 1.5, style: "solid" as const } }, lock: true });
        chart.createOverlay({ name: "levelTag", groupId: SYSTEM_GROUP, points: [{ value: peakLine.price }], extendData: { text: `突破前高`, color: "#ffffff", backgroundColor: "rgba(59,130,246,0.85)", borderColor: "rgba(59,130,246,0.9)" }, lock: true });
      }
    }

    // ── 回撤标注 ──
    if (drawdowns?.length) {
      for (const dd of drawdowns) {
        if (!dd.date) continue;
        chart.createOverlay({ name: "drawdownMarker", groupId: SYSTEM_GROUP, points: [{ timestamp: toTs(dd.date), value: dd.price }], extendData: `${dd.pct > 0 ? "+" : ""}${dd.pct.toFixed(1)}%`, lock: true });
      }
    }

    // ── 冯总信号：H1、H2 和 W ──
    if (fengSignals) {
      for (const s of fengSignals.signals ?? []) {
        const ts = toTs(s.date);
        if (!ts) continue;
        if (s.type === "h1") {
          chart.createOverlay({ name: "hhMarker", groupId: SYSTEM_GROUP, points: [{ timestamp: ts, value: s.price }], extendData: "H1", lock: true });
        } else if (s.type === "h2_w") {
          const hp = (s as any).highPrice ?? s.price;
          chart.createOverlay({ name: "hhMarker", groupId: SYSTEM_GROUP, points: [{ timestamp: ts, value: hp }], extendData: "H2", lock: true });
          chart.createOverlay({ name: "fengDoubleBottom", groupId: SYSTEM_GROUP, points: [{ timestamp: ts, value: s.price }], lock: true });
        }
      }
    }

    // ── 恢复用户画线 ──
    if (initialDrawings?.length) {
      for (const d of initialDrawings) {
        chart.createOverlay({ id: d.id, name: d.name, points: d.points as any, styles: d.styles as any, extendData: d.extendData });
      }
    }

    // ── 画线变更监听 ──
    if (enableDrawing && onDrawingsChange) {
      const saveTimer = { current: null as number | null };
      const debounceSave = () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          onDrawingsChange(snapshotUserDrawings());
        }, 500);
      };
      (chart as any).bindEvent?.("bindOverlay", debounceSave);
      (chart as any).bindEvent?.("bindOverlayEnd", debounceSave);
    }

    return () => {
      observer.disconnect();
      dispose(el);
      chartRef.current = null;
      if (externalChartRef) externalChartRef.current = null;
    };
  }, [points, height, showVolume, isDark, signals, drawdowns, supports, resistances, fengSignals, initialDrawings]);

  // ── 画线工具切换 ──
  useEffect(() => {
    const chart = chartRef.current as any;
    if (!chart?.createOverlay || !enableDrawing) return;
    if (activeTool) {
      chart.createOverlay({ id: `${activeTool}-${Date.now()}`, name: activeTool });
    }
  }, [activeTool, enableDrawing]);

  return <div ref={containerRef} className="w-full" style={height ? { height } : { height: "100%" }} />;
}
