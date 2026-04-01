import { api } from "./api-client";
import type { MarketOverview, RealtimeQuote, SectorRanking, SectorStock } from "@/shared/types";

export function getMarketOverview(tradeDate?: string) {
  const qs = tradeDate ? `?tradeDate=${tradeDate}` : "";
  return api<MarketOverview>(`/market/overview${qs}`);
}

export function getRealtimeQuotes(tsCodes: string[]) {
  const codes = tsCodes.join(",");
  return api<{ items: RealtimeQuote[] }>(`/realtime/quotes?codes=${encodeURIComponent(codes)}`);
}

export function getIntradaySectors() {
  return api<{ tradeDate: string; items: SectorRanking[] }>("/intraday/sectors");
}

export function getIntradaySectorStocks(sectorCode: string) {
  return api<{ items: SectorStock[] }>(`/intraday/sectors/${sectorCode}/stocks`);
}
