import { useQuery } from "@tanstack/react-query";
import { getStockChart, getSectorChart, getSectorEqualWeightChart, getRelativeStrength } from "@/services";

interface UseStockChartOptions {
  realOnly?: boolean;
}

export function useStockChart(tsCode: string, bars = 120, frequency = "1d", options: UseStockChartOptions = {}) {
  return useQuery({
    queryKey: ["chart", "stock", tsCode, bars, frequency, options.realOnly ? "realOnly" : "all"],
    queryFn: () => getStockChart(tsCode, bars, frequency, options),
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

export function useSectorEqualWeightChart(sectorCode: string, bars = 180) {
  return useQuery({
    queryKey: ["chart", "sector-eq", sectorCode, bars],
    queryFn: () => getSectorEqualWeightChart(sectorCode, bars),
    enabled: !!sectorCode,
    staleTime: 600_000,
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
