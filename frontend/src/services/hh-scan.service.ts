import { api } from "./api-client";

export interface DoubleBottomStock {
  tsCode: string;
  stockName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  rps20: number;
  amount: number;
  signalDate: string;
  signalType: string;
  signalPrice: number;
  signalCount: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface DoubleBottomSector {
  sectorCode: string;
  sectorName: string;
  signalCount: number;
  stocks: DoubleBottomStock[];
}

export interface DoubleBottomScanResult {
  tradeDate: string;
  totalSignals: number;
  sectors: DoubleBottomSector[];
}

export async function getDoubleBottomScan(): Promise<DoubleBottomScanResult> {
  return api<DoubleBottomScanResult>("/double-bottom-scan", { cacheTTL: 600_000 });
}
