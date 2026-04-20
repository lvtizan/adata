import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { useBullCamp, useStockSector, useStockFinancials } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount, fmtYi, fmtQuarter } from "@/shared/utils/format";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { BullCampItem } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store";
import { Resizer, useResizablePx, useResizableRightPx } from "@/shared/layout";

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
  const leftCol = useResizablePx(520, 420, 760);
  const rightCol = useResizableRightPx(300, 240, 460);

  const selected = items.find((i) => i.tsCode === selectedCode) || items[0];

  // 如果选中的牛股没有 sectorCode，查一下
  const needSectorLookup = !!selected && !selected.sectorCode;
  const { data: sectorLookup } = useStockSector(needSectorLookup ? selected.tsCode : "");
  const { data: financials } = useStockFinancials(selected?.tsCode ?? "");
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
    { key: "rps20", label: "RPS20", width: "56px", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.rps20 ?? "-"}</span> },
{ key: "amount", label: "成交额", width: "68px", align: "right", sortable: true, render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
    { key: "campScore", label: "综合分", width: "56px", align: "right", sortable: true, render: (item) => <span className="text-sm font-semibold">{item.campScore?.toFixed(0) ?? "-"}</span> },
    { key: "campScoreHistory" as any, label: "趋势", width: "56px", align: "center", sortable: false, render: (item) => <ScoreSparkline data={item.campScoreHistory ?? []} /> },
  ];

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
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftCol.width }}>
        <div className="px-3 py-2 border-b border-border-default">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-medium">牛股集中营</h2>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="查看牛股集中营算法说明"
                  className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-border-default text-text-tertiary hover:text-text-primary hover:bg-surface-secondary"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[360px] p-3 text-xs leading-5">
                <div>筛选：RPS250&gt;87（不可用时降级 RPS120 / RPS20）且成交额≥10亿，并且属于当日主线板块成分。</div>
                <div className="mt-1">评分：campScore = 0.5×RPS分 + 0.2×成交额分 + 0.3×20日收益分（min-max 标准化）。</div>
                <div className="mt-1">增强：连续在营天数、近7天公告、形态标签、近5天综合分趋势。</div>
              </TooltipContent>
            </Tooltip>
          </div>
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

      <Resizer onMouseDown={leftCol.onMouseDown} />

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

                    { label: "净利", value: financials?.periods?.[0]?.netIncome != null ? fmtYi(financials.periods[0].netIncome) : "-" },
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
                {/* 营收同比趋势（最近4季） */}
                {financials?.periods && financials.periods.length > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] ml-2">
                    <span className="text-text-quaternary mr-0.5">营收同比</span>
                    {financials.periods.slice(0, 4).reverse().map((p) => (
                      <span
                        key={p.endDate}
                        className={cn(
                          "px-1.5 py-0.5 rounded font-mono",
                          p.revenueYoY == null ? "text-text-quaternary" :
                          p.revenueYoY >= 0 ? "text-state-up bg-state-up/10" : "text-state-down bg-state-down/10"
                        )}
                      >
                        {fmtQuarter(p.endDate)} {p.revenueYoY != null ? `${p.revenueYoY > 0 ? "+" : ""}${p.revenueYoY.toFixed(0)}%` : "-"}
                      </span>
                    ))}
                  </div>
                )}
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

      <Resizer onMouseDown={rightCol.onMouseDown} />

      {/* ══ 右列：上涨归因 + 个股标签 ══ */}
      <div className="flex flex-col min-h-0 border-l border-border-default overflow-auto" style={{ width: rightCol.width }}>
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
