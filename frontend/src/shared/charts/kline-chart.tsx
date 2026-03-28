import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi } from "lightweight-charts";
import { useAppStore } from "@/store";
import { getChartTheme, candleColors } from "@/app/theme/chart-theme";
import type { CandlePoint } from "@/shared/types";
import { formatDate } from "@/shared/utils/format";

interface KlineChartProps {
  points: CandlePoint[];
  height?: number;
  showVolume?: boolean;
}

export function KlineChart({ points, height = 300, showVolume = true }: KlineChartProps) {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: candleColors.up,
      downColor: candleColors.down,
      wickUpColor: candleColors.upWick,
      wickDownColor: candleColors.downWick,
      borderVisible: false,
    });

    const validPoints = points.filter(
      (p) => p.open > 0 && p.high > 0 && p.low > 0 && p.close > 0 && isFinite(p.open)
    );

    candleSeries.setData(
      validPoints.map((p) => ({
        time: formatDate(p.time),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      }))
    );

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
          color: p.close >= p.open ? `${candleColors.up}80` : `${candleColors.down}80`,
        }))
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, height, showVolume, theme]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
