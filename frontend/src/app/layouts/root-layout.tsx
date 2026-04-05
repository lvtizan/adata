import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppShell, TopBar, BottomBar, LeftRail } from "@/shared/layout";
import { AiChatWidget } from "@/shared/layout/ai-chat-widget";
import { useMarketOverview, useBullCamp, useWatchlist } from "@/queries";
import { Activity, BarChart3, Eye, Flame, Settings, Crosshair, FileText, TrendingUp, LayoutPanelTop, GitCommit } from "lucide-react";

const navItems = [
  { path: "/intraday", label: "盘中观察", icon: TrendingUp },
  { path: "/market-overview", label: "市场总览", icon: LayoutPanelTop },
  { path: "/dashboard", label: "板块分析", icon: BarChart3 },
  { path: "/index-radar", label: "指数雷达", icon: Activity },
  { path: "/watchlist", label: "自选股", icon: Eye },
  { path: "/bullcamp", label: "牛股集中营", icon: Flame },
  { path: "/hh-scan", label: "双底扫描", icon: Crosshair },
  { path: "/market-recap", label: "盘前纪要", icon: FileText },
  { path: "/stock-compare", label: "股票对比", icon: GitCommit },
  { path: "/settings", label: "设置", icon: Settings },
];

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: overview } = useMarketOverview();

  // Prefetch: 后台预加载牛股集中营和自选股数据，切页时秒开
  useBullCamp();
  useWatchlist();

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/sector-workbench";
    }
    return location.pathname === path;
  };

  return (
    <AppShell
      topBar={
        <TopBar title={overview?.tradeDate || ""} />
      }
      leftRail={
        <LeftRail
          items={navItems.map((item) => ({
            label: item.label,
            icon: <item.icon className="w-4 h-4" />,
            active: isActive(item.path),
            onClick: () => navigate(item.path),
          }))}
        />
      }
      bottomBar={
        <BottomBar>
          <span>{overview?.tradeDate || "--"}</span>
          <span className="mx-2">|</span>
          <span>{overview?.marketState?.label || "市场状态"}</span>
        </BottomBar>
      }
    >
      <Outlet />
      <AiChatWidget />
    </AppShell>
  );
}
