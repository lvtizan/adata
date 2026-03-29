import { useStockAttribution } from "@/queries";
import { cn } from "@/lib/utils";
import type { AttributionItem } from "@/services/stock.service";

interface AttributionPanelProps {
  tsCode: string;
  stockName?: string;
}

const sentimentColor: Record<string, string> = {
  positive: "text-state-up",
  negative: "text-state-down",
  neutral: "text-text-secondary",
};

const sentimentBg: Record<string, string> = {
  positive: "bg-state-up/10 border-state-up/20",
  negative: "bg-state-down/10 border-state-down/20",
  neutral: "bg-surface-secondary border-border-default",
};

const dimensionIcon: Record<string, string> = {
  sector: "📊",
  revenue: "📈",
  profit: "💰",
  roe: "🎯",
  margin: "📐",
  momentum: "🚀",
  volume: "💎",
  catalyst: "📰",
};

function AttrTag({ item }: { item: AttributionItem }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2 rounded-md border text-sm",
        sentimentBg[item.sentiment] || sentimentBg.neutral
      )}
    >
      <span className="shrink-0 text-base leading-none mt-0.5">
        {dimensionIcon[item.dimension] || "•"}
      </span>
      <div className="min-w-0">
        <span className="font-medium text-text-primary">{item.label}</span>
        <span className="mx-1.5 text-text-quaternary">·</span>
        <span className={cn(sentimentColor[item.sentiment] || "text-text-secondary")}>
          {item.detail}
        </span>
      </div>
    </div>
  );
}

export function AttributionPanel({ tsCode, stockName }: AttributionPanelProps) {
  const { data, isLoading } = useStockAttribution(tsCode);

  if (!tsCode) return null;

  const items = data?.attribution || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-sm font-medium text-text-primary">上涨归因</h3>
        {stockName && (
          <span className="text-xs text-text-quaternary">{stockName}</span>
        )}
      </div>
      {isLoading ? (
        <div className="text-xs text-text-tertiary px-1">分析中...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-text-tertiary px-1">暂无归因数据</div>
      ) : (
        <div className="grid gap-1.5">
          {items.map((item, i) => (
            <AttrTag key={`${item.dimension}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
