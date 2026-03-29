import type { MarketOverview, MainlineSector } from "@/shared/types";

function StarRating({ stars }: { stars: number }) {
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-px text-amber-400 leading-none" title={`${stars} 星`}>
      {"★".repeat(full)}
      {half && <span className="relative inline-block w-[0.6em] overflow-hidden">★</span>}
      <span className="text-text-quaternary">{"☆".repeat(empty)}</span>
    </span>
  );
}

function MainlineRow({ sector }: { sector: MainlineSector }) {
  const pct = sector.pctChange10d;
  const pctColor = pct > 0 ? "text-state-up" : pct < 0 ? "text-state-down" : "text-text-tertiary";
  const statusColors: Record<string, string> = {
    "加强": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    "分歧": "bg-amber-500/15 text-amber-400 border-amber-500/30",
    "衰退": "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="font-semibold text-sm text-text-primary shrink-0">{sector.sectorName}</span>
      <StarRating stars={sector.stars} />
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${pctColor} bg-surface-hover/60 shrink-0`}>
        10日{pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
      {sector.limitUpCount > 0 && (
        <span className="text-[10px] text-state-up font-mono shrink-0">{sector.limitUpCount}涨停</span>
      )}
      <span className={`px-1 py-0.5 text-[10px] rounded border ${statusColors[sector.status] || "bg-surface-hover/60 text-text-tertiary border-border-subtle"}`}>
        {sector.status}
      </span>
    </div>
  );
}

export function MarketSummary({ overview }: { overview: MarketOverview | undefined }) {
  if (!overview) return null;

  const mainlines = overview.mainlines || [];

  return (
    <div className="flex items-stretch border border-border-default">
      {/* 主线板块（垂直列表） */}
      <div className="min-w-[280px] px-3 py-2 border-r border-border-default">
        <span className="block text-xs text-text-tertiary mb-1">主线板块</span>
        {mainlines.length > 0 ? (
          <div className="flex flex-col">
            {mainlines.map((s) => (
              <MainlineRow key={s.sectorCode} sector={s} />
            ))}
          </div>
        ) : (
          <strong className="block text-sm font-semibold leading-snug">
            {overview.mainline?.name || "--"}
          </strong>
        )}
      </div>

      {/* 涨停/跌停 */}
      <div className="min-w-[100px] px-3 py-2.5 border-r border-border-default">
        <span className="block text-xs text-text-tertiary mb-1">涨停/跌停</span>
        <strong className="block text-sm font-semibold leading-snug">
          {overview.breadth?.limitUpCount ?? "--"} / {overview.breadth?.limitDownCount ?? "--"}
        </strong>
      </div>

      {/* 情绪 */}
      <div className="min-w-[80px] px-3 py-2.5 border-r border-border-default">
        <span className="block text-xs text-text-tertiary mb-1">情绪</span>
        <strong className="block text-sm font-semibold leading-snug">
          {overview.emotionState?.label || "--"}
        </strong>
      </div>

      {/* 聚焦板块 */}
      <div className="min-w-[120px] px-3 py-2.5">
        <span className="block text-xs text-text-tertiary mb-1">聚焦板块</span>
        <strong className="block text-sm font-semibold leading-snug">
          {overview.topSectors?.slice(0, 3).map((s) => s.sectorName).join(" / ") || "--"}
        </strong>
      </div>
    </div>
  );
}
