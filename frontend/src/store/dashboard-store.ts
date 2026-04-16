import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface DashboardState {
  selectedSectorCode: string;
  selectedStockCode: string;
  setSelectedSectorCode: (code: string) => void;
  setSelectedStockCode: (code: string) => void;

  // 筛选阈值
  amountThreshold: number;  // 成交额 ≥ N 亿
  rs120Threshold: number;   // RS120 ≥ M
  setAmountThreshold: (v: number) => void;
  setRs120Threshold: (v: number) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      selectedSectorCode: "",
      selectedStockCode: "",
      setSelectedSectorCode: (code) => set({ selectedSectorCode: code, selectedStockCode: "" }),
      setSelectedStockCode: (code) => set({ selectedStockCode: code }),

      amountThreshold: 8,
      rs120Threshold: 87,
      setAmountThreshold: (v) => set({ amountThreshold: v }),
      setRs120Threshold: (v) => set({ rs120Threshold: v }),
    }),
    {
      name: "dashboard-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        amountThreshold: state.amountThreshold,
        rs120Threshold: state.rs120Threshold,
      }),
    },
  ),
);
