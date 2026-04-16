import { useMemo } from "react";
import { useThsSectorMembers } from "@/queries";
import { useDashboardStore } from "@/store";
import { DataTable, type Column } from "@/shared/table";
import { EmptyState } from "@/shared/ui/empty-state";
import { StockFilterBar } from "./stock-filter-bar";
import { Inbox, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThsSectorMember } from "@/services/ths.service";

interface SectorMembersPanelProps {
  sectorCode?: string;
  selectedStockCode?: string;
  onSelectStock: (code: string, name: string) => void;
}

export function SectorMembersPanel({ sectorCode, selectedStockCode, onSelectStock }: SectorMembersPanelProps) {
  const amountThreshold = useDashboardStore((s) => s.amountThreshold);
  const rs120Threshold = useDashboardStore((s) => s.rs120Threshold);

  const { data, isLoading } = useThsSectorMembers(sectorCode);
  const all = data?.items ?? [];

  const filtered = useMemo(() => {
    return all.filter((m) => {
      const amountOk = !Number.isFinite(amountThreshold) || m.amount >= amountThreshold * 1e8;
      const rsOk = !Number.isFinite(rs120Threshold) || (m.rs120 ?? 0) >= rs120Threshold;
      return amountOk && rsOk;
    });
  }, [all, amountThreshold, rs120Threshold]);

  const columns: Column<ThsSectorMember>[] = [
    {
      key: "name",
      label: "名称",
      render: (m) => (
        <div className="leading-tight">
          <div className="text-text-primary">{m.name}</div>
          <div className="text-[10px] text-text-tertiary font-mono">{m.code}</div>
        </div>
      ),
    },
    {
      key: "pctChange",
      label: "涨跌",
      align: "right" as const,
      width: "64px",
      render: (m) => (
        <span className={cn(
          "font-mono tabular-nums",
          m.pctChange >= 0 ? "text-state-up" : "text-state-down",
        )}>
          {m.pctChange >= 0 ? "+" : ""}{m.pctChange.toFixed(2)}%
        </span>
      ),
    },
    {
      key: "amount",
      label: "成交",
      align: "right" as const,
      width: "64px",
      render: (m) => (
        <span className="font-mono tabular-nums text-text-secondary">
          {(m.amount / 1e8).toFixed(1)}亿
        </span>
      ),
    },
    {
      key: "rs120",
      label: "RS120",
      align: "right" as const,
      width: "56px",
      render: (m) => (
        <span className={cn(
          "font-mono tabular-nums",
          (m.rs120 ?? 0) >= 87 ? "text-rs-high font-semibold" : "text-text-secondary",
        )}>
          {m.rs120 ?? "--"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border-default shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-text-primary">成分股</h2>
          <span className="text-[10px] text-text-tertiary">
            {filtered.length} / {all.length}
          </span>
        </div>
        <StockFilterBar />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {!sectorCode ? (
          <EmptyState size="sm" icon={<Filter className="w-7 h-7" />} title="请先选择板块" />
        ) : isLoading ? (
          <div className="py-8 text-center text-[11px] text-text-tertiary">加载中...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Inbox className="w-7 h-7" />}
            title="无匹配股票"
            description={all.length > 0 ? "尝试放宽筛选阈值" : "板块无成分股数据"}
          />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            rowKey={(m) => m.code}
            selectedKey={selectedStockCode}
            onRowClick={(m) => onSelectStock(m.code, m.name)}
            density="compact"
          />
        )}
      </div>
    </div>
  );
}
