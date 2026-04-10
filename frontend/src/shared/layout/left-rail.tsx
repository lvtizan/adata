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
    <aside className="w-[196px] border-r border-[#e8ebf2] bg-[#f4f6fb] flex flex-col py-3 px-2.5 gap-1 shrink-0">
      <div className="mb-2 flex items-center gap-2 px-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1f2937] to-[#3b82f6] flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden="true">
            <path
              d="M7 8c2.8.3 4.8 1.8 6 4 1-1 1.9-1.4 3-1.4S18 11 19 12c1.2-2.2 3.2-3.7 6-4-.3 3-1.8 5.2-4.2 6.5.8 1 1.2 2.2 1.2 3.5 0 3.7-2.7 6.4-6 6.4s-6-2.7-6-6.4c0-1.3.4-2.5 1.2-3.5C8.8 13.2 7.3 11 7 8z"
              fill="#ffffff"
            />
            <circle cx="13.5" cy="17.2" r="0.9" fill="#1f2937" />
            <circle cx="18.5" cy="17.2" r="0.9" fill="#1f2937" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-[#111827] truncate">A数据</div>
        </div>
      </div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={cn(
            "w-full h-9 px-2.5 flex items-center gap-2.5 rounded-md text-left text-[#4a4a4a] hover:text-[#1f1f1f] hover:bg-white transition-colors",
            item.active && "text-[#111] bg-white border border-[#e9edf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
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
