import { api } from "./api-client";
import type { ChartData, RelativeStrengthData } from "@/shared/types";

export function getStockChart(tsCode: string, bars = 120, frequency = "1d") {
  return api<ChartData>(`/charts/stock/${tsCode}?bars=${bars}&frequency=${frequency}`);
}

export function getSectorChart(sectorCode: string, bars = 120) {
  return api<ChartData>(`/charts/sector/${sectorCode}?bars=${bars}`);
}

export function getRelativeStrength(tsCode: string, sectorCode: string) {
  return api<RelativeStrengthData>(`/relative-strength?tsCode=${tsCode}&sectorCode=${sectorCode}`);
}
