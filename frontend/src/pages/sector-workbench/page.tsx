import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSectorStocks } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { AttributionPanel } from "@/features/chart/components/attribution-panel";
import { StockTagsPanel } from "@/features/chart/components/stock-tags-panel";
import { HHStatsPanel } from "@/features/chart/components/hh-stats-panel";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { DrawingsPanel } from "@/features/chart/components/drawings-panel";
import { Button } from "@/shared/ui/button";
import type { SectorStock } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store";

export default function SectorWorkbenchPage() {
  const navigate = useNavigate();
  const { setSelectedSectorCode } = useDashboardStore();
  const [searchParams] = useSearchParams();
  const sectorCode = searchParams.get("sectorCode") || "";
  const sectorNameFromQuery = searchParams.get("sectorName") || "";
  const initialStockCode = searchParams.get("stockCode") || "";

  const { data: items = [], isLoading, error } = useSectorStocks(sectorCode);

  const [selectedCode, setSelectedCode] = useState("");
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);
  const [leftWidth, setLeftWidth] = useState(280);
  const draggingLeft = useRef(false);
  const [rightWidth, setRightWidth] = useState(300);
  const draggingRight = useRef(false);

  const selected = items.find((i) => i.tsCode === selectedCode) || items.find((i) => i.tsCode === initialStockCode) || items[0];
  const sectorName = items[0]?.sectorName || sectorNameFromQuery || "细分板块";

  useEffect(() => {
    if (!selectedCode && items.length > 0) {
      setSelectedCode(initialStockCode && items.some((item) => item.tsCode === initialStockCode) ? initialStockCode : items[0].tsCode);
    }
  }, [selectedCode, items, initialStockCode]);

  const columns: Column<SectorStock>[] = [
    {
      key: "stockName",
      label: "名称",
      render: (item) => (
        <div className="leading-tight">
          <span className="text-sm">{item.stockName}</span>
          <span className="block text-[10px] text-text-tertiary font-mono">{item.tsCode.replace(/\.\w+$/, "")}</span>
        </div>
      ),
    },
    {
      key: "pctChange5d",
      label: "5日",
      width: "56px",
      align: "right",
      render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} />,
    },
    {
      key: "pctChange10d",
      label: "10日",
      width: "56px",
      align: "right",
      render: (item) => <NumericCell value={item.pctChange10d} format={fmtPct} />,
    },
  ];

  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    draggingLeft.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingLeft.current) return;
      setLeftWidth(Math.min(420, Math.max(220, startW + ev.clientX - startX)));
    }
    function onUp() {
      draggingLeft.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startResizeRight(e: React.MouseEvent) {
    e.preventDefault();
    draggingRight.current = true;
    const startX = e.clientX;
    const startW = rightWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingRight.current) return;
      setRightWidth(Math.min(460, Math.max(240, startW - (ev.clientX - startX))));
    }
    function onUp() {
      draggingRight.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function emitDrawingAction(
    action: "deleteSelected" | "clearAll" | "toggleLock" | "addSupportAtClose" | "addResistanceAtClose" | "addTagAtLatest" | "deleteById" | "toggleLockById",
    detail: Record<string, unknown> = {},
  ) {
    if (!selected) return;
    window.dispatchEvent(new CustomEvent(`chart-drawing:${selected.tsCode}`, { detail: { action, ...detail } }));
  }

  if (!sectorCode) {
    return <div className="flex items-center justify-center h-full text-text-tertiary">缺少板块参数</div>;
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-text-tertiary">板块成分股加载中...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-state-up">{error.message}</div>;
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftWidth }}>
        <div className="px-3 py-2 border-b border-border-default">
          <h2 className="text-sm font-medium">{sectorName}</h2>
          <p className="text-[10px] text-text-tertiary">{items.length} 只</p>
        </div>
        <DataTable
          columns={columns}
          data={items}
          rowKey={(i) => i.tsCode}
          selectedKey={selected?.tsCode}
          onRowClick={(i) => setSelectedCode(i.tsCode)}
          compact
          className="flex-1"
        />
      </div>

      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeLeft}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            <div className="px-4 py-2 border-b border-border-default space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <h2 className="text-base font-semibold leading-tight">{selected.stockName}</h2>
                  <span className="text-[10px] text-text-tertiary font-mono">{selected.tsCode} · {sectorName}</span>
                </div>
                <div className="flex items-stretch border border-border-default rounded text-xs">
                  {[
                    { label: "RPS20", value: selected.rps20 },
                    { label: "5日", value: selected.pctChange5d, pct: true },
                    { label: "10日", value: selected.pctChange10d, pct: true },
                  ].map((m) => (
                    <div key={m.label} className="px-2 py-1 border-r border-border-default last:border-r-0 min-w-[60px]">
                      <span className="block text-[10px] text-text-tertiary">{m.label}</span>
                      <strong className={cn(
                        "text-xs font-semibold font-mono",
                        m.pct && m.value != null && (m.value >= 0 ? "text-state-up" : "text-state-down")
                      )}>
                        {m.pct ? fmtPct(m.value) : (m.value ?? "-")}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() => {
                      setSelectedSectorCode(sectorCode);
                      navigate("/dashboard");
                    }}
                  >
                    回板块总览
                  </Button>
                </div>
              </div>
              <StockTagsPanel
                key={`sector-tags-${selected.tsCode}`}
                tsCode={selected.tsCode}
                compact
                onConceptClick={(code) => {
                  setSelectedSectorCode(code);
                  navigate("/dashboard");
                }}
              />
            </div>

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

            <div className="flex-1 min-h-0 overflow-auto">
              <WatchlistChart
                key={selected.tsCode}
                tsCode={selected.tsCode}
                sectorCode={sectorCode}
                stockName={selected.stockName}
                activeTool={drawingTool}
                onSelectionChange={setSelectedOverlay}
                onDrawingsChange={setDrawings}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">暂无成分股</div>
        )}
      </div>

      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeRight}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      <div className="flex flex-col min-h-0 border-l border-border-default overflow-auto" style={{ width: rightWidth }}>
        {selected ? (
          <div className="space-y-4 p-3">
            <DrawingsPanel
              items={drawings}
              selectedId={selectedOverlay.id}
              selectedName={selectedOverlay.name}
              onDelete={(id) => emitDrawingAction("deleteById", { overlayId: id })}
              onToggleLock={(id, nextLocked) => emitDrawingAction("toggleLockById", { overlayId: id, nextLocked })}
            />
            <AttributionPanel key={`sector-attr-${selected.tsCode}`} tsCode={selected.tsCode} />
            <StockTagsPanel
              key={`sector-panel-tags-${selected.tsCode}`}
              tsCode={selected.tsCode}
              onConceptClick={(code) => {
                setSelectedSectorCode(code);
                navigate("/dashboard");
              }}
            />
            <HHStatsPanel key={`sector-hh-${selected.tsCode}`} tsCode={selected.tsCode} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">选择股票后显示详情</div>
        )}
      </div>
    </div>
  );
}
