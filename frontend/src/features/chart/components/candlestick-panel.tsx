import { ChartShell, KlineChart } from "@/shared/charts";
import { useStockChart, useSectorChart, useStockPatterns } from "@/queries";
import type { PatternSignal, DrawdownMarker } from "@/services";

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
        />
      )}
    </ChartShell>
  );
}
