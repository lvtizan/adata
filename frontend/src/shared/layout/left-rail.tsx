import { cn } from "@/lib/utils";

interface LeftRailItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface LeftRailSection {
  title: string;
  items: LeftRailItem[];
}

interface LeftRailProps {
  items?: LeftRailItem[];
  sections?: LeftRailSection[];
  children?: React.ReactNode;
}

export function LeftRail({ items = [], sections = [], children }: LeftRailProps) {
  const grouped = sections.length > 0;
  return (
    <aside className="w-[204px] border-r border-border-default bg-surface-secondary flex flex-col py-2.5 px-2 gap-1 shrink-0">
      <div className="mb-2 flex items-center gap-2 px-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#111827] to-[#2563eb] flex items-center justify-center shadow-sm">
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
          <div className="text-[13px] font-semibold leading-tight text-text-primary truncate tracking-[0.02em]">A-Data Terminal</div>
        </div>
      </div>
      {grouped ? (
        sections.map((section) => (
          <div key={section.title} className="mb-1">
            <div className="px-2.5 py-1 text-[10px] text-text-quaternary tracking-[0.08em] uppercase">{section.title}</div>
            {section.items.map((item, i) => (
              <button
                key={`${section.title}-${i}`}
                onClick={item.onClick}
                className={cn(
                  "w-full h-9 px-2.5 flex items-center gap-2.5 rounded-md text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors",
                  item.active && "text-text-primary bg-canvas border border-border-default shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                )}
              >
                <span className="w-4 h-4 inline-flex items-center justify-center">{item.icon}</span>
                <span className="text-[14px] leading-none font-medium tracking-[0.01em]">{item.label}</span>
              </button>
            ))}
          </div>
        ))
      ) : (
        items.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className={cn(
              "w-full h-9 px-2.5 flex items-center gap-2.5 rounded-md text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors",
              item.active && "text-text-primary bg-canvas border border-border-default shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            )}
          >
            <span className="w-4 h-4 inline-flex items-center justify-center">{item.icon}</span>
            <span className="text-[14px] leading-none font-medium tracking-[0.01em]">{item.label}</span>
          </button>
        ))
      )}
      {children}
    </aside>
  );
}
