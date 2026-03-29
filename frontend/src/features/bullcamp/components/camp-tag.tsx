import { cn } from "@/lib/utils";

const PATTERN_LABELS: Record<string, { text: string; color: string; bg: string; border: string }> = {
  cupHandle:      { text: "杯柄",   color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/30" },
  vcp:            { text: "VCP",    color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/30" },
  tightBase:      { text: "紧凑",   color: "text-cyan-400",    bg: "bg-cyan-400/10",    border: "border-cyan-400/30" },
  threeLineBloom: { text: "三线开花", color: "text-rose-400",    bg: "bg-rose-400/10",    border: "border-rose-400/30" },
  pocketPivot:    { text: "口袋",   color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30" },
  hhBuy:          { text: "H2★",   color: "text-green-400",   bg: "bg-green-400/10",   border: "border-green-400/30" },
};

interface CampTagProps {
  isNew?: boolean;
  daysInCamp?: number;
  hasAnnouncement?: boolean;
  patternTags?: string[];
}

export function CampTag({ isNew, daysInCamp, hasAnnouncement, patternTags }: CampTagProps) {
  return (
    <span className="inline-flex gap-1 ml-1 flex-wrap">
      {isNew && <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm bg-state-up text-white leading-none">新</span>}
      {daysInCamp != null && daysInCamp > 1 && (
        <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm text-accent bg-accent-soft border border-accent/30 leading-none">{daysInCamp}D</span>
      )}
      {hasAnnouncement && (
        <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm text-state-warning bg-state-warning/10 border border-state-warning/30 leading-none">财</span>
      )}
      {patternTags?.map((tag) => {
        const style = PATTERN_LABELS[tag];
        if (!style) return null;
        return (
          <span key={tag} className={cn("px-1 py-0.5 text-[10px] font-semibold rounded-sm border leading-none", style.color, style.bg, style.border)}>
            {style.text}
          </span>
        );
      })}
    </span>
  );
}
