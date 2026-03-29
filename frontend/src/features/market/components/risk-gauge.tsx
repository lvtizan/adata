import type { MarketRisk } from "@/shared/types";
import { cn } from "@/lib/utils";

export function RiskGauge({ risk }: { risk: MarketRisk | undefined }) {
  if (!risk) return null;

  const score = risk.pointerValue ?? risk.score ?? 50;
  const angle = -90 + (score / 100) * 180;
  const toneMap: Record<string, string> = {
    positive: "text-state-down",
    warning: "text-state-warning",
    danger: "text-state-up",
    neutral: "text-text-secondary",
  };
  const toneClass = toneMap[risk.tone] || "";

  const factors = risk.factors || [];
  const limitsFactor = factors.find((f) => f.key === "limits");
  const ma20Factor = factors.find((f) => f.key === "ma20");
  const breadthFactor = factors.find((f) => f.key === "breadth");

  return (
    <div className="min-w-[248px] px-3 py-2 border-l border-border-default">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-text-tertiary">市场风险</span>
        <strong className={cn("text-sm font-semibold", toneClass)}>{risk.label}</strong>
      </div>
      <div className="relative w-full max-w-[180px] mx-auto h-[74px]">
        <div className="absolute inset-x-3 top-0 bottom-0 rounded-t-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-state-up/20 via-surface to-state-down/20" />
        </div>
        <div
          className="absolute bottom-0 left-1/2 w-0.5 h-[54%] bg-text-primary origin-bottom rounded-full"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        />
        <div className="absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-text-primary" />
      </div>
      <div className="text-center text-lg font-bold mt-0.5 leading-none">{score}</div>
      <div className="grid grid-cols-3 border-t border-border-subtle pt-1.5 mt-1.5">
        {[
          { label: "卖出", value: limitsFactor?.value },
          { label: "中性", value: ma20Factor?.value },
          { label: "买入", value: breadthFactor?.value },
        ].map((f) => (
          <div key={f.label} className="text-center">
            <span className="block text-[11px] text-text-tertiary mb-0.5">{f.label}</span>
            <strong className="text-base font-medium">{f.value ?? "--"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
