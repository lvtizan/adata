import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWatchlist, useUpdateWatchlist, useRemoveFromWatchlist, useStockSector, useStockFinancials, useRealtimeQuotes } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtQuarter } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { AttributionPanel } from "@/features/chart/components/attribution-panel";
import { StockTagsPanel } from "@/features/chart/components/stock-tags-panel";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { DrawingsPanel } from "@/features/chart/components/drawings-panel";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { WatchlistItem } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store";

const FREQ_OPTIONS = [
  { value: "1d", label: "日" },
  { value: "1w", label: "周" },
  { value: "1M", label: "月" },
] as const;

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { setSelectedSectorCode } = useDashboardStore();
  const { data: items = [] } = useWatchlist();
  const updateMutation = useUpdateWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const [selectedCode, setSelectedCode] = useState("");
  const [editingSubgroup, setEditingSubgroup] = useState(false);
  const [subgroupValue, setSubgroupValue] = useState("");
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string>("1d");
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);

  // 左列宽度拖拽
  const [leftWidth, setLeftWidth] = useState(260);
  const draggingLeft = useRef(false);
  // 右列宽度拖拽
  const [rightWidth, setRightWidth] = useState(300);
  const draggingRight = useRef(false);

  const selected = items.find((i) => i.tsCode === selectedCode) || items[0];

  const needSectorLookup = !!selected && !selected.sectorCode;
  const { data: sectorLookup } = useStockSector(needSectorLookup ? selected.tsCode : "");
  const { data: financials } = useStockFinancials(selected?.tsCode ?? "");
  const realtimeCodes = items.map((i) => i.tsCode);
  const { data: realtimeMap } = useRealtimeQuotes(realtimeCodes);
  const effectiveSectorCode = selected?.sectorCode || sectorLookup?.sectorCode || "";

  useEffect(() => {
    if (!selectedCode && items.length > 0 && items[0]) {
      setSelectedCode(items[0].tsCode);
    }
  }, [selectedCode, items]);

  const columns: Column<WatchlistItem>[] = [
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
      key: "pctChange1d",
      label: "今日",
      width: "56px",
      align: "right",
      render: (item) => {
        const rt = realtimeMap?.get(item.tsCode);
        const val = rt ?? item.pctChange1d;
        return <NumericCell value={val} format={fmtPct} />;
      },
    },
    {
      key: "pctChange5d",
      label: "5日",
      width: "56px",
      align: "right",
      render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} />,
    },
  ];

  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    draggingLeft.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingLeft.current) return;
      setLeftWidth(Math.min(400, Math.max(200, startW + ev.clientX - startX)));
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
      // 注意：右侧拖拽方向相反，往左拖 = 宽度变大
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

  async function handleSaveSubgroup() {
    if (!selected) return;
    await updateMutation.mutateAsync({ tsCode: selected.tsCode, data: { subgroup: subgroupValue } });
    setEditingSubgroup(false);
  }

  async function handleRemove() {
    if (!selected) return;
    await removeMutation.mutateAsync(selected.tsCode);
    setSelectedCode("");
  }

  function emitDrawingAction(
    action: "deleteSelected" | "clearAll" | "toggleLock" | "addSupportAtClose" | "addResistanceAtClose" | "addTagAtLatest" | "addBuyEntry" | "deleteById" | "toggleLockById",
    detail: Record<string, unknown> = {},
  ) {
    if (!selected) return;
    window.dispatchEvent(new CustomEvent(`chart-drawing:${selected.tsCode}`, { detail: { action, ...detail } }));
  }

  return (
    <div className="flex h-full">
      {/* ══ 左列：自选股列表 ══ */}
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftWidth }}>
        <div className="px-3 py-2 border-b border-border-default">
          <h2 className="text-sm font-medium">自选股</h2>
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

      {/* 左 resize handle */}
      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeLeft}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      {/* ══ 中列：K 线图 ══ */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            {/* Header: 股票名 + 标签 + 指标 + 操作 */}
            <div className="px-4 py-2 border-b border-border-default space-y-1.5">
              {/* 第一行：名称 + 指标卡片 + 操作 */}
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <h2 className="text-base font-semibold leading-tight">{selected.stockName}</h2>
                  <span className="text-[10px] text-text-tertiary font-mono">{selected.tsCode}</span>
                </div>
                {/* 指标卡片 */}
                <div className="flex items-stretch h-[50px] border border-border-default rounded text-xs overflow-hidden shrink-0">
                  {[
                    { label: "RPS20", value: selected.rps20 },
                    { label: "5日", value: selected.pctChange5d, pct: true },
                    { label: "10日", value: selected.pctChange10d, pct: true },
                  ].map((m) => (
                    <div key={m.label} className="px-3 py-1.5 border-r border-border-default last:border-r-0 min-w-[72px] flex flex-col justify-center">
                      <span className="block text-[10px] text-text-tertiary">{m.label}</span>
                      <strong className={cn(
                        "text-xs font-semibold font-mono mt-0.5",
                        m.pct && m.value != null && (m.value >= 0 ? "text-state-up" : "text-state-down")
                      )}>
                        {m.pct ? fmtPct(m.value) : (m.value ?? "-")}
                      </strong>
                    </div>
                  ))}
                </div>
                {financials?.periods && financials.periods.length > 0 && (
                  <div className="flex items-start shrink-0">
                    <div className="text-[10px] text-text-tertiary leading-none pt-1">营收同比</div>
                    <div className="flex items-stretch h-[50px] border border-border-default rounded text-xs overflow-hidden ml-3">
                      {financials.periods.slice(0, 4).map((period) => (
                        <div key={period.endDate} className="px-3 py-1.5 border-r border-border-default last:border-r-0 min-w-[82px] flex flex-col justify-center">
                          <span className="block text-[10px] text-text-tertiary">{fmtQuarter(period.endDate)}</span>
                          <strong
                            className={cn(
                              "block text-xs font-semibold font-mono mt-0.5",
                              period.revenueYoY == null
                                ? "text-text-quaternary"
                                : period.revenueYoY >= 0
                                  ? "text-state-up"
                                  : "text-state-down",
                            )}
                          >
                            {period.revenueYoY != null ? fmtPct(period.revenueYoY) : "-"}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 分组 + 移出 */}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {editingSubgroup ? (
                    <>
                      <Input className="h-6 w-28 text-[10px]" value={subgroupValue} onChange={(e) => setSubgroupValue(e.target.value)} />
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={handleSaveSubgroup}>保存</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => setEditingSubgroup(false)}>取消</Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-1.5"
                      onClick={() => { setSubgroupValue(selected.subgroup || ""); setEditingSubgroup(true); }}
                    >
                      {selected.subgroup || "未分组"} ✎
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-state-down hover:bg-state-down/10" onClick={handleRemove}>
                    移出
                  </Button>
                </div>
              </div>
              {/* 第二行：概念标签 + 资金徽章 */}
              <StockTagsPanel
                key={`tags-${selected.tsCode}`}
                tsCode={selected.tsCode}
                compact
                onConceptClick={(code) => { setSelectedSectorCode(code); navigate("/dashboard"); }}
              />
            </div>

            {/* 画线工具栏 */}
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
                rightContent={
                  <div className="flex items-center gap-1 bg-canvas px-1 py-1 mr-2">
                    {FREQ_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFrequency(opt.value)}
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
                }
              />
            </div>

            {/* K 线图 */}
            <div className="flex-1 min-h-0 overflow-auto">
              <WatchlistChart
                key={selected.tsCode}
                tsCode={selected.tsCode}
                sectorCode={effectiveSectorCode}
                stockName={selected.stockName}
                frequency={frequency}
                activeTool={drawingTool}
                onSelectionChange={setSelectedOverlay}
                onDrawingsChange={setDrawings}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">暂无自选股</div>
        )}
      </div>

      {/* 右 resize handle */}
      <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeRight}>
        <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
      </div>

      {/* ══ 右列：上涨归因 + 详细标签 ══ */}
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
