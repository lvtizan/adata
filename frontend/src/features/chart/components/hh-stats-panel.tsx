import { useStockHHStats } from "@/queries";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/shared/utils/format";

interface HHStatsPanelProps {
  tsCode: string;
  stockName?: string;
}

function WinRateBar({ label, rate }: { label: string; rate: number | null }) {
  if (rate == null) return null;
  const color =
    rate >= 60 ? "bg-state-up" : rate >= 40 ? "bg-amber-500" : "bg-state-down";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-tertiary w-8 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-surface-secondary rounded-sm overflow-hidden">
        <div
          className={cn("h-full rounded-sm transition-all", color)}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono w-10 text-right font-medium",
          rate >= 60
            ? "text-state-up"
            : rate >= 40
              ? "text-amber-600"
              : "text-state-down"
        )}
      >
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

function TypeCard({
  type,
  stats,
}: {
  type: string;
  stats: {
    count: number;
    winRate5d: number | null;
    winRate10d: number | null;
    winRate20d: number | null;
    avgRet5d: number | null;
    avgRet10d: number | null;
    avgRet20d: number | null;
    avgMaxGain20d: number | null;
  };
}) {
  return (
    <div className="border border-border-default rounded-md px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-accent">{type}</span>
          <span className="text-[10px] text-text-quaternary">({stats.count}次)</span>
        </div>
        {stats.avgMaxGain20d != null && (
          <span className="text-[10px] text-text-tertiary">
            均最大涨幅{" "}
            <strong
              className={cn(
                "font-mono",
                stats.avgMaxGain20d > 0 ? "text-state-up" : "text-state-down"
              )}
            >
              {stats.avgMaxGain20d > 0 ? "+" : ""}
              {stats.avgMaxGain20d.toFixed(1)}%
            </strong>
          </span>
        )}
      </div>
      <div className="space-y-1">
        <WinRateBar label="5日" rate={stats.winRate5d} />
        <WinRateBar label="10日" rate={stats.winRate10d} />
        <WinRateBar label="20日" rate={stats.winRate20d} />
      </div>
      {(stats.avgRet5d != null || stats.avgRet10d != null) && (
        <div className="flex gap-3 text-[10px] text-text-tertiary pt-0.5">
          {stats.avgRet5d != null && (
            <span>
              5日均{" "}
              <span className={cn("font-mono", stats.avgRet5d >= 0 ? "text-state-up" : "text-state-down")}>
                {stats.avgRet5d >= 0 ? "+" : ""}{stats.avgRet5d.toFixed(1)}%
              </span>
            </span>
          )}
          {stats.avgRet10d != null && (
            <span>
              10日均{" "}
              <span className={cn("font-mono", stats.avgRet10d >= 0 ? "text-state-up" : "text-state-down")}>
                {stats.avgRet10d >= 0 ? "+" : ""}{stats.avgRet10d.toFixed(1)}%
              </span>
            </span>
          )}
          {stats.avgRet20d != null && (
            <span>
              20日均{" "}
              <span className={cn("font-mono", stats.avgRet20d >= 0 ? "text-state-up" : "text-state-down")}>
                {stats.avgRet20d >= 0 ? "+" : ""}{stats.avgRet20d.toFixed(1)}%
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SignalRow({
  sig,
}: {
  sig: {
    date: string;
    type: string;
    price: number;
    ret5d: number | null;
    ret10d: number | null;
    maxGain20d: number | null;
    buySignal: boolean;
    success: boolean;
  };
}) {
  const fmtDate = sig.date
    ? `${sig.date.slice(4, 6)}/${sig.date.slice(6, 8)}`
    : "";
  return (
    <tr className="text-[11px] border-b border-border-default/50 last:border-b-0">
      <td className="py-1 text-text-tertiary">{fmtDate}</td>
      <td className="py-1">
        <span className="text-accent font-semibold">{sig.type}</span>
        {sig.buySignal && (
          <span className="ml-1 text-[9px] bg-state-up/15 text-state-up px-1 rounded">买</span>
        )}
      </td>
      <td className="py-1 font-mono text-right">{sig.price.toFixed(2)}</td>
      <td className={cn("py-1 font-mono text-right", sig.ret5d != null && sig.ret5d >= 0 ? "text-state-up" : "text-state-down")}>
        {sig.ret5d != null ? `${sig.ret5d >= 0 ? "+" : ""}${sig.ret5d.toFixed(1)}%` : "-"}
      </td>
      <td className={cn("py-1 font-mono text-right", sig.ret10d != null && sig.ret10d >= 0 ? "text-state-up" : "text-state-down")}>
        {sig.ret10d != null ? `${sig.ret10d >= 0 ? "+" : ""}${sig.ret10d.toFixed(1)}%` : "-"}
      </td>
      <td className="py-1 text-center">
        {sig.success ? (
          <span className="text-state-up">✓</span>
        ) : sig.maxGain20d != null ? (
          <span className="text-state-down">✗</span>
        ) : (
          <span className="text-text-quaternary">-</span>
        )}
      </td>
    </tr>
  );
}

export function HHStatsPanel({ tsCode, stockName }: HHStatsPanelProps) {
  const { data, isLoading } = useStockHHStats(tsCode);

  if (!tsCode) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-sm font-medium text-text-primary">HH 成功率</h3>
      </div>

      {isLoading ? (
        <div className="text-xs text-text-tertiary px-1">统计中...</div>
      ) : !data || data.totalSignals === 0 ? (
        <div className="text-xs text-text-tertiary px-1">近500日无 HH 信号</div>
      ) : (
        <div className="space-y-3">
          {/* 总览 */}
          <div className="border border-border-default rounded-md px-3 py-2 space-y-1.5 bg-surface-secondary/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                共 <strong className="text-text-primary">{data.totalSignals}</strong> 次信号
              </span>
              {data.overall.avgMaxGain20d != null && (
                <span className="text-[10px] text-text-tertiary">
                  20日均最大涨幅{" "}
                  <strong
                    className={cn(
                      "font-mono",
                      data.overall.avgMaxGain20d > 0 ? "text-state-up" : "text-state-down"
                    )}
                  >
                    {data.overall.avgMaxGain20d > 0 ? "+" : ""}
                    {data.overall.avgMaxGain20d.toFixed(1)}%
                  </strong>
                </span>
              )}
            </div>
            <WinRateBar label="5日" rate={data.overall.winRate5d} />
            <WinRateBar label="10日" rate={data.overall.winRate10d} />
            <WinRateBar label="20日" rate={data.overall.winRate20d} />
          </div>

          {/* 按类型分组 */}
          {Object.entries(data.statsByType).map(([type, stats]) => (
            <TypeCard key={type} type={type} stats={stats} />
          ))}

          {/* 信号明细表 */}
          {data.signals.length > 0 && (
            <div>
              <h4 className="text-[11px] text-text-tertiary mb-1 px-1">信号明细</h4>
              <div className="overflow-auto max-h-[200px]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-text-quaternary border-b border-border-default">
                      <th className="py-1 font-normal">日期</th>
                      <th className="py-1 font-normal">类型</th>
                      <th className="py-1 font-normal text-right">价格</th>
                      <th className="py-1 font-normal text-right">5日</th>
                      <th className="py-1 font-normal text-right">10日</th>
                      <th className="py-1 font-normal text-center">成功</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.signals
                      .slice()
                      .reverse()
                      .map((sig, i) => (
                        <SignalRow key={`${sig.date}-${i}`} sig={sig} />
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
