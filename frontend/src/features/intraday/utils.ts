export function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value)}`;
}

export function normalizePercentInput(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value <= 1 && value >= 0) return value * 100;
  return Math.max(0, Math.min(100, value));
}

export function clampScore(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function scoreToneClass(value: number | null | undefined): string {
  const score = clampScore(value);
  if (score >= 80) return "text-state-up";
  if (score >= 65) return "text-state-warning";
  if (score >= 50) return "text-text-secondary";
  return "text-state-down";
}

export function scoreBarClass(value: number | null | undefined): string {
  const score = clampScore(value);
  if (score >= 80) return "bg-state-up";
  if (score >= 65) return "bg-state-warning";
  if (score >= 50) return "bg-accent";
  return "bg-state-down";
}

export function gradeToneClass(grade?: string | null): string {
  switch (grade) {
    case "S":
      return "bg-emerald-500/12 text-emerald-500 border-emerald-500/25";
    case "A":
      return "bg-state-up/10 text-state-up border-state-up/20";
    case "B":
      return "bg-state-warning/10 text-state-warning border-state-warning/20";
    case "C":
      return "bg-surface-secondary text-text-secondary border-border-default";
    case "D":
      return "bg-state-down/10 text-state-down border-state-down/20";
    default:
      return "bg-surface-secondary text-text-tertiary border-border-default";
  }
}
