import { api } from "./api-client";
import type { ChartData, RelativeStrengthData } from "@/shared/types";

interface StockChartOptions {
  realOnly?: boolean;
}

export function getStockChart(tsCode: string, bars = 120, frequency = "1d", options: StockChartOptions = {}) {
  const params = new URLSearchParams({
    bars: String(bars),
    frequency,
  });
  if (options.realOnly) {
    params.set("realOnly", "1");
  }
  return api<ChartData>(`/charts/stock/${tsCode}?${params.toString()}`, { cacheTTL: 300_000 });
}

export function getSectorChart(sectorCode: string, bars = 120) {
  return api<ChartData>(`/charts/sector/${sectorCode}?bars=${bars}`, { cacheTTL: 300_000 });
}

export function getIndexChart(tsCode: string, bars = 180) {
  return api<ChartData>(`/charts/index/${tsCode}?bars=${bars}`, { cacheTTL: 300_000 });
}

export function getRelativeStrength(tsCode: string, sectorCode: string) {
  return api<RelativeStrengthData>(`/relative-strength?tsCode=${tsCode}&sectorCode=${sectorCode}`, { cacheTTL: 300_000 });
}
