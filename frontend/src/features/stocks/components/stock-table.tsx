import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorStock } from "@/shared/types";

interface StockTableProps {
  data: SectorStock[];
  selectedCode: string;
  onSelect: (code: string) => void;
  loading?: boolean;
}

export function StockTable({ data, selectedCode, onSelect, loading }: StockTableProps) {
  const columns: Column<SectorStock>[] = [
    { key: "tsCode", label: "代码", width: "80px", render: (item) => <span className="font-mono text-sm text-text-secondary">{item.tsCode}</span> },
    { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
    { key: "close", label: "现价", width: "64px", align: "right", render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
    { key: "pctChange1d", label: "1日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
    { key: "pctChange5d", label: "5日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "rps20", label: "RPS20", width: "56px", align: "right", render: (item) => <span className="text-sm font-mono">{item.rps20 ?? "-"}</span> },
    { key: "amount", label: "成交额", width: "72px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  if (loading) return <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">成分股加载中...</div>;

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.tsCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.tsCode)}
      compact
      emptyText="选择板块后加载"
      className="max-h-[calc(100vh-180px)]"
    />
  );
}
