import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/root-layout";
import DashboardPage from "@/pages/dashboard/page";
import IndexRadarPage from "@/pages/index-radar/page";
import SectorWorkbenchPage from "@/pages/sector-workbench/page";
import WatchlistPage from "@/pages/watchlist/page";
import BullcampPage from "@/pages/bullcamp/page";
import SettingsPage from "@/pages/settings/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "index-radar", element: <IndexRadarPage /> },
      { path: "sector-workbench", element: <SectorWorkbenchPage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "bullcamp", element: <BullcampPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
