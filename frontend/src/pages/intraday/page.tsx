import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { BadgeInfo, ChartNoAxesCombined, Layers3, Radar, Sparkles } from "lucide-react";
import { useIntradaySectors, useIntradaySectorStocks, useMarketOverview } from "@/queries";
import { useIntradayStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtAmount, fmtPct, formatDate } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { ChartShell } from "@/shared/charts";
import { AttributionPanel } from "@/features/chart/components/attribution-panel";
import { StockTagsPanel } from "@/features/chart/components/stock-tags-panel";
import { FinancialsPanel } from "@/features/bullcamp/components/financials-panel";
import { NewsPanel } from "@/features/bullcamp/components/news-panel";
import { cn } from "@/lib/utils";
import type { MarketOverview, SectorRanking, SectorStock } from "@/shared/types";

type ScoreGrade = "S" | "A" | "B" | "C";

type ScoredStock = SectorStock & {
  marketScore: number;
  sectorScore: number;
  patternScore: number;
  flowScore: number;
  totalScore: number;
  grade: ScoreGrade;
  relativeStrength: number;
  tags: string[];
  verdict: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreGrade(score: number): ScoreGrade {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  return "C";
}

function scoreToneClass(score: number) {
  if (score >= 80) return "text-state-up";
  if (score >= 65) return "text-amber-500";
  return "text-state-down";
}

function scoreBgClass(score: number) {
  if (score >= 80) return "bg-state-up/10 border-state-up/20";
  if (score >= 65) return "bg-amber-500/10 border-amber-500/20";
  return "bg-state-down/10 border-state-down/20";
}

function safeLogAmount(value: number | null | undefined) {
  if (!value || value <= 0) return 0;
  return Math.log10(value + 1);
}

function getMarketScore(overview?: MarketOverview) {
  const base = overview?.marketState?.score ?? 50;
  return clamp(base, 0, 100);
}

function calcSectorScore(sector: SectorRanking | undefined, marketScore: number) {
  if (!sector) return clamp(40 + marketScore * 0.08, 0, 100);
  const moveBoost = clamp(sector.pctChange1d * 5.5, -14, 16);
  const rankBoost = sector.rank ? clamp(18 - sector.rank, 0, 18) * 0.75 : 0;
  const limitBoost = clamp((sector.limitUpCount ?? 0) * 5, 0, 20);
  const breadthBoost = clamp(safeLogAmount(sector.amount) * 3.5, 0, 12);
  return clamp(38 + moveBoost + rankBoost + limitBoost + breadthBoost + marketScore * 0.07, 0, 100);
}

function scoreStock(stock: SectorStock, sector: SectorRanking | undefined, marketScore: number): ScoredStock {
  const sectorPct = sector?.pctChange1d ?? 0;
  const relativeStrength = stock.pctChange1d - sectorPct;
  const sectorScore = calcSectorScore(sector, marketScore);
  const momentumScore = clamp(38 + stock.pctChange1d * 6.5 + relativeStrength * 4.5, 0, 100);
  const rpsScore = clamp((stock.rps10 * 0.35) + (stock.rps20 * 0.25), 0, 100);
  const trendScore = stock.ma20 > 0 ? (stock.close >= stock.ma20 ? 12 : -8) : 0;
  const flowScore = clamp(28 + safeLogAmount(stock.amount) * 4 + (stock.pctChange1d > 0 ? 4 : 0) + (stock.dataMode === "fallback" ? -6 : 0), 0, 100);
  const patternScore = clamp((momentumScore * 0.5) + (rpsScore * 0.35) + trendScore, 0, 100);
  const marketAdjusted = marketScore * 0.15;
  const totalScore = clamp(marketAdjusted + sectorScore * 0.28 + patternScore * 0.37 + flowScore * 0.20, 0, 100);

  const tags = [
    relativeStrength >= 1.2 ? "强于板块" : undefined,
    stock.rps10 >= 80 ? "RPS10强" : undefined,
    stock.rps20 >= 70 ? "中期强" : undefined,
    stock.ma20 > 0 && stock.close >= stock.ma20 ? "站上MA20" : undefined,
    stock.amount >= 800000000 ? "放量" : stock.amount >= 100000000 ? "有量" : undefined,
    stock.dataMode === "fallback" ? "回退" : undefined,
  ].filter(Boolean) as string[];

  let verdict = "暂不参与";
  if (totalScore >= 80 && sectorScore >= 70) verdict = "重点跟踪";
  else if (totalScore >= 74 && patternScore >= 70) verdict = "等待触发";
  else if (totalScore >= 65) verdict = sectorScore >= 60 ? "板块跟随" : "个股强板块弱";

  return {
    ...stock,
    marketScore,
    sectorScore,
    patternScore,
    flowScore,
    totalScore,
    grade: scoreGrade(totalScore),
    relativeStrength,
    tags,
    verdict,
  };
}

function fmtScore(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toFixed(0);
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
          {subtitle && <p className="mt-0.5 text-[11px] text-text-tertiary truncate">{subtitle}</p>}
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

  const selectedSector = useMemo(
    () => rankings.find((item) => item.sectorCode === selectedSectorCode) ?? null,
    [rankings, selectedSectorCode],
  );

  const marketScore = useMemo(() => getMarketScore(marketOverview), [marketOverview]);

  const scoredStocks = useMemo(() => {
    const rows = stocks.map((stock) => scoreStock(stock, selectedSector ?? undefined, marketScore));
    rows.sort((a, b) => b.totalScore - a.totalScore || b.pctChange1d - a.pctChange1d);
    return rows;
  }, [stocks, selectedSector, marketScore]);

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

  const selectedStockIndex = selectedStock ? scoredStocks.findIndex((item) => item.tsCode === selectedStock.tsCode) : -1;
  const marketRiskTone = marketOverview?.marketState.openPermissionLight ?? "yellow";
  const marketTone: "up" | "down" | "warn" =
    marketRiskTone === "green" ? "up" : marketRiskTone === "red" ? "down" : "warn";
  const marketFactors = marketOverview?.marketRisk.factors?.slice(0, 4) ?? [];
  const headlineSectors = marketOverview?.topSectors?.slice(0, 4) ?? [];

  const sectorSubtitle = selectedSector
    ? `${selectedSector.sectorName} · 排名 #${selectedSector.rank} · ${fmtPct(selectedSector.pctChange1d)}`
    : "选择板块后显示";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-border-default px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-text-primary">盘中观察</h1>
          <Badge tone={marketTone}>
            {marketOverview?.marketState.label ?? "市场概览"} · {marketOverview?.marketState.riskLevel ?? "待定"}
          </Badge>
          {marketOverview?.emotionState && <Badge tone="neutral">情绪 {marketOverview.emotionState.label}</Badge>}
          {marketOverview?.mainline && <Badge tone="up">主线 {marketOverview.mainline.name}</Badge>}
          {marketOverview?.tradeDate && <span className="text-xs text-text-tertiary">{formatDate(marketOverview.tradeDate)}</span>}
          {(sectorsLoading || stocksLoading) && <span className="text-xs text-accent animate-pulse">加载中...</span>}
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          顶部看市场环境，左侧看板块强弱，中间看股票评分，右侧看研究详情。
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 px-3 py-3 xl:grid-cols-[290px_minmax(0,1fr)_380px]">
        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            title="市场环境"
            subtitle={marketOverview?.marketState.actionAdvice ?? "市场状态"}
            icon={<Radar className="h-4 w-4 text-accent" />}
          >
            <div className="grid gap-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="市场状态"
                  value={marketOverview?.marketState.label ?? "-"}
                  hint={marketOverview?.marketState.riskLevel ?? "未知"}
                  tone={marketTone}
                />
                <StatTile
                  label="情绪"
                  value={marketOverview?.emotionState.label ?? "-"}
                  hint={`评分 ${marketOverview?.emotionState.score ?? "-"}`}
                  tone={marketOverview && marketOverview.emotionState.score >= 60 ? "up" : marketOverview && marketOverview.emotionState.score <= 40 ? "down" : "warn"}
                />
                <StatTile
                  label="主线"
                  value={marketOverview?.mainline.name ?? "-"}
                  hint={marketOverview?.mainline.status ?? marketOverview?.mainline.reason ?? "等待识别"}
                  tone="up"
                />
                <StatTile
                  label="风险分"
                  value={marketOverview?.marketRisk.shortLabel ?? "-"}
                  hint={marketOverview ? `分数 ${marketOverview.marketRisk.score}` : "未知"}
                  tone={marketOverview && marketOverview.marketRisk.score <= 40 ? "up" : marketOverview && marketOverview.marketRisk.score >= 70 ? "down" : "warn"}
                />
              </div>

              <div className="rounded-lg border border-border-default bg-surface-subtle p-3">
                <div className="text-[11px] text-text-tertiary">市场广度</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>上涨 {marketOverview?.breadth.upCount ?? "-"}</div>
                  <div>下跌 {marketOverview?.breadth.downCount ?? "-"}</div>
                  <div>涨停 {marketOverview?.breadth.limitUpCount ?? "-"}</div>
                  <div>跌停 {marketOverview?.breadth.limitDownCount ?? "-"}</div>
                  <div>新高 {marketOverview?.breadth.newHighCount ?? "-"}</div>
                  <div>新低 {marketOverview?.breadth.newLowCount ?? "-"}</div>
                </div>
              </div>

              {marketFactors.length > 0 && (
                <div className="rounded-lg border border-border-default bg-surface-subtle p-3">
                  <div className="text-[11px] text-text-tertiary">风向因子</div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {marketFactors.map((factor) => (
                      <div key={factor.key} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-text-secondary">{factor.label}</span>
                        <span className="font-mono text-text-primary">{String(factor.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border-default bg-surface-subtle p-3">
                <div className="text-[11px] text-text-tertiary">主线/Top 板块</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {headlineSectors.map((sector) => (
                    <Badge key={sector.sectorCode} tone={sector.pctChange1d >= 0 ? "up" : "down"}>
                      {sector.sectorName} {fmtPct(sector.pctChange1d)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="板块排行"
            subtitle={sectorSubtitle}
            icon={<Layers3 className="h-4 w-4 text-accent" />}
            className="flex-1 min-h-0"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border-default px-3 py-2">
                {selectedSector ? (
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile label="涨跌幅" value={fmtPct(selectedSector.pctChange1d)} tone={selectedSector.pctChange1d >= 0 ? "up" : "down"} />
                    <StatTile label="RPS10" value={fmtScore(selectedSector.rps10)} hint="板块动能" tone={selectedSector.rps10 >= 70 ? "up" : "warn"} />
                    <StatTile label="涨停数" value={String(selectedSector.limitUpCount)} hint={`成分 ${selectedSector.amount || 0}`} tone="up" />
                    <StatTile label="成交活跃" value={fmtScore(selectedSector.pctChange5d)} hint="5日变化" tone={selectedSector.pctChange5d >= 0 ? "up" : "down"} />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border-default bg-surface-subtle px-3 py-6 text-center text-sm text-text-tertiary">
                    先选一个板块，右侧股票评分和研究会自动联动。
                  </div>
                )}
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
          subtitle={selectedSector ? `${selectedSector.sectorName} · ${scoredStocks.length} 只` : "选择板块后显示"}
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          className="flex min-h-0 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-2 gap-2 border-b border-border-default px-3 py-2 lg:grid-cols-4">
              <StatTile label="市场分" value={fmtScore(marketScore)} hint="全局环境" tone={marketScore >= 60 ? "up" : marketScore <= 40 ? "down" : "warn"} />
              <StatTile
                label="板块分"
                value={selectedStock ? fmtScore(selectedStock.sectorScore) : selectedSector ? fmtScore(calcSectorScore(selectedSector, marketScore)) : "-"}
                hint="当前板块"
                tone={selectedSector && selectedSector.pctChange1d >= 0 ? "up" : "warn"}
              />
              <StatTile label="个股数" value={String(scoredStocks.length)} hint={selectedStock ? `当前第 ${selectedStockIndex + 1} 位` : "等待选择"} tone="neutral" />
              <StatTile label="最高分" value={selectedStock ? fmtScore(selectedStock.totalScore) : "-"} hint={selectedStock?.verdict ?? "暂无"} tone={selectedStock && selectedStock.totalScore >= 75 ? "up" : "warn"} />
            </div>

            <DataTable
              columns={[
                {
                  key: "stockName",
                  label: "名称",
                  render: (item: ScoredStock) => (
                    <div className="leading-tight">
                      <span className="block text-sm font-medium">{item.stockName}</span>
                      <span className="block text-[10px] font-mono text-text-tertiary">{item.tsCode.replace(/\.\w+$/, "")}</span>
                      <span className="mt-0.5 block text-[10px] text-text-secondary">
                        {fmtPct(item.pctChange1d)} · 相对 {item.relativeStrength >= 0 ? "+" : ""}
                        {item.relativeStrength.toFixed(2)}%
                      </span>
                    </div>
                  ),
                },
                { key: "totalScore", label: "总分", align: "right", width: "54px", render: (item: ScoredStock) => <NumericCell value={item.totalScore} format={fmtScore} /> },
                {
                  key: "grade",
                  label: "评级",
                  align: "right",
                  width: "56px",
                  render: (item: ScoredStock) => (
                    <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", scoreBgClass(item.totalScore), scoreToneClass(item.totalScore))}>
                      {item.grade}
                    </span>
                  ),
                },
                { key: "sectorScore", label: "板块", align: "right", width: "56px", render: (item: ScoredStock) => <NumericCell value={item.sectorScore} format={fmtScore} /> },
                { key: "patternScore", label: "形态", align: "right", width: "56px", render: (item: ScoredStock) => <NumericCell value={item.patternScore} format={fmtScore} /> },
                { key: "flowScore", label: "资金", align: "right", width: "56px", render: (item: ScoredStock) => <NumericCell value={item.flowScore} format={fmtScore} /> },
                {
                  key: "tags",
                  label: "标签 / 结论",
                  render: (item: ScoredStock) => (
                    <div className="min-w-0 leading-tight">
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} tone="neutral" className="px-1.5 py-0 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-0.5 text-[10px] text-text-tertiary">{item.verdict}</div>
                    </div>
                  ),
                },
              ]}
              data={scoredStocks}
              rowKey={(item) => item.tsCode}
              selectedKey={selectedStock?.tsCode}
              onRowClick={(item) => setSelectedStockCode(item.tsCode)}
              compact
              className="flex-1 min-h-0"
              emptyText={selectedSector ? "当前板块没有股票数据" : "先选择板块"}
            />
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            title="研究详情"
            subtitle={selectedStock ? `${selectedStock.stockName} · ${selectedStock.tsCode}` : "选择股票后显示"}
            icon={<BadgeInfo className="h-4 w-4 text-accent" />}
            className="flex-1 min-h-0"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              {selectedStock ? (
                <div className="space-y-3 p-3">
                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-text-tertiary">{selectedStock.tsCode}</div>
                        <div className="mt-1 text-base font-semibold">{selectedStock.stockName}</div>
                        <div className="mt-1 text-[11px] text-text-tertiary">
                          {selectedSector?.sectorName ?? "未绑定板块"} · 右侧用于解释为什么它值得看。
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-3xl font-semibold leading-none", scoreToneClass(selectedStock.totalScore))}>
                          {selectedStock.totalScore.toFixed(0)}
                        </div>
                        <div className="mt-1 text-[11px] text-text-tertiary">
                          {selectedStock.grade} / {selectedStock.verdict}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <StatTile label="市场" value={fmtScore(selectedStock.marketScore)} hint="全局环境" tone={selectedStock.marketScore >= 60 ? "up" : selectedStock.marketScore <= 40 ? "down" : "warn"} />
                      <StatTile label="板块" value={fmtScore(selectedStock.sectorScore)} hint={selectedSector?.sectorName ?? "-"} tone={selectedStock.sectorScore >= 70 ? "up" : "warn"} />
                      <StatTile label="形态" value={fmtScore(selectedStock.patternScore)} hint="价格结构" tone={selectedStock.patternScore >= 70 ? "up" : "warn"} />
                      <StatTile label="资金" value={fmtScore(selectedStock.flowScore)} hint={fmtAmount(selectedStock.amount)} tone={selectedStock.flowScore >= 70 ? "up" : "warn"} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedStock.tags.length > 0 ? (
                        selectedStock.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                      ) : (
                        <span className="text-[11px] text-text-tertiary">暂无标签</span>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg border border-border-default bg-surface p-3 text-xs text-text-secondary">
                      {selectedStock.relativeStrength >= 0 ? "相对板块偏强，" : "相对板块偏弱，"}
                      当前更适合看 {selectedStock.verdict}。
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ChartNoAxesCombined className="h-4 w-4 text-accent" />
                      K 线结构
                    </div>
                    <div className="mt-3 h-[320px]">
                      <ChartShell
                        title="个股 K 线"
                        subtitle={`${selectedStock.stockName} · ${selectedSector?.sectorName ?? ""}`}
                        empty="暂无 K 线数据"
                        className="h-full"
                      >
                        <WatchlistChart
                          key={selectedStock.tsCode}
                          tsCode={selectedStock.tsCode}
                          sectorCode={selectedSector?.sectorCode || ""}
                          stockName={selectedStock.stockName}
                        />
                      </ChartShell>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <StockTagsPanel tsCode={selectedStock.tsCode} stockName={selectedStock.stockName} />
                  </div>

                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <AttributionPanel tsCode={selectedStock.tsCode} stockName={selectedStock.stockName} />
                  </div>

                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <FinancialsPanel tsCode={selectedStock.tsCode} />
                  </div>

                  <div className="rounded-xl border border-border-default bg-surface-subtle p-3">
                    <NewsPanel tsCode={selectedStock.tsCode} />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center px-4 text-sm text-text-tertiary">
                  先在中间表格里选一只股票，右侧会展示评分拆解、图形、题材、财务和公告。
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
