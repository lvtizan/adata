import { api } from "./api-client";

// ── YTC 六步法指数风险分析类型 ──

export interface SRZone {
  price: number;
  count: number;
  indices: number[];
  lastIndex: number;
  zone: [number, number];
}

export interface IndexStructure {
  supports: SRZone[];
  resistances: SRZone[];
  positionInRange: number;
  nearSupport: boolean;
  nearResistance: boolean;
  swingHighCount: number;
  swingLowCount: number;
}

export interface IndexTrend {
  trend: "uptrend" | "downtrend" | "sideways" | "unknown";
  trendCn: string;
  hhCount: number;
  lhCount: number;
  hlCount: number;
  llCount: number;
  upScore: number;
  downScore: number;
  maAlignment: "bullish" | "bearish" | "mixed" | "unknown";
  aboveMa20: boolean;
  aboveMa60: boolean;
}

export interface Wave {
  amplitude: number;
  duration: number;
  avgVol: number;
  fromIdx: number;
  toIdx: number;
  direction: "up" | "down";
}

export interface IndexStrength {
  weakening: boolean;
  strengthening: boolean;
  detail: string;
  impulseWaves: Wave[];
  correctionWaves: Wave[];
}

export interface IndexVerdict {
  riskScore: number;
  riskLevel: number; // 1-5
  riskLabel: string;
  tone: "positive" | "neutral" | "warning" | "danger";
  signal: string;
  signalDetail: string;
  projection: string;
  opportunityZone: string;
}

export interface IndexRiskItem {
  tsCode: string;
  name: string;
  group: string;
  price: number;
  pctChg: number;
  ret5: number;
  ret20: number;
  structure: IndexStructure;
  trend: IndexTrend;
  strength: IndexStrength;
  verdict: IndexVerdict;
}

export interface IndexRiskSummary {
  avgRiskScore: number;
  overall: string;
  overallTone: "positive" | "neutral" | "warning" | "danger";
  advice: string;
  groupRisks: Record<string, number>;
  topSignals: number;
  bottomSignals: number;
  strongSignals: number;
  weakeningCount: number;
  uptrendCount: number;
  downtrendCount: number;
  totalAnalyzed: number;
}

export interface IndexRiskResult {
  tradeDate: string;
  indices: IndexRiskItem[];
  summary: IndexRiskSummary;
}

export function getIndexRisk() {
  return api<IndexRiskResult>("/index-risk", { cacheTTL: 120_000 });
}
