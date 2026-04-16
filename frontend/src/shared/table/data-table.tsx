import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  sortable?: boolean;
  render: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (item: T) => string;
  selectedKey?: string;
  onRowClick?: (item: T) => void;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  sortFn?: (a: T, b: T, key: string, dir: "asc" | "desc") => number;
  className?: string;
  /** @deprecated Use density="compact" instead. compact=true maps to density="relaxed" for backward compat (original h-9 rows). */
  compact?: boolean;
  density?: "compact" | "normal" | "relaxed";
  emptyText?: string;
}

const sizingMap = {
  compact: { cell: "h-6 py-0.5 text-[11px]", header: "h-6 text-[10px]" },
  normal:  { cell: "h-7 py-1 text-[12px]",   header: "h-7 text-[11px]" },
  relaxed: { cell: "h-9 py-2 text-[13px]",   header: "h-9 text-[11px]" },
} as const;

export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectedKey,
  onRowClick,
  defaultSort,
  sortFn,
  className,
  compact,
  density,
  emptyText = "暂无数据",
}: DataTableProps<T>) {
  // density takes priority; compact boolean maps to relaxed (original h-9) for backward compat
  const effectiveDensity: "compact" | "normal" | "relaxed" =
    density ?? (compact ? "relaxed" : "relaxed");
  const sz = sizingMap[effectiveDensity];

  const [sort, setSort] = useState(defaultSort || { key: "", dir: "desc" as const });

  const sorted = useMemo(() => {
    if (!sort.key || !sortFn) return data;
    return [...data].sort((a, b) => sortFn(a, b, sort.key, sort.dir));
  }, [data, sort, sortFn]);

  function toggleSort(key: string) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <table className="w-full border-collapse" style={{ tableLayout: "auto" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "sticky top-0 z-10 bg-surface px-3 font-semibold text-text-secondary border-b border-border-default whitespace-nowrap",
                  sz.header,
                  col.align === "right" ? "text-right" : "text-left",
                  col.sortable && "cursor-pointer select-none hover:text-text-primary"
                )}
                style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && sort.key === col.key && (
                  <span className="ml-1 text-accent">{sort.dir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-text-tertiary">
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((item, i) => {
            const key = rowKey(item);
            return (
              <tr
                key={key}
                className={cn(
                  sz.cell,
                  "cursor-pointer border-b border-border-subtle hover:bg-surface-hover transition-colors",
                  key === selectedKey && "bg-surface-active"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 whitespace-nowrap",
                      col.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    {col.render(item, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
