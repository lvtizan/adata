import { useState, useMemo, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  TRACKED_INDICES,
  DEFAULT_ENABLED,
  useMultiIndexCharts,
} from "@/queries/index-compare.queries";
import { getSectorChart } from "@/services";
import { KlineChart } from "@/shared/charts/kline-chart";
import { LineCompareChart, type LineSeriesData } from "@/shared/charts/line-compare-chart";
import type { MainlineSector } from "@/shared/types";

const PALETTE = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#14b8a6",
  "#f97316", "#8b5cf6", "#10b981",
];

const GROUP_LABELS = ["大盘", "大中小", "成长", "情绪", "港股"] as const;

interface IndexComparePanelProps {
  mainlines?: MainlineSector[];
}

export function IndexComparePanel({ mainlines = [] }: IndexComparePanelProps) {
  const [enabledCodes, setEnabledCodes] = useState<Set<string>>(
    () => new Set(DEFAULT_ENABLED),
  );
  const [bars, setBars] = useState(60);

  // 只获取启用的指数数据
  const enabledIndices = useMemo(
    () => TRACKED_INDICES.filter((idx) => enabledCodes.has(idx.tsCode)),
    [enabledCodes],
  );

  const { data, isLoading } = useMultiIndexCharts(enabledIndices, bars);

  // 构建图表系列
  const chartSeries: LineSeriesData[] = useMemo(() => {
    return data.map((d, i) => ({
      label: d.index.name,
      color: PALETTE[TRACKED_INDICES.findIndex((t) => t.tsCode === d.index.tsCode) % PALETTE.length],
      data: d.normalizedData,
      enabled: true,
    }));
  }, [data]);

  const toggleIndex = useCallback((tsCode: string) => {
    setEnabledCodes((prev) => {
      const next = new Set(prev);
      if (next.has(tsCode)) {
        next.delete(tsCode);
      } else {
        next.add(tsCode);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: string) => {
    const groupCodes = TRACKED_INDICES.filter((i) => i.group === group).map((i) => i.tsCode);
    setEnabledCodes((prev) => {
      const next = new Set(prev);
      const allEnabled = groupCodes.every((c) => next.has(c));
      for (const c of groupCodes) {
        if (allEnabled) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  }, []);

  const handleToggleSeries = useCallback(
    (label: string) => {
      const idx = TRACKED_INDICES.find((i) => i.name === label);
      if (idx) toggleIndex(idx.tsCode);
    },
    [toggleIndex],
  );

  const mainlineSectors = useMemo(
    () => mainlines.filter((s) => !!s.sectorCode),
    [mainlines],
  );

  const mainlineQueries = useQueries({
    queries: mainlineSectors.map((line) => ({
      queryKey: ["chart", "sector", line.sectorCode, 90, "index-radar-mainline"],
      queryFn: () => getSectorChart(line.sectorCode, 90),
      staleTime: 120_000,
    })),
  });

  return (
    <div className="flex flex-col gap-3">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">指数走势对比</h3>
        <div className="flex items-center gap-2">
          {/* 周期切换 */}
          {[
            { label: "1月", value: 20 },
            { label: "3月", value: 60 },
            { label: "6月", value: 120 },
            { label: "1年", value: 250 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBars(opt.value)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                bars === opt.value
                  ? "bg-accent text-accent-foreground"
                  : "text-text-tertiary hover:bg-surface-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 指数选择器 - 按分组 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {GROUP_LABELS.map((group) => {
          const groupIndices = TRACKED_INDICES.filter((i) => i.group === group);
          const allEnabled = groupIndices.every((i) => enabledCodes.has(i.tsCode));
          return (
            <div key={group} className="flex items-center gap-1.5">
              <button
                onClick={() => toggleGroup(group)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  allEnabled
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {group}
              </button>
              {groupIndices.map((idx) => {
                const enabled = enabledCodes.has(idx.tsCode);
                const colorIdx = TRACKED_INDICES.indexOf(idx);
                return (
                  <button
                    key={idx.tsCode}
                    onClick={() => toggleIndex(idx.tsCode)}
                    className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-all ${
                      enabled ? "opacity-100" : "opacity-35"
                    } hover:bg-surface-hover`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: PALETTE[colorIdx % PALETTE.length] }}
                    />
                    {idx.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 图表 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[300px] text-text-tertiary text-sm">
          加载指数数据...
        </div>
      ) : chartSeries.length === 0 ? (
        <div className="flex items-center justify-center h-[300px] text-text-tertiary text-sm">
          请选择至少一个指数
        </div>
      ) : (
        <LineCompareChart
          series={chartSeries}
          height={340}
          showLegend={false}
          onToggleSeries={handleToggleSeries}
        />
      )}

      <div className="mt-2 border-t border-border-default pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium">核心主线指数（日K）</h4>
          <span className="text-xs text-text-tertiary">{mainlineSectors.length} 个</span>
        </div>
        {mainlineSectors.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-sm text-text-tertiary border border-border-default rounded">
            当前没有可展示的核心主线指数
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}
          >
            {mainlineSectors.map((line, idx) => {
              const q = mainlineQueries[idx];
              const points = q?.data?.points ?? [];
              return (
                <div key={line.sectorCode} className="rounded border border-border-default bg-surface">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
                    <div>
                      <div className="text-sm font-medium">{line.sectorName}</div>
                      <div className="text-[10px] text-text-tertiary font-mono">{line.sectorCode}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-semibold ${line.pctChange1d >= 0 ? "text-state-up" : "text-state-down"}`}>
                        {line.pctChange1d >= 0 ? "+" : ""}{line.pctChange1d.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-text-tertiary">RPS {line.compositeScore?.toFixed?.(0) ?? "-"}</div>
                    </div>
                  </div>
                  <div className="h-[220px]">
                    {q?.isLoading ? (
                      <div className="h-full flex items-center justify-center text-xs text-text-tertiary">加载中...</div>
                    ) : points.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-text-tertiary">暂无日K数据</div>
                    ) : (
                      <KlineChart points={points} height={220} showVolume={false} frequency="1d" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
