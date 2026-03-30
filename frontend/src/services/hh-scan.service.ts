import { api } from "./api-client";

export interface HHScanStock {
  tsCode: string;
  stockName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  rps20: number;
  campScore: number;
  amount: number;
  signalDate: string;
  signalType: string;
  signalPrice: number;
}

export interface HHScanSector {
  sectorCode: string;
  sectorName: string;
  signalCount: number;
  stocks: HHScanStock[];
}

export interface HHScanResult {
  tradeDate: string;
  totalSignals: number;
  sectors: HHScanSector[];
}

export async function getHHScan(): Promise<HHScanResult> {
  return api<HHScanResult>("/hh-scan");
}
