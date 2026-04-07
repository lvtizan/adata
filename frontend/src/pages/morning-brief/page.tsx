import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNewsBrief, useNewsFeed, useRefreshNewsFeed, useZsxqTopics, useZsxqStockStats, useRefreshZsxq, useZsxqSearch, useZsxqStockDetail } from "@/queries/news.queries";
import { cn } from "@/lib/utils";
import { RefreshCw, ExternalLink, Filter, Star, BarChart3, Search, X, ArrowLeft } from "lucide-react";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import { searchMarket } from "@/services";
import type { NewsBriefSection, NewsItem, ZsxqTopic, ZsxqStockStat } from "@/services";

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

// ── K线浮窗 ──
function KlinePopup({ stockName, onClose }: { stockName: string; onClose: () => void }) {
  const { data: match } = useStockSearch(stockName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-canvas border border-border-default rounded-xl shadow-2xl w-[700px] h-[480px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default">
          <span className="text-sm font-medium">{match?.stockName || stockName} {match?.tsCode || ""}</span>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-lg leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0">
          {match?.tsCode ? (
            <CandlestickPanel kind="stock" code={match.tsCode} label={match.tsCode} title={match.stockName || stockName} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
              {stockName} 未匹配到股票
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MorningBriefPage() {
  const [activeTab, setActiveTab] = useState<"brief" | "feed" | "zsxq">("brief");
  const [selectedSource, setSelectedSource] = useState<string | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [klinePopup, setKlinePopup] = useState<string | null>(null);

  const { data: brief, isLoading: briefLoading } = useNewsBrief();
  const { data: feedItems, isLoading: feedLoading } = useNewsFeed({
    source: selectedSource,
    category: selectedCategory,
    limit: 100,
  });
  const refreshMutation = useRefreshNewsFeed();
  const zsxqRefresh = useRefreshZsxq();

  const handleRefresh = () => {
    if (activeTab === "zsxq") {
      zsxqRefresh.mutate();
    } else {
      refreshMutation.mutate();
    }
  };
  const isRefreshing = refreshMutation.isPending || zsxqRefresh.isPending;

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
          disabled={isRefreshing}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border-default transition-colors",
            isRefreshing ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-hover"
          )}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
          {isRefreshing ? "采集中..." : "刷新采集"}
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-0 px-4 border-b border-border-default bg-surface">
        {([
          { id: "brief" as const, label: "简报摘要" },
          { id: "feed" as const, label: "新闻流" },
          { id: "zsxq" as const, label: "知识星球" },
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
        {activeTab === "zsxq" ? (
          <ZsxqView />
        ) : activeTab === "brief" ? (
          <BriefView brief={brief} isLoading={briefLoading} onStockClick={setKlinePopup} />
        ) : (
          <FeedView
            items={feedItems}
            isLoading={feedLoading}
            selectedSource={selectedSource}
            selectedCategory={selectedCategory}
            onSourceChange={setSelectedSource}
            onCategoryChange={setSelectedCategory}
            onStockClick={setKlinePopup}
          />
        )}
      </div>

      {/* K线浮窗 */}
      {klinePopup && <KlinePopup stockName={klinePopup} onClose={() => setKlinePopup(null)} />}
    </div>
  );
}

// ── 简报摘要视图 ──
function BriefView({
  brief,
  isLoading,
  onStockClick,
}: {
  brief: { date: string; totalItems: number; sourceStats: Record<string, number>; sections: NewsBriefSection[] } | undefined;
  isLoading: boolean;
  onStockClick?: (name: string) => void;
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
        <SectionCard key={section.category} section={section} onStockClick={onStockClick} />
      ))}
    </div>
  );
}

function SectionCard({ section, onStockClick }: { section: NewsBriefSection; onStockClick?: (name: string) => void }) {
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
                {(item as any).stock_mentions?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(item as any).stock_mentions.map((s: string) => (
                      <ZsxqStockTag key={s} name={s} onClick={() => onStockClick?.(s)} />
                    ))}
                  </div>
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
  onStockClick,
}: {
  items: NewsItem[] | undefined;
  isLoading: boolean;
  selectedSource: string | undefined;
  selectedCategory: string | undefined;
  onSourceChange: (v: string | undefined) => void;
  onCategoryChange: (v: string | undefined) => void;
  onStockClick?: (name: string) => void;
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
                    {(item as any).stock_mentions?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(item as any).stock_mentions.map((s: string) => (
                          <ZsxqStockTag key={s} name={s} onClick={() => onStockClick?.(s)} />
                        ))}
                      </div>
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

// ── 知识星球视图（双列：左信息流 + 右K线图）──
function ZsxqView() {
  const [subTab, setSubTab] = useState<"timeline" | "stats">("timeline");
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [stockDetailName, setStockDetailName] = useState<string | null>(null);
  const { data: topics, isLoading } = useZsxqTopics(100);
  const { data: stats } = useZsxqStockStats();
  const { data: searchResults } = useZsxqSearch(activeSearch);
  const { data: stockDetail } = useZsxqStockDetail(stockDetailName);

  if (isLoading) {
    return <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">加载中...</div>;
  }

  if (!topics || topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2 p-8">
        <Star className="w-8 h-8 opacity-30" />
        <p className="text-sm">暂无知识星球数据</p>
        <p className="text-xs">请在「设置」页面配置知识星球 Cookie</p>
        <p className="text-xs mt-1">然后点击右上角"刷新采集"</p>
      </div>
    );
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setActiveSearch(searchQuery.trim());
      setStockDetailName(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
  };

  const handleStockDetailClick = (name: string) => {
    setStockDetailName(name);
    setActiveSearch("");
    setSearchQuery("");
  };

  // 是否正在显示搜索结果或股票详情
  const showingSearch = !!activeSearch;
  const showingDetail = !!stockDetailName && !!stockDetail;
  const displayTopics = showingSearch ? (searchResults ?? []) : showingDetail ? stockDetail.topics : topics;

  return (
    <div className="flex h-full">
      {/* 左侧: 信息流 */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border-default">
        {/* 搜索栏 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-surface shrink-0">
          <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索内容..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-text-tertiary/50"
          />
          {(activeSearch || stockDetailName) && (
            <button onClick={() => { clearSearch(); setStockDetailName(null); }} className="text-text-tertiary hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 子Tab 或 返回按钮 */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle bg-surface shrink-0">
          {showingSearch ? (
            <div className="flex items-center gap-2 text-xs">
              <button onClick={clearSearch} className="text-text-tertiary hover:text-accent"><ArrowLeft className="w-3 h-3" /></button>
              <span className="text-text-secondary">搜索 "{activeSearch}" · {searchResults?.length ?? 0} 条结果</span>
            </div>
          ) : showingDetail ? (
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => setStockDetailName(null)} className="text-text-tertiary hover:text-accent"><ArrowLeft className="w-3 h-3" /></button>
              <span className="text-accent font-medium">{stockDetail.stock_name}</span>
              <span className="text-text-secondary">· {stockDetail.topics.length} 条提及</span>
              {stockDetail.related_stocks.length > 0 && (
                <span className="text-text-tertiary">· {stockDetail.related_stocks.length} 个相关股票</span>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => setSubTab("timeline")}
                className={cn("flex items-center gap-1 text-xs transition-colors", subTab === "timeline" ? "text-accent font-medium" : "text-text-tertiary")}
              >
                <Star className="w-3 h-3" /> 时间流 ({topics.length})
              </button>
              <button
                onClick={() => setSubTab("stats")}
                className={cn("flex items-center gap-1 text-xs transition-colors", subTab === "stats" ? "text-accent font-medium" : "text-text-tertiary")}
              >
                <BarChart3 className="w-3 h-3" /> 股票统计 ({stats?.length ?? 0})
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {/* 股票详情：相关股票标签 */}
          {showingDetail && stockDetail.related_stocks.length > 0 && (
            <div className="px-3 pt-3 pb-1">
              <div className="text-[11px] text-text-tertiary mb-1.5">相关股票</div>
              <div className="flex flex-wrap gap-1.5">
                {stockDetail.related_stocks.map((rs) => (
                  <button
                    key={rs.name}
                    onClick={() => { setSelectedStock(rs.name); setStockDetailName(rs.name); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-[11px] hover:bg-accent/20 transition-colors"
                  >
                    <span className="text-accent">{rs.name}</span>
                    <span className="text-text-tertiary">×{rs.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(showingSearch || showingDetail) ? (
            <div className="py-3 px-3 space-y-3">
              {displayTopics.map((topic) => (
                <ZsxqTopicCard key={topic.topic_id} topic={topic} onStockClick={setSelectedStock} highlight={activeSearch || stockDetailName || undefined} />
              ))}
              {displayTopics.length === 0 && (
                <div className="text-center text-text-tertiary text-sm py-8">未找到相关内容</div>
              )}
            </div>
          ) : subTab === "timeline" ? (
            <div className="py-3 px-3 space-y-3">
              {topics.map((topic) => (
                <ZsxqTopicCard key={topic.topic_id} topic={topic} onStockClick={setSelectedStock} />
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface border-b border-border-default">
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary w-8">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-text-secondary">股票</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-text-secondary w-14">次数</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats ?? []).map((s, i) => (
                    <ZsxqStockRow
                      key={s.stock_name}
                      index={i}
                      stat={s}
                      isSelected={selectedStock === s.stock_name}
                      onClick={() => { setSelectedStock(s.stock_name); handleStockDetailClick(s.stock_name); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 右侧: K线图 */}
      <div className="w-[50%] shrink-0">
        {selectedStock ? (
          <ZsxqStockChart stockQuery={selectedStock} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            点击股票标签查看K线图
          </div>
        )}
      </div>
    </div>
  );
}

// 股票标签：带 RS 值
function ZsxqStockTag({ name, onClick }: { name: string; onClick: () => void }) {
  const { data: match } = useStockSearch(name);
  const rs = match?.rps20;
  const pct = match?.pctChg;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-[11px] font-medium hover:bg-accent/20 transition-colors cursor-pointer"
    >
      <span className="text-accent">{name}</span>
      {rs != null && rs > 0 && <span className="text-text-tertiary">RS{rs.toFixed(0)}</span>}
      {pct != null && (
        <span className={cn("font-mono", pct >= 0 ? "text-state-up" : "text-state-down")}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

// 股票统计行：搜索获取实时指标
function ZsxqStockRow({ index, stat, isSelected, onClick }: {
  index: number;
  stat: ZsxqStockStat;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { data: match } = useStockSearch(stat.stock_name);

  return (
    <tr
      className={cn("border-b border-border-subtle hover:bg-surface-hover transition-colors cursor-pointer",
        isSelected && "bg-accent/5"
      )}
      onClick={onClick}
    >
      <td className="px-3 py-2 text-xs text-text-tertiary">{index + 1}</td>
      <td className="px-3 py-2">
        <div className="font-medium text-accent">{stat.stock_name}</div>
        {match && (
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {match.stockName} · {match.tsCode}
            {match.pctChg != null && (
              <span className={cn("ml-1.5 font-mono", match.pctChg >= 0 ? "text-state-up" : "text-state-down")}>
                {match.pctChg >= 0 ? "+" : ""}{match.pctChg.toFixed(2)}%
              </span>
            )}
            {match.rps20 != null && match.rps20 > 0 && (
              <span className="ml-1.5">RS {match.rps20.toFixed(0)}</span>
            )}
            {match.sectorName && (
              <span className="ml-1.5 text-text-tertiary">{match.sectorName}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-accent">{stat.mention_count}</td>
    </tr>
  );
}

function ZsxqStockChart({ stockQuery }: { stockQuery: string }) {
  const { data: searchResult } = useStockSearch(stockQuery);
  const tsCode = searchResult?.tsCode;
  const stockName = searchResult?.stockName || stockQuery;

  if (!tsCode) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        "{stockQuery}" 未找到匹配股票
      </div>
    );
  }

  return (
    <CandlestickPanel kind="stock" code={tsCode} label={tsCode} title={stockName} />
  );
}

function useStockSearch(query: string) {
  return useQuery({
    queryKey: ["zsxq-stock-search", query],
    queryFn: () => searchMarket(query, 1),
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60_000,
    select: (data) => {
      const s = data?.stocks?.[0];
      if (!s) return null;
      return {
        tsCode: s.tsCode,
        stockName: s.stockName,
        pctChg: s.pctChange1d,
        rps20: s.rps20,
        sectorName: s.sectorName,
        close: s.close,
      };
    },
  });
}

function ZsxqTopicCard({ topic, onStockClick, highlight }: { topic: ZsxqTopic; onStockClick?: (name: string) => void; highlight?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const content = topic.content || "";
  const isLong = content.length > 300;
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "..." : content;

  // 高亮搜索关键词
  const renderContent = (text: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === highlight.toLowerCase()
        ? <mark key={i} className="bg-yellow-300/40 text-inherit rounded-sm px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-[10px] text-accent font-bold">{topic.author?.charAt(0) || "?"}</span>
          </div>
          <span className="text-xs font-medium">{topic.author}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
          {topic.likes_count > 0 && <span>{topic.likes_count} 赞</span>}
          {topic.comments_count > 0 && <span>{topic.comments_count} 评论</span>}
          <span>{formatZsxqTime(topic.published)}</span>
        </div>
      </div>

      <div className="px-4 py-2.5">
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-text-primary">{renderContent(displayContent)}</div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-accent mt-1.5 hover:underline">
            {expanded ? "收起" : "展开全文"}
          </button>
        )}
      </div>

      {topic.stock_mentions && topic.stock_mentions.length > 0 && (
        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
          {topic.stock_mentions.map((s) => (
            <ZsxqStockTag key={s} name={s} onClick={() => onStockClick?.(s)} />
          ))}
        </div>
      )}

      {topic.images && topic.images.length > 0 && (
        <div className="px-4 pb-2.5 flex gap-2 overflow-x-auto">
          {topic.images.map((name, i) => (
            <img
              key={i}
              src={`/api/zsxq/images/${name}`}
              alt=""
              className="max-h-48 rounded border border-border-subtle object-contain cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => setLightboxImg(name)}
            />
          ))}
        </div>
      )}

      {/* 图片 Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={`/api/zsxq/images/${lightboxImg}`}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxImg(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

function formatZsxqTime(timeStr: string): string {
  if (!timeStr) return "";
  try {
    // zsxq 格式: "2026-04-06T12:30:00.000+0800"
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr.substring(0, 16);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return timeStr.substring(0, 16);
  }
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
