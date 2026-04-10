import { useState } from "react";
import { cn } from "@/lib/utils";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { DrawingsPanel } from "@/features/chart/components/drawings-panel";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";

interface FrequencyOption {
  value: string;
  label: string;
}

interface StockKlineWorkbenchProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  frequency?: string;
  onFrequencyChange?: (next: string) => void;
  frequencyOptions?: FrequencyOption[];
  showDrawingsPanel?: boolean;
  className?: string;
}

export function StockKlineWorkbench({
  tsCode,
  sectorCode,
  stockName,
  frequency = "1d",
  onFrequencyChange,
  frequencyOptions,
  showDrawingsPanel = false,
  className,
}: StockKlineWorkbenchProps) {
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [drawingColor, setDrawingColor] = useState("#3b82f6");
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);

  function emitDrawingAction(
    action: "deleteSelected" | "clearAll" | "toggleLock" | "addSupportAtClose" | "addResistanceAtClose" | "addTagAtLatest" | "addBuyEntry" | "deleteById" | "toggleLockById" | "changeColorById",
    detail: Record<string, unknown> = {},
  ) {
    if (!tsCode) return;
    window.dispatchEvent(new CustomEvent(`chart-drawing:${tsCode}`, { detail: { action, ...detail } }));
  }

  return (
    <div className={cn("h-full flex flex-col min-h-0", className)}>
      <div className="border-b border-border-default py-1">
        <DrawingToolbar
          activeTool={drawingTool}
          selectedOverlayId={selectedOverlay.id}
          selectedOverlayName={selectedOverlay.name}
          selectedOverlayLocked={selectedOverlay.locked}
          overlays={drawings}
          onToolSelect={setDrawingTool}
          onDeleteSelected={() => emitDrawingAction("deleteSelected")}
          onClearAll={() => emitDrawingAction("clearAll")}
          onToggleLock={() => emitDrawingAction("toggleLock")}
          onDeleteOverlay={(id) => emitDrawingAction("deleteById", { overlayId: id })}
          onToggleOverlayLock={(id, nextLocked) => emitDrawingAction("toggleLockById", { overlayId: id, nextLocked })}
          onAddSupportTemplate={() => emitDrawingAction("addSupportAtClose")}
          onAddResistanceTemplate={() => emitDrawingAction("addResistanceAtClose")}
          onAddTagTemplate={() => emitDrawingAction("addTagAtLatest")}
          onAddBuyEntry={() => emitDrawingAction("addBuyEntry")}
          onChangeOverlayColor={(id, color) => {
            setDrawingColor(color);
            emitDrawingAction("changeColorById", { overlayId: id, color });
          }}
          rightContent={
            frequencyOptions && onFrequencyChange ? (
              <div className="flex items-center gap-1 bg-canvas px-1 py-1 mr-2">
                {frequencyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onFrequencyChange(opt.value)}
                    className={cn(
                      "px-2.5 py-0.5 text-xs rounded transition-colors",
                      frequency === opt.value
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <WatchlistChart
            key={`${tsCode}-${frequency}`}
            tsCode={tsCode}
            sectorCode={sectorCode}
            stockName={stockName}
            frequency={frequency}
            activeTool={drawingTool}
            drawingColor={drawingColor}
            onSelectionChange={setSelectedOverlay}
            onDrawingsChange={setDrawings}
          />
        </div>
        {showDrawingsPanel && (
          <div className="w-[220px] border-l border-border-default p-2 overflow-auto">
            <DrawingsPanel
              items={drawings}
              selectedId={selectedOverlay.id}
              selectedName={selectedOverlay.name}
              onDelete={(id) => emitDrawingAction("deleteById", { overlayId: id })}
              onToggleLock={(id, nextLocked) => emitDrawingAction("toggleLockById", { overlayId: id, nextLocked })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
