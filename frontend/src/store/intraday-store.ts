import { create } from "zustand";

interface IntradayState {
  selectedSectorCode: string;
  selectedStockCode: string;
  setSelectedSectorCode: (code: string) => void;
  setSelectedStockCode: (code: string) => void;
}

export const useIntradayStore = create<IntradayState>((set) => ({
  selectedSectorCode: "",
  selectedStockCode: "",
  setSelectedSectorCode: (code) => set({ selectedSectorCode: code, selectedStockCode: "" }),
  setSelectedStockCode: (code) => set({ selectedStockCode: code }),
}));
