import { useEffect, useRef } from "react";
import { init, dispose, registerOverlay, type Chart } from "klinecharts";
import { useAppStore } from "@/store";
import { getKLineStyles, dateToTimestamp } from "@/app/theme/chart-theme";
import type { CandlePoint } from "@/shared/types";
import type { PatternSignal, DrawdownMarker } from "@/services";
import type { SupportLevel, ResistanceLevel } from "@/services/stock.service";

interface KlineChartProps {
  points: CandlePoint[];
  /** 固定高度（px）。不传则自适应父容器高度 */
  height?: number;
  showVolume?: boolean;
  /** HH 信号标记 (H1, H2, H3...) */
  signals?: PatternSignal[];
  /** 回撤幅度标记 */
  drawdowns?: DrawdownMarker[];
  supports?: SupportLevel[];
  resistances?: ResistanceLevel[];
}

function toTs(v: string): number {
  return dateToTimestamp(v);
}

let registeredCustomOverlay = false;

function ensureCustomOverlays() {
  if (registeredCustomOverlay) return;
  registeredCustomOverlay = true;
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
        type: "text",
        attrs: {
          x: bounding.width,
          y: point.y,
          text: data.text,
          align: "right",
          baseline: "middle",
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
          type: "polygon",
          attrs: {
            coordinates: [
              { x: point.x, y: arrowTipY },
              { x: point.x - 5, y: arrowBaseY },
              { x: point.x + 5, y: arrowBaseY },
            ],
          },
          styles: {
            style: "stroke_fill",
            color: "#f59e0b",
            borderColor: "#f59e0b",
            borderSize: 1,
          },
          ignoreEvent: true,
        },
        {
          type: "text",
          attrs: {
            x: point.x,
            y: labelY,
            text,
            align: "center",
            baseline: "bottom",
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
          type: "circle",
          attrs: { x: point.x, y: point.y + 10, r: 4 },
          styles: {
            style: "stroke_fill",
            color: "#ef4444",
            borderColor: "#ef4444",
            borderSize: 1,
          },
          ignoreEvent: true,
        },
        {
          type: "text",
          attrs: {
            x: point.x,
            y: point.y + 20,
            text,
            align: "center",
            baseline: "top",
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

export function KlineChart({ points, height, showVolume = true, signals, drawdowns, supports, resistances }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  useEffect(() => {
    ensureCustomOverlays();

    const el = containerRef.current;
    if (!el) return;

    // 初始化 klinechart
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
    if (showVolume) {
      const volH = height ? Math.round(height * 0.2) : 48;
      chart.createIndicator("VOL", false, { id: "pane_vol", height: volH });
    }

    // 转换并填充数据
    const validPoints = points.filter(
      (p) => p.open > 0 && p.high > 0 && p.low > 0 && p.close > 0 && isFinite(p.open)
    );

    const klineData = validPoints.map((p) => ({
      timestamp: toTs(p.time),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      turnover: p.amount ?? 0,
    }));

    loadChartData(chart, "chart", klineData);

    if (supports && supports.length > 0) {
      for (const sup of supports) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: sup.price }],
          styles: {
            line: { color: "#22c55e", size: 1, style: "dashed" as const },
          },
          lock: true,
        });
        chart.createOverlay({
          name: "levelTag",
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

    if (resistances && resistances.length > 0) {
      for (const res of resistances) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: res.price }],
          styles: {
            line: { color: "#ef4444", size: 1, style: "solid" as const },
          },
          lock: true,
        });
        chart.createOverlay({
          name: "levelTag",
          points: [{ value: res.price }],
          extendData: {
            text: `压力 x${res.count}`,
            color: "#dc2626",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            borderColor: "rgba(239, 68, 68, 0.35)",
          },
          lock: true,
        });
      }
    }

    // ── 添加信号标注 (overlay annotations) ──
    if (signals && signals.length > 0) {
      for (const s of signals) {
        if (!s.date) continue;
        const ts = toTs(s.date);
        if (!ts) continue;

        const isBuy = !!s.buySignal;
        const text = isBuy ? `${s.type}★` : s.type;

        chart.createOverlay({
          name: "hhMarker",
          points: [{ timestamp: ts, value: s.price }],
          extendData: text,
          lock: true,
        });
      }
    }

    // ── 添加回撤标注 ──
    if (drawdowns && drawdowns.length > 0) {
      for (const dd of drawdowns) {
        if (!dd.date) continue;
        const ts = toTs(dd.date);
        if (!ts) continue;

        chart.createOverlay({
          name: "drawdownMarker",
          points: [{ timestamp: ts, value: dd.price }],
          extendData: `${dd.pct > 0 ? "+" : ""}${dd.pct.toFixed(1)}%`,
          lock: true,
        });
      }
    }

    return () => {
      observer.disconnect();
      dispose(el);
      chartRef.current = null;
    };
  }, [points, height, showVolume, isDark, signals, drawdowns, supports, resistances]);

  return <div ref={containerRef} className="w-full" style={height ? { height } : { height: "100%" }} />;
}
