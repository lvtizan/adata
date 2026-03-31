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

const TOOLS: Tool[] = [
  { name: "horizontalStraightLine", label: "水平线", icon: "直线" },
  { name: "segment", label: "线段", icon: "线段" },
  { name: "rayLine", label: "射线", icon: "射线" },
  { name: "rect", label: "箱体", icon: "箱体" },
  { name: "simpleAnnotation", label: "标注", icon: "标注" },
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
  onAddBuyEntry?: () => void;
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
  onAddBuyEntry,
}: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 flex-wrap">
      <>
        {/* 画线工具 */}
        {TOOLS.map((tool) => (
          <button
            key={tool.name}
            onClick={() => onToolSelect(activeTool === tool.name ? null : tool.name)}
            className={cn(
              "px-2 h-7 text-[11px] rounded border transition-colors whitespace-nowrap",
              activeTool === tool.name
                ? "bg-accent/15 border-accent/40 text-accent font-medium"
                : "border-border-default text-text-secondary hover:bg-surface-hover"
            )}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}

        <div className="w-px h-5 bg-border-default mx-1" />

        {/* 快捷模板 */}
        <button onClick={onAddSupportTemplate} className="px-2 h-7 text-[11px] rounded border border-border-default text-emerald-600 hover:bg-emerald-500/10 transition-colors" title="按最新收盘价添加支撑线">支撑</button>
        <button onClick={onAddResistanceTemplate} className="px-2 h-7 text-[11px] rounded border border-border-default text-rose-600 hover:bg-rose-500/10 transition-colors" title="按最新收盘价添加阻力线">阻力</button>
        <button onClick={onAddTagTemplate} className="px-2 h-7 text-[11px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors" title="按最新K线添加价格标签">标签</button>
        {onAddBuyEntry && (
          <button onClick={onAddBuyEntry} className="px-2 h-7 text-[11px] rounded border border-amber-500/50 text-amber-600 font-medium hover:bg-amber-500/10 transition-colors" title="画买入线，自动生成止损止盈">买入</button>
        )}

        <div className="w-px h-5 bg-border-default mx-1" />

        <button onClick={() => onToolSelect(null)} className="px-2 h-7 text-[11px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors" title="退出当前画线工具">取消</button>
        {selectedOverlayId && (
          <>
            <button onClick={onToggleLock} className="px-2 h-7 text-[11px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors">
              {selectedOverlayLocked ? "解锁" : "锁定"}
            </button>
            <button onClick={onDeleteSelected} className="px-2 h-7 text-[11px] rounded border border-border-default text-text-secondary hover:bg-surface-hover transition-colors">删除</button>
          </>
        )}
        <button onClick={onClearAll} className="px-2 h-7 text-[11px] rounded border border-border-default text-state-down hover:bg-state-down/10 transition-colors" title="清空全部画线">清空</button>

        <span className="ml-1 text-[10px] text-text-quaternary">{overlays.length} 条{selectedOverlayName ? ` · ${selectedOverlayName}` : ""}</span>
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
