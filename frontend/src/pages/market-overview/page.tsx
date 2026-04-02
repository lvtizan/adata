import { useEffect, useMemo } from "react";
import { BadgeInfo, Layers3, Sparkles } from "lucide-react";
import { useIntradaySectors, useIntradaySectorStocks, useMarketOverview } from "@/queries";
import { useIntradayStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import {
  IntradayMarketContextBar,
  IntradayStockResearchPanel,
  scoreIntradayStock,
  type IntradayScoreResult,
  type IntradaySectorOverview,
  type IntradayStockOverview,
} from "@/features/intraday";
import type { SectorRanking, SectorStock } from "@/shared/types";

type ScoredStockRow = SectorStock & {
  score: IntradayScoreResult;
};

function fmtScore(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toFixed(0);
}

function toneClass(value: number | null | undefined) {
  if (value == null) return "text-text-secondary";
  if (value >= 80) return "text-state-up";
  if (value >= 65) return "text-amber-500";
  return "text-state-down";
}

function badgeClass(value: number | null | undefined) {
  if (value == null) return "bg-surface-secondary text-text-secondary border-border-default";
  if (value >= 80) return "bg-state-up/10 text-state-up border-state-up/20";
  if (value >= 65) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-state-down/10 text-state-down border-state-down/20";
}

const sectorColumns: Column<SectorRanking>[] = [
  { key: "rank", label: "#", width: "36px", render: (item) => <span className="text-[11px] text-text-tertiary">{item.rank}</span> },
  {
    key: "sectorName",
    label: "板块",
    render: (item) => (
      <span className="inline-block max-w-[128px] truncate text-sm font-medium" title={item.sectorName}>
        {item.sectorName}
      </span>
    ),
  },
  { key: "pctChange1d", label: "涨跌", align: "right", width: "64px", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
  { key: "rps10", label: "RPS10", align: "right", width: "56px", render: (item) => <NumericCell value={item.rps10} format={fmtScore} /> },
];

const stockColumns: Column<ScoredStockRow>[] = [
  {
    key: "stockName",
    label: "名称",
    render: (item) => (
      <div className="leading-tight">
        <span className="block text-sm font-medium">{item.stockName}</span>
        <span className="block text-[10px] font-mono text-text-tertiary">{item.tsCode.replace(/\.\w+$/, "")}</span>
      </div>
    ),
  },
  { key: "pctChange1d", label: "涨跌", align: "right", width: "60px", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
  { key: "totalScore", label: "总分", align: "right", width: "56px", render: (item) => <NumericCell value={item.score.total} format={fmtScore} /> },
  {
    key: "grade",
    label: "评级",
    align: "right",
    width: "52px",
    render: (item) => (
      <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", badgeClass(item.score.total))}>
        {item.score.grade}
      </span>
    ),
  },
  { key: "sector", label: "板块", align: "right", width: "52px", render: (item) => <NumericCell value={item.score.sector} format={fmtScore} /> },
  { key: "pattern", label: "形态", align: "right", width: "52px", render: (item) => <NumericCell value={item.score.pattern} format={fmtScore} /> },
  { key: "flow", label: "资金", align: "right", width: "52px", render: (item) => <NumericCell value={item.score.flow} format={fmtScore} /> },
  {
    key: "verdict",
    label: "结论",
    render: (item) => <span className={cn("text-[11px]", toneClass(item.score.total))}>{item.score.verdict}</span>,
  },
];

function Panel({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border-default bg-surface overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border-default px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          </div>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function MarketOverviewPage() {
  const { data: overview } = useMarketOverview();
  const { data: rankings = [], isLoading } = useIntradaySectors();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useIntradayStore();
  const { data: stocks = [] } = useIntradaySectorStocks(selectedSectorCode);

  useEffect(() => {
    if (!selectedSectorCode && rankings.length > 0) {
      setSelectedSectorCode(rankings[0].sectorCode);
    }
  }, [rankings, selectedSectorCode, setSelectedSectorCode]);

  const selectedSector = useMemo(
    () => rankings.find((item) => item.sectorCode === selectedSectorCode) ?? null,
    [rankings, selectedSectorCode],
  );

  const scoredStocks = useMemo<ScoredStockRow[]>(() => {
    if (!selectedSector) return [];
    return stocks
      .map((stock) => ({ ...stock, score: scoreIntradayStock({ market: overview, sector: selectedSector, stock }) }))
      .sort((a, b) => b.score.total - a.score.total || b.pctChange1d - a.pctChange1d);
  }, [stocks, selectedSector, overview]);

  useEffect(() => {
    if (scoredStocks.length === 0) return;
    const hasSelected = selectedStockCode && scoredStocks.some((item) => item.tsCode === selectedStockCode);
    if (!hasSelected) {
      setSelectedStockCode(scoredStocks[0].tsCode);
    }
  }, [scoredStocks, selectedStockCode, setSelectedStockCode]);

  const selectedStock = useMemo(
    () => scoredStocks.find((item) => item.tsCode === selectedStockCode) ?? scoredStocks[0] ?? null,
    [scoredStocks, selectedStockCode],
  );

  const selectedSectorOverview = useMemo<IntradaySectorOverview | null>(() => {
    if (!selectedSector) return null;
    return {
      sectorCode: selectedSector.sectorCode,
      sectorName: selectedSector.sectorName,
      pctChange1d: selectedSector.pctChange1d,
      limitUpCount: selectedSector.limitUpCount,
      amount: selectedSector.amount,
      rank: selectedSector.rank,
      status: selectedStock?.score?.sector != null ? `板块分 ${Math.round(selectedStock.score.sector)}` : undefined,
      rps10: selectedSector.rps10,
    };
  }, [selectedSector, selectedStock]);

  const selectedStockOverview = useMemo<IntradayStockOverview | null>(() => {
    if (!selectedStock) return null;
    return {
      tsCode: selectedStock.tsCode,
      stockName: selectedStock.stockName,
      close: selectedStock.close,
      pctChange1d: selectedStock.pctChange1d,
      amount: selectedStock.amount,
      score: selectedStock.score.total,
      grade: selectedStock.score.grade,
      tags: selectedStock.score.tags,
      note: selectedStock.score.verdict,
    };
  }, [selectedStock]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">市场总览</h1>
        <span className="text-xs text-text-tertiary">独立入口，用评分和研究视图看主线、候选股和证据链</span>
        {isLoading && <span className="animate-pulse text-xs text-accent">加载中...</span>}
      </div>

      <IntradayMarketContextBar
        overview={overview}
        selectedSector={selectedSectorOverview}
        selectedStock={selectedStockOverview}
      />

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)_420px]">
        <Panel
          title="板块排行"
          subtitle={selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只个股` : "选择板块后联动中间评分表"}
          icon={<Layers3 className="h-4 w-4 text-accent" />}
          className="flex min-h-0 flex-col"
        >
          <DataTable
            columns={sectorColumns}
            data={rankings}
            rowKey={(item) => item.sectorCode}
            selectedKey={selectedSectorCode}
            onRowClick={(item) => setSelectedSectorCode(item.sectorCode)}
            compact
            className="flex-1 min-h-0"
          />
        </Panel>

        <Panel
          title="股票评分表"
          subtitle={selectedSector ? `${selectedSector.sectorName} · 按总分排序` : "先选板块"}
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          className="flex min-h-0 flex-col"
        >
          <DataTable
            columns={stockColumns}
            data={scoredStocks}
            rowKey={(item) => item.tsCode}
            selectedKey={selectedStock?.tsCode}
            onRowClick={(item) => setSelectedStockCode(item.tsCode)}
            compact
            className="flex-1 min-h-0"
            emptyText={selectedSector ? "当前板块没有股票数据" : "先选择板块"}
          />
        </Panel>

        <Panel
          title="研究详情"
          subtitle={selectedStock ? `${selectedStock.stockName} · ${selectedStock.tsCode}` : "选择股票后显示"}
          icon={<BadgeInfo className="h-4 w-4 text-accent" />}
          className="flex min-h-0 flex-col"
        >
          <IntradayStockResearchPanel
            score={selectedStock?.score}
            stock={selectedStockOverview}
            sector={selectedSectorOverview}
            className="flex-1 min-h-0 p-3"
          />
        </Panel>
      </div>
    </div>
  );
}
