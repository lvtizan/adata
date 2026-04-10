import { useStockChart, useRelativeStrength, useStockPatterns } from "@/queries";
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
}: WatchlistChartProps) {
  const barsMap: Record<string, number> = { "1d": 120, "1w": 104, "1M": 60 };
  const { data: stockData, isLoading, error: stockError } = useStockChart(tsCode, barsMap[frequency] ?? 120, frequency);
  const { data: rsData } = useRelativeStrength(tsCode, sectorCode);
  const { data: patternData } = useStockPatterns(tsCode);

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
      isLoading={isLoading}
      error={stockError?.message}
      activeTool={activeTool}
      drawingColor={drawingColor}
      onSelectionChange={onSelectionChange}
      onChangeOverlayColor={onChangeOverlayColor}
      onDrawingsChange={onDrawingsChange}
      onBuyPlanChange={onBuyPlanChange}
    />
  );
}
