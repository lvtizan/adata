import { useEffect, useRef, useCallback, useState } from "react";
import { useMarketOverview, useSectorRankings, useSectorStocks, useWatchlist } from "@/queries";
import { useDashboardStore, useAppStore } from "@/store";
import { MarketSummary } from "@/features/market/components/market-summary";
import { SectorTable } from "@/features/sectors/components/sector-table";
import { StockTable } from "@/features/stocks/components/stock-table";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { ChartShell } from "@/shared/charts";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { DrawingsPanel } from "@/features/chart/components/drawings-panel";

/**
 * 基于百分比的弹性列宽 hook。
 * pct: 0-1 (列宽占容器百分比)，拖拽改变百分比而非像素。
 * 这样窗口缩放时列会等比例缩放。
 */
function useResizablePct(initialPct: number, minPct: number, maxPct: number, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [pct, setPct] = useState(initialPct);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startPct = pct;
    const containerWidth = containerRef.current?.clientWidth || 1200;

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const dx = ev.clientX - startX;
      const dPct = dx / containerWidth;
      setPct(Math.min(maxPct, Math.max(minPct, startPct + dPct)));
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pct, minPct, maxPct, containerRef]);

  return { pct, onMouseDown };
}

function Resizer({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center"
      onMouseDown={onMouseDown}
    >
      <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
    </div>
  );
}

