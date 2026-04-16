import { useState, useMemo } from "react";
import { useThsSectors, useMySectors, useAddMySector, useRemoveMySector } from "@/queries";
import { FilterBar, FilterChip } from "@/shared/ui/filter-chip";
import { Search, X, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface MySectorsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function MySectorsDialog({ open, onClose }: MySectorsDialogProps) {
  const [query, setQuery] = useState("");
  const { data: recResp } = useThsSectors();
  const { data: mineResp } = useMySectors();
  const addMutation = useAddMySector();
  const removeMutation = useRemoveMySector();

  const allSectors = recResp?.items ?? [];
  const mySet = new Set((mineResp?.items ?? []).map((s) => s.code));

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allSectors;
    return allSectors.filter((s) => s.name.includes(q) || s.code.includes(q));
  }, [allSectors, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[480px] max-h-[70vh] bg-canvas rounded-md border border-border-default flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-border-default flex items-center">
          <h3 className="text-[13px] font-semibold text-text-primary">管理主流板块</h3>
          <button onClick={onClose} className="ml-auto text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-border-default">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索板块名或代码（如 白酒 / 881273）"
              className="w-full pl-8 pr-3 h-7 text-[12px] border border-border-default rounded-md bg-canvas focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="p-3 border-b border-border-default">
          <div className="text-[11px] text-text-tertiary mb-1.5">
            已添加 ({(mineResp?.items ?? []).length})
          </div>
          <FilterBar>
            {(mineResp?.items ?? []).map((s) => (
              <FilterChip
                key={s.code}
                label={s.name}
                active
                onClear={() => removeMutation.mutate(s.code)}
              />
            ))}
            {(mineResp?.items ?? []).length === 0 && (
              <span className="text-[11px] text-text-tertiary">尚未添加</span>
            )}
          </FilterBar>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {filtered.map((s) => {
            const added = mySet.has(s.code);
            return (
              <div
                key={s.code}
                className={cn(
                  "flex items-center gap-2 px-3 h-7 border-b border-border-subtle last:border-b-0 text-[12px]",
                )}
              >
                <span className="flex-1 truncate">{s.name}</span>
                <span className="font-mono text-[10px] text-text-tertiary w-12 text-right">{s.code}</span>
                <span className="font-mono text-[10px] text-text-tertiary w-8 text-right">
                  {s.rs120 != null ? `RS${s.rs120}` : "--"}
                </span>
                {added ? (
                  <button
                    onClick={() => removeMutation.mutate(s.code)}
                    className="h-5 w-5 flex items-center justify-center rounded-sm text-rs-low hover:bg-surface-hover"
                    title="移除"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => addMutation.mutate({ code: s.code, name: s.name })}
                    className="h-5 w-5 flex items-center justify-center rounded-sm text-accent hover:bg-accent-soft"
                    title="添加"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
