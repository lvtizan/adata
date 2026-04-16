import { useEffect, useMemo, useRef } from "react";
import { useIntradaySectors, useIntradaySectorStocks, useMarketOverview } from "@/queries";
import { useIntradayStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { ChartShell } from "@/shared/charts";
import { StockKlineWorkbench } from "@/shared/charts/stock-kline-workbench";
import {
  scoreIntradayStock,
  clampScore,
  normalizePercentInput,
  scoreToneClass,
  type IntradayScoreResult,
  type IntradaySectorOverview,
  type IntradayStockOverview,
} from "@/features/intraday";
import { ShanghaiIndex5mChart } from "@/features/intraday/shanghai-index-chart";
import { cn } from "@/lib/utils";
import type { SectorRanking, SectorStock } from "@/shared/types";
import { Resizer, useResizablePct } from "@/shared/layout";

const sectorColumns: Column<SectorRanking>[] = [
  {
    key: "rank",
    label: "#",
    width: "32px",
    render: (item) => <span className="text-[11px] text-text-tertiary">{item.rank}</span>,
  },
  {
    key: "sectorName",
    label: "板块",
    render: (item) => (
      <span className="inline-block max-w-[110px] truncate text-sm font-medium" title={item.sectorName}>
        {item.sectorName}
      </span>
    ),
  },
  {
    key: "pctChange1d",
    label: "涨跌幅",
    align: "right",
    width: "68px",
    render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} />,
  },
  {
    key: "limitUpCount",
    label: "涨/跌",
    align: "right",
    width: "52px",
    render: (item) => (
      <span className="text-[11px]">
        <span className="text-state-up">{item.limitUpCount}</span>
        <span className="text-text-quaternary">/</span>
        <span className="text-state-down">{(item.amount || 0) - item.limitUpCount}</span>
      </span>
    ),
  },
];

const stockColumns: Column<SectorStock>[] = [
  {
    key: "stockName",
    label: "名称",
    render: (item) => (
      <div className="leading-tight">
        <span className="text-sm font-medium">{item.stockName}</span>
        <span className="block text-[10px] font-mono text-text-tertiary">{item.tsCode.replace(/\.\w+$/, "")}</span>
      </div>
    ),
  },
  {
    key: "close",
    label: "现价",
    align: "right",
    width: "64px",
    render: (item) => <span className="text-sm font-mono">{item.close || "-"}</span>,
  },
  {
    key: "pctChange1d",
    label: "涨跌幅",
    align: "right",
    width: "64px",
    render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} />,
  },
];

