import type { ChartDrawingOverlay } from "@/shared/types";

const LOCAL_PREFIX = "chart-drawings:v1";

function localKey(symbol: string, scope: string, timeframe: string) {
  return `${LOCAL_PREFIX}:${scope}:${timeframe}:${symbol}`;
}

export function readLocalDrawings(symbol: string, scope: string, timeframe: string): ChartDrawingOverlay[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(symbol, scope, timeframe));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalDrawings(
  symbol: string,
  scope: string,
  timeframe: string,
  overlays: ChartDrawingOverlay[],
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(symbol, scope, timeframe), JSON.stringify(overlays));
  } catch {
    // ignore quota / serialization issues
  }
}

export function clearLocalDrawings(symbol: string, scope: string, timeframe: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(localKey(symbol, scope, timeframe));
  } catch {
    // ignore
  }
}

function stripFunctions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(stripFunctions)
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return typeof value === "function" ? undefined : value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "function" || item === undefined) continue;
    const cleaned = stripFunctions(item);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

export function sanitizeOverlay(raw: unknown): ChartDrawingOverlay | null {
  if (!raw || typeof raw !== "object") return null;
  const cleaned = stripFunctions(raw) as Record<string, unknown>;
  if (!cleaned.name || typeof cleaned.name !== "string") return null;
  return {
    id: typeof cleaned.id === "string" ? cleaned.id : undefined,
    groupId: typeof cleaned.groupId === "string" ? cleaned.groupId : undefined,
    paneId: typeof cleaned.paneId === "string" ? cleaned.paneId : undefined,
    name: cleaned.name,
    lock: cleaned.lock === true,
    visible: cleaned.visible !== false,
    zLevel: typeof cleaned.zLevel === "number" ? cleaned.zLevel : undefined,
    mode: typeof cleaned.mode === "string" ? cleaned.mode : undefined,
    modeSensitivity: typeof cleaned.modeSensitivity === "number" ? cleaned.modeSensitivity : undefined,
    points: Array.isArray(cleaned.points) ? cleaned.points : [],
    styles: typeof cleaned.styles === "object" && cleaned.styles ? cleaned.styles : undefined,
    extendData: cleaned.extendData,
  };
}
