import type {
  IntradayGrade,
  IntradayScoreBreakdown,
  IntradayScoreResult,
  IntradaySectorScoringInput,
  IntradayStockScoringInput,
  IntradayScoringTag,
} from "../types";
import { normalizePercentInput } from "../utils";

function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(clamp(value));
}

function avg(values: number[]): number {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

function pctShare(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return clamp((part / total) * 100);
}

function invert(value: number): number {
  return clamp(100 - value);
}

function scoreTrend(change: number, scale = 1): number {
  return clamp(50 + change * scale);
}

function normalizeRanking(rank: number | null | undefined, maxRank = 60): number {
  if (!Number.isFinite(rank)) return 50;
  return clamp(100 - (((rank as number) - 1) / Math.max(1, maxRank - 1)) * 100);
}

function normalizeLogAmount(amount: number, baseline = 1_000_000_000, cap = 15_000_000_000): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const low = Math.log10(baseline);
  const high = Math.log10(cap);
  const value = Math.log10(Math.max(amount, 1));
  return clamp(((value - low) / Math.max(0.0001, high - low)) * 100);
}

function scoreRatio(ratio: number, low: number, high: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio <= low) return 0;
  if (ratio >= high) return 100;
  return ((ratio - low) / (high - low)) * 100;
}

function gradeFromScore(score: number): IntradayGrade {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 55) return "C";
  return "D";
}

function verdictFromScore(score: number, tags: string[]): string {
  if (score >= 85) return tags.includes("板块前排") ? "核心候选，优先跟踪" : "高优先级候选，等待触发确认";
  if (score >= 75) return "强势候选，可放入重点观察池";
  if (score >= 65) return "中等偏强，适合继续盯盘";
  if (score >= 55) return "一般候选，只保留观察价值";
  return "弱势信号偏多，直接跳过";
}

function uniqueTags(tags: IntradayScoringTag[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (seen.has(tag.label)) continue;
    seen.add(tag.label);
    out.push(tag.label);
  }
  return out;
}

function buildResult(
  breakdown: IntradayScoreBreakdown,
  tags: IntradayScoringTag[],
): IntradayScoreResult {
  const totalScore = clamp(
    breakdown.marketScore * 0.25 +
      breakdown.sectorScore * 0.3 +
      breakdown.patternScore * 0.3 +
      breakdown.flowScore * 0.15 -
      breakdown.riskPenalty,
  );
  const grade = gradeFromScore(totalScore);
  const labels = uniqueTags(tags);
  return {
    ...breakdown,
    totalScore: round(totalScore),
    total: round(totalScore),
    grade,
    tags: labels,
    verdict: verdictFromScore(totalScore, labels),
    market: breakdown.marketScore,
    sector: breakdown.sectorScore,
    pattern: breakdown.patternScore,
    flow: breakdown.flowScore,
    fundamental: breakdown.fundamentalScore ?? null,
    catalyst: breakdown.catalystScore ?? null,
    penalty: breakdown.riskPenalty,
  };
}

function marketScore(input: IntradayStockScoringInput | IntradaySectorScoringInput): number {
  const market = input.market;
  if (!market) return 50;

  const state = clamp(market.marketState?.score ?? 50);
  const emotion = clamp(market.emotionState?.score ?? 50);
  const risk = invert(market.marketRisk?.score ?? 50);

  const breadth = market.breadth;
  const ma20 = normalizePercentInput(breadth.aboveMa20Ratio);
  const ma60 = normalizePercentInput(breadth.aboveMa60Ratio);
  const breadthScore = avg([
    scoreRatio((breadth.upCount || 0) - (breadth.downCount || 0), -2000, 2000),
    scoreRatio((breadth.limitUpCount || 0) - (breadth.limitDownCount || 0), -80, 80),
    scoreRatio((breadth.newHighCount || 0) - (breadth.newLowCount || 0), -200, 200),
    avg([ma20, ma60]),
  ]);

  return round(state * 0.3 + emotion * 0.18 + risk * 0.22 + breadthScore * 0.3);
}

function sectorContextScore(input: IntradayStockScoringInput | IntradaySectorScoringInput): number {
  const sector = input.sector;
  if (!sector) return 50;

  const rankScore = normalizeRanking(sector.rank);
  const rankMomentum = sector.rankChange == null ? 50 : clamp(50 + sector.rankChange * 12);
  const pct = avg([
    scoreTrend(sector.pctChange1d, 7),
    scoreTrend(sector.pctChange5d, 3),
    scoreTrend(sector.pctChange10d, 2.2),
  ]);
  const rps = clamp(sector.rps10);
  const leadership = clamp(50 + Math.min(sector.limitUpCount || 0, 8) * 6);
  const amount = normalizeLogAmount(sector.amount || 0, 2_000_000_000, 30_000_000_000);

  return round(rps * 0.28 + pct * 0.24 + rankScore * 0.18 + rankMomentum * 0.1 + leadership * 0.12 + amount * 0.08);
}

