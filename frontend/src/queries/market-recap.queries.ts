import { useQuery } from "@tanstack/react-query";
import { getMarketRecap } from "@/services";

export function useMarketRecap(tradeDate?: string) {
  return useQuery({
    queryKey: ["market", "recap", tradeDate],
    queryFn: () => getMarketRecap(tradeDate),
    staleTime: 60_000,
  });
}
