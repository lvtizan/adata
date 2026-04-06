import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getIndexChart } from "@/services";
import type { CandlePoint } from "@/shared/types/chart";

export interface TrackedIndex {
  tsCode: string;
  name: string;
  group: string;
}

// 13 个跟踪指数（与后端 TRACKED_INDICES 对应）
export const TRACKED_INDICES: TrackedIndex[] = [
  { tsCode: "000001.SH", name: "上证指数", group: "大盘" },
  { tsCode: "399106.SZ", name: "深证综指", group: "大盘" },
  { tsCode: "000300.SH", name: "沪深300", group: "大盘" },
  { tsCode: "883421.TI", name: "同花顺全A", group: "大盘" },
  { tsCode: "000016.SH", name: "上证50", group: "大中小" },
  { tsCode: "000852.SH", name: "中证1000", group: "大中小" },
  { tsCode: "932000.CSI", name: "中证2000", group: "大中小" },
  { tsCode: "399006.SZ", name: "创业板指", group: "成长" },
  { tsCode: "000688.SH", name: "科创50", group: "成长" },
  { tsCode: "883307.TI", name: "宽基ETF", group: "情绪" },
  { tsCode: "883408.TI", name: "近期新高", group: "情绪" },
  { tsCode: "830000.TI", name: "A股平均股价", group: "情绪" },
  { tsCode: "HSTECH.HI", name: "恒生科技", group: "港股" },
];

// 默认启用的指数
const DEFAULT_ENABLED = new Set([
  "000001.SH", "000300.SH", "399006.SZ", "000852.SH", "883421.TI",
]);

function normalizeToPctChange(points: CandlePoint[]): Array<{ time: string; value: number }> {
  if (points.length === 0) return [];
  const basePrice = points[0].close;
  if (basePrice === 0) return points.map((p) => ({ time: p.time, value: 0 }));
  return points.map((p) => ({
    time: p.time,
    value: ((p.close - basePrice) / basePrice) * 100,
  }));
}

export function useMultiIndexCharts(
  indices: TrackedIndex[],
  bars = 120,
) {
  const queries = indices.map((idx) => ({
    queryKey: ["chart", "index", idx.tsCode, bars],
    queryFn: () => getIndexChart(idx.tsCode, bars),
    staleTime: 5 * 60_000,
    select: (data: { points: CandlePoint[] }) => ({
      ...idx,
      points: data.points || [],
      normalizedData: normalizeToPctChange(data.points || []),
    }),
  }));

  const results = useQueries({ queries });

  const data = useMemo(
    () =>
      results
        .map((r, i) => ({
          index: indices[i],
          normalizedData: r.data?.normalizedData ?? [],
          isLoading: r.isLoading,
          error: r.error,
        }))
        .filter((d) => d.normalizedData.length > 0),
    [results, indices],
  );

  const isLoading = results.some((r) => r.isLoading);
  const errors = results.filter((r) => r.error).length;

  return { data, isLoading, errors };
}

export { DEFAULT_ENABLED };
