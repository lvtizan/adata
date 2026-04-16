import { useState, useEffect } from "react";
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
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { StatStrip, type Stat } from "@/shared/ui/stat-strip";
import { StockTag } from "@/shared/ui/stock-tag";
import { EmptyState } from "@/shared/ui/empty-state";
import type { WatchlistItem } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store";
import { Resizer, useResizablePx, useResizableRightPx } from "@/shared/layout";
import { Inbox } from "lucide-react";

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
  const [drawingColor, setDrawingColor] = useState("#3b82f6");
  const [frequency, setFrequency] = useState<string>("1d");
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string | null; locked: boolean; name: string | null }>({ id: null, locked: false, name: null });
  const [drawings, setDrawings] = useState<Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>>([]);

  const leftCol = useResizablePx(260, 200, 400);
  const rightCol = useResizableRightPx(300, 240, 460);

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
        const val = rt?.pctChange ?? item.pctChange1d;
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

  // Build stats for selected stock
  const coreStats: Stat[] = selected
    ? [
        { label: "RPS20", value: selected.rps20 ?? "-", tone: "neutral" },
        {
          label: "5日",
          value: fmtPct(selected.pctChange5d),
          tone: selected.pctChange5d == null ? "neutral" : selected.pctChange5d >= 0 ? "up" : "down",
        },
        {
          label: "10日",
          value: fmtPct(selected.pctChange10d),
          tone: selected.pctChange10d == null ? "neutral" : selected.pctChange10d >= 0 ? "up" : "down",
        },
      ]
    : [];

  const financialStats: Stat[] =
    financials?.periods && financials.periods.length > 0
      ? financials.periods.slice(0, 4).map((period) => ({
          label: fmtQuarter(period.endDate),
          value: period.revenueYoY != null ? fmtPct(period.revenueYoY) : "-",
          tone:
            period.revenueYoY == null
              ? "neutral"
              : period.revenueYoY >= 0
                ? "up"
                : "down",
        }))
      : [];

  return (
    <div className="flex h-full">
      {/* ══ 左列：自选股列表 ══ */}
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftCol.width }}>
        <PageHeader title="自选股" subtitle={`共 ${items.length} 只`} />
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

      <Resizer onMouseDown={leftCol.onMouseDown} />

      {/* ══ 中列：K 线图 ══ */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            {/* Header: 股票名 + 指标 + 操作 */}
            <div className="px-4 py-2 border-b border-border-default space-y-1.5">
              {/* 第一行：名称 + 指标卡片 + 操作 */}
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <StockTag
                    code={selected.tsCode}
                    name={selected.stockName}
                    pctChange={realtimeMap?.get(selected.tsCode)?.pctChange ?? selected.pctChange1d}
                    rs={selected.rps20}
                    size="md"
                  />
                  <span className="block text-[10px] text-text-tertiary font-mono mt-0.5">{selected.tsCode}</span>
                </div>
                {/* 核心指标条 */}
                <StatStrip stats={coreStats} density="compact" className="shrink-0" />
                {/* 营收同比指标条 */}
                {financialStats.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-text-tertiary leading-none">营收同比</span>
                    <StatStrip stats={financialStats} density="compact" />
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

            {/* K 线图 */}
            <div className="flex-1 min-h-0 overflow-auto">
              <WatchlistChart
                key={selected.tsCode}
                tsCode={selected.tsCode}
                sectorCode={effectiveSectorCode}
                stockName={selected.stockName}
                frequency={frequency}
                activeTool={drawingTool}
                drawingColor={drawingColor}
                onSelectionChange={setSelectedOverlay}
                onDrawingsChange={setDrawings}
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Inbox />}
            title="暂无自选股"
            description="从股票列表或搜索中添加自选股，在此查看 K 线和详情"
            className="flex-1"
          />
        )}
      </div>

      <Resizer onMouseDown={rightCol.onMouseDown} />

      {/* ══ 右列：上涨归因 + 详细标签 ══ */}
      <div className="flex flex-col min-h-0 border-l border-border-default overflow-auto" style={{ width: rightCol.width }}>
        {selected ? (
          <div className="space-y-3 p-3">
            <Panel title="画线" padded={false} bordered>
              <DrawingsPanel
                items={drawings}
                selectedId={selectedOverlay.id}
                selectedName={selectedOverlay.name}
                onDelete={(id) => emitDrawingAction("deleteById", { overlayId: id })}
                onToggleLock={(id, nextLocked) => emitDrawingAction("toggleLockById", { overlayId: id, nextLocked })}
              />
            </Panel>
            <Panel title="上涨归因" padded={false} bordered>
              <AttributionPanel
                key={`attr-${selected.tsCode}`}
                tsCode={selected.tsCode}
              />
            </Panel>
            <Panel title="相关标签" padded={false} bordered>
              <StockTagsPanel
                key={`tags-full-${selected.tsCode}`}
                tsCode={selected.tsCode}
                onSelectStock={(code) => setSelectedCode(code)}
                onConceptClick={(code) => { setSelectedSectorCode(code); navigate("/dashboard"); }}
              />
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}
