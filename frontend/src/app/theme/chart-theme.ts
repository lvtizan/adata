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

/**
 * 经典黑白空心K线风格：
 *  - 阳线：空心（透明填充 + 深色边框）
 *  - 阴线：实心深色填充
 *  - 影线统一深色
 */
export function getCandleColors(isDark: boolean) {
  const body = isDark ? "#d1d4dc" : "#1a1a1a";
  const bg = isDark ? "#1a1d27" : "#ffffff";
  return {
    up: bg,             // 阳线空心 — 填充透明/背景色
    down: body,         // 阴线实心
    upWick: body,       // 阳线影线
    downWick: body,     // 阴线影线
    upBorder: body,     // 阳线边框
    downBorder: body,   // 阴线边框
  };
}

// 向后兼容：默认深色主题
export const candleColors = getCandleColors(true);
