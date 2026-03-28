import type { SectorRanking } from "./sector";

export interface MarketState {
  label: string;
  riskLevel: string;
  actionAdvice: string;
  openPermissionLight: "green" | "yellow" | "red";
  score: number;
}

export interface EmotionState {
  label: string;
  score: number;
  warnings: string[];
}

export interface MarketBreadth {
  upCount: number;
  downCount: number;
  limitUpCount: number;
  limitDownCount: number;
  brokenBoardRate: number;
  newHighCount: number;
  newLowCount: number;
  aboveMa20Ratio: number;
  aboveMa60Ratio: number;
}

export interface Mainline {
  name: string;
  status: string;
  reason: string;
}

export interface RiskFactor {
  key: string;
  label: string;
  value: number | string;
}

export interface MarketRisk {
  score: number;
  label: string;
  shortLabel: string;
  tone: "positive" | "neutral" | "warning" | "danger";
  summary: string;
  pointerValue: number;
  emotion: string;
  factors: RiskFactor[];
}

export interface MarketOverview {
  tradeDate: string;
  marketState: MarketState;
  emotionState: EmotionState;
  breadth: MarketBreadth;
  mainline: Mainline;
  marketRisk: MarketRisk;
  topSectors: SectorRanking[];
}
