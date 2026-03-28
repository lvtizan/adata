import { useQuery } from "@tanstack/react-query";
import { getSectorRankings, getSectorStocks } from "@/services";

export function useSectorRankings(sortBy = "rps10", keyword = "") {
  return useQuery({
    queryKey: ["sectors", "rankings", sortBy, keyword],
    queryFn: () => getSectorRankings(sortBy, keyword),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useSectorStocks(sectorCode: string, sortBy = "rps10") {
  return useQuery({
    queryKey: ["sectors", sectorCode, "stocks", sortBy],
    queryFn: () => getSectorStocks(sectorCode, sortBy),
    enabled: !!sectorCode,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}
