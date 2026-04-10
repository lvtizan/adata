import { ChartShell, KlineChart } from "@/shared/charts";
import { useStockChart, useSectorChart, useStockPatterns, useStockPredictions } from "@/queries";
import type { PatternSignal, DrawdownMarker } from "@/services";
import { StockKlineWorkbench } from "@/shared/charts/stock-kline-workbench";

interface CandlestickPanelProps {
  kind: "sector" | "stock";
  code: string;
  label: string;
  title: string;
  emptyText?: string;
}

export function CandlestickPanel({ kind, code, label, title, emptyText = "请选择" }: CandlestickPanelProps) {
  const stockQuery = useStockChart(kind === "stock" ? code : "", 120);
  const sectorQuery = useSectorChart(kind === "sector" ? code : "", 120);
  const query = kind === "stock" ? stockQuery : sectorQuery;

  // 个股才加载 pattern 数据（HH 信号 + 回撤标记）
  const { data: patternData } = useStockPatterns(kind === "stock" ? code : "");
  // 形态预测数据
  const { data: predictionData } = useStockPredictions(kind === "stock" ? code : "");

  if (kind === "stock") {
    return (
      <ChartShell
        title={title}
        subtitle={label}
        empty={!code ? emptyText : undefined}
        className="h-full"
      >
        {code ? (
          <StockKlineWorkbench
            tsCode={code}
            sectorCode=""
            stockName={title}
            showDrawingsPanel={false}
          />
        ) : (
          <div />
        )}
      </ChartShell>
    );
  }

  return (
    <ChartShell
      title={title}
      subtitle={label}
      loading={query.isLoading}
      error={query.error?.message}
      empty={!code ? emptyText : undefined}
      className="h-full"
    >
      {query.data?.points && (
        <KlineChart
          points={query.data.points}
          signals={patternData?.signals}
          drawdowns={patternData?.drawdowns}
          supports={patternData?.supports}
          resistances={patternData?.resistances}
          fengSignals={query.data.fengSignals}
          predictions={predictionData?.predictions}
        />
      )}
    </ChartShell>
  );
}
