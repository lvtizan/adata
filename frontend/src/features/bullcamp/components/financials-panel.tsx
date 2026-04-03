import { useStockFinancials } from "@/queries";
import { fmtYi, fmtPct, fmtQuarter } from "@/shared/utils/format";
import { cn } from "@/lib/utils";

function fmtPp(a: number | null | undefined, b: number | null | undefined): string {
  if (a == null || b == null) return "-";
  const diff = a - b;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`;
}

/** 营收/净利趋势迷你柱状图 (SVG, 8 季度) */
function RevenueTrendChart({ quarters }: { quarters: Array<{ endDate: string; revenue: number | null; netIncome: number | null }> }) {
  // 倒序显示（从旧到新）
  const sorted = [...quarters].reverse();
  if (sorted.length === 0) return null;

  const W = 320;
  const H = 100;
  const pad = { top: 8, right: 4, bottom: 20, left: 4 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const revenues = sorted.map((q) => q.revenue ?? 0);
  const netIncomes = sorted.map((q) => q.netIncome ?? 0);
  const allVals = [...revenues, ...netIncomes];
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const barGroupW = plotW / sorted.length;
  const barW = barGroupW * 0.35;
  const gap = barGroupW * 0.06;

  const yScale = (v: number) => pad.top + plotH - ((v - minVal) / range) * plotH;
  const zeroY = yScale(0);

  return (
    <div className="mb-4">
      <div className="text-xs text-text-tertiary mb-1.5 flex items-center gap-3">
        <span>营收 / 净利趋势</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--color-accent, #3b82f6)" }} /> 营收</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--color-state-up, #22c55e)" }} /> 净利</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
        {/* zero line */}
        <line x1={pad.left} x2={W - pad.right} y1={zeroY} y2={zeroY} stroke="var(--color-border-default, #333)" strokeWidth={0.5} />
        {sorted.map((q, i) => {
          const x = pad.left + i * barGroupW;
          const revH = Math.abs(((q.revenue ?? 0) - 0) / range) * plotH;
          const revY = (q.revenue ?? 0) >= 0 ? zeroY - revH : zeroY;
          const niH = Math.abs(((q.netIncome ?? 0) - 0) / range) * plotH;
          const niY = (q.netIncome ?? 0) >= 0 ? zeroY - niH : zeroY;

          return (
            <g key={q.endDate}>
              <rect x={x + gap} y={revY} width={barW} height={Math.max(revH, 0.5)} rx={1} fill="var(--color-accent, #3b82f6)" opacity={0.85} />
              <rect x={x + barW + gap * 2} y={niY} width={barW} height={Math.max(niH, 0.5)} rx={1} fill="var(--color-state-up, #22c55e)" opacity={0.85} />
              <text x={x + barGroupW / 2} y={H - 4} textAnchor="middle" className="text-[8px] fill-text-tertiary">{fmtQuarter(q.endDate)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FinancialsPanel({ tsCode }: { tsCode: string }) {
  const { data, isLoading, error } = useStockFinancials(tsCode);

  if (!tsCode) return <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">选择个股后显示</div>;
  if (isLoading) return <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">财务数据加载中...</div>;
  if (error) return <div className="flex items-center justify-center h-48 text-state-up text-sm">{error.message}</div>;

  const quarters = data?.periods || [];
  if (!quarters.length) return <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">暂无财务数据</div>;

  const latest = quarters[0];
  const prev = quarters[1];

  const kpis = [
    { label: "营收", value: fmtYi(latest.revenue), change: latest.revenueYoY != null ? fmtPct(latest.revenueYoY) : "-", tone: latest.revenueYoY },
    { label: "净利", value: fmtYi(latest.netIncome), change: latest.netIncomeYoY != null ? fmtPct(latest.netIncomeYoY) : "-", tone: latest.netIncomeYoY },
    { label: "毛利率", value: latest.grossMargin != null ? `${latest.grossMargin.toFixed(1)}%` : "-", change: fmtPp(latest.grossMargin, prev?.grossMargin) },
    { label: "ROE", value: latest.roe != null ? `${latest.roe.toFixed(1)}%` : "-", change: fmtPp(latest.roe, prev?.roe) },
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-4 border border-border-default mb-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-3 py-2.5 border-r border-border-default last:border-r-0">
            <span className="block text-xs text-text-tertiary mb-1">{kpi.label}</span>
            <strong className="block text-lg font-semibold">{kpi.value}</strong>
            <span className={cn("text-xs", kpi.tone != null && (kpi.tone >= 0 ? "text-state-up" : "text-state-down"))}>{kpi.change}</span>
          </div>
        ))}
      </div>

      <RevenueTrendChart quarters={quarters} />

      <div className="overflow-auto max-h-[400px]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["报告期", "营收", "同比", "净利润", "同比", "毛利率", "ROE"].map((h, index) => (
                <th key={`${h}-${index}`} className="sticky top-0 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary border-b border-border-default text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.endDate} className="border-b border-border-subtle hover:bg-surface-hover">
                <td className="px-3 py-2 text-left font-mono">{fmtQuarter(q.endDate)}</td>
                <td className="px-3 py-2 text-right">{fmtYi(q.revenue)}</td>
                <td className={cn("px-3 py-2 text-right", q.revenueYoY != null && (q.revenueYoY >= 0 ? "text-state-up" : "text-state-down"))}>{q.revenueYoY != null ? fmtPct(q.revenueYoY) : "-"}</td>
                <td className="px-3 py-2 text-right">{fmtYi(q.netIncome)}</td>
                <td className={cn("px-3 py-2 text-right", q.netIncomeYoY != null && (q.netIncomeYoY >= 0 ? "text-state-up" : "text-state-down"))}>{q.netIncomeYoY != null ? fmtPct(q.netIncomeYoY) : "-"}</td>
                <td className="px-3 py-2 text-right">{q.grossMargin != null ? `${q.grossMargin.toFixed(1)}%` : "-"}</td>
                <td className="px-3 py-2 text-right">{q.roe != null ? `${q.roe.toFixed(1)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
