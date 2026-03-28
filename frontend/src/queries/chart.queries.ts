import { useQuery } from "@tanstack/react-query";
import { getStockChart, getSectorChart, getRelativeStrength } from "@/services";

export function useStockChart(tsCode: string, bars = 120) {
  return useQuery({
    queryKey: ["chart", "stock", tsCode, bars],
    queryFn: () => getStockChart(tsCode, bars),
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
  });
}
