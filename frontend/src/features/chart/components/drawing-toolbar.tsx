import { cn } from "@/lib/utils";

/**
 * klinecharts 画线工具栏。
 *
 * 工具列表来自 klinecharts 内置 overlay:
 * https://klinecharts.com/en-US/guide/overlay
 */

interface Tool {
  name: string;
  label: string;
  icon: string;
}

const TOOL_GROUPS: { title: string; tools: Tool[] }[] = [
  {
    title: "直线",
    tools: [
      { name: "horizontalStraightLine", label: "水平线", icon: "─" },
      { name: "horizontalSegment", label: "水平线段", icon: "_" },
      { name: "verticalStraightLine", label: "垂直线", icon: "│" },
      { name: "verticalSegment", label: "垂直线段", icon: "!" },
      { name: "straightLine", label: "直线", icon: "╲" },
      { name: "rayLine", label: "射线", icon: "↗" },
      { name: "segment", label: "线段", icon: "—" },
    ],
  },
  {
    title: "定位",
    tools: [
      { name: "horizontalRayLine", label: "水平射线", icon: "→" },
      { name: "verticalRayLine", label: "垂直射线", icon: "I" },
      { name: "priceLine", label: "价格线", icon: "=" },
    ],
  },
  {
    title: "通道",
    tools: [
      { name: "priceChannelLine", label: "价格通道", icon: "⊏" },
      { name: "parallelStraightLine", label: "平行线", icon: "∥" },
    ],
  },
  {
    title: "斐波那契",
    tools: [
      { name: "fibonacciLine", label: "斐波那契", icon: "F" },
    ],
  },
  {
    title: "标注",
    tools: [
      { name: "simpleAnnotation", label: "标注", icon: "📌" },
      { name: "simpleTag", label: "标签", icon: "🏷" },
    ],
  },
];

interface DrawingToolbarProps {
  activeTool: string | null;
  selectedOverlayId?: string | null;
  selectedOverlayName?: string | null;
  selectedOverlayLocked?: boolean;
  overlays?: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>;
  onToolSelect: (tool: string | null) => void;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  onToggleLock: () => void;
  onDeleteOverlay: (id: string) => void;
  onToggleOverlayLock: (id: string, nextLocked: boolean) => void;
  onAddSupportTemplate: () => void;
  onAddResistanceTemplate: () => void;
  onAddTagTemplate: () => void;
}

export function DrawingToolbar({
  activeTool,
  selectedOverlayId = null,
  selectedOverlayName = null,
  selectedOverlayLocked = false,
  overlays = [],
  onToolSelect,
  onDeleteSelected,
  onClearAll,
  onToggleLock,
  onDeleteOverlay,
  onToggleOverlayLock,
  onAddSupportTemplate,
  onAddResistanceTemplate,
  onAddTagTemplate,
}: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-1">
      <>
        {TOOL_GROUPS.map((group) => (
          <div key={group.title} className="flex items-center gap-0.5 ml-0.5">
            <span className="text-[9px] text-text-quaternary px-0.5">{group.title}</span>
            {group.tools.map((tool) => (
              <button
                key={tool.name}
                onClick={() => onToolSelect(activeTool === tool.name ? null : tool.name)}
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded text-xs transition-colors",
                  "border hover:bg-surface-hover",
                  activeTool === tool.name
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "border-transparent text-text-secondary"
                )}
                title={tool.label}
              >
                {tool.icon}
              </button>
            ))}
          </div>
        ))}

        <div className="flex items-center gap-0.5 ml-1">
          <span className="text-[9px] text-text-quaternary px-0.5">模板</span>
          <button onClick={onAddSupportTemplate} className="px-2 h-7 text-[10px] rounded border border-border-default text-emerald-600 hover:bg-emerald-500/10 transition-colors" title="按最新收盘价添加支撑线">支撑</button>
          <button onClick={onAddResistanceTemplate} className="px-2 h-7 text-[10px] rounded border border-border-default text-rose-600 hover:bg-rose-500/10 transition-colors" title="按最新收盘价添加阻力线">阻力</button>
          <button onClick={onAddTagTemplate} className="px-2 h-7 text-[10px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors" title="按最新K线添加价格标签">标签</button>
        </div>

        <button
          onClick={() => onToolSelect(null)}
          className="ml-1 px-2 h-7 text-[10px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors"
          title="退出当前画线工具"
        >
          取消
        </button>
        <button
          onClick={onToggleLock}
          className="px-2 h-7 text-[10px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors"
          title="锁定或解锁当前选中画线"
        >
          {selectedOverlayId ? (selectedOverlayLocked ? "解锁" : "锁定") : "未选中"}
        </button>
        <button
          onClick={onDeleteSelected}
          className="px-2 h-7 text-[10px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors"
          title="删除当前选中画线"
        >
          删除
        </button>
        <button
          onClick={onClearAll}
          className="px-2 h-7 text-[10px] rounded border border-border-default text-state-down hover:bg-state-down/10 transition-colors"
          title="清空当前股票全部画线"
        >
          清空
        </button>

        <div className="ml-2 flex items-center gap-1 text-[10px] text-text-tertiary">
          <span>{overlays.length} 条</span>
          {selectedOverlayName ? <span>已选: {selectedOverlayName}</span> : <span>未选中</span>}
        </div>
      </>

      {overlays.length > 0 && (
        <div className="ml-2 flex items-center gap-1 overflow-x-auto">
          {overlays.map((overlay) => {
            const isSelected = overlay.id === selectedOverlayId;
            return (
              <div
                key={overlay.id}
                className={cn(
                  "flex items-center gap-1 rounded border px-2 h-7 text-[10px] whitespace-nowrap",
                  isSelected ? "border-accent/40 bg-accent/10 text-accent" : "border-border-default text-text-secondary"
                )}
                title={`${overlay.name} · ${overlay.points}点`}
              >
                <span>{overlay.label || overlay.name}</span>
                <button onClick={() => onToggleOverlayLock(overlay.id, !overlay.lock)} className="text-[10px] opacity-80 hover:opacity-100" title={overlay.lock ? "解锁此画线" : "锁定此画线"}>
                  {overlay.lock ? "锁" : "开"}
                </button>
                <button onClick={() => onDeleteOverlay(overlay.id)} className="text-[10px] opacity-80 hover:opacity-100" title="删除此画线">
                  删
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
