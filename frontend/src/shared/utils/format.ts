export function fmtPct(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function fmtAmount(value: number | null | undefined): string {
  if (value == null) return "-";
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toFixed(0);
}

export function tone(value: number | null | undefined): "up" | "down" | "" {
  if (value == null) return "";
  return value >= 0 ? "up" : "down";
}

export function fmtYi(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${(value / 1e8).toFixed(1)}亿`;
}

export function fmtQuarter(dateStr: string): string {
  if (!dateStr || dateStr.length < 6) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(4, 6), 10);
  const q = Math.ceil(m / 3);
  return `${y}Q${q}`;
}

export function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
