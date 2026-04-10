export interface WatchlistItem {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  subgroup: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  rps20: number;
  amount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BullCampItem {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  sectorPctChange5d: number;
  sectorPctChange10d: number;
  rps10: number;
  rps20: number;
  sectorRps10: number;
  amount: number;
  ma20: number;
  relativeStrengthLatest: number;
  relativeStrength5d: number;
  relativeStrength10d: number;
  relativeStrength20d: number;
  campScore: number;
  daysInCamp: number;
  isNew: boolean;
  hasRecentAnnouncement: boolean;
  patternTags?: string[];
  campScoreHistory?: (number | null)[];
}

export interface StockNewsItem {
  date: string;
  title: string;
  url?: string;
}

export interface ChartDrawingPoint {
  timestamp?: number;
  dataIndex?: number;
  value?: number;
}

export interface ChartDrawingOverlay {
  id?: string;
  groupId?: string;
  paneId?: string;
  name: string;
  lock?: boolean;
  visible?: boolean;
  zLevel?: number;
  mode?: string;
  modeSensitivity?: number;
  points: ChartDrawingPoint[];
  styles?: Record<string, unknown>;
  extendData?: unknown;
}

export interface ChartDrawingsDocument {
  symbol: string;
  scope: string;
  timeframe: string;
  overlays: ChartDrawingOverlay[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MarketSearchStockResult {
  type: "stock";
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  rps20: number;
  amount: number;
}

export interface MarketSearchSectorResult {
  type: "sector";
  sectorCode: string;
  sectorName: string;
  rps10?: number;
  pctChange5d?: number;
}

export interface MarketSearchResult {
  stocks: MarketSearchStockResult[];
  sectors: MarketSearchSectorResult[];
}

// HH 信号成功率统计
export interface HHSignalDetail {
  date: string;
  type: string;          // "H1", "H2", "H3"
  price: number;
  supportPrice?: number;
  volumeRatio?: number;
  buySignal: boolean;
  ret5d: number | null;
  ret10d: number | null;
  ret20d: number | null;
  maxGain20d: number | null;
  success: boolean;
}

export interface HHTypeStats {
  count: number;
  winRate5d: number | null;
  winRate10d: number | null;
  winRate20d: number | null;
  avgRet5d: number | null;
  avgRet10d: number | null;
  avgRet20d: number | null;
  avgMaxGain20d: number | null;
}

export interface HHStatsResult {
  tsCode: string;
  totalSignals: number;
  signals: HHSignalDetail[];
  statsByType: Record<string, HHTypeStats>;
  overall: {
    winRate5d: number | null;
    winRate10d: number | null;
    winRate20d: number | null;
    avgRet5d: number | null;
    avgRet10d: number | null;
    avgRet20d: number | null;
    avgMaxGain20d: number | null;
  };
}

export interface TradePlanItem {
  id: number;
  tsCode: string;
  stockName: string;
  sectorCode?: string;
  sectorName?: string;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  planRiskReward: number | null;
  realTakeProfit: number | null;
  realRiskReward: number | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}
