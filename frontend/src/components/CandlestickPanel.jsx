import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, createChart } from "lightweight-charts";
import { getSectorChart, getStockChart } from "../lib/api";

function toChartDate(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export default function CandlestickPanel({ kind, code, label, title, bars = 120, emptyText }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: "" });

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#5b6472",
        fontFamily: '"IBM Plex Sans", "Segoe UI", "PingFang SC", sans-serif',
      },
      grid: {
        vertLines: { color: "#eef0f3" },
        horzLines: { color: "#eef0f3" },
      },
      rightPriceScale: { borderColor: "#d9dce1" },
      timeScale: { borderColor: "#d9dce1", timeVisible: false },
      crosshair: {
        vertLine: { color: "#98a2b3", width: 1, style: 2 },
        horzLine: { color: "#98a2b3", width: 1, style: 2 },
      },
      width: containerRef.current.clientWidth,
      height: 248,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#d92d20",
      downColor: "#067647",
      wickUpColor: "#d92d20",
      wickDownColor: "#067647",
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({ width: entry.contentRect.width });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!code) {
        setState({ loading: false, error: "" });
        if (seriesRef.current) seriesRef.current.setData([]);
        return;
      }

      setState({ loading: true, error: "" });
      try {
        const data = kind === "sector" ? await getSectorChart(code, bars) : await getStockChart(code, bars);
        if (!active || !seriesRef.current || !chartRef.current) return;
        const points = (data.points || []).map((point) => ({
          time: toChartDate(point.time),
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
        }));
        seriesRef.current.setData(points);
        chartRef.current.timeScale().fitContent();
        setState({ loading: false, error: points.length ? "" : "暂无数据" });
      } catch (error) {
        if (!active) return;
        if (seriesRef.current) seriesRef.current.setData([]);
        setState({ loading: false, error: error.message || "加载失败" });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [bars, code, kind]);

  return (
    <section className="analysis-card chart-card">
      <div className="analysis-card-head">
        <div>
          <h3>{title}</h3>
          <p>{label || code || emptyText}</p>
        </div>
      </div>
      <div className="chart-shell" ref={containerRef}>
        {!code && <div className="chart-overlay">{emptyText}</div>}
        {code && state.loading && <div className="chart-overlay">图表加载中...</div>}
        {code && !state.loading && state.error && <div className="chart-overlay error">{state.error}</div>}
      </div>
    </section>
  );
}
