import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletePriceAlert, getPriceAlerts } from "@/services";
import type { TradePlanItem } from "@/shared/types";

type TradePlanPatch = {
  realTakeProfit?: number | null;
};

const REAL_TP_KEY = "trade-plan:real-take-profit:v1";

function loadRealTakeProfitMap(): Record<string, number | null> {
  try {
    const raw = localStorage.getItem(REAL_TP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number | null>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRealTakeProfitMap(map: Record<string, number | null>): void {
  localStorage.setItem(REAL_TP_KEY, JSON.stringify(map));
}

function calcR(entry: number, stop: number | null, target: number | null): number | null {
  if (stop == null || target == null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) return null;
  const risk = entry - stop;
  if (risk <= 0) return null;
  return (target - entry) / risk;
}

export function useTradePlans() {
  return useQuery({
    queryKey: ["trade-plans"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await getPriceAlerts();
      const realTpMap = loadRealTakeProfitMap();
      const items: TradePlanItem[] = (res.items ?? []).map((alert) => {
        const realTakeProfit = Object.prototype.hasOwnProperty.call(realTpMap, String(alert.id))
          ? realTpMap[String(alert.id)]
          : null;
        const planR = calcR(alert.entryPrice, alert.stopLoss, alert.takeProfit);
        const realR = calcR(alert.entryPrice, alert.stopLoss, realTakeProfit);
        return {
          id: alert.id,
          tsCode: alert.tsCode,
          stockName: alert.stockName,
          entryPrice: alert.entryPrice,
          stopLoss: alert.stopLoss,
          takeProfit: alert.takeProfit,
          riskReward: planR,
          planRiskReward: planR,
          realTakeProfit,
          realRiskReward: realR,
          status: alert.status,
          createdAt: alert.createdAt,
          updatedAt: alert.updatedAt,
        };
      });
      return items;
    },
  });
}

export function useDeleteTradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await deletePriceAlert(id);
      const map = loadRealTakeProfitMap();
      if (Object.prototype.hasOwnProperty.call(map, String(id))) {
        delete map[String(id)];
        saveRealTakeProfitMap(map);
      }
      return { ok: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-plans"] }),
  });
}

export function useUpdateTradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TradePlanPatch }) => {
      if (!Object.prototype.hasOwnProperty.call(data, "realTakeProfit")) {
        return { ok: true };
      }
      const map = loadRealTakeProfitMap();
      map[String(id)] = data.realTakeProfit ?? null;
      saveRealTakeProfitMap(map);
      return { ok: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-plans"] }),
  });
}
