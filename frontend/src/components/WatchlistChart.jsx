import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
} from "lightweight-charts";
import { getRelativeStrength, getStockChart } from "../lib/api";

function toChartDate(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function createBaseOptions() {
  return {
    autoSize: true,
    layout: {
      background: { color: "#ffffff" },
      textColor: "#6b7280",
      fontFamily: '"IBM Plex Sans", "Segoe UI", "PingFang SC", sans-serif',
    },
    grid: {
      vertLines: { color: "#f3f4f6" },
      horzLines: { color: "#f3f4f6" },
    },
    rightPriceScale: {
      borderColor: "#eceff3",
      scaleMargins: { top: 0.08, bottom: 0.12 },
    },
    timeScale: { borderColor: "#eceff3", timeVisible: false },
    crosshair: {
      vertLine: { color: "#9ca3af", width: 1, style: 2 },
      horzLine: { color: "#9ca3af", width: 1, style: 2 },
    },
  };
}

export default function WatchlistChart({ tsCode, sectorCode, stockName, showTools = true }) {
  const priceContainerRef = useRef(null);
  const lowerContainerRef = useRef(null);
  const rpsContainerRef = useRef(null);
  const priceChartRef = useRef(null);
  const lowerChartRef = useRef(null);
  const rpsChartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const rsSeriesRef = useRef(null);
  const stockRpsSeriesRef = useRef(null);
  const sectorRpsSeriesRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    if (!priceContainerRef.current || !lowerContainerRef.current || !rpsContainerRef.current) return undefined;

    const priceChart = createChart(priceContainerRef.current, createBaseOptions());
    const lowerChart = createChart(lowerContainerRef.current, createBaseOptions());
    const rpsChart = createChart(rpsContainerRef.current, createBaseOptions());

    candleSeriesRef.current = priceChart.addSeries(CandlestickSeries, {
      upColor: "#f23645",
      downColor: "#2962ff",
      wickUpColor: "#f23645",
      wickDownColor: "#2962ff",
      borderUpColor: "#f23645",
      borderDownColor: "#2962ff",
    });

    volumeSeriesRef.current = lowerChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });

    rsSeriesRef.current = lowerChart.addSeries(LineSeries, {
      color: "#111827",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "",
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
      borderColor: "#eceff3",
      scaleMargins: { top: 0.08, bottom: 0.12 },
    });

    lowerChart.priceScale("").applyOptions({
      visible: false,
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });

    let lock = false;
    const syncCharts = (source, targets) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (lock || !range) return;
        lock = true;
        targets.forEach(t => t.timeScale().setVisibleLogicalRange(range));
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
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!tsCode || !candleSeriesRef.current) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [stockData, rsData] = await Promise.all([
          getStockChart(tsCode, 120),
          sectorCode ? getRelativeStrength(tsCode, sectorCode) : Promise.resolve(null),
        ]);

        if (!active) return;

        const points = (stockData?.points || []).filter((point) =>
          [point.open, point.high, point.low, point.close].every((value) => Number.isFinite(value) && value > 0),
        );

        const candles = points.map((point) => ({
          time: toChartDate(point.time),
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
        }));

        const volumes = points.map((point) => ({
          time: toChartDate(point.time),
          value: Number.isFinite(point.amount) ? point.amount : point.volume,
          color: point.close >= point.open ? "rgba(242, 54, 69, 0.42)" : "rgba(41, 98, 255, 0.42)",
        }));

        const candleTimes = new Set(candles.map(c => c.time));

        const rs = (rsData?.spreadSeries || [])
          .filter(point => candleTimes.has(toChartDate(point.time)))
          .map((point) => ({
            time: toChartDate(point.time),
            value: point.value,
          }));

        const stockRps = (rsData?.stock?.rpsSeries || [])
          .filter(point => candleTimes.has(toChartDate(point.time)))
          .map((point) => ({
            time: toChartDate(point.time),
            value: point.value,
          }));

        const sectorRps = (rsData?.sector?.rpsSeries || [])
          .filter(point => candleTimes.has(toChartDate(point.time)))
          .map((point) => ({
            time: toChartDate(point.time),
            value: point.value,
          }));

        candleSeriesRef.current.setData(candles);
        volumeSeriesRef.current.setData(volumes);
        rsSeriesRef.current.setData(rs);
        stockRpsSeriesRef.current.setData(stockRps);
        sectorRpsSeriesRef.current.setData(sectorRps);
        priceChartRef.current?.timeScale().fitContent();
        lowerChartRef.current?.timeScale().fitContent();
        rpsChartRef.current?.timeScale().fitContent();
        setLoading(false);
      } catch (loadError) {
        if (!active) return;
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        rsSeriesRef.current?.setData([]);
        stockRpsSeriesRef.current?.setData([]);
        sectorRpsSeriesRef.current?.setData([]);
        setLoading(false);
        setError(loadError.message || "加载失败");
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [tsCode, sectorCode]);

  return (
    <section className="watch-chart-terminal">
      <div className={`watch-chart-stack ${showTools ? "" : "chart-plain"}`}>
        <div className="watch-chart-main-shell">
          {showTools && (
            <aside className="watch-chart-tools" aria-label="图表工具">
              {["📏", "🗑"].map((icon) => (
                <button key={icon} type="button" className="watch-chart-tool" title={icon === "📏" ? "画线工具（开发中）" : "清除画线"}>
                  <span>{icon}</span>
                </button>
              ))}
            </aside>
          )}
          <div ref={priceContainerRef} className="watch-chart-pane watch-chart-pane-main">
            {loading && <div className="watch-chart-loading">加载中...</div>}
            {error && <div className="watch-chart-error">{error}</div>}
          </div>
        </div>

        <div ref={lowerContainerRef} className="watch-chart-pane watch-chart-pane-lower" />

        <div ref={rpsContainerRef} className="watch-chart-pane watch-chart-pane-lower" />
      </div>
    </section>
  );
}
