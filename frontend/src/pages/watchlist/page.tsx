import { useState, useRef } from "react";
import { useWatchlist, useUpdateWatchlist, useRemoveFromWatchlist } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { WatchlistItem } from "@/shared/types";
import { cn } from "@/lib/utils";

export default function WatchlistPage() {
  const { data: items = [] } = useWatchlist();
  const updateMutation = useUpdateWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const [selectedCode, setSelectedCode] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [editingSubgroup, setEditingSubgroup] = useState(false);
  const [subgroupValue, setSubgroupValue] = useState("");
  const dragging = useRef(false);

  const selected = items.find((i) => i.tsCode === selectedCode) || items[0];

  // Auto-select first if nothing selected
  if (!selectedCode && items.length > 0 && items[0]) {
    setTimeout(() => setSelectedCode(items[0].tsCode), 0);
  }

  const columns: Column<WatchlistItem>[] = [
    {
      key: "tsCode",
      label: "代码",
      width: "72px",
      render: (item) => (
        <span className="font-mono text-xs text-text-secondary">{item.tsCode}</span>
      ),
    },
    {
      key: "stockName",
      label: "名称",
      render: (item) => <span className="text-sm">{item.stockName}</span>,
    },
    {
      key: "rps20",
      label: "RPS20",
      width: "56px",
      align: "right",
      render: (item) => (
        <span className="text-sm font-mono">{item.rps20 ?? "-"}</span>
      ),
    },
    {
      key: "pctChange5d",
      label: "5日",
      width: "60px",
      align: "right",
      render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} />,
    },
  ];

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const w = Math.min(520, Math.max(280, startW + ev.clientX - startX));
      setSidebarWidth(w);
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function handleSaveSubgroup() {
    if (!selected) return;
    await updateMutation.mutateAsync({
      tsCode: selected.tsCode,
      data: { subgroup: subgroupValue },
    });
    setEditingSubgroup(false);
  }

  async function handleRemove() {
    if (!selected) return;
    await removeMutation.mutateAsync(selected.tsCode);
    setSelectedCode("");
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className="flex flex-col min-h-0 border-r border-border-default"
        style={{ width: sidebarWidth }}
      >
        <div className="px-3 py-2 border-b border-border-default">
          <h2 className="text-sm font-medium">自选股</h2>
          <p className="text-xs text-text-tertiary">{items.length} 只</p>
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

      {/* Resize handle */}
      <div
        className="w-[10px] cursor-col-resize relative shrink-0 group"
        onMouseDown={startResize}
      >
        <div className="absolute top-0 bottom-0 left-[4px] w-[2px] group-hover:bg-border-strong transition-colors" />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border-default">
              <div>
                <h2 className="text-lg font-semibold">{selected.stockName}</h2>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {selected.tsCode} · {selected.sectorName}
                </p>
              </div>
              <div className="flex items-stretch border border-border-default">
                {[
                  { label: "RPS20", value: selected.rps20 },
                  { label: "5日", value: selected.pctChange5d, pct: true },
                  { label: "10日", value: selected.pctChange10d, pct: true },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="px-3 py-2 border-r border-border-default last:border-r-0 min-w-[80px]"
                  >
                    <span className="block text-xs text-text-tertiary mb-1">
                      {m.label}
                    </span>
                    <strong
                      className={cn(
                        "text-sm font-semibold font-mono",
                        m.pct &&
                          m.value != null &&
                          (m.value >= 0 ? "text-state-up" : "text-state-down")
                      )}
                    >
                      {m.pct ? fmtPct(m.value) : (m.value ?? "-")}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default bg-surface text-sm">
              <span className="text-text-tertiary text-xs">分组</span>
              {editingSubgroup ? (
                <>
                  <Input
                    className="h-7 w-40 text-xs"
                    value={subgroupValue}
                    onChange={(e) => setSubgroupValue(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleSaveSubgroup}
                  >
                    保存
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setEditingSubgroup(false)}
                  >
                    取消
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setSubgroupValue(selected.subgroup || "");
                    setEditingSubgroup(true);
                  }}
                >
                  {selected.subgroup || "未分组"} ✎
                </Button>
              )}
              <div className="ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-state-up hover:bg-state-up/10"
                  onClick={handleRemove}
                >
                  移出自选
                </Button>
              </div>
            </div>

            {/* Chart */}
            <div className="flex-1 min-h-0 overflow-auto">
              <WatchlistChart
                tsCode={selected.tsCode}
                sectorCode={selected.sectorCode}
                stockName={selected.stockName}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">
            暂无自选股
          </div>
        )}
      </div>
    </div>
  );
}
