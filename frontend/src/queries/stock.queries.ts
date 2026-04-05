import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWatchlist,
  addToWatchlist,
  updateWatchlist,
  removeFromWatchlist,
  getBullCamp,
  searchMarket,
  getStockFinancials,
  getStockNews,
  getStockPatterns,
  getStockSector,
  getStockAttribution,
  getStockTags,
  getStockHHStats,
  getChartDrawings,
  saveChartDrawings,
  clearChartDrawings,
} from "@/services";

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addToWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useUpdateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tsCode, data }: { tsCode: string; data: Record<string, unknown> }) =>
      updateWatchlist(tsCode, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useBullCamp() {
  return useQuery({
    queryKey: ["bullcamp"],
    queryFn: getBullCamp,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useMarketSearch(query: string, limit = 12) {
  return useQuery({
    queryKey: ["market-search", query, limit],
    queryFn: () => searchMarket(query, limit),
    enabled: query.trim().length >= 2,
    staleTime: 120_000,
    placeholderData: (prev) => prev,
  });
}

export function useStockFinancials(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "financials"],
    queryFn: () => getStockFinancials(tsCode),
    enabled: !!tsCode,
    staleTime: 5 * 60_000,
  });
}

export function useStockNews(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "news"],
    queryFn: () => getStockNews(tsCode),
    enabled: !!tsCode,
    staleTime: 5 * 60_000,
    select: (data) => data.items,
  });
}

export function useStockPatterns(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "patterns"],
    queryFn: () => getStockPatterns(tsCode),
    enabled: !!tsCode,
    staleTime: 10 * 60_000,
  });
}

export function useStockSector(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "sector"],
    queryFn: () => getStockSector(tsCode),
    enabled: !!tsCode,
    staleTime: 30 * 60_000,
  });
}

export function useStockAttribution(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "attribution"],
    queryFn: () => getStockAttribution(tsCode),
    enabled: !!tsCode,
    staleTime: 10 * 60_000,
  });
}

export function useStockTags(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "tags"],
    queryFn: () => getStockTags(tsCode),
    enabled: !!tsCode,
    staleTime: 30 * 60_000,
  });
}

export function useStockHHStats(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "hh-stats"],
    queryFn: () => getStockHHStats(tsCode),
    enabled: !!tsCode,
    staleTime: 10 * 60_000,
  });
}

export function useChartDrawings(symbol: string, scope = "stock", timeframe = "1d") {
  return useQuery({
    queryKey: ["drawings", scope, timeframe, symbol],
    queryFn: () => getChartDrawings(symbol, scope, timeframe),
    enabled: !!symbol,
    staleTime: 30_000,
  });
}

export function useSaveChartDrawings(symbol: string, scope = "stock", timeframe = "1d") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overlays: import("@/shared/types").ChartDrawingOverlay[]) =>
      saveChartDrawings(symbol, overlays, scope, timeframe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drawings", scope, timeframe, symbol] }),
  });
}

export function useClearChartDrawings(symbol: string, scope = "stock", timeframe = "1d") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearChartDrawings(symbol, scope, timeframe),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drawings", scope, timeframe, symbol] }),
  });
}
