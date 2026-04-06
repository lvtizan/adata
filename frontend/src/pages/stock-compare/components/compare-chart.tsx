'use client';

import { useMemo } from 'react';
import { LineCompareChart, type LineSeriesData } from '@/shared/charts/line-compare-chart';
import type { ChartPoint } from '../types';

interface CompareChartProps {
  data: Array<{
    tsCode: string;
    stockName: string;
    sectorName: string;
    normalizedData: ChartPoint[];
    rps10: number;
    color: string;
  }>;
}

export function CompareChart({ data }: CompareChartProps) {
  const series: LineSeriesData[] = useMemo(
    () =>
      data.map((stock) => ({
        label: stock.stockName,
        color: stock.color,
        data: stock.normalizedData,
        enabled: true,
        endLabel: `RS ${stock.rps10.toFixed(0)}`,
      })),
    [data],
  );

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        暂无数据
      </div>
    );
  }

  return <LineCompareChart series={series} height={500} />;
}
