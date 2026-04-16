import { useDashboardStore } from "@/store";
import { ThresholdInput } from "@/shared/ui/threshold-input";

export function StockFilterBar() {
  const amountThreshold = useDashboardStore((s) => s.amountThreshold);
  const rs120Threshold = useDashboardStore((s) => s.rs120Threshold);
  const setAmountThreshold = useDashboardStore((s) => s.setAmountThreshold);
  const setRs120Threshold = useDashboardStore((s) => s.setRs120Threshold);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <ThresholdInput
        label="成交额 ≥"
        value={amountThreshold}
        onChange={setAmountThreshold}
        min={0}
        step={0.5}
        suffix="亿"
      />
      <ThresholdInput
        label="RS120 ≥"
        value={rs120Threshold}
        onChange={setRs120Threshold}
        min={0}
        max={100}
      />
    </div>
  );
}
