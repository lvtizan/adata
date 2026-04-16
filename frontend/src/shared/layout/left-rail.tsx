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
  collapsed?: boolean;
  children?: React.ReactNode;
}

export function LeftRail({ items = [], sections = [], collapsed = false, children }: LeftRailProps) {
  const grouped = sections.length > 0;

  const itemButton = (item: LeftRailItem, key: string | number) => (
    <button
      key={key}
      onClick={item.onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "w-full h-9 flex items-center rounded-md text-left text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors",
        collapsed ? "justify-center" : "px-2.5 gap-2.5",
        item.active && "text-text-primary bg-canvas border border-border-default shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      )}
    >
      <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">{item.icon}</span>
      {!collapsed && (
        <span className="text-[14px] leading-none font-medium tracking-[0.01em]">{item.label}</span>
      )}
    </button>
  );

  return (
    <aside className={cn(
      "border-r border-border-default bg-surface-secondary flex flex-col py-2.5 gap-1 shrink-0 transition-[width] duration-200",
      collapsed ? "w-[48px] px-1" : "w-[204px] px-2",
    )}>
      {/* Brand */}
      <div className={cn(
        "mb-2 flex items-center gap-2",
        collapsed ? "justify-center px-1" : "px-2",
      )}>
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#111827] to-[#2563eb] flex items-center justify-center shadow-sm shrink-0">
          <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden="true">
            <path
              d="M7 8c2.8.3 4.8 1.8 6 4 1-1 1.9-1.4 3-1.4S18 11 19 12c1.2-2.2 3.2-3.7 6-4-.3 3-1.8 5.2-4.2 6.5.8 1 1.2 2.2 1.2 3.5 0 3.7-2.7 6.4-6 6.4s-6-2.7-6-6.4c0-1.3.4-2.5 1.2-3.5C8.8 13.2 7.3 11 7 8z"
              fill="#ffffff"
            />
            <circle cx="13.5" cy="17.2" r="0.9" fill="#1f2937" />
            <circle cx="18.5" cy="17.2" r="0.9" fill="#1f2937" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight text-text-primary truncate tracking-[0.02em]">A-Data Terminal</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-1">
        {grouped ? (
          sections.map((section) => (
            <div key={section.title} className="mb-1">
              <div className={cn(
                "py-1 text-[10px] text-text-quaternary tracking-[0.08em] uppercase",
                collapsed ? "hidden" : "px-2.5",
              )}>
                {section.title}
              </div>
              {section.items.map((item, i) => itemButton(item, `${section.title}-${i}`))}
            </div>
          ))
        ) : (
          items.map((item, i) => itemButton(item, i))
        )}
      </div>

      {children}
    </aside>
  );
}
