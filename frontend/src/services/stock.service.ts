import { api } from "./api-client";
import type {
  WatchlistItem,
  BullCampItem,
  FinancialsData,
  ListResponse,
  StockNewsItem,
  ChartDrawingsDocument,
  ChartDrawingOverlay,
  MarketSearchResult,
} from "@/shared/types";

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

export function searchMarket(query: string, limit = 12) {
  return api<MarketSearchResult>(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export function getStockFinancials(tsCode: string, periods = 8) {
  return api<FinancialsData>(`/stock/${tsCode}/financials?periods=${periods}`);
}

export function getStockNews(tsCode: string, limit = 20) {
  return api<{ tsCode: string; items: StockNewsItem[] }>(`/stock/${tsCode}/news?limit=${limit}`);
}

export function getChartDrawings(symbol: string, scope = "stock", timeframe = "1d") {
  return api<ChartDrawingsDocument>(`/drawings/${symbol}?scope=${encodeURIComponent(scope)}&timeframe=${encodeURIComponent(timeframe)}`);
}

export function saveChartDrawings(
  symbol: string,
  overlays: ChartDrawingOverlay[],
  scope = "stock",
  timeframe = "1d",
) {
  return api<ChartDrawingsDocument>(`/drawings/${symbol}?scope=${encodeURIComponent(scope)}&timeframe=${encodeURIComponent(timeframe)}`, {
    method: "PUT",
    body: JSON.stringify({ overlays }),
  });
}

export function clearChartDrawings(symbol: string, scope = "stock", timeframe = "1d") {
  return api<{ ok: boolean; deleted: boolean; symbol: string; scope: string; timeframe: string }>(
    `/drawings/${symbol}?scope=${encodeURIComponent(scope)}&timeframe=${encodeURIComponent(timeframe)}`,
    { method: "DELETE" },
  );
}

export interface PatternSignal {
  date: string;
  price: number;
  type: string;  // "H1", "H2", "H3", ...
  prevHigh?: number;
  prevLow?: number;
  volumeRatio?: number;
  buySignal?: boolean;
}

export interface DrawdownMarker {
  date: string;
  price: number;
  highPrice: number;
  highDate?: string;
  pct: number;  // 如 -25.3
}

export interface TouchPoint {
  date: string;
  price: number;
}

export interface SupportLevel {
  price: number;
  count: number;
  lowPrice: number;
  highPrice: number;
  lastDate?: string;
  touches?: TouchPoint[];
}

export interface ResistanceLevel {
  price: number;
  count: number;
  lowPrice: number;
  highPrice: number;
  lastDate?: string;
  touches?: TouchPoint[];
}

export interface PatternResult {
  tsCode: string;
  patterns: Array<{ tag: string; label: string; detected: boolean; confidence: number; detail: string }>;
  signals: PatternSignal[];
  drawdowns: DrawdownMarker[];
  supports: SupportLevel[];
  resistances: ResistanceLevel[];
  maAlignment: { ma30: number; ma50: number; ma200: number | null; bullish: boolean; priceAboveAll: boolean } | null;
  latestHH: string | null;  // "H1", "H2", ...
  hasBuySignal: boolean;
}

export function getStockPatterns(tsCode: string) {
  return api<PatternResult>(`/stock/${tsCode}/patterns`);
}

export function getStockSector(tsCode: string) {
  return api<{ sectorCode: string; sectorName: string }>(`/stock/${tsCode}/sector`);
}

export interface AttributionItem {
  dimension: string;
  label: string;
  detail: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface AttributionResult {
  tsCode: string;
  stockName: string;
  attribution: AttributionItem[];
}

export function getStockAttribution(tsCode: string) {
  return api<AttributionResult>(`/stock/${tsCode}/attribution`);
}

// ── 个股标签（概念题材 + 游资/基金 + 关联股）──

export interface ConceptTag {
  code: string;
  name: string;
  rps10: number;
}

export interface RelatedStock {
  tsCode: string;
  name: string;
  ret5: number;
  pctChg: number;
  concept: string;
}

export interface StockTagsResult {
  tsCode: string;
  stockName: string;
  concepts: ConceptTag[];
  capitalType: "游资主导" | "基金重仓" | "混合" | "未知";
  capitalDetail: string;
  relatedStocks: RelatedStock[];
}

export function getStockTags(tsCode: string) {
  return api<StockTagsResult>(`/stock/${tsCode}/tags`);
}

// ── HH 信号成功率统计 ──

export function getStockHHStats(tsCode: string) {
  return api<import("@/shared/types").HHStatsResult>(`/stock/${tsCode}/hh-stats`);
}
