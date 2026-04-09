import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getStockChart } from '@/services';
import { useStockCompareStore } from '@/store';
import { ChartPoint } from '@/pages/stock-compare/types';
import { CandlePoint } from '@/shared/types/chart';

// 找出所有股票日期的交集，作为统一的基准日
function findBaseDate(stocksData: Array<{points: CandlePoint[]}>): string | null {
  if (stocksData.length === 0) return null;

  // 找出所有股票的共同日期
  const allDates = new Set(stocksData[0].points.map(p => p.time));
  const stockDates = stocksData.slice(1).map(stockData =>
    new Set(stockData.points.map(p => p.time))
  );

  // 交集计算
  for (const dates of stockDates) {
    for (const date of allDates) {
      if (!dates.has(date)) {
        allDates.delete(date);
      }
    }
  }

  // 返回最早的共同日期
  const sortedDates = Array.from(allDates).sort();
  return sortedDates[0] || null;
}

// 将K线数据转换为相对涨幅百分比
function normalizeToPctChange(points: CandlePoint[]): ChartPoint[] {
  if (points.length === 0) return [];

  // 找到基准日（所有股票的共同最早日期）
  const baseDate = findBaseDate([{ points }]);
  if (!baseDate) return points.map(p => ({ time: p.time, value: 0 }));

  // 找到基准日的价格
  const basePoint = points.find(p => p.time === baseDate);
  if (!basePoint) return points.map(p => ({ time: p.time, value: 0 }));

  const basePrice = basePoint.close;

  // 计算相对涨幅百分比
  return points.map(p => ({
    time: p.time,
    value: ((p.close - basePrice) / basePrice) * 100,
  }));
}

// 检查股票数据是否有效
function isValidStockData(data: {points: CandlePoint[]}): boolean {
  return data && data.points && data.points.length > 0;
}

// 获取RPS10值（从选中的股票数据中获取）
function getRps10(stockData: any): number {
  // 如果是搜索结果数据
  if (stockData.rps10 !== undefined) {
    return stockData.rps10;
  }
  // 如果是从API获取的图表数据，需要从points中计算
  if (stockData.points && stockData.points.length > 0) {
    const lastPoint = stockData.points[stockData.points.length - 1];
    return lastPoint.rps10 || 0;
  }
  return 0;
}

// 使用多个查询并行获取股票数据
export function useMultiStockCharts(stocks: Array<{
  tsCode: string;
  stockName: string;
  sectorName: string;
  rps10?: number;
  rps20?: number;
}>) {
  const queries = stocks.map(stock => ({
    queryKey: ['chart', 'stock', stock.tsCode, 120, '1d'],
    queryFn: () => getStockChart(stock.tsCode, 120, '1d'),
    staleTime: 60_000, // 1分钟缓存
    select: (data: {points: CandlePoint[]}) => ({
      ...stock,
      points: data.points || [],
      // 图表点数据不携带 rps 字段，优先用已选股票快照值，缺失再降级
      rps10: stock.rps10 ?? stock.rps20 ?? getRps10(data),
    }),
  }));

  const results = useQueries({ queries });

  // 处理数据
  const processedData = results.map((result, index) => {
    if (!result.data) {
      return {
        stock: stocks[index],
        normalizedData: [],
        rps10: 0,
        error: result.error,
        isLoading: result.isLoading,
      };
    }

    const normalizedData = normalizeToPctChange(result.data.points);

    return {
      stock: stocks[index],
      normalizedData,
      rps10: result.data.rps10,
      error: result.error,
      isLoading: result.isLoading,
    };
  });

  // 计算整体状态
  const isLoading = results.some(r => r.isLoading);
  const errors = results.filter(r => r.error).length;
  const hasValidData = processedData.some(d => d.normalizedData.length > 0);

  return {
    data: processedData,
    isLoading,
    errors,
    hasValidData,
    totalStocks: stocks.length,
  };
}

// 单个股票数据查询
export function useStockCompareChart(tsCode: string, bars = 120) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['chart', 'compare', tsCode, bars, '1d'],
    queryFn: () => getStockChart(tsCode, bars, '1d'),
    staleTime: 60_000,
    select: (data: {points: CandlePoint[]}) => ({
      points: data.points || [],
      rps10: getRps10(data),
      normalizedData: normalizeToPctChange(data.points),
    }),
  });

  return {
    data,
    isLoading,
    error,
  };
}

// 获取基准日期和归一化后的数据
export function useNormalizedChartData(stocks: Array<{tsCode: string; points: CandlePoint[]}>) {
  const { data, isLoading, error } = useMultiStockCharts(stocks);

  // 找出所有股票的共同基准日
  const baseDate = useMemo(() => {
    if (!data || data.length === 0) return null;

    const allPoints = data.flatMap(d => d.normalizedData);
    if (allPoints.length === 0) return null;

    const firstDate = allPoints[0].time;
    return firstDate;
  }, [data]);

  // 找到最长的数据长度，用于统一X轴
  const maxLength = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.map(d => d.normalizedData.length));
  }, [data]);

  return {
    data: data.map(d => ({
      ...d,
      normalizedData: d.normalizedData.slice(0, maxLength),
    })),
    baseDate,
    maxLength,
    isLoading,
    error,
  };
}
