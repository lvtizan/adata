import { useState } from "react";
import { useMarketOverview } from "@/queries";
import { MarketSummary } from "@/features/market/components/market-summary";
import { RiskGauge } from "@/features/market/components/risk-gauge";
import { IndexRiskPanel } from "@/features/market/components/index-risk-panel";
import { IndexComparePanel } from "@/features/market/components/index-compare-panel";

type TabId = "risk" | "compare";

export default function IndexRadarPage() {
  const { data: overview } = useMarketOverview();
  const [tab, setTab] = useState<TabId>("compare");

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

      {/* Tab 切换 */}
      <div className="flex items-center gap-0 px-4 border-b border-border-default bg-surface">
        {([
          { id: "compare" as TabId, label: "走势对比" },
          { id: "risk" as TabId, label: "风险分析" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? "border-accent text-text-primary font-medium"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "compare" ? (
          <div className="p-4">
            <IndexComparePanel mainlines={overview?.mainlines ?? []} />
          </div>
        ) : (
          <IndexRiskPanel />
        )}
      </div>
    </div>
  );
}
