import { api } from "./api-client";

export interface InstitutionalItem {
  tsCode: string;
  stockName: string;
  close: number;
  pctChg: number;
  buyCount: number;
  sellCount: number;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
}

export interface HotMoneyStock {
  tsCode: string;
  stockName: string;
  netAmount: number;
  direction: "buy" | "sell";
}

export interface MarketRecapResult {
  tradeDate: string;
  limitUpHotspots: {
    limitUpCount: number;
    limitDownCount: number;
    byBoard: Array<{
      board: string;
      count: number;
      stocks: Array<{ tsCode: string; stockName: string; sectorName: string; close: number; pctChg: number }>;
    }>;
    bySector: Array<{
      sectorName: string;
      count: number;
      stocks: Array<{ tsCode: string; stockName: string; close: number; pctChg: number }>;
    }>;
  };
  institutional: {
    dailyNetBuy: Array<InstitutionalItem>;
    dailyNetSell: Array<InstitutionalItem>;
    threeDay: { netBuy: Array<InstitutionalItem>; netSell: Array<InstitutionalItem> };
  };
  hotMoney: {
    netBuy: Array<{ desk: string; stocks: Array<HotMoneyStock> }>;
    netSell: Array<{ desk: string; stocks: Array<HotMoneyStock> }>;
  };
  newHighs: {
    count: number;
    trend: { today: number; yesterday: number; dayBefore: number };
    stocks: Array<{ tsCode: string; stockName: string; pctChg: number; close: number; sectorName: string }>;
  };
  alerts: {
    items: Array<{ tsCode: string; stockName: string; close: number; pctChg: number; deviation: number; sectorName: string; alertType: string }>;
  };
}

export function getMarketRecap(tradeDate?: string): Promise<MarketRecapResult> {
  const qs = tradeDate ? `?tradeDate=${tradeDate}` : "";
  return api<MarketRecapResult>(`/market/recap${qs}`);
}
