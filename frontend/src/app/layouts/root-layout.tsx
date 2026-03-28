import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppShell, TopBar, RightPanel, BottomBar } from "@/shared/layout";
import { useMarketOverview } from "@/queries";
import { BarChart3, Eye, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";

const navItems = [
  { path: "/dashboard", label: "板块分析", icon: BarChart3 },
  { path: "/watchlist", label: "自选股", icon: Eye },
  { path: "/bullcamp", label: "牛股集中营", icon: Flame },
];

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: overview } = useMarketOverview();

  return (
    <AppShell
      topBar={
        <TopBar title={overview?.tradeDate || ""}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 text-sm text-text-secondary",
                location.pathname === item.path && "bg-surface-active text-text-primary font-medium"
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="w-4 h-4 mr-1.5" />
              {item.label}
            </Button>
          ))}
        </TopBar>
      }
      rightPanel={<RightPanel />}
      bottomBar={
        <BottomBar>
          <span>{overview?.tradeDate || "--"}</span>
          <span className="mx-2">|</span>
          <span>{overview?.marketState?.label || "市场状态"}</span>
        </BottomBar>
      }
    >
      <Outlet />
    </AppShell>
  );
}
