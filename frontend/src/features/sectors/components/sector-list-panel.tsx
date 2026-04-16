import { useState } from "react";
import { useThsSectors, useMySectors } from "@/queries";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { EmptyState } from "@/shared/ui/empty-state";
import { cn } from "@/lib/utils";
import { Plus, Inbox } from "lucide-react";

interface SectorListPanelProps {
  selectedCode?: string;
  onSelect: (code: string, name: string) => void;
  onManageClick: () => void;
}

export function SectorListPanel({ selectedCode, onSelect, onManageClick }: SectorListPanelProps) {
  const [tab, setTab] = useState<"recommend" | "mine">("recommend");
  const { data: recResp, isLoading: recLoading } = useThsSectors();
  const { data: mineResp, isLoading: mineLoading } = useMySectors();

  const allSectors = recResp?.items ?? [];
  const mySectorCodes = new Set((mineResp?.items ?? []).map((s) => s.code));

  const displayList =
    tab === "recommend"
      ? allSectors
      : allSectors.filter((s) => mySectorCodes.has(s.code));

  const isLoading = tab === "recommend" ? recLoading : mineLoading;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border-default shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-text-primary">板块列表</h2>
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "recommend", label: "推荐" },
              { value: "mine", label: `我的 (${mySectorCodes.size})` },
            ]}
          />
        </div>
        {tab === "mine" && (
          <button
            onClick={onManageClick}
            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            <Plus className="w-3 h-3" /> 管理主流板块
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="py-8 text-center text-[11px] text-text-tertiary">加载中...</div>
        ) : displayList.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Inbox className="w-7 h-7" />}
            title={tab === "mine" ? "未添加主流板块" : "暂无板块"}
            description={tab === "mine" ? "点击上方按钮添加" : undefined}
          />
        ) : (
          displayList.map((s) => {
            const active = s.code === selectedCode;
            const rs = s.rs120;
            return (
              <button
                key={s.code}
                onClick={() => onSelect(s.code, s.name)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 h-7 text-left text-[12px] border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors",
                  active && "bg-accent-soft text-accent",
                )}
              >
                <span className="flex-1 truncate">{s.name}</span>
                <span className="font-mono tabular-nums text-[10px] text-text-tertiary w-8 text-right">
                  {s.code}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums text-[10px] w-8 text-right",
                    rs != null && rs >= 87 && "text-rs-high font-semibold",
                    rs != null && rs < 30 && "text-rs-low",
                    (rs == null || (rs >= 30 && rs < 87)) && "text-text-tertiary",
                  )}
                >
                  {rs != null ? rs : "--"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
