import { useState, useRef } from "react";
import { useBullCamp } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { CampTag } from "@/features/bullcamp/components/camp-tag";
import { FinancialsPanel } from "@/features/bullcamp/components/financials-panel";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import type { BullCampItem } from "@/shared/types";
import { cn } from "@/lib/utils";

function compareValues(a: any, b: any, key: string, dir: "asc" | "desc"): number {
  let va = a[key], vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  return dir === "asc" ? va - vb : vb - va;
}

export default function BullcampPage() {
  const { data: items = [], isLoading, error } = useBullCamp();
  const [selectedCode, setSelectedCode] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(520);
  const dragging = useRef(false);

  const selected = items.find((i) => i.tsCode === selectedCode) || items[0];

  if (!selectedCode && items.length > 0) {
    setTimeout(() => setSelectedCode(items[0].tsCode), 0);
  }

  const columns: Column<BullCampItem>[] = [
    {
      key: "stockName", label: "名称", sortable: true,
      render: (item) => (
        <span className="text-sm">
          {item.stockName}
          <CampTag isNew={item.isNew} daysInCamp={item.daysInCamp} hasAnnouncement={item.hasRecentAnnouncement} />
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
  ];

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      setSidebarWidth(Math.min(760, Math.max(420, startW + ev.clientX - startX)));
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  if (isLoading) return <div className="flex items-center justify-center h-full text-text-tertiary">牛股集中营加载中...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-state-up">{error.message}</div>;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="flex flex-col min-h-0 border-r border-border-default" style={{ width: sidebarWidth }}>
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

      {/* Resize handle */}
      <div className="w-[10px] cursor-col-resize relative shrink-0 group" onMouseDown={startResize}>
        <div className="absolute top-0 bottom-0 left-[4px] w-[2px] group-hover:bg-border-strong transition-colors" />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            <div className="flex items-start justify-between px-4 py-3 border-b border-border-default">
              <div>
                <h2 className="text-lg font-semibold">{selected.stockName}</h2>
                <p className="text-xs text-text-tertiary mt-0.5">{selected.tsCode} · {selected.sectorName}</p>
              </div>
              <div className="flex items-stretch border border-border-default">
                {[
                  { label: "RPS20", value: selected.rps20 },
                  { label: "相对强弱", value: selected.relativeStrengthLatest?.toFixed(1) },
                  { label: "综合分", value: selected.campScore?.toFixed(0) },
                ].map((m) => (
                  <div key={m.label} className="px-3 py-2 border-r border-border-default last:border-r-0 min-w-[80px]">
                    <span className="block text-xs text-text-tertiary mb-1">{m.label}</span>
                    <strong className="text-sm font-semibold font-mono">{m.value ?? "-"}</strong>
                  </div>
                ))}
              </div>
            </div>

            <Tabs defaultValue="chart" className="flex-1 flex flex-col min-h-0">
              <TabsList className="px-4 border-b border-border-default bg-surface rounded-none h-auto justify-start gap-0">
                <TabsTrigger value="chart" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">图表</TabsTrigger>
                <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">财务</TabsTrigger>
                <TabsTrigger value="news" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">新闻</TabsTrigger>
              </TabsList>
              <TabsContent value="chart" className="flex-1 min-h-0 overflow-auto mt-0">
                <WatchlistChart tsCode={selected.tsCode} sectorCode={selected.sectorCode} stockName={selected.stockName} />
              </TabsContent>
              <TabsContent value="financials" className="flex-1 min-h-0 overflow-auto mt-0">
                <FinancialsPanel tsCode={selected.tsCode} />
              </TabsContent>
              <TabsContent value="news" className="flex-1 mt-0">
                <div className="flex items-center justify-center h-full text-text-tertiary">
                  <div className="text-center">
                    <h3 className="text-sm font-medium text-text-primary mb-2">新闻与公告</h3>
                    <p className="text-xs">此功能即将上线，敬请期待。</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">暂无数据</div>
        )}
      </div>
    </div>
  );
}
