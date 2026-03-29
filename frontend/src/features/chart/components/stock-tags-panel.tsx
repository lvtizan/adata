import { useStockTags } from "@/queries";
import { cn } from "@/lib/utils";
import type { StockTagsResult } from "@/services/stock.service";

interface StockTagsPanelProps {
  tsCode: string;
  stockName?: string;
  /** compact: 嵌入 header 的行内模式，只显示概念标签+资金徽章 */
  compact?: boolean;
  onSelectStock?: (tsCode: string) => void;
  /** 点击概念标签时回调，传入概念code和name */
  onConceptClick?: (conceptCode: string, conceptName: string) => void;
}

const capitalTypeStyle: Record<string, { bg: string; text: string; icon: string }> = {
  "游资主导": { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", icon: "🔥" },
  "基金重仓": { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400", icon: "🏦" },
  "混合":     { bg: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400", icon: "🔄" },
  "未知":     { bg: "bg-surface-secondary border-border-default", text: "text-text-tertiary", icon: "❓" },
};

function ConceptTags({ data, small, onConceptClick }: { data: StockTagsResult; small?: boolean; onConceptClick?: (code: string, name: string) => void }) {
  if (!data.concepts.length) return <span className="text-xs text-text-tertiary">暂无题材</span>;
  const list = small ? data.concepts.slice(0, 5) : data.concepts;
  const Tag = onConceptClick ? "button" : "span";
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((c) => (
        <Tag
          key={c.code}
          onClick={onConceptClick ? () => onConceptClick(c.code, c.name) : undefined}
          className={cn(
            "inline-flex items-center gap-0.5 rounded border",
            small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
            onConceptClick && "cursor-pointer hover:ring-1 hover:ring-accent/40 transition-shadow",
            c.rps10 >= 80
              ? "bg-state-up/10 border-state-up/20 text-state-up"
              : c.rps10 >= 50
              ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-400"
              : "bg-surface-secondary border-border-default text-text-secondary"
          )}
          title={`RPS10: ${c.rps10}`}
        >
          {c.name}
          {!small && <span className="text-[10px] opacity-70">{c.rps10.toFixed(0)}</span>}
        </Tag>
      ))}
      {small && data.concepts.length > 5 && (
        <span className="text-[10px] text-text-tertiary">+{data.concepts.length - 5}</span>
      )}
    </div>
  );
}

function CapitalBadge({ data, small }: { data: StockTagsResult; small?: boolean }) {
  const style = capitalTypeStyle[data.capitalType] || capitalTypeStyle["未知"];
  if (data.capitalType === "未知") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border",
        small ? "px-1.5 py-0 text-[10px]" : "px-2.5 py-1 text-xs",
        style.bg
      )}
      title={data.capitalDetail}
    >
      <span className={small ? "text-[10px]" : "text-xs"}>{style.icon}</span>
      <span className={cn("font-medium", style.text)}>{data.capitalType}</span>
    </span>
  );
}

function RelatedStocks({ data, onSelect }: { data: StockTagsResult; onSelect?: (tsCode: string) => void }) {
  if (!data.relatedStocks.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-text-quaternary">
        同题材 · {data.relatedStocks[0]?.concept}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.relatedStocks.map((s) => (
          <button
            key={s.tsCode}
            onClick={() => onSelect?.(s.tsCode)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors",
              "bg-surface-secondary border-border-default hover:border-accent hover:bg-accent/5",
              "cursor-pointer"
            )}
            title={`${s.name} 5日涨幅${s.ret5 > 0 ? "+" : ""}${s.ret5}%`}
          >
            <span className="text-text-primary font-medium">{s.name}</span>
            <span className={cn(
              "text-[10px]",
              s.pctChg > 0 ? "text-state-up" : s.pctChg < 0 ? "text-state-down" : "text-text-tertiary"
            )}>
              {s.pctChg > 0 ? "+" : ""}{s.pctChg}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** compact 模式：行内展示概念标签 + 资金徽章，适合嵌入 header */
function CompactView({ data, onConceptClick }: { data: StockTagsResult; onConceptClick?: (code: string, name: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CapitalBadge data={data} small />
      <ConceptTags data={data} small onConceptClick={onConceptClick} />
    </div>
  );
}

export function StockTagsPanel({ tsCode, stockName, compact, onSelectStock, onConceptClick }: StockTagsPanelProps) {
  const { data, isLoading } = useStockTags(tsCode);

  if (!tsCode) return null;

  // ── compact 模式 ──
  if (compact) {
    if (isLoading) return <span className="text-[10px] text-text-tertiary">标签加载中...</span>;
    if (!data) return null;
    return <CompactView data={data} onConceptClick={onConceptClick} />;
  }

  // ── 完整模式 ──
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text-primary">个股标签</h3>
      </div>

      {isLoading ? (
        <div className="text-xs text-text-tertiary">加载中...</div>
      ) : !data ? (
        <div className="text-xs text-text-tertiary">暂无数据</div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs text-text-quaternary">炒什么题材</div>
            <ConceptTags data={data} onConceptClick={onConceptClick} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-text-quaternary">资金属性</div>
            <CapitalBadge data={data} />
            {data.capitalDetail && (
              <p className="text-xs text-text-tertiary mt-1">{data.capitalDetail}</p>
            )}
          </div>
          <RelatedStocks data={data} onSelect={onSelectStock} />
        </div>
      )}
    </div>
  );
}
