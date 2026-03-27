import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart } from "lightweight-charts";
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
  const priceChartRef = useRef(null);
  const lowerChartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const rsSeriesRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    if (!priceContainerRef.current || !lowerContainerRef.current) return undefined;

    const priceChart = createChart(priceContainerRef.current, createBaseOptions());
    const lowerChart = createChart(lowerContainerRef.current, createBaseOptions());

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
      priceScaleId: "left",
    });

    lowerChart.priceScale("left").applyOptions({
      visible: true,
      borderColor: "#eceff3",
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });

    let lock = false;
    priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (lock || !range || !lowerChartRef.current) return;
      lock = true;
      lowerChartRef.current.timeScale().setVisibleLogicalRange(range);
      lock = false;
    });
    lowerChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (lock || !range || !priceChartRef.current) return;
      lock = true;
      priceChartRef.current.timeScale().setVisibleLogicalRange(range);
      lock = false;
    });

    priceChartRef.current = priceChart;
    lowerChartRef.current = lowerChart;

    return () => {
      priceChart.remove();
      lowerChart.remove();
      priceChartRef.current = null;
      lowerChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!tsCode || !candleSeriesRef.current || !volumeSeriesRef.current || !rsSeriesRef.current) {
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

        const rs = (rsData?.spreadSeries || []).map((point) => ({
          time: toChartDate(point.time),
          value: point.value,
        }));

        candleSeriesRef.current.setData(candles);
        volumeSeriesRef.current.setData(volumes);
        rsSeriesRef.current.setData(rs);
        priceChartRef.current?.timeScale().fitContent();
        lowerChartRef.current?.timeScale().fitContent();
        setLoading(false);
      } catch (loadError) {
        if (!active) return;
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        rsSeriesRef.current?.setData([]);
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
      <div className="watch-chart-header terminal-section-head">
        <div>
          <h3>{stockName || tsCode || "价格图"}</h3>
          <p>主图显示日线 K 线，副图叠加成交额与 RPS 强弱曲线</p>
        </div>
      </div>

      <div className={`watch-chart-stack ${showTools ? "" : "chart-plain"}`}>
        <div className="watch-chart-main-shell">
          {showTools && (
            <aside className="watch-chart-tools" aria-label="图表画线工具">
              {["＋", "/", "∕", "—", "|", "~", "T"].map((icon) => (
                <button key={icon} type="button" className="watch-chart-tool">
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
      </div>
    </section>
  );
}
