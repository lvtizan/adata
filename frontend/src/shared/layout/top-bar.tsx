import { useAppStore } from "@/store";
import { Moon, Sun, PanelRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { MarketSearch } from "./market-search";

interface TopBarProps {
  title?: string;
  children?: React.ReactNode;
}

export function TopBar({ title, children }: TopBarProps) {
  const { theme, toggleTheme, toggleRightPanel } = useAppStore();

  return (
    <header className="h-12 flex items-center gap-3 px-4 border-b border-border-default bg-canvas shrink-0">
      <div className="flex items-center gap-2.5 min-w-[180px]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-text-primary to-accent flex items-center justify-center text-white text-xs font-bold">
          AS
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">A-Share Terminal</div>
        </div>
      </div>

      <nav className="flex gap-1">
        {children}
      </nav>

      <div className="ml-auto flex items-center gap-2 min-w-0">
        <MarketSearch />
        {title && <span className="text-text-secondary text-sm">{title}</span>}
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleRightPanel}>
          <PanelRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
