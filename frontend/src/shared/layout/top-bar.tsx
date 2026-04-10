import { MarketSearch } from "./market-search";

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
  children?: React.ReactNode;
}

export function TopBar({ title, showSearch = true, children }: TopBarProps) {
  return (
    <header className="h-12 flex items-center gap-3 px-3 border-b border-border-default bg-[#f8fafc] shrink-0">
      <nav className="flex gap-1">
        {children}
      </nav>

      <div className="ml-auto flex items-center gap-2 min-w-0">
        {showSearch && <MarketSearch />}
        {title && <span className="text-[#64748b] text-xs font-mono tracking-[0.04em]">{title}</span>}
      </div>
    </header>
  );
}
