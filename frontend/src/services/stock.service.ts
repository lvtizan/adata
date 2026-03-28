import { api } from "./api-client";
import type { WatchlistItem, BullCampItem, FinancialsData, ListResponse } from "@/shared/types";

export function getWatchlist() {
  return api<ListResponse<WatchlistItem>>("/watchlist");
}

export function addToWatchlist(item: Partial<WatchlistItem>) {
  return api<{ success: boolean; item: WatchlistItem }>("/watchlist", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateWatchlist(tsCode: string, data: Partial<WatchlistItem>) {
  return api<{ success: boolean; item: WatchlistItem }>(`/watchlist/${tsCode}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function removeFromWatchlist(tsCode: string) {
  return api<{ success: boolean }>(`/watchlist/${tsCode}`, { method: "DELETE" });
}

export function getBullCamp() {
  return api<ListResponse<BullCampItem>>("/bullcamp");
}

export function getStockFinancials(tsCode: string, periods = 8) {
  return api<FinancialsData>(`/stock/${tsCode}/financials?periods=${periods}`);
}
