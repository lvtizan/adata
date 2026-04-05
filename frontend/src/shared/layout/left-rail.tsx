import { cn } from "@/lib/utils";

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
    <aside className="w-[172px] border-r border-border-default bg-[#f2f2f1] flex flex-col py-3 px-2.5 gap-1 shrink-0">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={cn(
            "w-full h-9 px-2.5 flex items-center gap-2.5 rounded-md text-left text-[#4a4a4a] hover:text-[#1f1f1f] hover:bg-white/80 transition-colors",
            item.active && "text-[#111] bg-white shadow-sm"
          )}
        >
          <span className="w-4 h-4 inline-flex items-center justify-center">{item.icon}</span>
          <span className="text-[15px] leading-none font-normal tracking-[0.005em]">{item.label}</span>
        </button>
      ))}
      {children}
    </aside>
  );
}
