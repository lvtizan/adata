import { api } from "./api-client";
import type { SectorRanking, SectorStock, ListResponse } from "@/shared/types";

export function getSectorRankings(sortBy = "rps10", keyword = "") {
  const params = new URLSearchParams({ sortBy, keyword });
  return api<ListResponse<SectorRanking>>(`/sectors/rankings?${params}`, { cacheTTL: 120_000 });
}

export function getSectorStocks(sectorCode: string, sortBy = "rps10") {
  return api<ListResponse<SectorStock>>(`/sectors/${sectorCode}/stocks?sortBy=${sortBy}`, { cacheTTL: 120_000 });
}
