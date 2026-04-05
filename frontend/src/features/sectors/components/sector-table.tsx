import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorRanking } from "@/shared/types";
import { cn } from "@/lib/utils";

interface SectorTableProps {
  data: SectorRanking[];
  selectedCode: string;
  onSelect: (code: string) => void;
}

function numSort(a: number | null | undefined, b: number | null | undefined, dir: "asc" | "desc") {
  const va = a ?? -Infinity;
  const vb = b ?? -Infinity;
  return dir === "asc" ? va - vb : vb - va;
}

function sectorSortFn(a: SectorRanking, b: SectorRanking, key: string, dir: "asc" | "desc") {
  switch (key) {
    case "rank": return numSort(a.rank, b.rank, dir);
    case "limitUpCount": return numSort(a.limitUpCount, b.limitUpCount, dir);
    case "rps10": return numSort(a.rps10, b.rps10, dir);
    case "pctChange1d": return numSort(a.pctChange1d, b.pctChange1d, dir);
    case "pctChange5d": return numSort(a.pctChange5d, b.pctChange5d, dir);
    case "pctChange10d": return numSort(a.pctChange10d, b.pctChange10d, dir);
    case "amount": return numSort(a.amount, b.amount, dir);
    default: return 0;
  }
}

export function SectorTable({ data, selectedCode, onSelect }: SectorTableProps) {
  const columns: Column<SectorRanking>[] = [
    {
      key: "rank", label: "#", width: "36px", sortable: true,
      render: (item) => (
        <span className="text-sm">
          {item.rank}
          {item.rankChange != null && item.rankChange !== 0 && (
            <span className={cn("ml-0.5 text-xs font-semibold", item.rankChange > 0 ? "text-state-up" : "text-state-down")}>
              {item.rankChange > 0 ? `↑${item.rankChange}` : `↓${Math.abs(item.rankChange)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "sectorName", label: "板块",
      render: (item) => (
        <span className="font-medium text-sm truncate max-w-[120px] inline-block" title={item.sectorName}>{item.sectorName}</span>
      ),
    },
    { key: "limitUpCount", label: "涨停", align: "right", sortable: true, render: (item) => <span className="text-sm">{item.limitUpCount ?? 0}</span> },
    { key: "rps10", label: "RPS", align: "right", sortable: true, render: (item) => <span className="text-sm font-mono">{item.rps10 ?? "-"}</span> },
    { key: "pctChange1d", label: "今日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
    { key: "pctChange5d", label: "5日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "pctChange10d", label: "10日", align: "right", sortable: true, render: (item) => <NumericCell value={item.pctChange10d} format={fmtPct} /> },
    { key: "amount", label: "成交额", align: "right", sortable: true, render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.sectorCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.sectorCode)}
      sortFn={sectorSortFn}
      compact
          />
  );
}
