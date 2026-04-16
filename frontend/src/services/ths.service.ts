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

// ───────────────────────── Dashboard v2 接口 ─────────────────────────

export interface ThsSector {
  code: string;
  name: string;
  rs120: number | null;
}

export interface ThsSectorMember {
  code: string;
  name: string;
  price: number;
  pctChange: number;
  amount: number;
  rs120?: number;
}

export interface MySector {
  code: string;
  name: string;
  addedAt: number;
}

export function getThsSectors() {
  return api<{ items: ThsSector[] }>("/ths/sectors", { cacheTTL: 300_000 });
}

export function getThsSectorMembers(sectorCode: string) {
  return api<{ items: ThsSectorMember[] }>(
    `/ths/sectors/${encodeURIComponent(sectorCode)}/members`,
    { cacheTTL: 60_000 },
  );
}

export function getMySectors() {
  return api<{ items: MySector[] }>("/ths/my-sectors");
}

export function addMySector(code: string, name: string) {
  return api<{ ok: boolean }>("/ths/my-sectors", {
    method: "POST",
    body: JSON.stringify({ action: "add", code, name }),
  });
}

export function removeMySector(code: string) {
  return api<{ ok: boolean }>("/ths/my-sectors", {
    method: "POST",
    body: JSON.stringify({ action: "remove", code }),
  });
}

export function refreshThsRs120() {
  return api<{ ok: boolean; message: string }>("/ths/refresh-rs120", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
