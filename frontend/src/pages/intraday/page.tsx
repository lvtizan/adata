import { useEffect, useRef, useCallback, useState } from "react";
import { useIntradaySectors, useIntradaySectorStocks, useWatchlist } from "@/queries";
import { useIntradayStore, useAppStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { ChartShell } from "@/shared/charts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SectorRanking, SectorStock } from "@/shared/types";

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
    <div className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center" onMouseDown={onMouseDown}>
      <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
    </div>
  );
}

const sectorColumns: Column<SectorRanking>[] = [
  {
    key: "rank", label: "#", width: "32px",
    render: (item) => <span className="text-[11px] text-text-tertiary">{item.rank}</span>,
  },
  {
    key: "sectorName", label: "板块",
    render: (item) => (
      <span className="font-medium text-sm truncate max-w-[110px] inline-block" title={item.sectorName}>{item.sectorName}</span>
    ),
  },
  { key: "pctChange1d", label: "涨跌幅", align: "right", width: "68px", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
  {
    key: "limitUpCount", label: "涨/跌", align: "right", width: "52px",
    render: (item) => (
      <span className="text-[11px]">
        <span className="text-state-up">{item.limitUpCount}</span>
        <span className="text-text-quaternary">/</span>
        <span className="text-state-down">{(item.amount || 0) - item.limitUpCount}</span>
      </span>
    ),
  },
];

const stockColumns: Column<SectorStock>[] = [
  {
    key: "stockName", label: "名称",
    render: (item) => (
      <div className="leading-tight">
        <span className="text-sm font-medium">{item.stockName}</span>
        <span className="block text-[10px] text-text-tertiary font-mono">{item.tsCode.replace(/\.\w+$/, "")}</span>
      </div>
    ),
  },
  { key: "close", label: "现价", align: "right", width: "64px", render: (item) => <span className="text-sm font-mono">{item.close || "-"}</span> },
  { key: "pctChange1d", label: "涨跌幅", align: "right", width: "64px", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
];

export default function IntradayPage() {
  const { data: rankings = [], isLoading } = useIntradaySectors();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useIntradayStore();
  const { data: stocks = [] } = useIntradaySectorStocks(selectedSectorCode);
  const { data: watchlistItems = [] } = useWatchlist();
  const stealthMode = useAppStore((s) => s.stealthMode);
  const toggleStealth = useAppStore((s) => s.toggleStealthMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const col1 = useResizablePct(0.30, 0.18, 0.42, containerRef);
  const col2 = useResizablePct(0.28, 0.15, 0.40, containerRef);

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

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border-default flex items-center gap-2">
        <h1 className="text-sm font-semibold">盘中观察</h1>
        <span className="text-xs text-text-tertiary">同花顺概念板块 · 按涨跌幅排序 · 自动刷新</span>
        {isLoading && <span className="text-xs text-accent animate-pulse">加载中...</span>}
      </div>

      <div ref={containerRef} className="flex-1 flex min-h-0 border-t border-border-default overflow-hidden">
        {/* Column 1: 概念板块排行 */}
        <div
          className="flex flex-col min-h-0 border-r border-border-default overflow-hidden"
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col1.pct * 100}%`, minWidth: 220 }}
        >
          <div className="px-3 py-2 border-b border-border-default shrink-0">
            <h2 className="text-sm font-medium">概念板块</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个板块</p>
          </div>
          <DataTable
            columns={sectorColumns}
            data={rankings}
            rowKey={(item) => item.sectorCode}
            selectedKey={selectedSectorCode}
            onRowClick={(item) => setSelectedSectorCode(item.sectorCode)}
            compact
            className="flex-1"
          />
        </div>

        {!stealthMode && <Resizer onMouseDown={col1.onMouseDown} />}

        {/* Column 2: 板块个股（实时） */}
        <div
          className={`flex flex-col min-h-0 overflow-hidden ${stealthMode ? "" : "border-r border-border-default"}`}
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col2.pct * 100}%`, minWidth: 200 }}
        >
          <div className="px-3 py-2 border-b border-border-default shrink-0">
            <h2 className="text-sm font-medium">板块个股</h2>
            <p className="text-xs text-text-tertiary">
              {selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只` : "选择板块后加载"}
            </p>
          </div>
          <DataTable
            columns={stockColumns}
            data={stocks}
            rowKey={(item) => item.tsCode}
            selectedKey={selectedStockCode}
            onRowClick={(item) => setSelectedStockCode(item.tsCode)}
            compact
            className="flex-1"
          />
        </div>

        {!stealthMode && <Resizer onMouseDown={col2.onMouseDown} />}

        {/* Column 3: K线图 — 摸鱼模式下折叠 */}
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
            <button
              onClick={toggleStealth}
              className="absolute top-2 right-2 z-30 w-6 h-6 rounded flex items-center justify-center bg-surface-subtle/80 hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
              title="折叠图表 (摸鱼模式)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <ChartShell
              title="个股 K 线"
              subtitle={selectedStock ? `${selectedStock.stockName} · ${selectedSector?.sectorName || ""}` : ""}
              empty={!selectedStock?.tsCode ? "选择个股后显示" : undefined}
              className="h-full"
            >
              {selectedStock?.tsCode ? (
                <WatchlistChart
                  key={selectedStock.tsCode}
                  tsCode={selectedStock.tsCode}
                  sectorCode={selectedSector?.sectorCode || ""}
                  stockName={selectedStock.stockName}
                />
              ) : (
                <div />
              )}
            </ChartShell>
          </div>
        )}
      </div>
    </div>
  );
}
