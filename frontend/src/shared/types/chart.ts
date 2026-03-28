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

export interface ChartData {
  code: string;
  name: string;
  points: CandlePoint[];
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
