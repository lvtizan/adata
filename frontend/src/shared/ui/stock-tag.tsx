import * as React from "react";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/shared/utils/format";

interface StockTagProps {
  code: string;
  name: string;
  pctChange?: number | null;
  rs?: number | null;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function StockTag({
  code,
  name,
  pctChange,
  rs,
  onClick,
  size = "md",
  className,
}: StockTagProps) {
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  const nameFontSize = size === "sm" ? "text-[11px]" : "text-[12px]";
  const interactive = onClick != null;
  const Tag = interactive ? "button" : "span";

  return (
    <Tag
      {...(interactive ? { onClick, type: "button" as const } : {})}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-surface text-text-primary font-medium transition-colors",
        padding,
        nameFontSize,
        interactive && "hover:bg-surface-hover cursor-pointer",
        className,
      )}
      title={`${name} ${code}`}
    >
      <span className="leading-none">{name}</span>
      {pctChange != null && (
        <span
          className={cn(
            "font-mono tabular-nums text-[10px] leading-none",
            pctChange >= 0 ? "text-state-up" : "text-state-down",
          )}
        >
          {fmtPct(pctChange)}
        </span>
      )}
      {rs != null && (
        <span
          className={cn(
            "font-mono tabular-nums text-[10px] leading-none px-1 py-0.5 rounded-sm",
            rs >= 87 && "bg-rs-high/10 text-rs-high",
            rs >= 60 && rs < 87 && "text-text-secondary",
            rs < 60 && "text-rs-low",
          )}
        >
          RS{Math.round(rs)}
        </span>
      )}
    </Tag>
  );
}
