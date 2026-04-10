import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/root-layout";
import DashboardPage from "@/pages/dashboard/page";
import IndexRadarPage from "@/pages/index-radar/page";
import SectorWorkbenchPage from "@/pages/sector-workbench/page";
import WatchlistPage from "@/pages/watchlist/page";
import BullcampPage from "@/pages/bullcamp/page";
import HHScanPage from "@/pages/hh-scan/page";
import IntradayPage from "@/pages/intraday/page";
import MarketOverviewPage from "@/pages/market-overview/page";
import MarketRecapPage from "@/pages/market-recap/page";
import MorningBriefPage from "@/pages/morning-brief/page";
import SettingsPage from "@/pages/settings/page";
import StockComparePage from "@/pages/stock-compare/page";
import DebugPage from "@/pages/debug/page";
import CoreMainlinePage from "@/pages/core-mainline/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/intraday" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "index-radar", element: <IndexRadarPage /> },
      { path: "sector-workbench", element: <SectorWorkbenchPage /> },
      { path: "intraday", element: <IntradayPage /> },
      { path: "market-overview", element: <MarketOverviewPage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "bullcamp", element: <BullcampPage /> },
      { path: "hh-scan", element: <HHScanPage /> },
      { path: "market-recap", element: <MarketRecapPage /> },
      { path: "morning-brief", element: <MorningBriefPage /> },
      { path: "stock-compare", element: <StockComparePage /> },
      { path: "core-mainline", element: <CoreMainlinePage /> },
      { path: "debug", element: <DebugPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
