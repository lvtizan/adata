import * as React from "react";
import { cn } from "@/lib/utils";

interface ThresholdInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  width?: number;
  className?: string;
}

export function ThresholdInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
  width = 56,
  className,
}: ThresholdInputProps) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap", className)}>
      <span className="text-text-tertiary">{label}</span>
      <div className="inline-flex items-center gap-0.5 h-6 px-2 rounded-md border border-border-default bg-canvas focus-within:border-accent transition-colors">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(NaN);
              return;
            }
            const v = parseFloat(raw);
            if (!Number.isNaN(v)) onChange(v);
          }}
          style={{ width }}
          className="bg-transparent text-[11px] font-mono tabular-nums font-semibold text-text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[10px] text-text-tertiary">{suffix}</span>}
      </div>
    </label>
  );
}
