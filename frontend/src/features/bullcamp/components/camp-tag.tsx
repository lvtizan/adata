import { cn } from "@/lib/utils";

interface CampTagProps {
  isNew?: boolean;
  daysInCamp?: number;
  hasAnnouncement?: boolean;
}

export function CampTag({ isNew, daysInCamp, hasAnnouncement }: CampTagProps) {
  return (
    <span className="inline-flex gap-1 ml-1">
      {isNew && <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm bg-state-up text-white leading-none">新</span>}
      {daysInCamp != null && daysInCamp > 1 && (
        <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm text-accent bg-accent-soft border border-accent/30 leading-none">{daysInCamp}D</span>
      )}
      {hasAnnouncement && (
        <span className="px-1 py-0.5 text-[10px] font-semibold rounded-sm text-state-warning bg-state-warning/10 border border-state-warning/30 leading-none">财</span>
      )}
    </span>
  );
}
