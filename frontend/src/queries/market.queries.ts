import { useQuery } from "@tanstack/react-query";
import { getMarketOverview } from "@/services";

export function useMarketOverview(tradeDate?: string) {
  return useQuery({
    queryKey: ["market", "overview", tradeDate],
    queryFn: () => getMarketOverview(tradeDate),
    staleTime: 60_000,
  });
}
