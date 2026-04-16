import { create } from "zustand";

type Theme = "light" | "dark";
type Locale = "zh-CN" | "en-US";

/** 判断当前是否在工作时间 (工作日 9:00-17:30) */
function isWorkHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const t = h * 60 + m;
  return t >= 9 * 60 && t <= 17 * 60 + 30; // 9:00 ~ 17:30
}

interface AppState {
  theme: Theme;
  locale: Locale;
  rightPanelOpen: boolean;
  leftRailCollapsed: boolean;
  stealthMode: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  toggleRightPanel: () => void;
  toggleLeftRailCollapsed: () => void;
  setLeftRailCollapsed: (v: boolean) => void;
  toggleStealthMode: () => void;
  setStealthMode: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: (localStorage.getItem("theme") as Theme) || "light",
  locale: (localStorage.getItem("locale") as Locale) || "zh-CN",
  rightPanelOpen: false,
  leftRailCollapsed: localStorage.getItem("leftRailCollapsed") === "true",
  // 每次加载根据当前时间判断，工作时间自动开启摸鱼模式
  stealthMode: isWorkHours(),
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
  setLocale: (l) => {
    localStorage.setItem("locale", l);
    set({ locale: l });
  },
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  toggleLeftRailCollapsed: () =>
    set((s) => {
      const next = !s.leftRailCollapsed;
      localStorage.setItem("leftRailCollapsed", String(next));
      return { leftRailCollapsed: next };
    }),
  setLeftRailCollapsed: (v) => {
    localStorage.setItem("leftRailCollapsed", String(v));
    set({ leftRailCollapsed: v });
  },
  toggleStealthMode: () =>
    set((s) => ({ stealthMode: !s.stealthMode })),
  setStealthMode: (v) => set({ stealthMode: v }),
}));
