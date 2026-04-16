import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles, Users, AlertTriangle, RefreshCw } from "lucide-react";
import { useZsxqMainlines, useZsxqStockDetail } from "@/queries";
import type { ZsxqStage, ZsxqMainlineItem, ZsxqMainlineCluster } from "@/services";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { FilterChip, FilterBar } from "@/shared/ui/filter-chip";
import { StockTag } from "@/shared/ui/stock-tag";
import { EmptyState } from "@/shared/ui/empty-state";

const STAGE_META: Record<ZsxqStage, { label: string; color: string; desc: string; icon: typeof Sparkles }> = {
  萌芽: { label: "萌芽", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", desc: "新出现、少量提及，埋伏窗口", icon: Sparkles },
  发酵: { label: "发酵", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", desc: "提及量快速上升，主升段", icon: TrendingUp },
  共识: { label: "共识", color: "bg-amber-500/20 text-amber-300 border-amber-500/30", desc: "全员讨论，警惕过热", icon: Users },
  退潮: { label: "退潮", color: "bg-red-500/20 text-red-300 border-red-500/30", desc: "提及量下滑，止盈/规避", icon: TrendingDown },
  平稳: { label: "平稳", color: "bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20", desc: "持续讨论但无明显变化", icon: Minus },
};

const STAGE_ORDER: ZsxqStage[] = ["萌芽", "发酵", "共识", "平稳", "退潮"];

export default function ZsxqMainlinesPage() {
  const [days, setDays] = useState(7);
  const [stageFilter, setStageFilter] = useState<ZsxqStage | "全部">("全部");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useZsxqMainlines(days, 50);

  const items = data?.items ?? [];
  const grouped = STAGE_ORDER.reduce<Record<ZsxqStage, ZsxqMainlineItem[]>>((acc, st) => {
    acc[st] = items.filter((x) => x.stage === st);
    return acc;
  }, { 萌芽: [], 发酵: [], 共识: [], 平稳: [], 退潮: [] });

  const displayItems = stageFilter === "全部" ? items : grouped[stageFilter];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="星球主线"
        subtitle={`基于知识星球近 ${days} 天内容，按"近半段 vs 前半段"提及量变化判断主线阶段`}
        actions={
          <>
            <SegmentedControl
              size="sm"
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
              options={[
                { value: "3", label: "3天" },
                { value: "7", label: "7天" },
                { value: "15", label: "15天" },
              ]}
            />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded border border-border-default hover:bg-surface-hover disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </>
        }
      />

      {/* Stage filter */}
      <div className="px-4 py-2 border-b border-border-default">
        <FilterBar>
          <FilterChip
            label="全部"
            value={items.length}
            active={stageFilter === "全部"}
            onClick={() => setStageFilter("全部")}
          />
          {STAGE_ORDER.map((st) => {
            const meta = STAGE_META[st];
            const count = grouped[st].length;
            return (
              <FilterChip
                key={st}
                label={meta.label}
                value={count}
                active={stageFilter === st}
                onClick={() => setStageFilter(st)}
              />
            );
          })}
        </FilterBar>
      </div>

      {/* Clusters panel */}
      {data?.clusters && data.clusters.length > 0 && (
        <div className="px-4 py-3 border-b border-border-default">
          <Panel title="主线聚团（按共现关系自动归类，热度排序）" padded={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 p-3">
              {data.clusters.map((c) => (
                <ClusterCard key={c.leader} cluster={c} onPick={setSelectedName} />
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">分析中...</div>
        ) : displayItems.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8" />}
            title="当前筛选条件下没有数据"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayItems.map((item) => (
              <MainlineCard
                key={item.name}
                item={item}
                selected={selectedName === item.name}
                onClick={() => setSelectedName(selectedName === item.name ? null : item.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedName && (
        <StockDetailDrawer name={selectedName} onClose={() => setSelectedName(null)} />
      )}

      {data?.updated_at && (
        <div className="px-4 py-2 text-xs text-text-tertiary border-t border-border-default">
          更新于 {new Date(data.updated_at).toLocaleString("zh-CN")}
        </div>
      )}
    </div>
  );
}

function ClusterCard({ cluster, onPick }: { cluster: ZsxqMainlineCluster; onPick: (name: string) => void }) {
  const meta = STAGE_META[cluster.stage];
  const momentum = cluster.total_recent - cluster.total_prior;
  return (
    <div className="p-2.5 rounded-md border border-border-default bg-surface">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${meta.color}`}>{meta.label}</span>
        <span className="font-semibold text-sm" title={`龙头: ${cluster.leader}`}>{cluster.theme}</span>
        <span className="text-[10px] text-text-tertiary">×{cluster.size}</span>
        <span className="ml-auto text-[10px] text-text-tertiary">
          {cluster.total_recent}/{cluster.total_prior}
          {momentum !== 0 && (
            <span className={momentum > 0 ? " text-emerald-400" : " text-red-400"}>
              {momentum > 0 ? " ↑" : " ↓"}
              {Math.abs(momentum)}
            </span>
          )}
        </span>
      </div>
      {cluster.theme_candidates && cluster.theme_candidates.length > 1 && (
        <div className="text-[10px] text-text-tertiary mb-1">
          次选: {cluster.theme_candidates.slice(1).map((t) => t.theme).join(" · ")}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {cluster.members.map((m) => (
          <StockTag
            key={m}
            size="sm"
            code={m}
            name={m}
            onClick={() => onPick(m)}
          />
        ))}
      </div>
    </div>
  );
}

function MainlineCard({ item, selected, onClick }: { item: ZsxqMainlineItem; selected: boolean; onClick: () => void }) {
  const meta = STAGE_META[item.stage];
  const Icon = meta.icon;
  const momentum = item.recent - item.prior;

  return (
    <Panel
      bordered
      padded={false}
      className={`cursor-pointer transition-all ${selected ? "border-accent bg-accent/5" : "hover:border-border-strong"}`}
      onClick={onClick}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base">{item.name}</span>
            <span className={`px-2 py-0.5 text-[10px] rounded border ${meta.color} flex items-center gap-1`}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
          </div>
          <span className="text-xs text-text-tertiary">热度 {item.score}</span>
        </div>

        <div className="flex items-center gap-3 text-xs mb-2">
          <span>
            近 <span className="text-blue-400 font-semibold">{item.recent}</span> / 前 <span className="text-text-tertiary">{item.prior}</span>
          </span>
          <span className={momentum > 0 ? "text-emerald-400" : momentum < 0 ? "text-red-400" : "text-text-tertiary"}>
            {momentum > 0 ? "↑" : momentum < 0 ? "↓" : "·"} {Math.abs(momentum)}
          </span>
          <span className="text-text-tertiary ml-auto">{item.last_pub.slice(5, 10)}</span>
        </div>

        {item.cooccur && item.cooccur.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <span className="text-[10px] text-text-tertiary">常同出现:</span>
            {item.cooccur.map((c) => (
              <StockTag
                key={c.name}
                size="sm"
                code={c.name}
                name={c.name}
              />
            ))}
          </div>
        )}

        {item.snippets[0] && (
          <div className="text-xs text-text-secondary line-clamp-3 leading-relaxed bg-surface-2 p-2 rounded">
            {item.snippets[0]}
          </div>
        )}
      </div>
    </Panel>
  );
}

function StockDetailDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const { data: detail, isLoading } = useZsxqStockDetail(name);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-surface-1 border-l border-border-default overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface-1 px-4 py-3 border-b border-border-default flex items-center justify-between">
          <h2 className="font-semibold">{name}</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-sm">
            关闭
          </button>
        </div>
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="text-sm text-text-tertiary">加载中...</div>
          ) : detail?.topics?.length ? (
            <>
              {detail.related_stocks?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
                  <span>相关提及:</span>
                  {detail.related_stocks.slice(0, 8).map((s) => (
                    <StockTag
                      key={s.name}
                      size="sm"
                      code={s.name}
                      name={s.name}
                    />
                  ))}
                </div>
              )}
              {detail.topics.map((t) => (
                <div key={t.topic_id} className="p-3 rounded bg-surface-2 text-sm">
                  <div className="text-xs text-text-tertiary mb-1">
                    {t.author} · {t.published.slice(0, 16).replace("T", " ")}
                  </div>
                  <div className="whitespace-pre-wrap line-clamp-8 leading-relaxed">{t.content}</div>
                </div>
              ))}
            </>
          ) : (
            <EmptyState size="sm" title="无相关帖子" />
          )}
        </div>
      </div>
    </div>
  );
}
