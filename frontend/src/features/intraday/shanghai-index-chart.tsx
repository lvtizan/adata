import { AlertCircle, ArrowDown, CircleDashed } from "lucide-react";
import { useStockChart } from "@/queries";
import { KlineChart } from "@/shared/charts";
import { cn } from "@/lib/utils";

const SHANGHAI_INDEX_CODE = "000001.SH";

function SignalLegend() {
  const items = [
    { label: "W", tone: "text-amber-500", icon: CircleDashed },
    { label: "双顶", tone: "text-emerald-500", icon: ArrowDown },
    { label: "突", tone: "text-white", icon: AlertCircle },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
      <span className="shrink-0">后端信号</span>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <span
            key={item.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border-default bg-surface-secondary px-2 py-1",
              item.label === "突" && "bg-state-down border-state-down/40",
            )}
          >
            <Icon className={cn("h-3 w-3", item.label === "突" ? "text-white" : item.tone)} />
            <span className={cn("font-semibold", item.tone)}>{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ShanghaiIndex5mChart() {
  const { data, isLoading, error } = useStockChart(SHANGHAI_INDEX_CODE, 240, "5m", { realOnly: true });

  const hasIntradayData = Boolean(data?.points?.length);
  const hasSyntheticFallback = Boolean((data as any)?.synthetic);

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border-default bg-surface-secondary/40 text-sm text-text-tertiary">
        上证 5 分钟图加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border-default bg-surface-secondary/40 text-sm text-state-down">
        上证 5 分钟图加载失败：{error.message}
      </div>
    );
  }

  if (!hasIntradayData) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border-default bg-surface-secondary/40 text-sm text-text-tertiary">
        {hasSyntheticFallback ? "当前只拿到日线，未命中真实5分钟数据" : "暂无上证 5 分钟数据"}
      </div>
    );
  }

  const chartData = data;
  const title = "上证指数 5 分钟";
  const subtitle = "000001.SH · 真实分钟线（realOnly）";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          <div className="text-[11px] text-text-tertiary">{subtitle}</div>
        </div>
        {hasIntradayData ? (
          <SignalLegend />
        ) : (
          <div className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
            分钟线抓取失败，当前显示日线回退
          </div>
        )}
      </div>

      <div className="h-[360px] overflow-hidden rounded-2xl border border-border-default bg-surface-secondary/30 p-2">
        <KlineChart
          points={chartData?.points ?? []}
          signals={data?.signals}
          frequency="5m"
          height={340}
          showVolume={false}
        />
      </div>
    </div>
  );
}