function stockPatternScore(input: IntradayStockScoringInput): number {
  const stock = input.stock;
  const sector = input.sector;

  const momentum = avg([
    scoreTrend(stock.pctChange1d, 4),
    scoreTrend(stock.pctChange5d, 2.2),
    scoreTrend(stock.pctChange10d, 1.6),
  ]);

  const strength = avg([
    clamp(stock.rps5),
    clamp(stock.rps10),
    clamp(stock.rps20),
  ]);

  const maSignal = stock.ma20 > 0
    ? clamp(50 + ((stock.close - stock.ma20) / stock.ma20) * 400)
    : 50;
  const sectorRelative = sector
    ? avg([
        clamp(50 + (stock.pctChange1d - sector.pctChange1d) * 8),
        clamp(50 + (stock.pctChange5d - sector.pctChange5d) * 4),
        clamp(50 + (stock.pctChange10d - sector.pctChange10d) * 2.8),
      ])
    : 50;

  return round(momentum * 0.32 + strength * 0.32 + sectorRelative * 0.24 + maSignal * 0.12);
}

function stockFlowScore(input: IntradayStockScoringInput): number {
  const stock = input.stock;
  const sector = input.sector;

  const amountQuality = sector?.amount && sector.amount > 0
    ? scoreRatio(pctShare(stock.amount || 0, sector.amount || 0), 0.1, 8)
    : normalizeLogAmount(stock.amount || 0, 300_000_000, 6_000_000_000);

  const dataModeBonus = stock.dataMode === "full" ? 8 : -8;
  const activity = avg([
    clamp(50 + Math.min(Math.max(stock.pctChange1d, -6), 6) * 6),
    clamp(50 + Math.min(Math.max(stock.pctChange5d, -12), 12) * 2.8),
  ]);
  const absoluteAmount = normalizeLogAmount(stock.amount || 0, 300_000_000, 8_000_000_000);

  return round(amountQuality * 0.4 + absoluteAmount * 0.25 + activity * 0.2 + clamp(50 + dataModeBonus) * 0.15);
}

function stockRiskPenalty(input: IntradayStockScoringInput): number {
  let penalty = 0;
  const isTrendLeader =
    input.stock.rps20 >= 85 &&
    input.stock.pctChange10d > 0 &&
    input.stock.ma20 > 0 &&
    input.stock.close >= input.stock.ma20;

  if (input.stock.dataMode === "fallback") penalty += 8;
  if (input.stock.ma20 > 0 && input.stock.close < input.stock.ma20) penalty += 6;
  if (input.stock.pctChange1d < 0) penalty += isTrendLeader ? 1 : 4;
  if (input.stock.pctChange5d < 0) penalty += isTrendLeader ? 1 : 3;
  if (input.sector && input.stock.pctChange1d < input.sector.pctChange1d - 1.5) penalty += 5;
  if (input.market?.marketRisk?.score != null && input.market.marketRisk.score >= 70) penalty += 5;
  if (input.market?.emotionState?.score != null && input.market.emotionState.score <= 35) penalty += 4;

  return round(clamp(penalty, 0, 20));
}

function applyStockConvictionBonus(
  result: IntradayScoreResult,
  input: IntradayStockScoringInput,
): IntradayScoreResult {
  const { stock, sector } = input;
  let bonus = 0;

  if (stock.rps20 >= 90) bonus += 8;
  else if (stock.rps20 >= 85) bonus += 6;
  else if (stock.rps20 >= 80) bonus += 4;

  if (stock.rps10 >= 85) bonus += 3;
  else if (stock.rps10 >= 75) bonus += 2;

  if (stock.pctChange10d >= 12) bonus += 5;
  else if (stock.pctChange10d >= 6) bonus += 3;
  else if (stock.pctChange10d >= 3) bonus += 1;

  if (stock.pctChange5d >= 5) bonus += 2;
  if (stock.ma20 > 0 && stock.close >= stock.ma20) bonus += 3;
  if (sector.rank <= 10) bonus += 2;
  if (stock.amount >= 1_000_000_000) bonus += 2;

  const adjustedScore = clamp(result.total + bonus);
  const grade = gradeFromScore(adjustedScore);

  return {
    ...result,
    totalScore: round(adjustedScore),
    total: round(adjustedScore),
    grade,
    verdict: verdictFromScore(adjustedScore, result.tags),
  };
}

function sectorPatternScore(input: IntradaySectorScoringInput): number {
  const sector = input.sector;
  const momentum = avg([
    scoreTrend(sector.pctChange1d, 4),
    scoreTrend(sector.pctChange5d, 2),
    scoreTrend(sector.pctChange10d, 1.4),
  ]);
  const leadership = clamp(50 + Math.min(sector.limitUpCount || 0, 10) * 7);
  const rps = clamp(sector.rps10);
  return round(momentum * 0.38 + leadership * 0.32 + rps * 0.3);
}

