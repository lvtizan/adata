import { cn } from "@/lib/utils";
import { Minus, PenLine, MoveUpRight, Square, StickyNote, ShieldCheck, ShieldAlert, Tag, DollarSign, X, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface Tool {
  name: string;
  label: string;
  icon: ReactNode;
}

const TOOLS: Tool[] = [
  { name: "horizontalStraightLine", label: "水平线", icon: <Minus className="w-4 h-4" /> },
  { name: "segment", label: "线段", icon: <PenLine className="w-4 h-4" /> },
  { name: "rayLine", label: "射线", icon: <MoveUpRight className="w-4 h-4" /> },
  { name: "rect", label: "箱体", icon: <Square className="w-4 h-4" /> },
  { name: "simpleAnnotation", label: "标注", icon: <StickyNote className="w-4 h-4" /> },
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
  rightContent?: ReactNode;
}

function ToolBtn({ active, title, onClick, children, className = "" }: {
  active?: boolean; title: string; onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded transition-colors",
        active ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DrawingToolbar({
  activeTool,
  selectedOverlayId = null,
  selectedOverlayLocked = false,
  overlays = [],
  onToolSelect,
  onDeleteSelected,
  onClearAll,
  onToggleLock,
  onAddSupportTemplate,
  onAddResistanceTemplate,
  onAddTagTemplate,
  onAddBuyEntry,
  rightContent,
}: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-1">
      {/* 画线工具 */}
      {TOOLS.map((tool) => (
        <ToolBtn
          key={tool.name}
          active={activeTool === tool.name}
          title={tool.label}
          onClick={() => onToolSelect(activeTool === tool.name ? null : tool.name)}
        >
          {tool.icon}
        </ToolBtn>
      ))}

      <div className="w-px h-5 bg-border-default mx-0.5" />

      {/* 快捷模板 */}
      <ToolBtn title="支撑线" onClick={onAddSupportTemplate} className="text-emerald-600">
        <ShieldCheck className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="阻力线" onClick={onAddResistanceTemplate} className="text-rose-500">
        <ShieldAlert className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="价格标签" onClick={onAddTagTemplate}>
        <Tag className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="买入划线（自动算止损止盈）" onClick={() => onAddBuyEntry?.()} className="text-amber-600">
        <DollarSign className="w-4 h-4" />
      </ToolBtn>

      <div className="w-px h-5 bg-border-default mx-0.5" />

      {/* 操作 */}
      <ToolBtn title="取消" onClick={() => onToolSelect(null)}>
        <X className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn title="清空全部画线" onClick={onClearAll} className="text-state-down">
        <Trash2 className="w-4 h-4" />
      </ToolBtn>

      {overlays.length > 0 && (
        <span className="ml-1 text-[10px] text-text-quaternary">{overlays.length} 条</span>
      )}

      {rightContent && <div className="ml-auto flex items-center">{rightContent}</div>}
    </div>
  );
}
