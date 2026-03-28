import { create } from "zustand";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  rightPanelOpen: boolean;
  leftRailCollapsed: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleRightPanel: () => void;
  setLeftRailCollapsed: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: (localStorage.getItem("theme") as Theme) || "light",
  rightPanelOpen: true,
  leftRailCollapsed: false,
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),
  setTheme: (t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    set({ theme: t });
  },
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftRailCollapsed: (v) => set({ leftRailCollapsed: v }),
}));
