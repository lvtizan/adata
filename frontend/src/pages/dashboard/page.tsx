import { useEffect, useRef, useCallback, useState } from "react";
import { useMarketOverview, useSectorRankings, useSectorStocks, useWatchlist } from "@/queries";
import { useDashboardStore } from "@/store";
import { MarketSummary } from "@/features/market/components/market-summary";
import { RiskGauge } from "@/features/market/components/risk-gauge";
import { SectorTable } from "@/features/sectors/components/sector-table";
import { StockTable } from "@/features/stocks/components/stock-table";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { ChartShell } from "@/shared/charts";
import { useNavigate } from "react-router-dom";

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
      className="w-[10px] cursor-col-resize relative shrink-0 group"
      onMouseDown={onMouseDown}
    >
      <div className="absolute top-0 bottom-0 left-[4px] w-[2px] group-hover:bg-border-strong transition-colors" />
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

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="px-3 py-2 border-b border-border-default">
        <div className="flex items-stretch min-w-0 w-full">
          <MarketSummary overview={overview} />
          <RiskGauge risk={overview?.marketRisk} />
        </div>
      </div>

      {/* Main layout: 3-column */}
      <div ref={containerRef} className="flex-1 flex min-h-0 border-t border-border-default overflow-hidden">
        {/* Column 1: Sector rankings */}
        <div
          className="flex flex-col min-h-0 border-r border-border-default overflow-hidden"
          style={{ flex: `0 1 ${col1.pct * 100}%`, minWidth: 220 }}
        >
          <div className="px-3 py-2 border-b border-border-default shrink-0">
            <h2 className="text-sm font-medium">板块列表</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个候选板块</p>
          </div>
          <SectorTable data={rankings} selectedCode={selectedSectorCode} onSelect={setSelectedSectorCode} />
        </div>

        <Resizer onMouseDown={col1.onMouseDown} />

        {/* Column 2: Sector stocks */}
        <div
          className="flex flex-col min-h-0 border-r border-border-default overflow-hidden"
          style={{ flex: `0 1 ${col2.pct * 100}%`, minWidth: 220 }}
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
            onSelect={(code) => {
              setSelectedStockCode(code);
              const sector = selectedSector;
              navigate(`/sector-workbench?sectorCode=${encodeURIComponent(sector?.sectorCode || "")}&sectorName=${encodeURIComponent(sector?.sectorName || "")}&stockCode=${encodeURIComponent(code)}`);
            }}
            loading={stocksLoading}
            watchlistCodes={watchlistCodes}
            sectorCode={selectedSector?.sectorCode}
            sectorName={selectedSector?.sectorName}
          />
        </div>

        <Resizer onMouseDown={col2.onMouseDown} />

        {/* Column 3: Charts (takes remaining space) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-[260px]">
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
        </div>
      </div>
    </div>
  );
}
