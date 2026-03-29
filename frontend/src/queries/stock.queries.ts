import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWatchlist, addToWatchlist, updateWatchlist, removeFromWatchlist, getBullCamp, getStockFinancials, getStockNews, getStockPatterns, getStockSector, getStockAttribution, getStockTags } from "@/services";

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
