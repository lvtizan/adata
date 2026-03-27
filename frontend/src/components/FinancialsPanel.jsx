import { useEffect, useState } from "react";
import { getStockFinancials } from "../lib/api";

function fmtYi(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${(num / 1e8).toFixed(1)}亿`;
}

function fmtPct(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num > 0 ? "+" : ""}${num.toFixed(1)}%`;
}

function fmtPp(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num > 0 ? "+" : ""}${num.toFixed(1)}pp`;
}

function fmtQuarter(endDate) {
  if (!endDate) return "-";
  const str = String(endDate);
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const qMap = { "03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4" };
  return `${year}${qMap[month] || ""}`;
}

function tone(value) {
  if (value == null || value === "") return "";
  return Number(value) >= 0 ? "up" : "down";
}

export default function FinancialsPanel({ tsCode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tsCode) return;
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await getStockFinancials(tsCode);
        if (!active) return;
        setData(result);
      } catch (err) {
        if (!active) return;
        setError(err.message || "财务数据加载失败");
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [tsCode]);

  if (loading) {
    return <div className="financials-panel"><div className="financials-loading">财务数据加载中...</div></div>;
  }

  if (error) {
    return <div className="financials-panel"><div className="financials-error">{error}</div></div>;
  }

  if (!data) {
    return <div className="financials-panel"><div className="financials-empty">选择股票后显示财务数据</div></div>;
  }

  const quarters = Array.isArray(data.quarters) ? data.quarters : [];
  const latest = quarters[0] || {};
  const prev = quarters[1] || {};

  // Calculate period-over-period change for gross margin and ROE
  const grossMarginChange = (latest.grossMargin != null && prev.grossMargin != null)
    ? latest.grossMargin - prev.grossMargin : null;
  const roeChange = (latest.roe != null && prev.roe != null)
    ? latest.roe - prev.roe : null;

  return (
    <div className="financials-panel">
      {/* Top: 4 KPI cards */}
      <div className="fin-kpi-row">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">最新营收</span>
          <strong className="fin-kpi-value">{fmtYi(latest.revenue)}</strong>
          <span className={`fin-kpi-change ${tone(latest.revenueYoY)}`}>{fmtPct(latest.revenueYoY)} (同比)</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">最新净利</span>
          <strong className="fin-kpi-value">{fmtYi(latest.netIncome)}</strong>
          <span className={`fin-kpi-change ${tone(latest.netIncomeYoY)}`}>{fmtPct(latest.netIncomeYoY)} (同比)</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">毛利率</span>
          <strong className="fin-kpi-value">{latest.grossMargin != null ? `${Number(latest.grossMargin).toFixed(1)}%` : "-"}</strong>
          <span className={`fin-kpi-change ${tone(grossMarginChange)}`}>{fmtPp(grossMarginChange)} (环比)</span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">ROE</span>
          <strong className="fin-kpi-value">{latest.roe != null ? `${Number(latest.roe).toFixed(1)}%` : "-"}</strong>
          <span className={`fin-kpi-change ${tone(roeChange)}`}>{fmtPp(roeChange)} (环比)</span>
        </div>
      </div>

      {/* Bottom: quarterly table */}
      <div className="fin-table-wrap">
        <table className="market-table fin-table">
          <thead>
            <tr>
              <th>报告期</th>
              <th>营收</th>
              <th>同比</th>
              <th>净利润</th>
              <th>同比</th>
              <th>毛利率</th>
              <th>ROE</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q, i) => (
              <tr key={q.endDate || i}>
                <td className="mono">{fmtQuarter(q.endDate)}</td>
                <td>{fmtYi(q.revenue)}</td>
                <td className={tone(q.revenueYoY)}>{fmtPct(q.revenueYoY)}</td>
                <td>{fmtYi(q.netIncome)}</td>
                <td className={tone(q.netIncomeYoY)}>{fmtPct(q.netIncomeYoY)}</td>
                <td>{q.grossMargin != null ? `${Number(q.grossMargin).toFixed(1)}%` : "-"}</td>
                <td>{q.roe != null ? `${Number(q.roe).toFixed(1)}%` : "-"}</td>
              </tr>
            ))}
            {!quarters.length && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#6b7280" }}>暂无财务数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
