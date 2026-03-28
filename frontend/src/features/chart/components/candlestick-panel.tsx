import { ChartShell, KlineChart } from "@/shared/charts";
import { useStockChart, useSectorChart } from "@/queries";

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

  return (
    <ChartShell
      title={title}
      subtitle={label}
      loading={query.isLoading}
      error={query.error?.message}
      empty={!code ? emptyText : undefined}
    >
      {query.data?.points && <KlineChart points={query.data.points} height={220} />}
    </ChartShell>
  );
}
