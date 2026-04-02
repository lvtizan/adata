import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { BadgeInfo, Layers3, Radar, Sparkles } from "lucide-react";
import { useIntradaySectors, useIntradaySectorStocks, useMarketOverview } from "@/queries";
import { useIntradayStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import {
  IntradayMarketContextBar,
  IntradayStockResearchPanel,
  scoreIntradaySector,
  scoreIntradayStock,
  type IntradaySectorOverview,
  type IntradayStockOverview,
  type IntradayScoreResult,
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

function badgeTone(value: number | null | undefined) {
  if (value == null) return "neutral";
  if (value >= 80) return "up";
  if (value >= 65) return "warn";
  return "down";
}

function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "up" | "down" | "warn";
  className?: string;
}) {
  const toneClass =
    tone === "up"
      ? "bg-state-up/10 text-state-up border-state-up/20"
      : tone === "down"
      ? "bg-state-down/10 text-state-down border-state-down/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
      : "bg-surface-secondary text-text-secondary border-border-default";
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[11px] leading-none", toneClass, className)}>
      {children}
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-subtle px-3 py-2">
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold leading-none", tone === "up" ? "text-state-up" : tone === "down" ? "text-state-down" : tone === "warn" ? "text-amber-500" : "text-text-primary")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-text-tertiary">{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
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

const sectorColumns: Column<SectorRanking>[] = [
  { key: "rank", label: "#", width: "36px", render: (item) => <span className="text-[11px] text-text-tertiary">{item.rank}</span> },
  {
    key: "sectorName",
    label: "板块",
    render: (item) => (
      <span className="font-medium text-sm truncate max-w-[128px] inline-block" title={item.sectorName}>
        {item.sectorName}
      </span>
    ),
  },
  { key: "pctChange1d", label: "涨跌", align: "right", width: "64px", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
  { key: "rps10", label: "RPS10", align: "right", width: "56px", render: (item) => <NumericCell value={item.rps10} format={fmtScore} /> },
  {
    key: "limitUpCount",
    label: "涨停/成分",
    align: "right",
    width: "88px",
    render: (item) => (
      <span className="text-[11px]">
        <span className="text-state-up">{item.limitUpCount}</span>
        <span className="text-text-quaternary">/</span>
        <span className="text-text-secondary">{item.amount || 0}</span>
      </span>
    ),
  },
];

export default function IntradayPage() {
  const { data: marketOverview } = useMarketOverview();
  const { data: rankings = [], isLoading: sectorsLoading } = useIntradaySectors();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useIntradayStore();
  const { data: stocks = [], isLoading: stocksLoading } = useIntradaySectorStocks(selectedSectorCode);

  useEffect(() => {
    if (!selectedSectorCode && rankings.length > 0) {
      setSelectedSectorCode(rankings[0].sectorCode);
    }
  }, [rankings, selectedSectorCode, setSelectedSectorCode]);

  const displaySector = useMemo(
    () => rankings.find((item) => item.sectorCode === selectedSectorCode) ?? rankings[0] ?? null,
    [rankings, selectedSectorCode],
  );

  const sectorScore = useMemo(
    () => (displaySector ? scoreIntradaySector({ sector: displaySector, market: marketOverview }) : null),
    [displaySector, marketOverview],
  );

  const scoredStocks = useMemo<ScoredStockRow[]>(() => {
    if (!displaySector) return [];
    return stocks
      .map((stock) => ({ ...stock, score: scoreIntradayStock({ stock, sector: displaySector, market: marketOverview }) }))
      .sort((a, b) => b.score.totalScore - a.score.totalScore || b.pctChange1d - a.pctChange1d);
  }, [stocks, displaySector, marketOverview]);

  useEffect(() => {
    if (scoredStocks.length === 0) return;
    if (!selectedStockCode || !scoredStocks.some((item) => item.tsCode === selectedStockCode)) {
      setSelectedStockCode(scoredStocks[0].tsCode);
    }
  }, [scoredStocks, selectedStockCode, setSelectedStockCode]);

  const selectedStockRow = useMemo(
    () => scoredStocks.find((item) => item.tsCode === selectedStockCode) ?? scoredStocks[0] ?? null,
    [scoredStocks, selectedStockCode],
  );

  const selectedStockScore = selectedStockRow?.score ?? null;

  const selectedSectorOverview: IntradaySectorOverview | null = displaySector
    ? {
        sectorCode: displaySector.sectorCode,
        sectorName: displaySector.sectorName,
        pctChange1d: displaySector.pctChange1d,
        limitUpCount: displaySector.limitUpCount,
        amount: displaySector.amount,
        rank: displaySector.rank,
        status: sectorScore?.verdict,
        rps10: displaySector.rps10,
      }
    : null;

  const selectedStockOverview: IntradayStockOverview | null = selectedStockRow && selectedStockScore
    ? {
        tsCode: selectedStockRow.tsCode,
        stockName: selectedStockRow.stockName,
        close: selectedStockRow.close,
        pctChange1d: selectedStockRow.pctChange1d,
        amount: selectedStockRow.amount,
        score: selectedStockScore.totalScore,
        grade: selectedStockScore.grade,
        tags: selectedStockScore.tags,
        note: selectedStockScore.verdict,
      }
    : null;

  const selectedSectorSummaryTone = badgeTone(sectorScore?.totalScore);
  const selectedStockSummaryTone = badgeTone(selectedStockScore?.totalScore);

  const stockColumns: Column<ScoredStockRow>[] = [
    {
      key: "stockName",
      label: "名称",
      render: (item) => (
        <div className="leading-tight">
          <span className="block text-sm font-medium">{item.stockName}</span>
          <span className="block text-[10px] font-mono text-text-tertiary">{item.tsCode.replace(/\.\w+$/, "")}</span>
          <span className="mt-0.5 block text-[10px] text-text-secondary">
            {fmtPct(item.pctChange1d)} · {item.score.verdict}
          </span>
        </div>
      ),
    },
    { key: "totalScore", label: "总分", align: "right", width: "54px", render: (item) => <NumericCell value={item.score.totalScore} format={fmtScore} /> },
    {
      key: "grade",
      label: "评级",
      align: "right",
      width: "56px",
      render: (item) => (
        <Badge tone={badgeTone(item.score.totalScore)} className="px-2 py-0.5">
          {item.score.grade}
        </Badge>
      ),
    },
    { key: "sectorScore", label: "板块", align: "right", width: "56px", render: (item) => <NumericCell value={item.score.sectorScore} format={fmtScore} /> },
    { key: "patternScore", label: "形态", align: "right", width: "56px", render: (item) => <NumericCell value={item.score.patternScore} format={fmtScore} /> },
    { key: "flowScore", label: "资金", align: "right", width: "56px", render: (item) => <NumericCell value={item.score.flowScore} format={fmtScore} /> },
    {
      key: "tags",
      label: "标签 / 结论",
      render: (item) => (
        <div className="min-w-0 leading-tight">
          <div className="flex flex-wrap gap-1">
            {item.score.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="neutral" className="px-1.5 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-0.5 text-[10px] text-text-tertiary">{item.score.verdict}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-border-default px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-text-primary">盘中观察</h1>
          <Badge tone={marketOverview?.marketState.openPermissionLight === "green" ? "up" : marketOverview?.marketState.openPermissionLight === "red" ? "down" : "warn"}>
            {marketOverview?.marketState.label ?? "市场概览"} · {marketOverview?.marketState.riskLevel ?? "待定"}
          </Badge>
          {marketOverview?.mainline && <Badge tone="up">主线 {marketOverview.mainline.name}</Badge>}
          {marketOverview?.tradeDate && <span className="text-xs text-text-tertiary">{marketOverview.tradeDate}</span>}
          {(sectorsLoading || stocksLoading) && <span className="text-xs text-accent animate-pulse">加载中...</span>}
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          顶部看市场环境，左侧看板块强弱，中间看股票评分，右侧看研究详情。
        </p>
      </div>

      <div className="px-3 pt-3">
        <IntradayMarketContextBar
          overview={marketOverview}
          selectedSector={selectedSectorOverview}
          selectedStock={selectedStockOverview}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 px-3 py-3 xl:grid-cols-[290px_minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            title="板块排行"
            subtitle={displaySector ? `${displaySector.sectorName} · #${displaySector.rank}` : "选择板块后显示"}
            icon={<Layers3 className="h-4 w-4 text-accent" />}
            className="flex-1 min-h-0"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border-default px-3 py-2">
                {displaySector ? (
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile label="板块分" value={fmtScore(sectorScore?.totalScore)} hint={sectorScore?.verdict ?? "等待评分"} tone={selectedSectorSummaryTone} />
                    <StatTile label="涨跌幅" value={fmtPct(displaySector.pctChange1d)} tone={displaySector.pctChange1d >= 0 ? "up" : "down"} />
                    <StatTile label="RPS10" value={fmtScore(displaySector.rps10)} hint="板块动能" tone={displaySector.rps10 >= 70 ? "up" : "warn"} />
                    <StatTile label="涨停数" value={String(displaySector.limitUpCount)} hint={`成分 ${displaySector.amount || 0}`} tone="up" />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border-default bg-surface-subtle px-3 py-6 text-center text-sm text-text-tertiary">
                    先选一个板块，右侧股票评分和研究会自动联动。
                  </div>
                )}
              </div>

              <div className="border-b border-border-default px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {(sectorScore?.tags ?? []).slice(0, 5).map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <DataTable
                columns={sectorColumns}
                data={rankings}
                rowKey={(item) => item.sectorCode}
                selectedKey={selectedSectorCode}
                onRowClick={(item) => setSelectedSectorCode(item.sectorCode)}
                compact
                className="flex-1 min-h-0"
              />
            </div>
          </Panel>
        </div>

        <Panel
          title="股票评分表"
          subtitle={displaySector ? `${displaySector.sectorName} · ${scoredStocks.length} 只` : "选择板块后显示"}
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          className="flex min-h-0 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-2 gap-2 border-b border-border-default px-3 py-2 lg:grid-cols-4">
              <StatTile label="市场分" value={fmtScore(sectorScore?.marketScore)} hint="全局环境" tone={badgeTone(sectorScore?.marketScore)} />
              <StatTile label="板块分" value={fmtScore(sectorScore?.sectorScore)} hint="当前板块" tone={badgeTone(sectorScore?.sectorScore)} />
              <StatTile label="最高分" value={fmtScore(selectedStockScore?.totalScore)} hint={selectedStockScore?.verdict ?? "等待选择"} tone={selectedStockSummaryTone} />
              <StatTile label="个股数" value={String(scoredStocks.length)} hint={selectedStockRow ? `当前第 ${scoredStocks.findIndex((item) => item.tsCode === selectedStockRow.tsCode) + 1} 位` : "等待选择"} />
            </div>

            <DataTable
              columns={stockColumns}
              data={scoredStocks}
              rowKey={(item) => item.tsCode}
              selectedKey={selectedStockRow?.tsCode}
              onRowClick={(item) => setSelectedStockCode(item.tsCode)}
              compact
              className="flex-1 min-h-0"
              emptyText={displaySector ? "当前板块没有股票数据" : "先选择板块"}
            />
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            title="研究详情"
            subtitle={selectedStockRow ? `${selectedStockRow.stockName} · ${selectedStockRow.tsCode}` : "选择股票后显示"}
            icon={<BadgeInfo className="h-4 w-4 text-accent" />}
            className="flex-1 min-h-0"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <IntradayStockResearchPanel
                score={selectedStockScore}
                stock={selectedStockOverview}
                sector={selectedSectorOverview}
                className="p-3"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
