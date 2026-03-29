import { useMarketOverview } from "@/queries";
import { MarketSummary } from "@/features/market/components/market-summary";
import { RiskGauge } from "@/features/market/components/risk-gauge";
import { IndexRiskPanel } from "@/features/market/components/index-risk-panel";

export default function IndexRadarPage() {
  const { data: overview } = useMarketOverview();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-default">
        <div>
          <h1 className="text-xl font-semibold">指数雷达</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            观察大盘、风格、情绪和港股指数的强弱切换与风险信号。
          </p>
        </div>
        <div className="flex items-stretch">
          <MarketSummary overview={overview} />
          <RiskGauge risk={overview?.marketRisk} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <IndexRiskPanel />
      </div>
    </div>
  );
}
