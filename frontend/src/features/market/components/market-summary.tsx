import type { MarketOverview } from "@/shared/types";

export function MarketSummary({ overview }: { overview: MarketOverview | undefined }) {
  if (!overview) return null;

  const pills = [
    { label: "主线", value: overview.mainline?.name || "--" },
    { label: "涨停/跌停", value: `${overview.breadth?.limitUpCount ?? "--"} / ${overview.breadth?.limitDownCount ?? "--"}` },
    { label: "情绪", value: overview.emotionState?.label || "--" },
    { label: "聚焦板块", value: overview.topSectors?.slice(0, 3).map((s) => s.sectorName).join(" / ") || "--" },
  ];

  return (
    <div className="flex items-stretch border border-border-default">
      {pills.map((pill) => (
        <div key={pill.label} className="min-w-[140px] px-3 py-2.5 border-r border-border-default last:border-r-0">
          <span className="block text-xs text-text-tertiary mb-1">{pill.label}</span>
          <strong className="block text-sm font-semibold leading-snug">{pill.value}</strong>
        </div>
      ))}
    </div>
  );
}
