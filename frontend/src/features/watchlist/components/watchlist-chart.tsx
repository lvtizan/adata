import { useEffect, useLayoutEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import { useStockChart, useRelativeStrength } from "@/queries";
import { getChartTheme, candleColors } from "@/app/theme/chart-theme";
import { useAppStore } from "@/store";

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
}

function toChartDate(value: string): string {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function WatchlistChart({ tsCode, sectorCode, stockName }: WatchlistChartProps) {
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  const priceRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const rpsRef = useRef<HTMLDivElement>(null);

  const priceChartRef = useRef<IChartApi | null>(null);
  const lowerChartRef = useRef<IChartApi | null>(null);
  const rpsChartRef = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const rsSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const stockRpsSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const sectorRpsSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const { data: stockData, isLoading: stockLoading, error: stockError } = useStockChart(tsCode);
  const { data: rsData, isLoading: rsLoading } = useRelativeStrength(tsCode, sectorCode);

  const loading = stockLoading || rsLoading;
  const error = stockError ? (stockError as Error).message : "";

  // Create charts
  useLayoutEffect(() => {
    if (!priceRef.current || !lowerRef.current || !rpsRef.current) return;

    const baseOpts = {
      autoSize: true,
      ...getChartTheme(isDark),
      rightPriceScale: {
        borderColor: isDark ? "#2a2e3a" : "#e8eaee",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: { borderColor: isDark ? "#2a2e3a" : "#e8eaee", timeVisible: false },
    };

    const priceChart = createChart(priceRef.current, baseOpts);
    const lowerChart = createChart(lowerRef.current, baseOpts);
    const rpsChart = createChart(rpsRef.current, baseOpts);

    candleSeriesRef.current = priceChart.addSeries(CandlestickSeries, {
      upColor: candleColors.up,
      downColor: candleColors.down,
      wickUpColor: candleColors.upWick,
      wickDownColor: candleColors.downWick,
      borderUpColor: candleColors.up,
      borderDownColor: candleColors.down,
    });

    volumeSeriesRef.current = lowerChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });

    rsSeriesRef.current = lowerChart.addSeries(LineSeries, {
      color: isDark ? "#d1d5db" : "#111827",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "",
    });

    lowerChart.priceScale("").applyOptions({
      visible: false,
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });

    stockRpsSeriesRef.current = rpsChart.addSeries(LineSeries, {
      color: "#f23645",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: "rps",
      title: "个股RPS",
    });

    sectorRpsSeriesRef.current = rpsChart.addSeries(LineSeries, {
      color: "#2962ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: "rps",
      title: "板块RPS",
    });

    rpsChart.priceScale("rps").applyOptions({
      visible: true,
      borderColor: isDark ? "#2a2e3a" : "#e8eaee",
      scaleMargins: { top: 0.08, bottom: 0.12 },
    });

    // Sync time ranges across all 3 charts
    let lock = false;
    const syncCharts = (source: IChartApi, targets: IChartApi[]) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (lock || !range) return;
        lock = true;
        targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range));
        lock = false;
      });
    };

    syncCharts(priceChart, [lowerChart, rpsChart]);
    syncCharts(lowerChart, [priceChart, rpsChart]);
    syncCharts(rpsChart, [priceChart, lowerChart]);

    priceChartRef.current = priceChart;
    lowerChartRef.current = lowerChart;
    rpsChartRef.current = rpsChart;

    return () => {
      priceChart.remove();
      lowerChart.remove();
      rpsChart.remove();
      priceChartRef.current = null;
      lowerChartRef.current = null;
      rpsChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsSeriesRef.current = null;
      stockRpsSeriesRef.current = null;
      sectorRpsSeriesRef.current = null;
    };
  }, [isDark]);

  // Update data when it arrives
  useEffect(() => {
    if (!candleSeriesRef.current || !stockData) return;

    const points = (stockData.points || []).filter(
      (p) => [p.open, p.high, p.low, p.close].every((v) => Number.isFinite(v) && v > 0)
    );

    const candles = points.map((p) => ({
      time: toChartDate(p.time),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    const volumes = points.map((p) => ({
      time: toChartDate(p.time),
      value: p.amount != null && Number.isFinite(p.amount) ? p.amount : p.volume,
      color:
        p.close >= p.open
          ? "rgba(242, 54, 69, 0.42)"
          : "rgba(41, 98, 255, 0.42)",
    }));

    const candleTimes = new Set(candles.map((c) => c.time));

    const spreadSeries = (rsData?.spreadSeries || [])
      .filter((p) => candleTimes.has(toChartDate(p.time)))
      .map((p) => ({ time: toChartDate(p.time), value: p.value }));

    const stockRps = (rsData?.stock?.rpsSeries || [])
      .filter((p) => candleTimes.has(toChartDate(p.time)))
      .map((p) => ({ time: toChartDate(p.time), value: p.value }));

    const sectorRps = (rsData?.sector?.rpsSeries || [])
      .filter((p) => candleTimes.has(toChartDate(p.time)))
      .map((p) => ({ time: toChartDate(p.time), value: p.value }));

    candleSeriesRef.current?.setData(candles);
    volumeSeriesRef.current?.setData(volumes);
    rsSeriesRef.current?.setData(spreadSeries);
    stockRpsSeriesRef.current?.setData(stockRps);
    sectorRpsSeriesRef.current?.setData(sectorRps);

    priceChartRef.current?.timeScale().fitContent();
    lowerChartRef.current?.timeScale().fitContent();
    rpsChartRef.current?.timeScale().fitContent();
  }, [stockData, rsData]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative" style={{ height: 420 }}>
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
        <div ref={priceRef} className="w-full h-full" />
      </div>

      <div className="relative" style={{ height: 168 }}>
        <div ref={lowerRef} className="w-full h-full" />
      </div>

      <div className="relative" style={{ height: 168 }}>
        <div ref={rpsRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 text-xs text-text-secondary border-t border-border-subtle">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f23645" }} />
          {stockName || "个股"} RPS
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#2962ff" }} />
          板块 RPS
        </span>
      </div>
    </div>
  );
}
