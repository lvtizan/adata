import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface LeftRailItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface LeftRailProps {
  items?: LeftRailItem[];
  children?: React.ReactNode;
}

export function LeftRail({ items = [], children }: LeftRailProps) {
  return (
    <aside className="w-[52px] border-r border-border-default bg-canvas flex flex-col items-center py-2 gap-1 shrink-0">
      {items.map((item, i) => (
        <Tooltip key={i} delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={item.onClick}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors",
                item.active && "text-text-primary bg-surface-active"
              )}
            >
              {item.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
        </Tooltip>
      ))}
      {children}
    </aside>
  );
}
