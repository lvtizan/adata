import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Minus, Send, Loader2 } from "lucide-react";
import { api } from "@/services/api-client";
import { cn } from "@/lib/utils";

// ── 类型 ──
interface ResearchCard {
  type: "stock" | "error" | "hint";
  query: string;
  data?: StockResearchData;
  error?: string;
  hints?: string[];
}

interface StockResearchData {
  basic: {
    tsCode: string;
    name: string;
    close: number;
    pctChg: number;
    sectorCode: string;
    sectorName: string;
  };
  tags?: {
    concepts: string[];
    capitalType: string;
    relatedStocks: Array<{ tsCode: string; name: string }>;
  };
  patterns?: {
    hasBuySignal: boolean;
    maAlignment: string | null;
    signals: Array<{ date: string; type: string; label: string }>;
    supports: Array<{ price: number }>;
    resistances: Array<{ price: number }>;
  };
  attribution?: {
    attribution: Array<{ dimension: string; score: number; detail: string }>;
  };
  rs?: {
    summary: {
      relativeStrength5d: number;
      relativeStrength10d: number;
      relativeStrength20d: number;
      label: string;
    };
  };
  financials?: {
    periods: Array<{
      endDate: string;
      revenue: number | null;
      netIncome: number | null;
      roe: number | null;
      revenueYoY: number | null;
    }>;
  };
  hhStats?: {
    totalSignals: number;
    overall: { winRate?: number; avgReturn?: number };
  };
}

