import { useQuery } from "@tanstack/react-query";
import { getStockChart, getSectorChart, getRelativeStrength } from "@/services";

export function useStockChart(tsCode: string, bars = 120, frequency = "1d") {
  return useQuery({
    queryKey: ["chart", "stock", tsCode, bars, frequency],
    queryFn: () => getStockChart(tsCode, bars, frequency),
    enabled: !!tsCode,
    staleTime: 60_000,
  });
}

export function useSectorChart(sectorCode: string, bars = 120) {
  return useQuery({
    queryKey: ["chart", "sector", sectorCode, bars],
    queryFn: () => getSectorChart(sectorCode, bars),
    enabled: !!sectorCode,
    staleTime: 60_000,
  });
}

export function useRelativeStrength(tsCode: string, sectorCode: string) {
  return useQuery({
    queryKey: ["relative-strength", tsCode, sectorCode],
    queryFn: () => getRelativeStrength(tsCode, sectorCode),
    enabled: !!tsCode && !!sectorCode,
    staleTime: 60_000,
    retry: true,                  // 无限重试，直到成功
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 30000), // 指数退避，2s→4s→8s→...→最长30s
  });
}
