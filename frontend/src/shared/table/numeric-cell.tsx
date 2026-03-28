import { cn } from "@/lib/utils";

interface NumericCellProps {
  value: number | null | undefined;
  format: (v: number | null | undefined) => string;
}

export function NumericCell({ value, format }: NumericCellProps) {
  const text = format(value);
  const color = value == null ? "" : value > 0 ? "text-state-up" : value < 0 ? "text-state-down" : "";
  return <span className={cn("font-mono text-sm", color)}>{text}</span>;
}
