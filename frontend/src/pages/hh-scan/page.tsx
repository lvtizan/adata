import { useState, useRef, useMemo } from "react";
import { useHHScan } from "@/queries";
import { useAppStore } from "@/store";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import type { HHScanStock, HHScanSector } from "@/services/hh-scan.service";
import { cn } from "@/lib/utils";

function compareValues(a: any, b: any, key: string, dir: "asc" | "desc"): number {
  let va = a[key], vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  return dir === "asc" ? va - vb : vb - va;
}

function getSignalTypeColor(signalType: string): string {
  if (signalType === "H3" || signalType?.includes("H3+")) return "text-state-down";
  if (signalType === "H2") return "text-accent-warning";
  return "text-text-secondary";
}

function getSignalTypeBg(signalType: string): string {
  if (signalType === "H3" || signalType?.includes("H3+")) return "bg-state-down/10";
  if (signalType === "H2") return "bg-accent-warning/10";
  return "bg-surface";
}

export default function HHScanPage() {
  const { data: scanData, isLoading, error } = useHHScan();
  const { stealthMode } = useAppStore();
  const [selectedSectorCode, setSelectedSectorCode] = useState<string>("");
  const [selectedStockCode, setSelectedStockCode] = useState<string>("");

  // Left panel width state
  const [leftWidth, setLeftWidth] = useState(280);
  const draggingLeft = useRef(false);

  // Bottom panel height state
  const [bottomHeight, setBottomHeight] = useState(300);
  const draggingBottom = useRef(false);

  // Sort sectors by signalCount descending
  const sortedSectors = useMemo(() => {
    if (!scanData?.sectors) return [];
    return [...scanData.sectors].sort((a, b) => b.signalCount - a.signalCount);
  }, [scanData?.sectors]);

  // Select first sector by default
  const activeSector = useMemo(() => {
    const code = selectedSectorCode || sortedSectors[0]?.sectorCode;
    return sortedSectors.find((s) => s.sectorCode === code);
  }, [selectedSectorCode, sortedSectors]);

  // Get stocks for active sector
  const sectorStocks = useMemo(() => {
    return activeSector?.stocks || [];
  }, [activeSector]);

  // Select first stock by default
  const selectedStock = useMemo(() => {
    const code = selectedStockCode || sectorStocks[0]?.tsCode;
    return sectorStocks.find((s) => s.tsCode === code);
  }, [selectedStockCode, sectorStocks]);

  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    draggingLeft.current = true;
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(ev: MouseEvent) {
      if (!draggingLeft.current) return;
      setLeftWidth(Math.min(400, Math.max(220, startW + ev.clientX - startX)));
    }
    function onUp() {
      draggingLeft.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startResizeBottom(e: React.MouseEvent) {
    e.preventDefault();
    draggingBottom.current = true;
    const startY = e.clientY;
    const startH = bottomHeight;
    function onMove(ev: MouseEvent) {
      if (!draggingBottom.current) return;
      setBottomHeight(Math.min(500, Math.max(200, startH - (ev.clientY - startY))));
    }
    function onUp() {
      draggingBottom.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Sector list columns
  const sectorColumns: Column<HHScanSector>[] = [
    {
      key: "sectorName",
      label: "板块",
      sortable: true,
      render: (item) => <span className="text-sm font-medium">{item.sectorName}</span>,
    },
    {
      key: "signalCount",
      label: "信号数",
      width: "60px",
      align: "right",
      sortable: true,
      render: (item) => (
        <span className="text-sm font-mono font-semibold text-accent">{item.signalCount}</span>
      ),
    },
    {
      key: "signalCount",
      label: "占比",
      width: "56px",
      align: "right",
      sortable: false,
      render: (item) => {
        const pct = scanData?.totalSignals ? ((item.signalCount / scanData.totalSignals) * 100).toFixed(0) : 0;
        return <span className="text-xs text-text-secondary">{pct}%</span>;
      },
    },
  ];

  // Stock table columns
  const stockColumns: Column<HHScanStock>[] = [
    {
      key: "stockName",
      label: "股票",
      sortable: true,
      render: (item) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{item.stockName}</div>
          <div className="text-[10px] text-text-tertiary font-mono">{item.tsCode}</div>
        </div>
      ),
    },
    {
      key: "signalType",
      label: "信号类型",
      width: "64px",
      align: "center",
      sortable: true,
      render: (item) => (
        <span
          className={cn(
            "inline-block px-2 py-1 rounded text-xs font-semibold",
            getSignalTypeBg(item.signalType),
            getSignalTypeColor(item.signalType)
          )}
        >
          {item.signalType}
        </span>
      ),
    },
    {
      key: "signalDate",
      label: "日期",
      width: "72px",
      align: "center",
      sortable: true,
      render: (item) => <span className="text-xs text-text-secondary">{item.signalDate}</span>,
    },
    {
      key: "close",
      label: "现价",
      width: "60px",
      align: "right",
      sortable: true,
      render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span>,
    },
    {
      key: "pctChange1d",
      label: "1日",
      width: "56px",
      align: "right",
      sortable: true,
      render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} />,
    },
    {
      key: "pctChange5d",
      label: "5日",
      width: "56px",
      align: "right",
      sortable: true,
      render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} />,
    },
    {
      key: "rps20",
      label: "RPS20",
      width: "56px",
      align: "right",
      sortable: true,
      render: (item) => <span className="text-sm font-mono text-text-secondary">{item.rps20 ?? "-"}</span>,
    },
    {
      key: "amount",
      label: "成交额",
      width: "68px",
      align: "right",
      sortable: true,
      render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span>,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        HH 筛选加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-state-up">
        {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">HH 信号筛选</h1>
            <p className="text-xs text-text-secondary mt-1">
              共 <span className="font-mono font-semibold text-accent">{scanData?.totalSignals ?? 0}</span> 个信号 · 覆盖{" "}
              <span className="font-mono font-semibold">{sortedSectors.length}</span> 个板块
              {scanData?.tradeDate && (
                <>
                  {" "}
                  · <span className="text-text-tertiary">{scanData.tradeDate}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Main content: dual-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Sector list */}
        <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: leftWidth }}>
          <div className="px-3 py-2 border-b border-border-default bg-surface">
            <h2 className="text-sm font-medium text-text-primary">{sortedSectors.length} 个板块</h2>
          </div>
          <DataTable
            columns={sectorColumns}
            data={sortedSectors}
            rowKey={(s) => s.sectorCode}
            selectedKey={activeSector?.sectorCode}
            onRowClick={(s) => {
              setSelectedSectorCode(s.sectorCode);
              setSelectedStockCode("");
            }}
            sortFn={compareValues}
            defaultSort={{ key: "signalCount", dir: "desc" }}
            compact
            className="flex-1"
          />
        </div>

        {/* Resize handle */}
        <div
          className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center"
          onMouseDown={startResizeLeft}
        >
          <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
        </div>

        {/* Right: Stock table + chart */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {activeSector ? (
            <>
              {/* Stock table header */}
              <div className="px-4 py-2 border-b border-border-default bg-surface">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">{activeSector.sectorName}</h2>
                    <p className="text-xs text-text-tertiary">
                      {sectorStocks.length} 只股票
                    </p>
                  </div>
                </div>
              </div>

              {/* Stock table */}
              <div style={{ height: stealthMode ? "100%" : `calc(100% - ${bottomHeight}px)` }} className="min-h-0 overflow-auto">
                <DataTable
                  columns={stockColumns}
                  data={sectorStocks}
                  rowKey={(s) => s.tsCode}
                  selectedKey={selectedStock?.tsCode}
                  onRowClick={(s) => setSelectedStockCode(s.tsCode)}
                  sortFn={compareValues}
                  defaultSort={{ key: "signalDate", dir: "desc" }}
                  compact
                />
              </div>

              {/* Bottom chart section (hidden in stealth mode) */}
              {!stealthMode && (
                <>
                  {/* Resize handle */}
                  <div
                    className="h-[6px] cursor-row-resize relative shrink-0 group bg-surface border-t border-border-default"
                    onMouseDown={startResizeBottom}
                  >
                    <div className="absolute left-0 right-0 top-[2px] h-[2px] group-hover:bg-border-strong transition-colors" />
                  </div>

                  {/* K-line chart */}
                  <div style={{ height: bottomHeight }} className="min-h-0 overflow-hidden bg-canvas">
                    {selectedStock ? (
                      <CandlestickPanel
                        kind="stock"
                        code={selectedStock.tsCode}
                        label={selectedStock.stockName}
                        title="K线图"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-text-tertiary">
                        选择个股查看K线
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              暂无数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
