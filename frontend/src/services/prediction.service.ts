import { api } from "./api-client";

export interface PredictionPathPoint {
  date: string;
  price: number;
  type: string; // "current" | "predicted_low" | "neckline" | "breakout" | "target" | "handle_low"
}

export interface PredictionAction {
  entry: string;
  stop: string;
  target: string;
  riskReward: number;
}

export interface PatternPrediction {
  pattern: string;
  label: string;
  confidence: number;
  phase: string;
  projectedPath: PredictionPathPoint[];
  keyLevels: Record<string, number>;
  action: PredictionAction;
  tsCode?: string;
}

export interface PredictionResult {
  predictions: PatternPrediction[];
}

export function getStockPredictions(tsCode: string) {
  return api<PredictionResult>(`/stock/${tsCode}/predictions`, { cacheTTL: 300_000 });
}

export function getAllPredictions() {
  return api<{ tradeDate: string; items: PatternPrediction[] }>("/predictions", { cacheTTL: 300_000 });
}
