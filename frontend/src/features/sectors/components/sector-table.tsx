import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorRanking } from "@/shared/types";
import { cn } from "@/lib/utils";

interface SectorTableProps {
  data: SectorRanking[];
  selectedCode: string;
  onSelect: (code: string) => void;
}

export function SectorTable({ data, selectedCode, onSelect }: SectorTableProps) {
  const columns: Column<SectorRanking>[] = [
    {
      key: "rank", label: "#", width: "48px",
      render: (item) => (
        <span className="text-sm">
          {item.rank}
          {item.rankChange != null && item.rankChange !== 0 && (
            <span className={cn("ml-1 text-xs font-semibold", item.rankChange > 0 ? "text-state-up" : "text-state-down")}>
              {item.rankChange > 0 ? `↑${item.rankChange}` : `↓${Math.abs(item.rankChange)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "sectorName", label: "板块",
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{item.sectorName}</span>
          <span className="text-xs text-text-tertiary font-mono">{item.sectorCode}</span>
        </div>
      ),
    },
    { key: "limitUpCount", label: "涨停", width: "48px", align: "right", render: (item) => <span className="text-sm">{item.limitUpCount ?? 0}</span> },
    { key: "rps10", label: "RPS10", width: "56px", align: "right", render: (item) => <span className="text-sm font-mono">{item.rps10 ?? "-"}</span> },
    { key: "pctChange5d", label: "5日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "pctChange10d", label: "10日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange10d} format={fmtPct} /> },
    { key: "amount", label: "成交额", width: "72px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.sectorCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.sectorCode)}
      compact
      className="max-h-[calc(100vh-180px)]"
    />
  );
}
