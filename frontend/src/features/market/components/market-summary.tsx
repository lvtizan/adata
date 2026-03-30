import type { MarketOverview, MainlineSector, MarketRisk } from "@/shared/types";
import { cn } from "@/lib/utils";

/** 主线板块标签 — 左侧强度条 + 状态着色 */
function MainlineTag({ sector, rank }: { sector: MainlineSector; rank: number }) {
  const pct = sector.pctChange10d;
  const pctColor = pct > 0 ? "text-state-up" : pct < 0 ? "text-state-down" : "text-text-tertiary";

  // 状态决定左竖条和背景色
  const statusStyle: Record<string, { bar: string; bg: string; text: string }> = {
    "加强": { bar: "bg-emerald-500", bg: "bg-emerald-500/8", text: "text-emerald-500" },
    "分歧": { bar: "bg-amber-500",   bg: "bg-amber-500/8",   text: "text-amber-500" },
    "衰退": { bar: "bg-red-400",     bg: "bg-red-400/8",     text: "text-red-400" },
  };
  const s = statusStyle[sector.status] || { bar: "bg-text-quaternary", bg: "bg-surface-hover/50", text: "text-text-tertiary" };

  // 星级 → 竖条高度（1-5星 → 20%-100%）
  const barHeight = Math.max(20, Math.round((sector.stars / 5) * 100));

  return (
    <span className={cn("inline-flex items-center gap-1.5 pl-0 pr-2 py-1 rounded text-xs whitespace-nowrap relative overflow-hidden", s.bg)}>
      {/* 左侧强度竖条 */}
      <span className="w-[3px] self-stretch rounded-full overflow-hidden bg-surface-active/30 shrink-0 relative ml-1">
        <span className={cn("absolute bottom-0 left-0 w-full rounded-full", s.bar)} style={{ height: `${barHeight}%` }} />
      </span>
      {/* 排名序号 */}
      <span className="text-[10px] text-text-quaternary font-mono w-3 text-center shrink-0">{rank}</span>
      {/* 板块名 */}
      <span className="font-semibold text-text-primary">{sector.sectorName}</span>
      {/* 涨幅 */}
      <span className={cn("font-mono text-[11px]", pctColor)}>
        {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
      {/* 涨停数 */}
      {sector.limitUpCount > 0 && (
        <span className="text-[10px] text-state-up font-mono">{sector.limitUpCount}↑</span>
      )}
      {/* 状态 */}
      <span className={cn("text-[10px] font-medium", s.text)}>{sector.status}</span>
    </span>
  );
}

/** 风险指示条（替代仪表盘） */
function RiskIndicator({ risk }: { risk: MarketRisk | undefined }) {
  if (!risk) return null;
  const score = risk.pointerValue ?? risk.score ?? 50;
  const toneMap: Record<string, string> = {
    positive: "text-state-down",
    warning: "text-state-warning",
    danger: "text-state-up",
    neutral: "text-text-secondary",
  };
  const barColor = score >= 65 ? "bg-state-up" : score >= 45 ? "bg-state-warning" : "bg-state-down";
  const toneClass = toneMap[risk.tone] || "";

  return (
    <div className="flex items-center gap-2 pl-3 border-l border-border-default">
      <span className="text-xs text-text-tertiary whitespace-nowrap">风险</span>
      <div className="w-16 h-1.5 rounded-full bg-surface-active relative overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-sm font-bold tabular-nums min-w-[24px]", toneClass)}>{score}</span>
      <span className={cn("text-xs font-medium", toneClass)}>{risk.label}</span>
    </div>
  );
}

export function MarketSummary({ overview }: { overview: MarketOverview | undefined }) {
  if (!overview) return null;

  const mainlines = overview.mainlines || [];
  const breadth = overview.breadth;
  const emotion = overview.emotionState;

  return (
    <div className="flex items-center gap-3 flex-wrap min-w-0">
      {/* 主线板块 */}
      {mainlines.length > 0 && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-text-tertiary shrink-0">主线</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {mainlines.map((s, i) => (
              <MainlineTag key={s.sectorCode} sector={s} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* 风险 */}
      <div className="w-px h-4 bg-border-default shrink-0" />
      <RiskIndicator risk={overview.marketRisk} />
    </div>
  );
}
