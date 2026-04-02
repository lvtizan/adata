import type { MarketOverview, SectorRanking, SectorStock } from "@/shared/types";

export type IntradayGrade = "S" | "A" | "B" | "C" | "D" | string;

export interface IntradayScoringTag {
  key: string;
  label: string;
  tone?: "positive" | "neutral" | "warning" | "danger";
}

export interface IntradaySectorOverview
  extends Pick<SectorRanking, "sectorCode" | "sectorName" | "pctChange1d" | "limitUpCount" | "amount"> {
  rank?: number;
  status?: string;
  rps10?: number;
}

export interface IntradayStockOverview
  extends Pick<SectorStock, "tsCode" | "stockName" | "close" | "pctChange1d" | "amount"> {
  score?: number | null;
  grade?: IntradayGrade | null;
  tags?: string[];
  note?: string;
}

export interface IntradayScoreBreakdown {
  marketScore: number;
  sectorScore: number;
  patternScore: number;
  flowScore: number;
  riskPenalty: number;
  fundamentalScore?: number | null;
  catalystScore?: number | null;
}

export interface IntradayScoreResult extends IntradayScoreBreakdown {
  totalScore: number;
  total: number;
  grade: IntradayGrade;
  verdict: string;
  tags: string[];
  reason?: string;
  market: number;
  sector: number;
  pattern: number;
  flow: number;
  fundamental?: number | null;
  catalyst?: number | null;
  penalty: number;
}

export interface IntradayScoringContext {
  market?: MarketOverview;
  sector?: SectorRanking;
}

export interface IntradayStockScoringInput extends IntradayScoringContext {
  stock: SectorStock;
  sector: SectorRanking;
}

export interface IntradaySectorScoringInput extends IntradayScoringContext {
  sector: SectorRanking;
}

export interface IntradayMarketContextProps {
  overview?: MarketOverview;
  selectedSector?: IntradaySectorOverview | null;
  selectedStock?: IntradayStockOverview | null;
  className?: string;
}

export interface IntradayStockResearchPanelProps {
  score?: Partial<IntradayScoreResult> | null;
  stock?: IntradayStockOverview | null;
  sector?: IntradaySectorOverview | null;
  className?: string;
}

export interface IntradayResearchWorkspaceProps extends IntradayMarketContextProps {
  score?: Partial<IntradayScoreResult> | null;
}
