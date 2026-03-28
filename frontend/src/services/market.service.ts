import { api } from "./api-client";
import type { MarketOverview } from "@/shared/types";

export function getMarketOverview(tradeDate?: string) {
  const qs = tradeDate ? `?tradeDate=${tradeDate}` : "";
  return api<MarketOverview>(`/market/overview${qs}`);
}
