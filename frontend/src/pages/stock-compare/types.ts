// 股票对比页面相关类型定义

import { CandlePoint } from '@/shared/types/chart';

export interface SelectedStock {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  close: number;
  pctChange1d: number;
  rps10: number;
  amount: number;
}

export interface CompareChartData {
  tsCode: string;
  stockName: string;
  sectorName: string;
  data: CandlePoint[];
  rps10: number;
}

export interface RSLabel {
  tsCode: string;
  value: number; // RPS10值
  x: number;     // 时间点位置
  y: number;     // 价格位置
  color: string;
}

export interface ChartPoint {
  time: string;
  value: number; // 百分比变化
}

// 扩展 K 线数据点类型
export interface ExtendedCandlePoint extends CandlePoint {
  pctChange?: number; // 相对于基准日的涨跌幅
}