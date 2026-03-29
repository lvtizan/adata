import { cn } from "@/lib/utils";

interface DrawingItem {
  id: string;
  name: string;
  lock: boolean;
  points: number;
  label?: string;
}

interface DrawingsPanelProps {
  items: DrawingItem[];
  selectedId?: string | null;
  selectedName?: string | null;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, nextLocked: boolean) => void;
}

const NAME_MAP: Record<string, string> = {
  horizontalStraightLine: "水平线",
  horizontalSegment: "水平线段",
  verticalStraightLine: "垂直线",
  verticalSegment: "垂直线段",
  straightLine: "直线",
  rayLine: "射线",
  segment: "线段",
  horizontalRayLine: "水平射线",
  verticalRayLine: "垂直射线",
  priceLine: "价格线",
  priceChannelLine: "价格通道",
  parallelStraightLine: "平行线",
  fibonacciLine: "斐波那契",
  simpleAnnotation: "标注",
  simpleTag: "标签",
};

function formatOverlayName(item: DrawingItem) {
  return item.label || NAME_MAP[item.name] || item.name;
}

export function DrawingsPanel({ items, selectedId = null, selectedName = null, onDelete, onToggleLock }: DrawingsPanelProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">画线列表</h3>
          <p className="text-[10px] text-text-tertiary">
            {items.length} 条{selectedName ? ` · 已选 ${selectedName}` : ""}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded border border-border-default bg-surface px-3 py-4 text-xs text-text-tertiary">
          当前股票还没有保存的用户画线。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded border px-3 py-2",
                  selected ? "border-accent/40 bg-accent/10" : "border-border-default bg-surface"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{formatOverlayName(item)}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {item.points} 点{item.lock ? " · 已锁定" : " · 可编辑"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onToggleLock(item.id, !item.lock)}
                      className="px-2 h-6 rounded border border-border-default text-[10px] text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      {item.lock ? "解锁" : "锁定"}
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="px-2 h-6 rounded border border-border-default text-[10px] text-state-down hover:bg-state-down/10 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
