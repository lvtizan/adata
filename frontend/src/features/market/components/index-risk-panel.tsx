import { useIndexRisk } from "@/queries/index-risk.queries";
import { cn } from "@/lib/utils";
import type { IndexRiskItem, IndexRiskSummary } from "@/services/index-risk.service";

// ── 风险色调映射 ──
const toneColors: Record<string, string> = {
  positive: "text-state-down",     // 绿色 = 低风险
  neutral: "text-text-secondary",
  warning: "text-state-warning",
  danger: "text-state-up",         // 红色 = 高风险
};

const toneBg: Record<string, string> = {
  positive: "bg-state-down/10",
  neutral: "bg-surface",
  warning: "bg-state-warning/10",
  danger: "bg-state-up/10",
};

// ── 趋势图标 ──
function TrendIcon({ trend }: { trend: string }) {
  if (trend === "uptrend") return <span className="text-state-up">▲</span>;
  if (trend === "downtrend") return <span className="text-state-down">▼</span>;
  return <span className="text-text-tertiary">◆</span>;
}

// ── 风险等级条 ──
function RiskBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  let barColor = "bg-state-down"; // 绿
  if (pct >= 65) barColor = "bg-state-up"; // 红
  else if (pct >= 45) barColor = "bg-state-warning"; // 橙

  return (
    <div className="w-14 h-1.5 rounded-full bg-surface-active relative overflow-hidden">
      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── 信号标签 ──
function SignalBadge({ signal }: { signal: string }) {
  const colorMap: Record<string, string> = {
    "见顶风险": "bg-state-up/15 text-state-up",
    "逼近压力": "bg-state-warning/15 text-state-warning",
    "见底机会": "bg-state-down/15 text-state-down",
    "强势上攻": "bg-state-down/15 text-state-down",
    "趋势延续": "bg-accent-soft text-accent",
    "震荡观望": "bg-surface-active text-text-secondary",
    "数据不足": "bg-surface text-text-tertiary",
  };
  const cls = colorMap[signal] || "bg-surface text-text-secondary";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs whitespace-nowrap", cls)}>
      {signal}
    </span>
  );
}

// ── 汇总面板 ──
function SummaryCard({ summary }: { summary: IndexRiskSummary }) {
  const toneClass = toneColors[summary.overallTone] || "";
  const bgClass = toneBg[summary.overallTone] || "";

  return (
    <div className={cn("rounded-lg px-3 py-2.5 mb-2", bgClass)}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-tertiary">综合风险评估</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-lg font-bold", toneClass)}>
            {summary.avgRiskScore.toFixed(0)}
          </span>
          <span className={cn("text-sm font-medium", toneClass)}>
            {summary.overall}
          </span>
        </div>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed mb-2">{summary.advice}</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <span className="block text-xs text-text-tertiary">上升</span>
          <strong className="text-sm text-state-up">{summary.uptrendCount}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-tertiary">下降</span>
          <strong className="text-sm text-state-down">{summary.downtrendCount}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-tertiary">见顶</span>
          <strong className="text-sm text-state-up">{summary.topSignals}</strong>
        </div>
        <div>
          <span className="block text-xs text-text-tertiary">衰弱</span>
          <strong className="text-sm text-state-warning">{summary.weakeningCount}</strong>
        </div>
      </div>
    </div>
  );
}

// ── 单个指数行 ──
function IndexRow({ item }: { item: IndexRiskItem }) {
  const v = item.verdict;
  const chgClass = item.pctChg > 0 ? "text-state-up" : item.pctChg < 0 ? "text-state-down" : "text-text-secondary";

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-hover rounded transition-colors">
      {/* 指数名 */}
      <div className="w-20 shrink-0">
        <span className="text-xs font-medium truncate block">{item.name}</span>
        <span className="text-xs text-text-tertiary">{item.price}</span>
      </div>
      {/* 涨跌 */}
      <div className="w-12 text-right shrink-0">
        <span className={cn("text-xs font-medium", chgClass)}>
          {item.pctChg > 0 ? "+" : ""}{item.pctChg}%
        </span>
      </div>
      {/* 趋势 */}
      <div className="w-6 text-center shrink-0">
        <TrendIcon trend={item.trend.trend} />
      </div>
      {/* 风险条 */}
      <div className="w-14 shrink-0">
        <RiskBar score={v.riskScore} />
      </div>
      {/* 信号 */}
      <div className="flex-1 text-right">
        <SignalBadge signal={v.signal} />
      </div>
    </div>
  );
}

// ── 分组显示 ──
function IndexGroup({ group, items }: { group: string; items: IndexRiskItem[] }) {
  return (
    <div className="mb-1">
      <div className="px-2.5 py-1 text-xs text-text-tertiary font-medium">{group}</div>
      {items.map((item) => (
        <IndexRow key={item.tsCode} item={item} />
      ))}
    </div>
  );
}

// ── 主面板 ──
export function IndexRiskPanel() {
  const { data, isLoading, error } = useIndexRisk();

  if (isLoading) {
    return (
      <div className="px-3 py-6 text-center text-xs text-text-tertiary">
        正在分析指数风险...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-3 py-6 text-center text-xs text-text-tertiary">
        指数风险数据暂不可用
      </div>
    );
  }

  // 按 group 分组
  const groupOrder = ["大盘", "大中小", "成长", "情绪", "港股"];
  const grouped: Record<string, IndexRiskItem[]> = {};
  for (const item of data.indices) {
    const g = item.group || "其他";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(item);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border-default shrink-0">
        <h2 className="text-sm font-medium">指数风险雷达</h2>
        <p className="text-xs text-text-tertiary">YTC 六步法 · {data.tradeDate}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <SummaryCard summary={data.summary} />
        {groupOrder.map((g) =>
          grouped[g] ? <IndexGroup key={g} group={g} items={grouped[g]} /> : null
        )}
      </div>
    </div>
  );
}