function sectorFlowScore(input: IntradaySectorScoringInput): number {
  const sector = input.sector;
  const amountScore = clamp(50 + Math.log10((sector.amount || 1) + 1) * 8);
  const limitUpScore = clamp(45 + Math.min(sector.limitUpCount || 0, 10) * 6);
  return round(amountScore * 0.55 + limitUpScore * 0.45);
}

function sectorRiskPenalty(input: IntradaySectorScoringInput): number {
  const penalties: number[] = [];
  if (input.sector.pctChange1d < 0) penalties.push(5);
  if (input.sector.pctChange5d < 0) penalties.push(3);
  if (input.market?.marketRisk?.score != null && input.market.marketRisk.score >= 70) penalties.push(5);
  return round(avg(penalties));
}

function marketTags(input: IntradayStockScoringInput | IntradaySectorScoringInput): IntradayScoringTag[] {
  const tags: IntradayScoringTag[] = [];
  const market = input.market;
  if (!market) return tags;

  if ((market.marketState?.label || "").includes("进攻")) {
    tags.push({ key: "market-offense", label: "市场进攻", tone: "positive" });
  } else if ((market.marketState?.label || "").includes("防守")) {
    tags.push({ key: "market-defense", label: "市场防守", tone: "warning" });
  }

  if (market.emotionState?.score != null && market.emotionState.score >= 65) {
    tags.push({ key: "emotion-strong", label: "情绪偏热", tone: "positive" });
  } else if (market.emotionState?.score != null && market.emotionState.score <= 35) {
    tags.push({ key: "emotion-weak", label: "情绪偏冷", tone: "warning" });
  }

  if (market.marketRisk?.score != null && market.marketRisk.score >= 70) {
    tags.push({ key: "risk-high", label: "市场风险偏高", tone: "danger" });
  } else if (market.marketRisk?.score != null && market.marketRisk.score <= 35) {
    tags.push({ key: "risk-low", label: "市场风险偏低", tone: "positive" });
  }

  return tags;
}

function sectorTags(input: IntradaySectorScoringInput): IntradayScoringTag[] {
  const sector = input.sector;
  const tags: IntradayScoringTag[] = [...marketTags(input)];

  if (sector.rank <= 5) {
    tags.push({ key: "sector-front", label: "板块前排", tone: "positive" });
  }
  if (sector.pctChange1d > 0) {
    tags.push({ key: "sector-up", label: "板块走强", tone: "positive" });
  }
  if (sector.limitUpCount >= 3) {
    tags.push({ key: "sector-hot", label: "板块活跃", tone: "positive" });
  }
  if (sector.rps10 >= 80) {
    tags.push({ key: "sector-rps", label: "板块RPS强", tone: "positive" });
  }

  return tags;
}

function stockTags(input: IntradayStockScoringInput): IntradayScoringTag[] {
  const stock = input.stock;
  const sector = input.sector;
  const tags: IntradayScoringTag[] = [...marketTags(input)];

  if (sector && stock.pctChange1d >= sector.pctChange1d + 1) {
    tags.push({ key: "stock-stronger-than-sector", label: "强于板块", tone: "positive" });
  }
  if (stock.rps10 >= 80) {
    tags.push({ key: "stock-rps", label: "相对强势", tone: "positive" });
  }
  if (stock.close >= stock.ma20 && stock.ma20 > 0) {
    tags.push({ key: "stock-above-ma20", label: "站上20日线", tone: "positive" });
  } else if (stock.ma20 > 0) {
    tags.push({ key: "stock-below-ma20", label: "弱于20日线", tone: "warning" });
  }
  if (stock.pctChange1d > 0 && stock.pctChange5d > 0) {
    tags.push({ key: "stock-trend", label: "趋势延续", tone: "positive" });
  }
  if ((sector?.rank || 999) <= 3 && stock.pctChange1d > 0) {
    tags.push({ key: "stock-core", label: "主线核心候选", tone: "positive" });
  }
  if (stock.dataMode === "fallback") {
    tags.push({ key: "stock-fallback", label: "数据回退", tone: "warning" });
  }

  return tags;
}

export function scoreIntradaySector(input: IntradaySectorScoringInput): IntradayScoreResult {
  const breakdown: IntradayScoreBreakdown = {
    marketScore: marketScore(input),
    sectorScore: sectorContextScore(input),
    patternScore: sectorPatternScore(input),
    flowScore: sectorFlowScore(input),
    riskPenalty: sectorRiskPenalty(input),
  };

  return buildResult(breakdown, sectorTags(input));
}

export function scoreIntradayStock(input: IntradayStockScoringInput): IntradayScoreResult {
  const breakdown: IntradayScoreBreakdown = {
    marketScore: marketScore(input),
    sectorScore: sectorContextScore(input),
    patternScore: stockPatternScore(input),
    flowScore: stockFlowScore(input),
    riskPenalty: stockRiskPenalty(input),
  };

  const result = buildResult(breakdown, stockTags(input));
  return applyStockConvictionBonus(result, input);
}
