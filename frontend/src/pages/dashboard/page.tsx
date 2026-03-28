import { useEffect, useState, useRef, useCallback } from "react";
import { useMarketOverview, useSectorRankings, useSectorStocks } from "@/queries";
import { useDashboardStore } from "@/store";
import { MarketSummary } from "@/features/market/components/market-summary";
import { RiskGauge } from "@/features/market/components/risk-gauge";
import { SectorTable } from "@/features/sectors/components/sector-table";
import { StockTable } from "@/features/stocks/components/stock-table";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import { RsPanel } from "@/features/chart/components/rs-panel";

function useResizable(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      setWidth(Math.min(max, Math.max(min, startW + ev.clientX - startX)));
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width, min, max]);

  return { width, onMouseDown };
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

export default function DashboardPage() {
  const { data: overview } = useMarketOverview();
  const { data: rankings = [] } = useSectorRankings();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useDashboardStore();
  const { data: stocks = [], isLoading: stocksLoading } = useSectorStocks(selectedSectorCode);

  const col1 = useResizable(340, 260, 520);
  const col2 = useResizable(380, 280, 560);

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
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-default">
        <div>
          <h1 className="text-xl font-semibold">板块强度终端</h1>
          <p className="text-xs text-text-secondary mt-0.5">板块结构、个股联动和图表确认放在同一工作台里。</p>
        </div>
        <div className="flex items-stretch">
          <MarketSummary overview={overview} />
          <RiskGauge risk={overview?.marketRisk} />
        </div>
      </div>

      {/* Main 3-column with resizable dividers */}
      <div className="flex-1 flex min-h-0 border-t border-border-default">
        {/* Column 1: Sector rankings */}
        <div className="flex flex-col min-h-0 shrink-0 border-r border-border-default" style={{ width: col1.width }}>
          <div className="px-3 py-2 border-b border-border-default">
            <h2 className="text-sm font-medium">板块列表</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个候选板块</p>
          </div>
          <SectorTable data={rankings} selectedCode={selectedSectorCode} onSelect={setSelectedSectorCode} />
        </div>

        <Resizer onMouseDown={col1.onMouseDown} />

        {/* Column 2: Sector stocks */}
        <div className="flex flex-col min-h-0 shrink-0 border-r border-border-default" style={{ width: col2.width }}>
          <div className="px-3 py-2 border-b border-border-default">
            <h2 className="text-sm font-medium">板块内个股</h2>
            <p className="text-xs text-text-tertiary">
              {selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只` : "选择板块后加载"}
            </p>
          </div>
          <StockTable data={stocks} selectedCode={selectedStockCode} onSelect={setSelectedStockCode} loading={stocksLoading} />
        </div>

        <Resizer onMouseDown={col2.onMouseDown} />

        {/* Column 3: Charts (takes remaining space) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-[380px] overflow-y-auto">
          <CandlestickPanel kind="sector" code={selectedSector?.sectorCode || ""} label={selectedSector?.sectorName || ""} title="细分板块 K 线" emptyText="选择板块后显示" />
          <CandlestickPanel kind="stock" code={selectedStock?.tsCode || ""} label={selectedStock?.stockName || ""} title="选中个股 K 线" emptyText="选择个股后显示" />
          <RsPanel tsCode={selectedStock?.tsCode || ""} sectorCode={selectedSector?.sectorCode || ""} stockName={selectedStock?.stockName} sectorName={selectedSector?.sectorName} />
        </div>
      </div>
    </div>
  );
}
