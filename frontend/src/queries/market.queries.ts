import { useQuery } from "@tanstack/react-query";
import { getMarketOverview, getRealtimeQuotes, getIntradaySectors, getIntradaySectorStocks } from "@/services";

export function useMarketOverview(tradeDate?: string) {
  return useQuery({
    queryKey: ["market", "overview", tradeDate],
    queryFn: () => getMarketOverview(tradeDate),
    staleTime: 60_000,
  });
}

export function useIntradaySectors() {
  return useQuery({
    queryKey: ["intraday", "sectors"],
    queryFn: getIntradaySectors,
    staleTime: 60_000,
    refetchInterval: 120_000,
    select: (data) => data.items,
  });
}

export function useIntradaySectorStocks(sectorCode: string) {
  return useQuery({
    queryKey: ["intraday", "sectors", sectorCode, "stocks"],
    queryFn: () => getIntradaySectorStocks(sectorCode),
    enabled: !!sectorCode,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data) => data.items,
  });
}

export function useRealtimeQuotes(tsCodes: string[]) {
  return useQuery({
    queryKey: ["realtime", "quotes", tsCodes],
    queryFn: () => getRealtimeQuotes(tsCodes),
    enabled: tsCodes.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    select: (data) => {
      const map = new Map<string, number>();
      for (const item of data.items) {
        if (item.pctChange != null) map.set(item.tsCode, item.pctChange);
      }
      return map;
    },
  });
}