// 初始比例: 板块 33%, 个股 30%, 图表 37% (余量)
const COL1_PCT = 0.33;
const COL2_PCT = 0.30;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: overview } = useMarketOverview();
  const { data: rankings = [] } = useSectorRankings();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useDashboardStore();
  const { data: stocks = [], isLoading: stocksLoading } = useSectorStocks(selectedSectorCode);
  const { data: watchlistItems = [] } = useWatchlist();
  const stealthMode = useAppStore((s) => s.stealthMode);
  const toggleStealth = useAppStore((s) => s.toggleStealthMode);

  const watchlistCodes = new Set(watchlistItems.map((w) => w.tsCode));

  const containerRef = useRef<HTMLDivElement>(null);
  const col1 = useResizablePct(COL1_PCT, 0.18, 0.45, containerRef);
  const col2 = useResizablePct(COL2_PCT, 0.18, 0.42, containerRef);

  useEffect(() => {
    if (!selectedSectorCode && rankings.length > 0) {
      setSelectedSectorCode(rankings[0].sectorCode);
    }
  }, [rankings, selectedSectorCode, setSelectedSectorCode]);

  useEffect(() => {
    if (stocks.length > 0 && !stocks.some((s) => s.tsCode === selectedStockCode)) {
      setSelectedStockCode(stocks[0].tsCode);
    }
  }, [stocks, selectedStockCode, setSelectedStockCode]);

  const selectedSector = rankings.find((s) => s.sectorCode === selectedSectorCode);
  const selectedStock = stocks.find((s) => s.tsCode === selectedStockCode);
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);

  function emitDrawingAction(
    action: "deleteSelected" | "clearAll" | "toggleLock" | "addSupportAtClose" | "addResistanceAtClose" | "addTagAtLatest" | "deleteById" | "toggleLockById",
    detail: Record<string, unknown> = {},
  ) {
    if (!selectedStock?.tsCode) return;
    window.dispatchEvent(new CustomEvent(`chart-drawing:${selectedStock.tsCode}`, { detail: { action, ...detail } }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar — 单行紧凑 */}
      <div className="px-3 py-1.5 border-b border-border-default overflow-x-auto">
        <MarketSummary overview={overview} />
      </div>

      {/* Main layout: 3-column */}
      <div ref={containerRef} className="flex-1 flex min-h-0 border-t border-border-default overflow-hidden">
        {/* Column 1: Sector rankings */}
        <div
          className="flex flex-col min-h-0 border-r border-border-default overflow-hidden"
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col1.pct * 100}%`, minWidth: 220 }}
        >
          <div className="px-3 py-2 border-b border-border-default shrink-0">
            <h2 className="text-sm font-medium">板块列表</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个候选板块</p>
          </div>
          <SectorTable data={rankings} selectedCode={selectedSectorCode} onSelect={setSelectedSectorCode} />
        </div>

        {!stealthMode && <Resizer onMouseDown={col1.onMouseDown} />}

        {/* Column 2: Sector stocks */}
        <div
          className={`flex flex-col min-h-0 overflow-hidden ${stealthMode ? "" : "border-r border-border-default"}`}
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col2.pct * 100}%`, minWidth: 220 }}
        >
          <div className="px-3 py-2 border-b border-border-default shrink-0">
            <h2 className="text-sm font-medium">板块内个股</h2>
            <p className="text-xs text-text-tertiary">
              {selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只` : "选择板块后加载"}
            </p>
          </div>
          <StockTable
            data={stocks}
            selectedCode={selectedStockCode}
            onSelect={setSelectedStockCode}
            onNameClick={(item) => {
              navigate(`/sector-workbench?sectorCode=${encodeURIComponent(selectedSector?.sectorCode || "")}&sectorName=${encodeURIComponent(selectedSector?.sectorName || "")}&stockCode=${encodeURIComponent(item.tsCode)}`);
            }}
            loading={stocksLoading}
            watchlistCodes={watchlistCodes}
            sectorCode={selectedSector?.sectorCode}
            sectorName={selectedSector?.sectorName}
          />
        </div>

        {!stealthMode && <Resizer onMouseDown={col2.onMouseDown} />}

        {/* Column 3: Charts — 摸鱼模式下折叠 */}
        {stealthMode ? (
          <div
            className="w-9 shrink-0 flex flex-col items-center justify-center border-l border-border-default bg-surface-subtle cursor-pointer hover:bg-surface-hover transition-colors group"
            onClick={toggleStealth}
            title="展开图表"
          >
            <ChevronLeft className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
            <span className="text-[10px] text-text-tertiary group-hover:text-text-secondary mt-1" style={{ writingMode: "vertical-rl" }}>K 线</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 min-w-[260px] relative">
            {/* 折叠按钮 */}
            <button
              onClick={toggleStealth}
              className="absolute top-2 right-2 z-30 w-6 h-6 rounded flex items-center justify-center bg-surface-subtle/80 hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
              title="折叠图表 (摸鱼模式)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 min-h-0">
              <CandlestickPanel kind="sector" code={selectedSector?.sectorCode || ""} label={selectedSector?.sectorName || ""} title="细分板块 K 线" emptyText="选择板块后显示" />
            </div>
            <div className="flex-1 min-h-0">
              <ChartShell
                title="选中个股 K 线"
                subtitle={selectedStock?.stockName || ""}
                empty={!selectedStock?.tsCode ? "选择个股后显示" : undefined}
                className="h-full"
              >
                {selectedStock?.tsCode ? (
                  <div className="h-full flex flex-col min-h-0">
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
                      />
                    </div>
                    <div className="flex-1 min-h-0 flex">
                      <div className="flex-1 min-w-0">
                        <WatchlistChart
                          key={selectedStock.tsCode}
                          tsCode={selectedStock.tsCode}
                          sectorCode={selectedSector?.sectorCode || ""}
                          stockName={selectedStock.stockName}
                          activeTool={drawingTool}
                          onSelectionChange={setSelectedOverlay}
                          onDrawingsChange={setDrawings}
                        />
                      </div>
                      <div className="w-[220px] border-l border-border-default p-2 overflow-auto">
                        <DrawingsPanel
                          items={drawings}
                          selectedId={selectedOverlay.id}
                          selectedName={selectedOverlay.name}
                          onDelete={(id) => emitDrawingAction("deleteById", { overlayId: id })}
                          onToggleLock={(id, nextLocked) => emitDrawingAction("toggleLockById", { overlayId: id, nextLocked })}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div />
                )}
              </ChartShell>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