// ── 数据获取 ──
async function fetchStockResearch(query: string): Promise<ResearchCard> {
  // 先搜索股票
  try {
    const search = await api<{
      stocks: Array<{ tsCode: string; stockName: string; close: number; pctChange1d: number; sectorCode: string; sectorName: string; rps10: number; rps20: number }>;
    }>(`/search?q=${encodeURIComponent(query)}&limit=1`);

    if (!search.stocks || search.stocks.length === 0) {
      return { type: "error", query, error: `未找到"${query}"相关股票` };
    }

    const stock = search.stocks[0];
    const tsCode = stock.tsCode;

    // 并行拉取所有维度数据
    const [tags, patterns, attribution, rs, financials, hhStats] = await Promise.allSettled([
      api<any>(`/stock/${tsCode}/tags`),
      api<any>(`/stock/${tsCode}/patterns`),
      api<any>(`/stock/${tsCode}/attribution`),
      api<any>(`/relative-strength?tsCode=${tsCode}&sectorCode=${stock.sectorCode}`),
      api<any>(`/stock/${tsCode}/financials?periods=4`),
      api<any>(`/stock/${tsCode}/hh-stats`),
    ]);

    const data: StockResearchData = {
      basic: {
        tsCode: stock.tsCode,
        name: stock.stockName,
        close: stock.close,
        pctChg: stock.pctChange1d,
        sectorCode: stock.sectorCode,
        sectorName: stock.sectorName,
      },
      tags: tags.status === "fulfilled" ? tags.value : undefined,
      patterns: patterns.status === "fulfilled" ? patterns.value : undefined,
      attribution: attribution.status === "fulfilled" ? attribution.value : undefined,
      rs: rs.status === "fulfilled" ? rs.value : undefined,
      financials: financials.status === "fulfilled" ? financials.value : undefined,
      hhStats: hhStats.status === "fulfilled" ? hhStats.value : undefined,
    };

    return { type: "stock", query, data };
  } catch (e) {
    return { type: "error", query, error: `查询失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── 研究卡片 ──
function StockCard({ data }: { data: StockResearchData }) {
  const { basic, tags, patterns, attribution, rs, financials, hhStats } = data;
  const isUp = basic.pctChg >= 0;

  return (
    <div className="space-y-3 text-xs">
      {/* 基础信息 */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold">{basic.name}</span>
          <span className="text-text-tertiary ml-1.5 font-mono">{basic.tsCode}</span>
        </div>
        <div className="text-right">
          <span className="font-mono">{basic.close.toFixed(2)}</span>
          <span className={cn("ml-1.5 font-mono", isUp ? "text-state-up" : "text-state-down")}>
            {isUp ? "+" : ""}{basic.pctChg.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* 板块 + 概念 */}
      <div>
        <div className="text-text-tertiary mb-1">所属板块</div>
        <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[11px]">{basic.sectorName}</span>
        {tags?.concepts && tags.concepts.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.concepts.slice(0, 6).map((c: any) => {
              const name = typeof c === "string" ? c : c?.name ?? "";
              return (
                <span key={name} className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary text-[10px]">{name}</span>
              );
            })}
          </div>
        )}
      </div>

      {/* 相对强度 */}
      {rs?.summary && (
        <div>
          <div className="text-text-tertiary mb-1">相对强度</div>
          <div className="grid grid-cols-4 gap-2">
            <RSCell label="5日" value={rs.summary.relativeStrength5d} />
            <RSCell label="10日" value={rs.summary.relativeStrength10d} />
            <RSCell label="20日" value={rs.summary.relativeStrength20d} />
            <div className="text-center">
              <div className="text-text-tertiary text-[10px]">判定</div>
              <div className={cn("font-medium",
                rs.summary.label === "领先" ? "text-state-up" :
                rs.summary.label === "落后" ? "text-state-down" : "text-text-secondary"
              )}>{rs.summary.label}</div>
            </div>
          </div>
        </div>
      )}

      {/* 技术形态 */}
      {patterns && (
        <div>
          <div className="text-text-tertiary mb-1">技术形态</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span>MA排列:</span>
              <span className={cn("font-medium",
                patterns.maAlignment === "bullish" ? "text-state-up" :
                patterns.maAlignment === "bearish" ? "text-state-down" : "text-text-secondary"
              )}>
                {patterns.maAlignment === "bullish" ? "多头" : patterns.maAlignment === "bearish" ? "空头" : "交叉"}
              </span>
            </div>
            {patterns.hasBuySignal && (
              <div className="text-state-up font-medium">有买入信号</div>
            )}
            {patterns.signals && patterns.signals.length > 0 && (
              <div className="text-text-secondary">
                最近信号: {patterns.signals.slice(-3).map((s: any) => `${s.label}(${s.date.slice(4)})`).join(", ")}
              </div>
            )}
            {patterns.supports && patterns.supports.length > 0 && (
              <div className="text-text-secondary">
                支撑位: {patterns.supports.slice(0, 3).map((s: any) => s.price.toFixed(2)).join(" / ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 上涨归因 */}
      {attribution?.attribution && attribution.attribution.length > 0 && (
        <div>
          <div className="text-text-tertiary mb-1">涨跌归因</div>
          <div className="space-y-1">
            {attribution.attribution.slice(0, 4).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-text-secondary">{a.dimension}</span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-active overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", a.score > 0 ? "bg-state-up" : "bg-state-down")}
                    style={{ width: `${Math.min(Math.abs(a.score), 100)}%` }}
                  />
                </div>
                <span className="text-[10px] w-8 text-right text-text-tertiary">{a.score > 0 ? "+" : ""}{a.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HH 成功率 */}
      {hhStats && hhStats.totalSignals > 0 && (
        <div>
          <div className="text-text-tertiary mb-1">HH信号统计</div>
          <span>共 {hhStats.totalSignals} 次信号</span>
          {hhStats.overall?.winRate != null && (
            <span className="ml-2">胜率 {(hhStats.overall.winRate * 100).toFixed(0)}%</span>
          )}
          {hhStats.overall?.avgReturn != null && (
            <span className="ml-2">均收益 {(hhStats.overall.avgReturn * 100).toFixed(1)}%</span>
          )}
        </div>
      )}

      {/* 财务摘要 */}
      {financials?.periods && financials.periods.length > 0 && (
        <div>
          <div className="text-text-tertiary mb-1">近期财务</div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-text-tertiary">
                <th className="text-left font-normal">报告期</th>
                <th className="text-right font-normal">营收</th>
                <th className="text-right font-normal">净利</th>
                <th className="text-right font-normal">ROE</th>
                <th className="text-right font-normal">营收YoY</th>
              </tr>
            </thead>
            <tbody>
              {financials.periods.slice(0, 4).map((p: any) => (
                <tr key={p.endDate}>
                  <td>{p.endDate?.slice(0, 7)}</td>
                  <td className="text-right font-mono">{p.revenue ? (p.revenue / 1e8).toFixed(1) + "亿" : "-"}</td>
                  <td className="text-right font-mono">{p.netIncome ? (p.netIncome / 1e8).toFixed(1) + "亿" : "-"}</td>
                  <td className="text-right font-mono">{p.roe != null ? p.roe.toFixed(1) + "%" : "-"}</td>
                  <td className={cn("text-right font-mono", (p.revenueYoY ?? 0) >= 0 ? "text-state-up" : "text-state-down")}>
                    {p.revenueYoY != null ? (p.revenueYoY >= 0 ? "+" : "") + p.revenueYoY.toFixed(1) + "%" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 资金类型 */}
      {tags?.capitalType && tags.capitalType !== "未知" && (
        <div className="text-text-secondary">
          资金属性: <span className="font-medium text-text-primary">{tags.capitalType}</span>
        </div>
      )}
    </div>
  );
}

function RSCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-text-tertiary text-[10px]">{label}</div>
      <div className={cn("font-mono font-medium",
        value > 2 ? "text-state-up" : value < -2 ? "text-state-down" : "text-text-secondary"
      )}>
        {value > 0 ? "+" : ""}{value.toFixed(1)}
      </div>
    </div>
  );
}

// ── 主组件 ──
export function AiResearchPanel() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<ResearchCard[]>([
    {
      type: "hint",
      query: "",
      hints: [
        "输入股票名称或代码，如：贵州茅台、600519",
        "自动聚合：板块归属、概念标签、相对强度、技术形态、涨跌归因、财务数据、HH信号统计",
      ],
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q || loading) return;
    setQuery("");
    setLoading(true);

    const card = await fetchStockResearch(q);
    setCards((prev) => [...prev, card]);
    setLoading(false);

    // 滚动到底部
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, [query, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-accent text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          title="研究助手"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}

      {/* 面板 */}
      {open && (
        <div
          className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border border-border-default bg-canvas flex flex-col transition-all"
          style={{
            bottom: 20,
            right: 20,
            width: minimized ? 280 : 400,
            height: minimized ? 48 : 560,
            maxHeight: "calc(100vh - 80px)",
          }}
        >
          {/* 标题栏 */}
          <div
            className="flex items-center justify-between px-3 py-2.5 bg-accent text-white shrink-0 cursor-pointer select-none"
            onClick={() => minimized && setMinimized(false)}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="w-4 h-4" />
              研究助手
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 内容区 */}
          {!minimized && (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {cards.map((card, idx) => (
                  <div key={idx}>
                    {card.type === "hint" && (
                      <div className="text-xs text-text-tertiary space-y-1 p-2 bg-surface rounded-lg">
                        {card.hints?.map((h, i) => <p key={i}>{h}</p>)}
                      </div>
                    )}
                    {card.type === "error" && (
                      <div className="p-2 bg-state-up/5 border border-state-up/20 rounded-lg">
                        <div className="text-xs text-text-tertiary mb-1">查询: {card.query}</div>
                        <div className="text-xs text-state-up">{card.error}</div>
                      </div>
                    )}
                    {card.type === "stock" && card.data && (
                      <div className="p-3 bg-surface border border-border-default rounded-lg">
                        <StockCard data={card.data} />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-text-tertiary p-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在查询...
                  </div>
                )}
              </div>

              {/* 输入框 */}
              <div className="flex items-center gap-2 p-3 border-t border-border-default">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入股票名称或代码..."
                  className="flex-1 h-8 px-3 text-sm bg-surface border border-border-default rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
                  disabled={loading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={loading || !query.trim()}
                  className="h-8 w-8 flex items-center justify-center rounded-md bg-accent text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
