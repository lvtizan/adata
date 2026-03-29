import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, type IChartApi } from "lightweight-charts";
import { useAppStore } from "@/store";
import { getChartTheme, getCandleColors } from "@/app/theme/chart-theme";
import type { CandlePoint } from "@/shared/types";
import { formatDate } from "@/shared/utils/format";
import type { PatternSignal, DrawdownMarker } from "@/services";

interface KlineChartProps {
  points: CandlePoint[];
  height?: number;
  showVolume?: boolean;
  /** HH 信号标记 (H1, H2, H3...) */
  signals?: PatternSignal[];
  /** 回撤幅度标记 */
  drawdowns?: DrawdownMarker[];
}

function toChartDate(value: string): string {
  if (!value) return "";
  if (value.includes("-")) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function KlineChart({ points, height = 300, showVolume = true, signals, drawdowns }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(theme === "dark"),
      width: containerRef.current.clientWidth,
      height,
      autoSize: true,
    });

    const isDark = theme === "dark";
    const cc = getCandleColors(isDark);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: cc.up,
      downColor: cc.down,
      wickUpColor: cc.upWick,
      wickDownColor: cc.downWick,
      borderUpColor: cc.upBorder,
      borderDownColor: cc.downBorder,
    });

    const validPoints = points.filter(
      (p) => p.open > 0 && p.high > 0 && p.low > 0 && p.close > 0 && isFinite(p.open)
    );

    const candles = validPoints.map((p) => ({
      time: formatDate(p.time),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    candleSeries.setData(candles);

    // ── H1/H2/H3 信号标记 + 回撤幅度 ──
    const candleTimes = new Set(candles.map((c) => c.time));
    const allMarkers: Array<{
      time: string;
      position: "aboveBar" | "belowBar";
      color: string;
      shape: "arrowUp" | "arrowDown" | "circle";
      text: string;
      size?: number;
    }> = [];

    if (signals && signals.length > 0) {
      for (const s of signals) {
        if (!s.date) continue;
        const t = toChartDate(s.date);
        if (!candleTimes.has(t)) continue;
        const isH1 = s.type === "H1";
        const isBuy = !!s.buySignal;
        allMarkers.push({
          time: t,
          position: "aboveBar",
          color: isBuy ? "#22c55e" : isH1 ? "#6b7280" : "#f59e0b",
          shape: "arrowUp",
          text: isBuy ? `${s.type}★` : s.type,
        });
      }
    }

    if (drawdowns && drawdowns.length > 0) {
      for (const dd of drawdowns) {
        if (!dd.date) continue;
        const t = toChartDate(dd.date);
        if (!candleTimes.has(t)) continue;
        allMarkers.push({
          time: t,
          position: "belowBar",
          color: "#ef4444",
          shape: "circle",
          size: 0.5,
          text: `${dd.pct > 0 ? "+" : ""}${dd.pct.toFixed(1)}%`,
        });
      }
    }

    allMarkers.sort((a, b) => (a.time < b.time ? -1 : 1));
    if (allMarkers.length > 0) {
      createSeriesMarkers(candleSeries, allMarkers);
    }

    if (showVolume && validPoints.some((p) => p.volume > 0)) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(
        validPoints.map((p) => ({
          time: formatDate(p.time),
          value: p.volume,
          color: p.close >= p.open
            ? (isDark ? "rgba(209,212,220,0.35)" : "rgba(26,26,26,0.18)")
            : (isDark ? "rgba(209,212,220,0.55)" : "rgba(26,26,26,0.45)"),
        }))
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, height, showVolume, theme, signals, drawdowns]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
