import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/root-layout";
import DashboardPage from "@/pages/dashboard/page";
import WatchlistPage from "@/pages/watchlist/page";
import BullcampPage from "@/pages/bullcamp/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "bullcamp", element: <BullcampPage /> },
    ],
  },
]);
