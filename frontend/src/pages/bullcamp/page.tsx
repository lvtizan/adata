import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBullCamp, useStockSector } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { CampTag } from "@/features/bullcamp/components/camp-tag";
import { ScoreSparkline } from "@/features/bullcamp/components/score-sparkline";
import { FinancialsPanel } from "@/features/bullcamp/components/financials-panel";
import { NewsPanel } from "@/features/bullcamp/components/news-panel";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { AttributionPanel } from "@/features/chart/components/attribution-panel";
import { StockTagsPanel } from "@/features/chart/components/stock-tags-panel";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { DrawingsPanel } from "@/features/chart/components/drawings-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import type { BullCampItem } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store";

function compareValues(a: any, b: any, key: string, dir: "asc" | "desc"): number {
  let va = a[key], vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  return dir === "asc" ? va - vb : vb - va;
}

export default function BullcampPage() {
  const navigate = useNavigate();
  const { setSelectedSectorCode } = useDashboardStore();
  const { data: items = [], isLoading, error } = useBullCamp();
  const [selectedCode, setSelectedCode] = useState("");
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);
  // 左列宽度
  const [leftWidth, setLeftWidth] = useState(520);
  const draggingLeft = useRef(false);
  // 右列宽度
  const [rightWidth, setRightWidth] = useState(300);
  const draggingRight = useRef(false);

  const selected = items.find((i) => i.tsCode === selectedCode) || items[0];

  // 如果选中的牛股没有 sectorCode，查一下
  const needSectorLookup = !!selected && !selected.sectorCode;
  const { data: sectorLookup } = useStockSector(needSectorLookup ? selected.tsCode : "");
  const effectiveSectorCode = selected?.sectorCode || sectorLookup?.sectorCode || "";

  useEffect(() => {
    if (!selectedCode && items.length > 0 && items[0]) {
      setSelectedCode(items[0].tsCode);
    }
  }, [selectedCode, items]);

  const columns: Column<BullCampItem>[] = [
    {
      key: "stockName", label: "名称", sortable: true,
      render: (item) => (
        <span className="text-sm">
          {item.stockName}
          <CampTag isNew={item.isNew} daysInCamp={item.daysInCamp} hasAnnouncement={item.hasRecentAnnouncement} patternTags={item.patternTags} />
        </span>
      ),
    },
    { key: "sectorName", label: "板块", sortable: true, render: (item) => <span className="text-xs text-text-secondary">{item.sectorName}</span> },
    { key: "close", label: "现价", width: "60px", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
    { key: "pctChange5d", label: "5日", width: "60px", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "sectorPctChange5d", label: "板块5日", width: "64px", align: "right", sortable: true, render: (item) => <NumericCell value={item.sectorPctChange5d} format={fmtPct} /> },
    { key: "rps20", label: "RPS20", width: "56px", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.rps20 ?? "-"}</span> },
    { key: "sectorRps10", label: "板块RPS", width: "64px", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.sectorRps10 ?? "-"}</span> },
    { key: "relativeStrengthLatest", label: "相对强弱", width: "64px", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.relativeStrengthLatest?.toFixed(1) ?? "-"}</span> },
    { key: "amount", label: "成交额", width: "68px", align: "right", sortable: true, render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
    { key: "campScore", label: "综合分", width: "56px", align: "right", sortable: true, render: (item) => <span className="text-sm font-semibold">{item.campScore?.toFixed(0) ?? "-"}</span> },
    { key: "campScoreHistory" as any, label: "趋势", width: "56px", align: "center", sortable: false, render: (item) => <ScoreSparkline data={item.campScoreHistory ?? []} /> },
  ];

  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    draggingLeft.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingLeft.current) return;
      setLeftWidth(Math.min(760, Math.max(420, startW + ev.clientX - startX)));
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

  if (isLoading) return <div className="flex items-center justify-center h-full text-text-tertiary">牛股集中营加载中...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-state-up">{error.message}</div>;

  return (
    <div className="flex h-full">
      {/* ══ 左列：牛股列表 ══ */}
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftWidth }}>
        <div className="px-3 py-2 border-b border-border-default">
          <h2 className="text-sm font-medium">牛股集中营</h2>
          <p className="text-xs text-text-tertiary">{items.length} 只</p>
        </div>
        <DataTable
          columns={columns}
          data={items}
          rowKey={(i) => i.tsCode}
          selectedKey={selected?.tsCode}
          onRowClick={(i) => setSelectedCode(i.tsCode)}
          sortFn={compareValues}
          defaultSort={{ key: "campScore", dir: "desc" }}
          compact
          className="flex-1"
        />
      </div>

      {/* 左 resize handle */}
      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeLeft}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      {/* ══ 中列：K 线图 + 财务/新闻 ══ */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="px-4 py-2 border-b border-border-default space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <h2 className="text-base font-semibold leading-tight">{selected.stockName}</h2>
                  <span className="text-[10px] text-text-tertiary font-mono">{selected.tsCode} · {selected.sectorName}</span>
                </div>
                <div className="flex items-stretch border border-border-default rounded text-xs">
                  {[
                    { label: "RPS20", value: selected.rps20 },
                    { label: "5日", value: selected.pctChange5d, pct: true },
                    { label: "相对强弱", value: selected.relativeStrengthLatest?.toFixed(1) },
                    { label: "综合分", value: selected.campScore?.toFixed(0) },
                  ].map((m) => (
                    <div key={m.label} className="px-2 py-1 border-r border-border-default last:border-r-0 min-w-[60px]">
                      <span className="block text-[10px] text-text-tertiary">{m.label}</span>
                      <strong className={cn(
                        "text-xs font-semibold font-mono",
                        m.pct && m.value != null && (Number(m.value) >= 0 ? "text-state-up" : "text-state-down")
                      )}>
                        {m.pct ? fmtPct(m.value as number) : (m.value ?? "-")}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              {/* 概念标签行 */}
              <StockTagsPanel
                key={`tags-compact-${selected.tsCode}`}
                tsCode={selected.tsCode}
                compact
                onConceptClick={(code) => { setSelectedSectorCode(code); navigate("/dashboard"); }}
              />
            </div>

            <Tabs defaultValue="chart" className="flex-1 flex flex-col min-h-0">
              <TabsList className="px-4 border-b border-border-default bg-surface rounded-none h-auto justify-start gap-0">
                <TabsTrigger value="chart" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">图表</TabsTrigger>
                <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">财务</TabsTrigger>
                <TabsTrigger value="news" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">新闻</TabsTrigger>
              </TabsList>
              <TabsContent value="chart" className="flex-1 flex flex-col min-h-0 overflow-auto mt-0">
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
                <div className="flex-1 min-h-0">
                  <WatchlistChart
                    key={selected.tsCode}
                    tsCode={selected.tsCode}
                    sectorCode={effectiveSectorCode}
                    stockName={selected.stockName}
                    activeTool={drawingTool}
                    onSelectionChange={setSelectedOverlay}
                    onDrawingsChange={setDrawings}
                  />
                </div>
              </TabsContent>
              <TabsContent value="financials" className="flex-1 min-h-0 overflow-auto mt-0">
                <FinancialsPanel tsCode={selected.tsCode} />
              </TabsContent>
              <TabsContent value="news" className="flex-1 min-h-0 overflow-auto mt-0">
                <NewsPanel tsCode={selected.tsCode} />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">暂无数据</div>
        )}
      </div>

      {/* 右 resize handle */}
      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeRight}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      {/* ══ 右列：上涨归因 + 个股标签 ══ */}
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
            <AttributionPanel
              key={`attr-${selected.tsCode}`}
              tsCode={selected.tsCode}
            />
            <div className="border-t border-border-default pt-3">
              <StockTagsPanel
                key={`tags-full-${selected.tsCode}`}
                tsCode={selected.tsCode}
                onSelectStock={(code) => setSelectedCode(code)}
                onConceptClick={(code) => { setSelectedSectorCode(code); navigate("/dashboard"); }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
