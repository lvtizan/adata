import { create } from "zustand";

interface DashboardState {
  selectedSectorCode: string;
  selectedStockCode: string;
  setSelectedSectorCode: (code: string) => void;
  setSelectedStockCode: (code: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedSectorCode: "",
  selectedStockCode: "",
  setSelectedSectorCode: (code) => set({ selectedSectorCode: code, selectedStockCode: "" }),
  setSelectedStockCode: (code) => set({ selectedStockCode: code }),
}));
