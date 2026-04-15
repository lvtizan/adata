import { api } from "./api-client";

export interface ThsKlinePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface ThsKlineResult {
  code: string;
  name: string;
  market: "stock" | "sector" | "index";
  freq: "1d" | "5m" | "1w" | "1M";
  points: ThsKlinePoint[];
  source: "ths";
  error?: string;
}

export function getThsKline(code: string, market: "stock" | "sector" | "index", freq: "1d" | "5m" | "1w" | "1M", bars = 240) {
  const params = new URLSearchParams({ code, market, freq, bars: String(bars) });
  return api<ThsKlineResult>(`/ths/kline?${params.toString()}`, { cacheTTL: 60_000 });
}
