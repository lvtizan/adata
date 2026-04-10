import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppShell, TopBar, BottomBar, LeftRail } from "@/shared/layout";
import { AiResearchPanel } from "@/shared/layout/ai-research-panel";
import { useMarketOverview, useBullCamp, useWatchlist } from "@/queries";
import { Activity, BarChart3, Eye, Flame, Settings, Crosshair, FileText, TrendingUp, GitCommit, Newspaper, ClipboardList, BookMarked, type LucideIcon } from "lucide-react";
import { useUII18n, type UIKey } from "@/i18n/ui";

const navItems: Array<{ path: string; labelKey: UIKey; icon: LucideIcon }> = [
  { path: "/intraday", labelKey: "nav.intraday", icon: TrendingUp },
  { path: "/dashboard", labelKey: "nav.dashboard", icon: BarChart3 },
  { path: "/index-radar", labelKey: "nav.indexRadar", icon: Activity },
  { path: "/watchlist", labelKey: "nav.watchlist", icon: Eye },
  { path: "/bullcamp", labelKey: "nav.bullcamp", icon: Flame },
  { path: "/hh-scan", labelKey: "nav.hhScan", icon: Crosshair },
  { path: "/market-recap", labelKey: "nav.marketRecap", icon: FileText },
  { path: "/morning-brief", labelKey: "nav.morningBrief", icon: Newspaper },
  { path: "/stock-compare", labelKey: "nav.stockCompare", icon: GitCommit },
  { path: "/core-mainline", labelKey: "nav.coreMainline", icon: BookMarked },
  { path: "/trade-plan", labelKey: "nav.tradePlan", icon: ClipboardList },
  { path: "/settings", labelKey: "nav.settings", icon: Settings },
];

const navGroups: Array<{ titleKey: UIKey; paths: string[] }> = [
  {
    titleKey: "nav.realtime",
    paths: ["/intraday", "/dashboard", "/index-radar"],
  },
  {
    titleKey: "nav.trading",
    paths: ["/watchlist", "/bullcamp", "/hh-scan", "/stock-compare", "/core-mainline", "/trade-plan"],
  },
  {
    titleKey: "nav.review",
    paths: ["/market-recap", "/morning-brief"],
  },
  {
    titleKey: "nav.system",
    paths: ["/settings"],
  },
];

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: overview } = useMarketOverview();
  const { t, locale } = useUII18n();
  const hideTopSearch = location.pathname === "/morning-brief";

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
        <TopBar title={overview?.tradeDate || ""} showSearch={!hideTopSearch} />
      }
      leftRail={
        <LeftRail
          sections={navGroups.map((group) => ({
            title: t(group.titleKey),
            items: group.paths
              .map((path) => navItems.find((item) => item.path === path))
              .filter((item): item is (typeof navItems)[number] => !!item)
              .map((item) => ({
                label: t(item.labelKey),
                icon: <item.icon className="w-4 h-4" />,
                active: isActive(item.path),
                onClick: () => navigate(item.path),
              })),
          }))}
        />
      }
      bottomBar={
        <BottomBar>
          <span>{overview?.tradeDate || "--"}</span>
          <span className="mx-2">|</span>
          <span>{overview?.marketState?.label || (locale === "en-US" ? "Market State" : "市场状态")}</span>
        </BottomBar>
      }
    >
      <Outlet />
      <AiResearchPanel />
    </AppShell>
  );
}
