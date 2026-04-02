import { cn } from "@/lib/utils";
import { IntradayMarketContextBar } from "./market-context-bar";
import { IntradayStockResearchPanel } from "./stock-research-panel";
import type { IntradayResearchWorkspaceProps } from "./types";

export function IntradayResearchWorkspace({
  overview,
  selectedSector,
  selectedStock,
  score,
  className,
}: IntradayResearchWorkspaceProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <IntradayMarketContextBar
        overview={overview}
        selectedSector={selectedSector}
        selectedStock={selectedStock}
      />
      <IntradayStockResearchPanel
        score={score}
        stock={selectedStock}
        sector={selectedSector}
      />
    </div>
  );
}
