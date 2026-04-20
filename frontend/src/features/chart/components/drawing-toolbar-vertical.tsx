import { cn } from "@/lib/utils";
import { Minus, PenLine, MoveUpRight, Maximize2, Square, StickyNote, RotateCcw, RotateCw, Trash2, ShieldCheck, ShieldAlert, Tag, DollarSign } from "lucide-react";
import type { ReactNode } from "react";

interface Tool {
  name: string;
  label: string;
  icon: ReactNode;
}

const LINE_TOOLS: Tool[] = [
  { name: "horizontalStraightLine", label: "水平线", icon: <Minus className="w-4 h-4" /> },
  { name: "segment", label: "线段", icon: <PenLine className="w-4 h-4" /> },
  { name: "rayLine", label: "射线", icon: <MoveUpRight className="w-4 h-4" /> },
  { name: "straightLine", label: "延长线", icon: <Maximize2 className="w-4 h-4" /> },
];

const CHANNEL_TOOLS: Tool[] = [
  { name: "equalDistanceChannel", label: "等距通道", icon: <ChannelIcon /> },
  { name: "pitchfork", label: "分叉通道", icon: <PitchforkIcon /> },
  { name: "priceChannelLine", label: "价格通道", icon: <ParallelIcon /> },
  { name: "fibonacciLine", label: "斐波那契", icon: <FibIcon /> },
];

const SHAPE_TOOLS: Tool[] = [
  { name: "rect", label: "矩形", icon: <Square className="w-4 h-4" /> },
  { name: "simpleAnnotation", label: "标注", icon: <StickyNote className="w-4 h-4" /> },
];

const TEMPLATE_TOOLS: Tool[] = [
  { name: "__support__", label: "支撑线", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { name: "__resistance__", label: "阻力线", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { name: "__tag__", label: "价格标签", icon: <Tag className="w-3.5 h-3.5" /> },
  { name: "__buy__", label: "买入计划", icon: <DollarSign className="w-3.5 h-3.5" /> },
];

function ChannelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="1" y1="12" x2="15" y2="4" />
      <line x1="1" y1="15" x2="15" y2="7" strokeDasharray="3 2" />
      <line x1="1" y1="9" x2="15" y2="1" strokeDasharray="3 2" />
    </svg>
  );
}

function PitchforkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="8" x2="14" y2="4" />
      <line x1="8" y1="6" x2="14" y2="1" strokeDasharray="3 2" />
      <line x1="8" y1="6" x2="14" y2="11" strokeDasharray="3 2" />
      <line x1="3" y1="3" x2="3" y2="13" strokeOpacity="0.4" />
    </svg>
  );
}

function ParallelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="1" y1="11" x2="15" y2="5" />
      <line x1="1" y1="14" x2="15" y2="8" strokeDasharray="3 2" />
    </svg>
  );
}

function FibIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="2" y1="7" x2="14" y2="7" strokeOpacity="0.6" />
      <line x1="2" y1="10" x2="14" y2="10" strokeOpacity="0.6" />
      <line x1="2" y1="13" x2="14" y2="13" />
    </svg>
  );
}

function ToolBtn({ active, title, onClick, children, className = "" }: {
  active?: boolean; title: string; onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <div className="relative group/tool">
      <button
        onClick={onClick}
        title={title}
        className={cn(
          "w-9 h-9 flex items-center justify-center rounded transition-colors",
          active
            ? "bg-accent/15 text-accent"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          className,
        )}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover/tool:flex items-center">
        <div className="bg-canvas border border-border-default rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap shadow-md">
          {title}
        </div>
      </div>
    </div>
  );
}

function Separator() {
  return <div className="w-5 h-px bg-border-default mx-auto my-1" />;
}

interface DrawingToolbarVerticalProps {
  activeTool: string | null;
  onToolSelect: (tool: string | null) => void;
  onAddSupportTemplate: () => void;
  onAddResistanceTemplate: () => void;
  onAddTagTemplate: () => void;
  onAddBuyEntry?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
}

export function DrawingToolbarVertical({
  activeTool,
  onToolSelect,
  onAddSupportTemplate,
  onAddResistanceTemplate,
  onAddTagTemplate,
  onAddBuyEntry,
  onUndo,
  onRedo,
  onClearAll,
}: DrawingToolbarVerticalProps) {
  function handleToolClick(name: string) {
    if (name === "__support__") { onAddSupportTemplate(); return; }
    if (name === "__resistance__") { onAddResistanceTemplate(); return; }
    if (name === "__tag__") { onAddTagTemplate(); return; }
    if (name === "__buy__") { onAddBuyEntry?.(); return; }
    onToolSelect(activeTool === name ? null : name);
  }

  const allDrawingTools = [...LINE_TOOLS, ...CHANNEL_TOOLS, ...SHAPE_TOOLS];

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 bg-canvas border-r border-border-default w-10 shrink-0">
      {LINE_TOOLS.map((t) => (
        <ToolBtn key={t.name} active={activeTool === t.name} title={t.label} onClick={() => handleToolClick(t.name)}>
          {t.icon}
        </ToolBtn>
      ))}

      <Separator />

      {CHANNEL_TOOLS.map((t) => (
        <ToolBtn key={t.name} active={activeTool === t.name} title={t.label} onClick={() => handleToolClick(t.name)}>
          {t.icon}
        </ToolBtn>
      ))}

      <Separator />

      {SHAPE_TOOLS.map((t) => (
        <ToolBtn key={t.name} active={activeTool === t.name} title={t.label} onClick={() => handleToolClick(t.name)}>
          {t.icon}
        </ToolBtn>
      ))}

      <Separator />

      <ToolBtn title="支撑线" onClick={() => handleToolClick("__support__")} className="text-emerald-600">
        {TEMPLATE_TOOLS[0].icon}
      </ToolBtn>
      <ToolBtn title="阻力线" onClick={() => handleToolClick("__resistance__")} className="text-rose-500">
        {TEMPLATE_TOOLS[1].icon}
      </ToolBtn>
      <ToolBtn title="价格标签" onClick={() => handleToolClick("__tag__")}>
        {TEMPLATE_TOOLS[2].icon}
      </ToolBtn>
      <ToolBtn title="买入计划" onClick={() => handleToolClick("__buy__")} className="text-amber-600">
        {TEMPLATE_TOOLS[3].icon}
      </ToolBtn>

      <div className="flex-1" />
      <Separator />

      <ToolBtn title="撤销 (Ctrl+Z)" onClick={onUndo}>
        <RotateCcw className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn title="重做 (Ctrl+Shift+Z)" onClick={onRedo}>
        <RotateCw className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn title="清空画线" onClick={onClearAll} className="text-state-down">
        <Trash2 className="w-3.5 h-3.5" />
      </ToolBtn>
    </div>
  );
}
