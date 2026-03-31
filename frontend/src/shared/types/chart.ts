export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
}

// 冯总交易系统信号类型
// 信号链: 支撑位止跌 → H1(首次反包) → 回调 → H2(W底确认)
export interface FengSignalPoint {
  date: string;
  price: number;
  label: string;          // "止跌★5", "H1", "H2(W)"
  type: "stopDecline" | "h1" | "h2_w";
}

export interface FengBuySignal {
  type: "buy";
  date: string;
  price: number;
  pattern: string;
  patternLabel: string;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

export interface FengSignals {
  signals: FengSignalPoint[];
  buySignals: FengBuySignal[];
}

export interface ChartData {
  code: string;
  name: string;
  points: CandlePoint[];
  fengSignals?: FengSignals;
}

export interface RpsSeries {
  time: string;
  value: number;
}

export interface RelativeStrengthSide {
  tsCode?: string;
  sectorCode?: string;
  name: string;
  pctChange5d: number;
  pctChange10d: number;
  pctChange20d: number;
  rpsSeries: RpsSeries[];
}

export interface RelativeStrengthData {
  stock: RelativeStrengthSide;
  sector: RelativeStrengthSide;
  spreadSeries: RpsSeries[];
  summary: {
    relativeStrength5d: number;
    relativeStrength10d: number;
    relativeStrength20d: number;
    label: string;
  };
}

export interface FinancialPeriod {
  endDate: string;
  annDate: string;
  revenue: number | null;
  operateProfit: number | null;
  netIncome: number | null;
  basicEps: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  debtToAssets: number | null;
  revenueYoY: number | null;
  netIncomeYoY: number | null;
}

export interface FinancialsData {
  code: string;
  name: string;
  periods: FinancialPeriod[];
}
