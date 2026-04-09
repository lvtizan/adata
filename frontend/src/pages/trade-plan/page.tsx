import { useEffect, useMemo, useRef, useState } from "react";
import { DataTable, type Column } from "@/shared/table";
import { useTradePlans, useDeleteTradePlan, useUpdateTradePlan, useStockSector } from "@/queries";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { DrawingToolbar } from "@/features/chart/components/drawing-toolbar";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { cn } from "@/lib/utils";
import type { TradePlanItem } from "@/shared/types";

function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  return v.toFixed(2);
}

function fmtRR(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  return `${v.toFixed(2)}R`;
}

const TRADE_PLAN_CHART_WIDTH_KEY = "trade-plan:chart-width";
const FREQ_OPTIONS = [
  { value: "1d", label: "日" },
  { value: "1w", label: "周" },
  { value: "1M", label: "月" },
] as const;

export default function TradePlanPage() {
  const { data: plans = [], isLoading, error } = useTradePlans();
  const deleteMutation = useDeleteTradePlan();
  const updateMutation = useUpdateTradePlan();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [drawingColor, setDrawingColor] = useState("#3b82f6");
  const [frequency, setFrequency] = useState<string>("1d");
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);
  const [realTpDrafts, setRealTpDrafts] = useState<Record<number, string>>({});
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const raw = localStorage.getItem(TRADE_PLAN_CHART_WIDTH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? Math.max(340, Math.min(900, parsed)) : 520;
  });
  const draggingRight = useRef(false);

  const selected = useMemo(
    () => plans.find((item) => item.id === selectedId) || plans[0] || null,
    [plans, selectedId],
  );
  const { data: sectorLookup } = useStockSector(selected?.tsCode ?? "");

  useEffect(() => {
    if (!selected && plans.length > 0) {
      setSelectedId(plans[0].id);
    }
  }, [plans, selected]);

  useEffect(() => {
    localStorage.setItem(TRADE_PLAN_CHART_WIDTH_KEY, String(rightWidth));
  }, [rightWidth]);

  function startResizeRight(e: React.MouseEvent) {
    e.preventDefault();
    draggingRight.current = true;
    const startX = e.clientX;
    const startW = rightWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingRight.current) return;
      setRightWidth(Math.min(900, Math.max(340, startW - (ev.clientX - startX))));
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
    action: "deleteSelected" | "clearAll" | "toggleLock" | "addSupportAtClose" | "addResistanceAtClose" | "addTagAtLatest" | "addBuyEntry" | "deleteById" | "toggleLockById",
    detail: Record<string, unknown> = {},
  ) {
    if (!selected?.tsCode) return;
    window.dispatchEvent(new CustomEvent(`chart-drawing:${selected.tsCode}`, { detail: { action, ...detail } }));
  }

  function getRealTakeProfitDraft(item: TradePlanItem): string {
    const draft = realTpDrafts[item.id];
    if (draft != null) return draft;
    if (item.realTakeProfit == null || Number.isNaN(item.realTakeProfit)) return "";
    return item.realTakeProfit.toFixed(2);
  }

  async function saveRealTakeProfit(item: TradePlanItem): Promise<void> {
    const raw = (realTpDrafts[item.id] ?? "").trim();
    if (raw === "") {
      await updateMutation.mutateAsync({ id: item.id, data: { realTakeProfit: null } });
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    await updateMutation.mutateAsync({ id: item.id, data: { realTakeProfit: value } });
  }

  const columns: Column<TradePlanItem>[] = useMemo(() => [
    {
      key: "stock",
      label: "股票",
      width: "24%",
      render: (item) => (
        <div className="leading-tight">
          <div>
            <span className="text-sm">{item.stockName || item.tsCode}</span>
            <span className="block text-[10px] text-text-tertiary font-mono">{item.tsCode}</span>
          </div>
        </div>
      ),
    },
    {
      key: "entryPrice",
      label: "买入价",
      align: "right",
      width: "10%",
      render: (item) => <span className="font-mono text-sm">{fmtPrice(item.entryPrice)}</span>,
    },
    {
      key: "stopLoss",
      label: "止损价",
      align: "right",
      width: "10%",
      render: (item) => <span className="font-mono text-sm text-state-down">{fmtPrice(item.stopLoss)}</span>,
    },
    {
      key: "takeProfit",
      label: "计划止盈",
      align: "right",
      width: "11%",
      render: (item) => <span className="font-mono text-sm text-state-up">{fmtPrice(item.takeProfit)}</span>,
    },
    {
      key: "planRiskReward",
      label: "计划R",
      align: "right",
      width: "10%",
      sortable: true,
      render: (item) => <span className="font-mono text-sm">{fmtRR(item.planRiskReward ?? item.riskReward)}</span>,
    },
    {
      key: "realTakeProfit",
      label: "实际止盈价",
      align: "right",
      width: "12%",
      render: (item) => (
        <div className="flex justify-end">
          <Input
            value={getRealTakeProfitDraft(item)}
            onChange={(e) => setRealTpDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
            onBlur={() => { void saveRealTakeProfit(item); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="填价格"
            className="h-7 w-[92px] text-xs text-right font-mono"
          />
        </div>
      ),
    },
    {
      key: "realRiskReward",
      label: "实际止盈R",
      align: "right",
      width: "10%",
      render: (item) => <span className="font-mono text-sm">{fmtRR(item.realRiskReward)}</span>,
    },
    {
      key: "actions",
      label: "操作",
      width: "13%",
      render: (item) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-1.5 text-state-down hover:bg-state-down/10"
            onClick={(e) => {
              e.stopPropagation();
              void deleteMutation.mutateAsync(item.id);
            }}
          >
            删除
          </Button>
        </div>
      ),
    },
  ], [deleteMutation, realTpDrafts, updateMutation]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border-default">
        <h2 className="text-base font-semibold">交易计划</h2>
        <p className="text-xs text-text-tertiary mt-0.5">画线自动生成计划止盈与计划R；你可补充实际止盈价，系统自动计算实际止盈R</p>
      </div>

      {isLoading && <div className="px-4 py-4 text-sm text-text-tertiary">加载中...</div>}
      {error && <div className="px-4 py-4 text-sm text-state-down">{error.message}</div>}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <DataTable
            columns={columns}
            data={plans}
            rowKey={(item) => String(item.id)}
            selectedKey={selected ? String(selected.id) : undefined}
            onRowClick={(item) => setSelectedId(item.id)}
            compact
            className="h-full"
            emptyText="暂无交易计划。先在自选股里用买入划线，再点“加入交易计划”。"
          />
        </div>

        <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={startResizeRight}>
          <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
        </div>

        <div className="border-l border-border-default flex flex-col min-h-0" style={{ width: rightWidth }}>
          {selected ? (
            <>
              <div className="px-3 py-2 border-b border-border-default flex items-center gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">{selected.stockName || selected.tsCode}</div>
                  <div className="text-[10px] text-text-tertiary font-mono">{selected.tsCode}</div>
                </div>
              </div>

              <div className="border-b border-border-default py-1">
                <DrawingToolbar
                  activeTool={drawingTool}
                  drawingColor={drawingColor}
                  onColorChange={setDrawingColor}
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

              <div className="flex-1 min-h-0">
                <WatchlistChart
                  key={`${selected.tsCode}-${frequency}`}
                  tsCode={selected.tsCode}
                  sectorCode={selected.sectorCode || sectorLookup?.sectorCode || ""}
                  stockName={selected.stockName || selected.tsCode}
                  frequency={frequency}
                  activeTool={drawingTool}
                  drawingColor={drawingColor}
                  onSelectionChange={setSelectedOverlay}
                  onDrawingsChange={setDrawings}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">
              选择左侧交易计划查看图表
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
