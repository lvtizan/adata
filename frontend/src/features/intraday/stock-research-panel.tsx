import { cn } from "@/lib/utils";
import { FinancialsPanel } from "@/features/bullcamp/components/financials-panel";
import { NewsPanel } from "@/features/bullcamp/components/news-panel";
import { AttributionPanel } from "@/features/chart/components/attribution-panel";
import { StockTagsPanel } from "@/features/chart/components/stock-tags-panel";
import type { ReactNode } from "react";
import type { IntradayStockResearchPanelProps } from "./types";
import { fmtAmount, fmtPct } from "@/shared/utils/format";
import { formatScore, gradeToneClass, scoreBarClass, scoreToneClass } from "./utils";

function ScoreCell({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-secondary/70 px-3 py-2">
      <div className="text-[10px] text-text-tertiary uppercase tracking-wide">{label}</div>
      <div className={cn("mt-1 text-base font-semibold tabular-nums", scoreToneClass(value))}>
        {formatScore(value)}
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span>{label}</span>
        <span className="tabular-nums">{value == null ? "-" : Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-active overflow-hidden">
        <div className={cn("h-full rounded-full", scoreBarClass(value))} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border-default bg-surface/90 overflow-hidden">
      <div className="px-3 py-2 border-b border-border-default/80">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle && <span className="text-[11px] text-text-tertiary">{subtitle}</span>}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function IntradayStockResearchPanel({ score, stock, sector, className }: IntradayStockResearchPanelProps) {
  const tsCode = stock?.tsCode || "";

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3 overflow-y-auto", className)}>
      <section className="rounded-2xl border border-border-default bg-gradient-to-br from-surface via-surface/95 to-surface-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold truncate">{stock?.stockName || "选择个股后显示"}</h2>
              {stock?.tsCode && <span className="text-xs text-text-tertiary font-mono">{stock.tsCode}</span>}
            </div>
            <div className="mt-1 text-xs text-text-tertiary">
              {sector ? `${sector.sectorName} · ${sector.sectorCode}` : "板块未选择"}
              {stock?.note ? ` · ${stock.note}` : ""}
            </div>
          </div>

          <div className={cn("rounded-2xl border px-4 py-3 min-w-[160px]", gradeToneClass(score?.grade || stock?.grade))}>
            <div className="text-[10px] uppercase tracking-wide opacity-80">总分</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{formatScore(score?.total ?? stock?.score)}</span>
              <span className="text-sm font-medium">{score?.grade || stock?.grade || "-"}</span>
            </div>
            <div className="mt-1 text-xs opacity-85">{score?.verdict || "等待评分结果"}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ScoreCell label="大盘" value={score?.market} />
          <ScoreCell label="板块" value={score?.sector} />
          <ScoreCell label="形态" value={score?.pattern} />
          <ScoreCell label="资金" value={score?.flow} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ScoreCell label="基本面" value={score?.fundamental} />
          <ScoreCell label="催化" value={score?.catalyst} />
          <ScoreCell label="扣分" value={score?.penalty != null ? -Math.abs(score.penalty) : null} />
        </div>

        {score?.reason && <p className="mt-3 text-sm text-text-secondary leading-relaxed">{score.reason}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {(score?.tags?.length ? score.tags : stock?.tags || []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full border border-border-default bg-surface-secondary px-2.5 py-1 text-xs text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <Section title="题材与归因" subtitle={stock?.tsCode || "概览"}>
        <div className="p-3 space-y-4">
          <StockTagsPanel tsCode={tsCode} stockName={stock?.stockName} compact />
          <AttributionPanel tsCode={tsCode} stockName={stock?.stockName} />
        </div>
      </Section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section title="财务快照" subtitle="最近季度">
          <div className="max-h-[460px] overflow-y-auto">
            <FinancialsPanel tsCode={tsCode} />
          </div>
        </Section>

        <Section title="公告与新闻" subtitle="最新信息">
          <div className="max-h-[460px] overflow-y-auto">
            <NewsPanel tsCode={tsCode} />
          </div>
        </Section>
      </div>

      <Section title="评分解释" subtitle="用于盘中快速判断">
        <div className="grid gap-2 p-3">
          <ScoreBar label="总分" value={score?.total} />
          <ScoreBar label="大盘环境" value={score?.market} />
          <ScoreBar label="板块强度" value={score?.sector} />
          <ScoreBar label="形态结构" value={score?.pattern} />
          <ScoreBar label="资金确认" value={score?.flow} />
        </div>
      </Section>

      {stock && (
        <section className="rounded-2xl border border-border-default bg-surface-secondary/60 p-3 text-xs text-text-tertiary">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-secondary">快速判断</span>
            <span>{stock.stockName}</span>
            {stock.pctChange1d != null && <span>{fmtPct(stock.pctChange1d)}</span>}
            {stock.amount != null && <span>{fmtAmount(stock.amount)}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
