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
}
