import { cn } from "@/lib/utils";
import type { IntradayMarketContextProps } from "./types";
import { formatDate, fmtAmount, fmtPct } from "@/shared/utils/format";
import { clampScore, normalizePercentInput, scoreToneClass } from "./utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { ShanghaiIndex5mChart } from "./shanghai-index-chart";

function MetricPill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-secondary/70 px-3 py-2 min-w-0">
      <div className="text-[10px] text-text-tertiary uppercase tracking-wide">{label}</div>
      <div className={cn("text-sm font-semibold truncate", tone || "text-text-primary")}>{value}</div>
    </div>
  );
}

function SelectedCard({
  label,
  title,
  meta,
  highlight,
}: {
  label: string;
  title: string;
  meta: string;
  highlight?: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-surface/80 px-3 py-2.5 min-w-0">
      <div className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-baseline gap-2 min-w-0">
        <div className="font-semibold text-sm truncate">{title}</div>
        {highlight && <div className="text-[11px] font-medium text-text-secondary shrink-0">{highlight}</div>}
      </div>
      <div className="text-[11px] text-text-tertiary truncate">{meta}</div>
    </div>
  );
}

function MarketScoreTooltip({ overview }: { overview: NonNullable<IntradayMarketContextProps["overview"]> }) {
  const breadth = overview.breadth;
  const breadthDiffScore = clampScore(50 + ((breadth.upCount - breadth.downCount) / 4000) * 100);
  const highLowScore = clampScore(50 + ((breadth.newHighCount - breadth.newLowCount) / 200) * 50);
  const maScore = clampScore((normalizePercentInput(breadth.aboveMa20Ratio) + normalizePercentInput(breadth.aboveMa60Ratio)) / 2);
  const breadthScore = clampScore(breadthDiffScore * 0.45 + highLowScore * 0.25 + maScore * 0.3);
  const riskConverted = clampScore(100 - (overview.marketRisk.pointerValue ?? overview.marketRisk.score));

  const parts = [
    {
      label: "市场状态",
      score: clampScore(overview.marketState.score),
      weight: 35,
      hint: overview.marketState.label,
    },
    {
      label: "情绪状态",
      score: clampScore(overview.emotionState.score),
      weight: 25,
      hint: overview.emotionState.label,
    },
    {
      label: "市场广度",
      score: breadthScore,
      weight: 25,
      hint: `涨跌 ${breadth.upCount}/${breadth.downCount} · 新高新低 ${breadth.newHighCount}/${breadth.newLowCount}`,
    },
    {
      label: "风险折算",
      score: riskConverted,
      weight: 15,
      hint: `${overview.marketRisk.label} · 风险越低得分越高`,
    },
  ];

  const total = clampScore(parts.reduce((sum, part) => sum + (part.score * part.weight) / 100, 0));

  return (
    <Tooltip delayDuration={180}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-lg border border-border-default bg-surface-secondary/70 px-3 py-2 text-left transition-colors hover:bg-surface-secondary"
        >
          <div className="text-[10px] text-text-tertiary uppercase tracking-wide">环境分</div>
          <div className={cn("text-sm font-semibold truncate", scoreToneClass(total))}>{Math.round(total)}</div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="w-[320px] p-0 bg-white text-slate-900 border-slate-200 shadow-2xl">
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-border-default px-3 py-2">
            <div className="text-sm font-semibold text-popover-foreground">环境分组成</div>
            <div className="mt-0.5 text-xs text-muted-foreground">当前环境分 {Math.round(total)}，用于盘中候选股的环境加权</div>
          </div>
          <div className="space-y-2 px-3 py-3">
            {parts.map((part) => (
              <div key={part.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-popover-foreground">{part.label}</span>
                  <span className="font-mono text-popover-foreground">{Math.round(part.score)} · {part.weight}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-active">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      part.score >= 70 ? "bg-state-up" : part.score >= 50 ? "bg-state-warning" : "bg-state-down",
                    )}
                    style={{ width: `${part.score}%` }}
                  />
                </div>
                <div className="text-[11px] leading-snug text-muted-foreground">{part.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function IntradayMarketContextBar({ overview, selectedSector, selectedStock, className }: IntradayMarketContextProps) {
  if (!overview) return null;

  const breadth = overview.breadth;
  const marketStateTone =
    overview.marketState.openPermissionLight === "green"
      ? "text-state-up"
      : overview.marketState.openPermissionLight === "yellow"
      ? "text-state-warning"
      : "text-state-down";
  const riskTone = scoreToneClass(overview.marketRisk.pointerValue ?? overview.marketRisk.score);
  const riskScore = clampScore(overview.marketRisk.pointerValue ?? overview.marketRisk.score);
  const mainlines = overview.mainlines || [];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border-default bg-gradient-to-r from-surface via-surface/95 to-surface-subtle shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="px-4 py-3 border-b border-border-default/80">
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">盘中环境</h2>
              <span className={cn("text-xs font-medium", marketStateTone)}>{overview.marketState.label}</span>
              <span className="text-[11px] text-text-tertiary">{formatDate(overview.tradeDate)}</span>
            </div>
            <div className="mt-1 text-xs text-text-secondary leading-relaxed">
              {overview.marketState.actionAdvice}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MarketScoreTooltip overview={overview} />
            <MetricPill label="情绪" value={`${overview.emotionState.label} ${clampScore(overview.emotionState.score)}`} tone={scoreToneClass(overview.emotionState.score)} />
            <MetricPill label="风险" value={`${overview.marketRisk.label} ${riskScore}`} tone={riskTone} />
            <MetricPill label="涨跌家数" value={`${breadth.upCount}/${breadth.downCount}`} />
            <MetricPill label="连板/跌停" value={`${breadth.limitUpCount}/${breadth.limitDownCount}`} />
          </div>
        </div>
      </div>

      <div className="border-b border-border-default bg-surface px-4 py-2 text-sm font-medium">上证5分钟</div>
      <div className="p-4">
        <ShanghaiIndex5mChart />
      </div>
      <div className="px-4 pb-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <span>主线</span>
            <span className="h-px flex-1 bg-border-default" />
          </div>
          <div className="flex flex-wrap gap-2">
            {mainlines.length > 0 ? (
              mainlines.map((line) => {
                const sector = line;
                return (
                  <span
                    key={`mainline-${sector.sectorCode}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-secondary/80 px-3 py-1 text-xs"
                  >
                    <span className="font-medium text-text-primary">
                      {sector.sectorName}
                    </span>
                    <span className="text-text-tertiary">{line.status}</span>
                    {typeof line.limitUpCount === "number" && line.limitUpCount > 0 && (
                      <span className="text-state-up">{line.limitUpCount}↑</span>
                    )}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-text-tertiary">暂无主线数据</span>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 xl:min-w-[340px]">
          {selectedSector ? (
            <SelectedCard
              label="当前板块"
              title={selectedSector.sectorName}
              meta={`${selectedSector.sectorCode} · ${fmtPct(selectedSector.pctChange1d)} · ${selectedSector.limitUpCount} 连板/涨停`}
              highlight={selectedSector.status ? selectedSector.status : undefined}
            />
          ) : (
            <SelectedCard label="当前板块" title="未选择" meta="选择板块后显示" />
          )}

          {selectedStock ? (
            <SelectedCard
              label="当前个股"
              title={selectedStock.stockName}
              meta={`${selectedStock.tsCode} · ${fmtPct(selectedStock.pctChange1d)} · ${fmtAmount(selectedStock.amount)}`}
              highlight={
                selectedStock.score != null
                  ? `${Math.round(selectedStock.score)}${selectedStock.grade ? ` · ${selectedStock.grade}` : ""}`
                  : selectedStock.grade || undefined
              }
            />
          ) : (
            <SelectedCard label="当前个股" title="未选择" meta="选择个股后显示" />
          )}
        </div>
      </div>
    </div>
  );
}
