import { MarketSearch } from "./market-search";

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
  children?: React.ReactNode;
}

export function TopBar({ title, showSearch = true, children }: TopBarProps) {
  return (
    <header className="h-12 flex items-center gap-3 px-3 border-b border-border-default bg-surface shrink-0">
      <nav className="flex gap-1">
        {children}
      </nav>

      <div className="ml-auto flex items-center gap-3 min-w-0">
        {showSearch && <MarketSearch />}
        {title && (
          <span className="text-text-quaternary text-[11px] font-mono tracking-[0.04em] tabular-nums">
            {title}
          </span>
        )}
      </div>
    </header>
  );
}
