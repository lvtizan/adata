export interface SectorRanking {
  rank: number;
  rankChange: number | null;
  prevRank: number | null;
  sectorCode: string;
  sectorName: string;
  pctChange5d: number;
  pctChange10d: number;
  rps10: number;
  amount: number;
  limitUpCount: number;
}

export interface SectorStock {
  tsCode: string;
  stockName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  rps5: number;
  rps10: number;
  rps20: number;
  amount: number;
  ma20: number;
  dataMode: "full" | "fallback";
}
