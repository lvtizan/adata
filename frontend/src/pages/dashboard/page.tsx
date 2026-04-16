import { useRef, useState } from "react";
import { useMarketOverview } from "@/queries";
import { useDashboardStore, useAppStore } from "@/store";
import { MarketSummary } from "@/features/market/components/market-summary";
import { SectorListPanel } from "@/features/sectors/components/sector-list-panel";
import { MySectorsDialog } from "@/features/sectors/components/my-sectors-dialog";
import { SectorMembersPanel } from "@/features/stocks/components/sector-members-panel";
import { DashboardChartColumn } from "@/features/chart/components/dashboard-chart-column";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Resizer, useResizablePct } from "@/shared/layout";

// 初始比例: 板块 33%, 个股 30%, 图表 37% (余量)
const COL1_PCT = 0.33;
const COL2_PCT = 0.30;

export default function DashboardPage() {
  const [myDialogOpen, setMyDialogOpen] = useState(false);
  const { data: overview } = useMarketOverview();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useDashboardStore();
  const stealthMode = useAppStore((s) => s.stealthMode);
  const toggleStealth = useAppStore((s) => s.toggleStealthMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const col1 = useResizablePct(COL1_PCT, 0.18, 0.45, containerRef);
  const col2 = useResizablePct(COL2_PCT, 0.18, 0.42, containerRef);

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar — 单行紧凑 */}
      <div className="px-3 py-1.5 border-b border-border-default overflow-x-auto">
        <MarketSummary overview={overview} />
      </div>

      {/* Main layout: 3-column */}
      <div ref={containerRef} className="flex-1 flex min-h-0 border-t border-border-default overflow-hidden">
        {/* Column 1: Sector list panel */}
        <div
          className="flex flex-col min-h-0 border-r border-border-default overflow-hidden"
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col1.pct * 100}%`, minWidth: 220 }}
        >
          <SectorListPanel
            selectedCode={selectedSectorCode}
            onSelect={(code) => setSelectedSectorCode(code)}
            onManageClick={() => setMyDialogOpen(true)}
          />
        </div>

        {!stealthMode && <Resizer onMouseDown={col1.onMouseDown} />}

        {/* Column 2: Sector members with filter */}
        <div
          className={`flex flex-col min-h-0 overflow-hidden ${stealthMode ? "" : "border-r border-border-default"}`}
          style={stealthMode ? { flex: "1 1 50%" } : { flex: `0 1 ${col2.pct * 100}%`, minWidth: 220 }}
        >
          <SectorMembersPanel
            sectorCode={selectedSectorCode}
            selectedStockCode={selectedStockCode}
            onSelectStock={(code) => setSelectedStockCode(code)}
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
            <DashboardChartColumn
              sectorCode={selectedSectorCode || undefined}
              stockCode={selectedStockCode || undefined}
            />
          </div>
        )}
      </div>
      <MySectorsDialog open={myDialogOpen} onClose={() => setMyDialogOpen(false)} />
    </div>
  );
}
