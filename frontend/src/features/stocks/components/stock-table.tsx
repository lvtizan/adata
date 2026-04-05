import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorStock } from "@/shared/types";
import { useAddToWatchlist, useRemoveFromWatchlist } from "@/queries";
import { Star } from "lucide-react";

interface StockTableProps {
  data: SectorStock[];
  selectedCode: string;
  onSelect: (code: string) => void;
  /** 点击股票名称时触发（用于跳转板块工作台），不传则只选中 */
  onNameClick?: (item: SectorStock) => void;
  loading?: boolean;
  watchlistCodes?: Set<string>;
  sectorCode?: string;
  sectorName?: string;
}

function numSort(a: number | null | undefined, b: number | null | undefined, dir: "asc" | "desc") {
  const va = a ?? -Infinity;
  const vb = b ?? -Infinity;
  return dir === "asc" ? va - vb : vb - va;
}

function stockSortFn(a: SectorStock, b: SectorStock, key: string, dir: "asc" | "desc") {
  switch (key) {
    case "close": return numSort(a.close, b.close, dir);
    case "pctChange1d": return numSort(a.pctChange1d, b.pctChange1d, dir);
    case "pctChange5d": return numSort(a.pctChange5d, b.pctChange5d, dir);
    case "pctChange10d": return numSort(a.pctChange10d, b.pctChange10d, dir);
    case "rps20": return numSort(a.rps20, b.rps20, dir);
    case "amount": return numSort(a.amount, b.amount, dir);
    default: return 0;
  }
}

export function StockTable({ data, selectedCode, onSelect, onNameClick, loading, watchlistCodes = new Set(), sectorCode, sectorName }: StockTableProps) {
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const toggleWatchlist = (e: React.MouseEvent, item: SectorStock) => {
    e.stopPropagation();
    if (watchlistCodes.has(item.tsCode)) {
      removeMutation.mutate(item.tsCode);
    } else {
      addMutation.mutate({
        tsCode: item.tsCode,
        stockName: item.stockName,
        sectorCode: sectorCode || "",
        sectorName: sectorName || "",
        close: item.close,
        pctChange1d: item.pctChange1d,
        pctChange5d: item.pctChange5d,
        pctChange10d: item.pctChange10d,
        rps20: item.rps20,
        amount: item.amount,
      });
    }
  };

  const columns: Column<SectorStock>[] = [
    {
      key: "stockName",
      label: "名称",
      render: (item) => (
        <span className="flex items-center gap-1 text-sm">
          <span
            className={`flex flex-col leading-tight ${onNameClick ? "cursor-pointer hover:text-accent" : ""}`}
            onClick={onNameClick ? (e) => { e.stopPropagation(); onNameClick(item); } : undefined}
          >
            <span>{item.stockName}</span>
            <span className="text-xs text-text-quaternary">{item.tsCode.replace(/\.\w+$/, '')}</span>
          </span>
          <button
            className="shrink-0 p-1 rounded hover:bg-accent-soft transition-colors cursor-pointer"
            onClick={(e) => toggleWatchlist(e, item)}
            title={watchlistCodes.has(item.tsCode) ? "取消自选" : "加自选"}
          >
            <Star
              size={15}
              className={watchlistCodes.has(item.tsCode) ? "fill-amber-400 text-amber-400" : "text-text-quaternary hover:text-amber-300"}
            />
          </button>
        </span>
      ),
    },
    { key: "close", label: "现价", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
    { key: "pctChange1d", label: "1日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
    { key: "pctChange5d", label: "5日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "pctChange10d", label: "10日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange10d} format={fmtPct} /> },
    { key: "amount", label: "成交额", align: "right", sortable: true, render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  if (loading) return <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">成分股加载中...</div>;

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.tsCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.tsCode)}
      sortFn={stockSortFn}
      compact
      emptyText="选择板块后加载"
          />
  );
}
