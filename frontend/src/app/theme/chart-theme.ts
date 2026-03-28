export function getChartTheme(isDark: boolean) {
  return {
    layout: {
      background: { color: isDark ? "#1a1d27" : "#ffffff" },
      textColor: isDark ? "#787b86" : "#6b7280",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: isDark ? "#2a2e3a" : "#f0f0f0" },
      horzLines: { color: isDark ? "#2a2e3a" : "#f0f0f0" },
    },
    crosshair: {
      vertLine: { color: isDark ? "#555963" : "#9aa1ad", width: 1 as const, style: 2 as const },
      horzLine: { color: isDark ? "#555963" : "#9aa1ad", width: 1 as const, style: 2 as const },
    },
    rightPriceScale: {
      borderColor: isDark ? "#2a2e3a" : "#e8eaee",
    },
    timeScale: {
      borderColor: isDark ? "#2a2e3a" : "#e8eaee",
    },
  };
}

export const candleColors = {
  up: "#f23645",
  down: "#089981",
  upWick: "#f23645",
  downWick: "#089981",
};
