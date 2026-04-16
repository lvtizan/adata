import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClear?: () => void;
  className?: string;
}

export function FilterChip({ label, value, active, onClick, onClear, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] border transition-colors cursor-pointer",
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-border-default bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        className,
      )}
    >
      <span>{label}</span>
      {value != null && (
        <span className="font-mono tabular-nums font-medium">{value}</span>
      )}
      {onClear && (
        <span
          role="button"
          aria-label="清除"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-surface-active ml-0.5"
        >
          <X className="w-2.5 h-2.5" />
        </span>
      )}
    </button>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {children}
    </div>
  );
}
