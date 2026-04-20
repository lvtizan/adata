import { useMemo } from "react";
import { useStockChart, useRelativeStrength, useStockPatterns, useSectorEqualWeightChart } from "@/queries";
import { InteractiveStockKline } from "@/shared/charts/interactive-stock-kline";

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  activeTool?: string | null;
  drawingColor?: string;
  frequency?: string;
  onChangeOverlayColor?: (chart: any, overlayId: string, color: string) => void;
  onSelectionChange?: (selection: { id: string | null; locked: boolean; name: string | null }) => void;
  onDrawingsChange?: (overlays: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>) => void;
  onBuyPlanChange?: (plan: { entryPrice: number; stopLoss: number; takeProfit: number; riskReward: number | null }) => void;
  onToolReset?: () => void;
}

export function WatchlistChart({
  tsCode,
  sectorCode,
  stockName,
  activeTool,
  drawingColor,
  frequency = "1d",
  onSelectionChange,
  onChangeOverlayColor,
  onDrawingsChange,
  onBuyPlanChange,
  onToolReset,
}: WatchlistChartProps) {
  const barsMap: Record<string, number> = { "1d": 120, "1w": 104, "1M": 60 };
  const bars = barsMap[frequency] ?? 120;
  const { data: stockData, isLoading, error: stockError } = useStockChart(tsCode, bars, frequency);
  const { data: rsData } = useRelativeStrength(tsCode, sectorCode);
  const { data: patternData } = useStockPatterns(tsCode);
  const { data: sectorEqData } = useSectorEqualWeightChart(sectorCode, Math.max(bars, 180));

  // 板块等权线归一化到个股价格坐标（同起点，相同涨幅可直接对比）
  const sectorNormalizedPoints = useMemo(() => {
    const stockPoints = stockData?.points;
    const sectorPoints = sectorEqData?.points;
    if (!stockPoints?.length || !sectorPoints?.length) return undefined;

    const stockDates = new Set(stockPoints.map((p) => p.time));
    const firstCommon = sectorPoints.find((p) => stockDates.has(p.time));
    if (!firstCommon) return undefined;

    const sectorBase = firstCommon.close;
    const stockBase = stockPoints.find((p) => p.time === firstCommon.time)?.close;
    if (!sectorBase || !stockBase) return undefined;

    const ratio = stockBase / sectorBase;
    const stockStart = stockPoints[0].time;
    return sectorPoints
      .filter((p) => p.time >= stockStart)
      .map((p) => ({ time: p.time, value: +(p.close * ratio).toFixed(4) }))
      .filter((p) => p.value >= stockBase * 0.1 && p.value <= stockBase * 10);
  }, [stockData, sectorEqData]);

  return (
    <InteractiveStockKline
      tsCode={tsCode}
      stockName={stockName}
      points={stockData?.points ?? []}
      frequency={frequency}
      signals={patternData?.signals}
      drawdowns={patternData?.drawdowns}
      supports={patternData?.supports}
      resistances={patternData?.resistances}
      fengSignals={stockData?.fengSignals}
      rsData={rsData}
      sectorNormalizedPoints={sectorNormalizedPoints}
      isLoading={isLoading}
      error={stockError?.message}
      activeTool={activeTool}
      drawingColor={drawingColor}
      onSelectionChange={onSelectionChange}
      onChangeOverlayColor={onChangeOverlayColor}
      onDrawingsChange={onDrawingsChange}
      onBuyPlanChange={onBuyPlanChange}
      onToolReset={onToolReset}
    />
  );
}
