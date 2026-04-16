import * as React from "react";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down" | "neutral";
}

interface StatStripProps {
  stats: Stat[];
  density?: "compact" | "normal";
  className?: string;
}

export function StatStrip({ stats, density = "normal", className }: StatStripProps) {
  const padding = density === "compact" ? "px-2 py-1" : "px-2.5 py-1";
  const minW = density === "compact" ? "min-w-[56px]" : "min-w-[72px]";
  return (
    <div
      className={cn(
        "inline-flex border border-border-default rounded-md overflow-hidden",
        className,
      )}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          className={cn(
            padding,
            minW,
            "border-r border-border-default last:border-r-0",
          )}
        >
          <span className="block text-[10px] text-text-tertiary leading-none">
            {s.label}
          </span>
          <strong
            className={cn(
              "block text-[12px] font-semibold font-mono leading-tight mt-0.5 tabular-nums",
              s.tone === "up" && "text-state-up",
              s.tone === "down" && "text-state-down",
            )}
          >
            {s.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