export default function IntradayPage() {
  const { data: overview } = useMarketOverview();
  const { data: rankings = [], isLoading } = useIntradaySectors();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useIntradayStore();
  const { data: stocks = [] } = useIntradaySectorStocks(selectedSectorCode);

  const containerRef = useRef<HTMLDivElement>(null);
  const col1 = useResizablePct(0.24, 0.18, 0.34, containerRef);
  const col2 = useResizablePct(0.26, 0.18, 0.36, containerRef);

  useEffect(() => {
    if (!selectedSectorCode && rankings.length > 0) {
      setSelectedSectorCode(rankings[0].sectorCode);
    }
  }, [rankings, selectedSectorCode, setSelectedSectorCode]);

  useEffect(() => {
    if (stocks.length > 0 && !stocks.some((s) => s.tsCode === selectedStockCode)) {
      setSelectedStockCode(stocks[0].tsCode);
    }
  }, [stocks, selectedStockCode, setSelectedStockCode]);

  const selectedSector = useMemo(
    () => rankings.find((item) => item.sectorCode === selectedSectorCode) ?? null,
    [rankings, selectedSectorCode],
  );
  const selectedStock = useMemo(
    () => stocks.find((item) => item.tsCode === selectedStockCode) ?? stocks[0] ?? null,
    [stocks, selectedStockCode],
  );

  const selectedScore = useMemo<IntradayScoreResult | null>(() => {
    if (!selectedSector || !selectedStock) return null;
    return scoreIntradayStock({ market: overview, sector: selectedSector, stock: selectedStock });
  }, [overview, selectedSector, selectedStock]);

  const selectedSectorOverview = useMemo<IntradaySectorOverview | null>(() => {
    if (!selectedSector) return null;
    return {
      sectorCode: selectedSector.sectorCode,
      sectorName: selectedSector.sectorName,
      pctChange1d: selectedSector.pctChange1d,
      limitUpCount: selectedSector.limitUpCount,
      amount: selectedSector.amount,
      rank: selectedSector.rank,
      status: selectedScore?.sector != null ? `板块分 ${Math.round(selectedScore.sector)}` : undefined,
      rps10: selectedSector.rps10,
    };
  }, [selectedSector, selectedScore]);

  const selectedStockOverview = useMemo<IntradayStockOverview | null>(() => {
    if (!selectedStock) return null;
    return {
      tsCode: selectedStock.tsCode,
      stockName: selectedStock.stockName,
      close: selectedStock.close,
      pctChange1d: selectedStock.pctChange1d,
      amount: selectedStock.amount,
      score: selectedScore?.totalScore ?? null,
      grade: selectedScore?.grade ?? null,
      tags: selectedScore?.tags ?? [],
      note: selectedScore?.verdict,
    };
  }, [selectedStock, selectedScore]);

  // Compute env score for top bar (same logic as MarketScoreTooltip)
  const envScore = useMemo<number | null>(() => {
    if (!overview) return null;
    const breadth = overview.breadth;
    const breadthDiffScore = clampScore(50 + ((breadth.upCount - breadth.downCount) / 4000) * 100);
    const highLowScore = clampScore(50 + ((breadth.newHighCount - breadth.newLowCount) / 200) * 50);
    const maScore = clampScore((normalizePercentInput(breadth.aboveMa20Ratio) + normalizePercentInput(breadth.aboveMa60Ratio)) / 2);
    const breadthScore = clampScore(breadthDiffScore * 0.45 + highLowScore * 0.25 + maScore * 0.3);
    const riskConverted = clampScore(100 - (overview.marketRisk.pointerValue ?? overview.marketRisk.score));
    return clampScore(
      clampScore(overview.marketState.score) * 0.35 +
      clampScore(overview.emotionState.score) * 0.25 +
      breadthScore * 0.25 +
      riskConverted * 0.15,
    );
  }, [overview]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部盘中环境横排 bar */}
      <div className="shrink-0 border-b border-border-default px-3 py-1.5 flex items-center gap-1 overflow-x-auto">
        <span className="text-sm font-semibold mr-2 shrink-0">盘中观察</span>
        {isLoading && <span className="animate-pulse text-xs text-accent mr-2 shrink-0">加载中...</span>}
        {overview ? (
          <div className="flex items-center gap-4 min-w-0">
            {/* 环境分 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">环境分</span>
              <span className={cn("text-[12px] font-semibold font-mono tabular-nums", scoreToneClass(envScore))}>
                {envScore != null ? Math.round(envScore) : "—"}
              </span>
            </div>
            <span className="h-3 w-px bg-border-default shrink-0" />
            {/* 市场状态 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">状态</span>
              <span className={cn(
                "text-[12px] font-semibold",
                overview.marketState.openPermissionLight === "green"
                  ? "text-state-up"
                  : overview.marketState.openPermissionLight === "yellow"
                  ? "text-state-warning"
                  : "text-state-down",
              )}>
                {overview.marketState.label}
              </span>
            </div>
            <span className="h-3 w-px bg-border-default shrink-0" />
            {/* 情绪 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">情绪</span>
              <span className={cn("text-[12px] font-semibold font-mono tabular-nums", scoreToneClass(overview.emotionState.score))}>
                {overview.emotionState.label} {Math.round(clampScore(overview.emotionState.score))}
              </span>
            </div>
            <span className="h-3 w-px bg-border-default shrink-0" />
            {/* 风险 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">风险</span>
              <span className={cn("text-[12px] font-semibold font-mono tabular-nums", scoreToneClass(overview.marketRisk.pointerValue ?? overview.marketRisk.score))}>
                {overview.marketRisk.label} {Math.round(clampScore(overview.marketRisk.pointerValue ?? overview.marketRisk.score))}
              </span>
            </div>
            <span className="h-3 w-px bg-border-default shrink-0" />
            {/* 涨跌家数 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">涨跌家数</span>
              <span className="text-[12px] font-mono tabular-nums">
                <span className="text-state-up">{overview.breadth.upCount}</span>
                <span className="text-text-quaternary">/</span>
                <span className="text-state-down">{overview.breadth.downCount}</span>
              </span>
            </div>
            <span className="h-3 w-px bg-border-default shrink-0" />
            {/* 连板/跌停 */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-text-tertiary">连板/跌停</span>
              <span className="text-[12px] font-mono tabular-nums">
                <span className="text-state-up">{overview.breadth.limitUpCount}</span>
                <span className="text-text-quaternary">/</span>
                <span className="text-state-down">{overview.breadth.limitDownCount}</span>
              </span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-text-tertiary">市场数据加载中...</span>
        )}
      </div>

      {/* 主区：3 列 */}
      <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
        {/* 列 1：概念板块 */}
        <div
          className="flex min-h-0 flex-col overflow-hidden border-r border-border-default"
          style={{ flex: `0 1 ${col1.pct * 100}%`, minWidth: 220 }}
        >
          <div className="shrink-0 border-b border-border-default px-3 py-2">
            <h2 className="text-sm font-medium">概念板块</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个板块</p>
          </div>
          <DataTable
            columns={sectorColumns}
            data={rankings}
            rowKey={(item) => item.sectorCode}
            selectedKey={selectedSectorCode}
            onRowClick={(item) => setSelectedSectorCode(item.sectorCode)}
            compact
            className="flex-1"
          />
        </div>

        <Resizer onMouseDown={col1.onMouseDown} />

        {/* 列 2：板块个股 */}
        <div
          className="flex min-h-0 flex-col overflow-hidden border-r border-border-default"
          style={{ flex: `0 1 ${col2.pct * 100}%`, minWidth: 200 }}
        >
          <div className="shrink-0 border-b border-border-default px-3 py-2">
            <h2 className="text-sm font-medium">板块个股</h2>
            <p className="text-xs text-text-tertiary">
              {selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只` : "选择板块后加载"}
            </p>
          </div>
          <DataTable
            columns={stockColumns}
            data={stocks}
            rowKey={(item) => item.tsCode}
            selectedKey={selectedStockCode}
            onRowClick={(item) => setSelectedStockCode(item.tsCode)}
            compact
            className="flex-1"
          />
        </div>

        <Resizer onMouseDown={col2.onMouseDown} />

        {/* 列 3：上证5分钟（上）+ 个股K线（下），各占 50% */}
        <div className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden border-r border-border-default">
          {/* 上：上证5分钟 */}
          <div className="flex-1 min-h-0 border-b border-border-default overflow-hidden">
            <div className="h-full overflow-auto p-2">
              <ShanghaiIndex5mChart />
            </div>
          </div>
          {/* 下：个股K线 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChartShell
              title="个股 K 线"
              subtitle={selectedStock ? `${selectedStock.stockName} · ${selectedSector?.sectorName || ""}` : ""}
              empty={!selectedStock?.tsCode ? "选择个股后显示" : undefined}
              className="h-full"
            >
              {selectedStock?.tsCode ? (
                <StockKlineWorkbench
                  tsCode={selectedStock.tsCode}
                  sectorCode={selectedSector?.sectorCode || ""}
                  stockName={selectedStock.stockName}
                />
              ) : (
                <div />
              )}
            </ChartShell>
          </div>
        </div>

        {/* 列 4（窄）：主营业务 */}
        <div className="w-[220px] shrink-0 border-l border-border-default flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 border-b border-border-default px-3 py-2">
            <h2 className="text-sm font-medium">主营业务</h2>
            <p className="text-xs text-text-tertiary">{selectedStock?.stockName || "选择个股后显示"}</p>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {selectedStock ? (
              <div className="space-y-2">
                <div className="text-[11px] text-text-tertiary leading-relaxed">
                  {selectedScore?.verdict || ""}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(selectedScore?.tags ?? selectedStockOverview?.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-border-default bg-surface-secondary px-2 py-0.5 text-[10px] text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-text-quaternary italic">
                  主营业务详情待接入
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">选择个股后显示主营业务</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
