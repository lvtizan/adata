import { useState } from "react";
import { useNewsBrief, useNewsFeed, useRefreshNewsFeed } from "@/queries/news.queries";
import { cn } from "@/lib/utils";
import { RefreshCw, ExternalLink, Filter } from "lucide-react";
import type { NewsBriefSection, NewsItem } from "@/services";

const SOURCE_LABELS: Record<string, string> = {
  cls: "财联社",
  eastmoney: "东方财富",
  sina: "新浪财经",
  zsxq: "知识星球",
};

const CATEGORY_COLORS: Record<string, string> = {
  policy: "bg-blue-500/10 text-blue-600",
  sector: "bg-orange-500/10 text-orange-600",
  company: "bg-red-500/10 text-red-600",
  macro: "bg-purple-500/10 text-purple-600",
  fund: "bg-green-500/10 text-green-600",
  tech: "bg-cyan-500/10 text-cyan-600",
  insight: "bg-yellow-500/10 text-yellow-600",
  general: "bg-gray-500/10 text-gray-600",
};

export default function MorningBriefPage() {
  const [activeTab, setActiveTab] = useState<"brief" | "feed">("brief");
  const [selectedSource, setSelectedSource] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();

  const { data: brief, isLoading: briefLoading } = useNewsBrief();
  const { data: feedItems, isLoading: feedLoading } = useNewsFeed({
    source: selectedSource,
    category: selectedCategory,
    limit: 100,
  });
  const refreshMutation = useRefreshNewsFeed();

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">每日简报</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            多源聚合: 东方财富 / 新浪 / 同花顺 / 知识星球
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border-default transition-colors",
            refreshMutation.isPending
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-surface-hover"
          )}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshMutation.isPending && "animate-spin")} />
          {refreshMutation.isPending ? "采集中..." : "刷新采集"}
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-0 px-4 border-b border-border-default bg-surface">
        {([
          { id: "brief" as const, label: "简报摘要" },
          { id: "feed" as const, label: "新闻流" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm border-b-2 transition-colors",
              activeTab === t.id
                ? "border-accent text-text-primary font-medium"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 主内容 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "brief" ? (
          <BriefView brief={brief} isLoading={briefLoading} />
        ) : (
          <FeedView
            items={feedItems}
            isLoading={feedLoading}
            selectedSource={selectedSource}
            selectedCategory={selectedCategory}
            onSourceChange={setSelectedSource}
            onCategoryChange={setSelectedCategory}
          />
        )}
      </div>
    </div>
  );
}

// ── 简报摘要视图 ──
function BriefView({
  brief,
  isLoading,
}: {
  brief: { date: string; totalItems: number; sourceStats: Record<string, number>; sections: NewsBriefSection[] } | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        加载中...
      </div>
    );
  }

  if (!brief || brief.totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
        <p>暂无新闻数据</p>
        <p className="text-xs">点击右上角"刷新采集"开始获取新闻</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      {/* 来源统计 */}
      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <span>共 {brief.totalItems} 条</span>
        {Object.entries(brief.sourceStats).map(([src, count]) => (
          <span key={src} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {SOURCE_LABELS[src] ?? src}: {count}
          </span>
        ))}
      </div>

      {/* 分类板块 */}
      {brief.sections.map((section) => (
        <SectionCard key={section.category} section={section} />
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: NewsBriefSection }) {
  const colorCls = CATEGORY_COLORS[section.category] ?? CATEGORY_COLORS.general;

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border-subtle">
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", colorCls)}>
          {section.label}
        </span>
        <span className="text-xs text-text-tertiary">{section.count} 条</span>
      </div>
      <div className="divide-y divide-border-subtle">
        {section.items.map((item, i) => (
          <div key={i} className="px-4 py-2.5 hover:bg-surface-hover transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary leading-relaxed">
                  {item.title}
                </div>
                {item.summary && item.summary !== item.title && (
                  <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                    {item.summary}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-text-tertiary">
                  {SOURCE_LABELS[item.source] ?? item.source}
                </span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-tertiary hover:text-accent transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 新闻流视图 ──
function FeedView({
  items,
  isLoading,
  selectedSource,
  selectedCategory,
  onSourceChange,
  onCategoryChange,
}: {
  items: NewsItem[] | undefined;
  isLoading: boolean;
  selectedSource: string | undefined;
  selectedCategory: string | undefined;
  onSourceChange: (v: string | undefined) => void;
  onCategoryChange: (v: string | undefined) => void;
}) {
  const sources = ["cls", "eastmoney", "sina", "zsxq"];
  const categories = ["policy", "sector", "company", "macro", "fund", "tech", "insight", "general"];
  const categoryLabels: Record<string, string> = {
    policy: "政策", sector: "板块", company: "个股", macro: "宏观",
    fund: "资金", tech: "科技", insight: "观点", general: "综合",
  };

  return (
    <div className="flex flex-col h-full">
      {/* 过滤器 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle bg-surface">
        <Filter className="w-3.5 h-3.5 text-text-tertiary" />

        {/* 来源过滤 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSourceChange(undefined)}
            className={cn(
              "px-2 py-0.5 text-xs rounded transition-colors",
              !selectedSource ? "bg-accent/10 text-accent" : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            全部
          </button>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => onSourceChange(selectedSource === s ? undefined : s)}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                selectedSource === s ? "bg-accent/10 text-accent" : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>

        <span className="text-border-default">|</span>

        {/* 类别过滤 */}
        <div className="flex items-center gap-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => onCategoryChange(selectedCategory === c ? undefined : c)}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                selectedCategory === c
                  ? CATEGORY_COLORS[c]
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {categoryLabels[c]}
            </button>
          ))}
        </div>
      </div>

      {/* 新闻列表 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">
            加载中...
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-tertiary text-sm gap-1">
            <p>暂无新闻</p>
            <p className="text-xs">点击"刷新采集"开始获取</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-2.5 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("px-1.5 py-px rounded text-[10px]", CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.general)}>
                        {categoryLabels[item.category] ?? item.category}
                      </span>
                      <span className="text-[10px] text-text-tertiary">
                        {SOURCE_LABELS[item.source] ?? item.source}
                      </span>
                      <span className="text-[10px] text-text-tertiary">
                        {formatTime(item.published)}
                      </span>
                    </div>
                    <div className="text-sm text-text-primary">{item.title}</div>
                    {item.summary && item.summary !== item.title && (
                      <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-accent transition-colors mt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr.substring(0, 16);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return timeStr.substring(0, 16);
  }
}
