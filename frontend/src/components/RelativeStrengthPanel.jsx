import { useEffect, useMemo, useRef, useState } from "react";
import { LineSeries, createChart } from "lightweight-charts";
import { getRelativeStrength } from "../lib/api";

function toChartDate(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function fmtSigned(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

export default function RelativeStrengthPanel({ tsCode, sectorCode, stockName, sectorName }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const stockSeriesRef = useRef(null);
  const sectorSeriesRef = useRef(null);
  const [payload, setPayload] = useState(null);
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
      width: containerRef.current.clientWidth,
      height: 220,
    });

    stockSeriesRef.current = chart.addSeries(LineSeries, { color: "#d92d20", lineWidth: 2 });
    sectorSeriesRef.current = chart.addSeries(LineSeries, { color: "#1d4ed8", lineWidth: 2 });
    chartRef.current = chart;

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
      stockSeriesRef.current = null;
      sectorSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!tsCode || !sectorCode) {
        setPayload(null);
        setState({ loading: false, error: "" });
        if (stockSeriesRef.current) stockSeriesRef.current.setData([]);
        if (sectorSeriesRef.current) sectorSeriesRef.current.setData([]);
        return;
      }

      setState({ loading: true, error: "" });
      try {
        const data = await getRelativeStrength(tsCode, sectorCode);
        if (!active || !stockSeriesRef.current || !sectorSeriesRef.current || !chartRef.current) return;

        const stockSeries = (data.stock?.rpsSeries || []).map((point) => ({
          time: toChartDate(point.time),
          value: point.value,
        }));
        const sectorSeries = (data.sector?.rpsSeries || []).map((point) => ({
          time: toChartDate(point.time),
          value: point.value,
        }));

        stockSeriesRef.current.setData(stockSeries);
        sectorSeriesRef.current.setData(sectorSeries);
        chartRef.current.timeScale().fitContent();
        setPayload(data);
        setState({ loading: false, error: stockSeries.length ? "" : "暂无数据" });
      } catch (error) {
        if (!active) return;
        if (stockSeriesRef.current) stockSeriesRef.current.setData([]);
        if (sectorSeriesRef.current) sectorSeriesRef.current.setData([]);
        setPayload(null);
        setState({ loading: false, error: error.message || "加载失败" });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [sectorCode, tsCode]);

  const summary = useMemo(() => payload?.summary || {}, [payload]);

  return (
    <section className="analysis-card chart-card">
      <div className="analysis-card-head">
        <div>
          <h3>强度对比</h3>
          <p>{tsCode && sectorCode ? `${stockName || tsCode} vs ${sectorName || sectorCode}` : "选择个股后显示"}</p>
        </div>
        <div className="rs-badges">
          <span className="rs-badge">5日 {fmtSigned(summary.relativeStrength5d)}</span>
          <span className="rs-badge">10日 {fmtSigned(summary.relativeStrength10d)}</span>
          <span className="rs-badge emphasis">{summary.label || "同步"}</span>
        </div>
      </div>
      <div className="chart-shell" ref={containerRef}>
        {!tsCode && <div className="chart-overlay">选择个股后显示强度对比</div>}
        {tsCode && state.loading && <div className="chart-overlay">对比加载中...</div>}
        {tsCode && !state.loading && state.error && <div className="chart-overlay error">{state.error}</div>}
      </div>
      <div className="chart-legend">
        <span><i className="legend-dot stock" />个股归一化</span>
        <span><i className="legend-dot sector" />板块归一化</span>
      </div>
    </section>
  );
}
