import { useEffect, useRef } from "react";
import { createChart, LineSeries } from "lightweight-charts";
import { ChartShell } from "@/shared/charts";
import { useRelativeStrength } from "@/queries";
import { useAppStore } from "@/store";
import { getChartTheme } from "@/app/theme/chart-theme";
import { formatDate } from "@/shared/utils/format";
import { cn } from "@/lib/utils";

interface RsPanelProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  sectorName?: string;
}

export function RsPanel({ tsCode, sectorCode, stockName, sectorName }: RsPanelProps) {
  const { data, isLoading, error } = useRelativeStrength(tsCode, sectorCode);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(theme === "dark"),
      width: containerRef.current.clientWidth,
      height: 200,
      autoSize: true,
    });

    const stockLine = chart.addSeries(LineSeries, { color: "#f23645", lineWidth: 2 });
    const sectorLine = chart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 2 });

    stockLine.setData(data.stock.rpsSeries.map((p) => ({ time: formatDate(p.time), value: p.value })));
    sectorLine.setData(data.sector.rpsSeries.map((p) => ({ time: formatDate(p.time), value: p.value })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, theme]);

  const summary = data?.summary;

  return (
    <ChartShell
      title="相对强弱"
      subtitle={stockName && sectorName ? `${stockName} vs ${sectorName}` : undefined}
      loading={isLoading}
      error={error?.message}
      empty={!tsCode || !sectorCode ? "选择个股后显示" : undefined}
      actions={
        summary ? (
          <div className="flex gap-1.5">
            {[
              { label: `5日 ${summary.relativeStrength5d}` },
              { label: `10日 ${summary.relativeStrength10d}` },
              { label: summary.label, emphasis: true },
            ].map((b, i) => (
              <span
                key={i}
                className={cn(
                  "px-2 py-1 text-xs border border-border-default rounded-sm",
                  b.emphasis && "text-accent border-accent/30 bg-accent-soft"
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      <div ref={containerRef} className="w-full" style={{ height: 200 }} />
      {data && (
        <div className="flex gap-3 px-3 pb-2 text-xs text-text-secondary">
          <span><span className="inline-block w-2 h-2 rounded-full bg-state-up mr-1" />{stockName || "个股"} RPS</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-accent mr-1" />{sectorName || "板块"} RPS</span>
        </div>
      )}
    </ChartShell>
  );
}
