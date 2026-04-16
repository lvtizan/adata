import * as React from "react";
import { cn } from "@/lib/utils";

interface Option<V extends string> {
  value: V;
  label: React.ReactNode;
}

interface SegmentedControlProps<V extends string> {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedControlProps<V>) {
  const height = size === "sm" ? "h-6" : "h-7";
  const fontSize = size === "sm" ? "text-[11px]" : "text-xs";
  return (
    <div
      className={cn(
        "inline-flex bg-surface rounded-full p-0.5 border border-border-default",
        height,
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 rounded-full transition-colors font-medium",
              fontSize,
              active
                ? "bg-canvas text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
