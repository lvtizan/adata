import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIntradaySectors, useIntradaySectorStocks, useMarketOverview } from "@/queries";
import { useIntradayStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { ChartShell } from "@/shared/charts";
import { StockKlineWorkbench } from "@/shared/charts/stock-kline-workbench";
import {
  IntradayMarketContextBar,
  IntradayStockResearchPanel,
  scoreIntradayStock,
  type IntradayScoreResult,
  type IntradaySectorOverview,
  type IntradayStockOverview,
} from "@/features/intraday";
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
  const [overviewOpen, setOverviewOpen] = useState(true);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-default px-3 py-1.5">
        <h1 className="text-sm font-semibold">盘中观察</h1>
        <span className="text-xs text-text-tertiary">同花顺概念板块 · 一列板块涨跌 · 一列个股 · 一列K线</span>
        {isLoading && <span className="animate-pulse text-xs text-accent">加载中...</span>}
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden border-t border-border-default">
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

        <div className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden border-r border-border-default">
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

        {overviewOpen ? (
          <div className="flex min-h-0 w-[420px] min-w-[360px] max-w-[480px] flex-col overflow-hidden bg-canvas">
            <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
              <div>
                <h2 className="text-sm font-medium">市场总览</h2>
                <p className="text-xs text-text-tertiary">今晚新增内容独立放侧栏，不占用盘中主视图</p>
              </div>
              <button
                type="button"
                onClick={() => setOverviewOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded bg-surface-subtle text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
                title="收起市场总览"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="flex min-h-full flex-col gap-3">
                <IntradayMarketContextBar
                  overview={overview}
                  selectedSector={selectedSectorOverview}
                  selectedStock={selectedStockOverview}
                />
                <div className="min-h-0 flex-1">
                  <IntradayStockResearchPanel
                    score={selectedScore}
                    stock={selectedStockOverview}
                    sector={selectedSectorOverview}
                    className="h-full"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="group flex w-9 shrink-0 cursor-pointer flex-col items-center justify-center border-l border-border-default bg-surface-subtle transition-colors hover:bg-surface-hover"
            onClick={() => setOverviewOpen(true)}
            title="展开市场总览"
          >
            <ChevronLeft className="h-4 w-4 text-text-tertiary transition-colors group-hover:text-text-primary" />
            <span className="mt-1 text-[10px] text-text-tertiary group-hover:text-text-secondary" style={{ writingMode: "vertical-rl" }}>
              市场总览
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
