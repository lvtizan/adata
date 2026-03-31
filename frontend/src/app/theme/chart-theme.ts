/**
 * KLineChart (klinecharts) 主题配置。
 *
 * 项目从 lightweight-charts 迁移到 klinecharts，
 * 本文件提供 dark/light 两套完整样式。
 */

// ── 色板 ────────────────────────────────────────────

function palette(isDark: boolean) {
  const body = isDark ? "#d1d4dc" : "#1a1a1a";
  const bg = isDark ? "#1a1d27" : "#ffffff";
  const grid = isDark ? "#2a2e3a" : "#f0f0f0";
  const border = isDark ? "#2a2e3a" : "#e8eaee";
  const text = isDark ? "#787b86" : "#6b7280";
  const textSecondary = isDark ? "#555963" : "#9aa1ad";
  const crosshair = isDark ? "#555963" : "#9aa1ad";

  return { body, bg, grid, border, text, textSecondary, crosshair };
}

// ── 对外导出 ────────────────────────────────────────

/**
 * 返回 klinecharts setStyles() 需要的完整样式对象。
 * 用法：chart.setStyles(getKLineStyles(isDark))
 */
export function getKLineStyles(isDark: boolean): Record<string, any> {
  const p = palette(isDark);

  return {
    grid: {
      show: true,
      horizontal: { show: true, size: 1, color: p.grid, style: "dashed" as const },
      vertical: { show: false },
    },
    candle: {
      // 经典黑白空心K线风格
      type: "candle_solid" as const,
      bar: {
        upColor: p.bg,            // 阳线空心 → 填充背景色
        downColor: p.body,        // 阴线实心
        upBorderColor: p.body,    // 阳线边框
        downBorderColor: p.body,  // 阴线边框
        upWickColor: p.body,      // 阳线影线
        downWickColor: p.body,    // 阴线影线
        noChangeColor: p.body,
        noChangeBorderColor: p.body,
        noChangeWickColor: p.body,
      },
      priceMark: {
        show: true,
        high: { show: true, color: p.text, textSize: 10 },
        low: { show: true, color: p.text, textSize: 10 },
        last: {
          show: false,
          upColor: "#26a69a",
          downColor: "#ef5350",
          noChangeColor: p.text,
          line: { show: false, style: "dashed" as const, size: 1 },
          text: { show: false, size: 10, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2 },
        },
      },
      tooltip: {
        showRule: "follow_cross" as const,
        showType: "rect" as const,
        text: { size: 11, color: p.text },
        rect: {
          color: isDark ? "rgba(26,29,39,0.92)" : "rgba(255,255,255,0.96)",
          borderColor: p.border,
          borderSize: 1,
          borderRadius: 4,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },
    indicator: {
      tooltip: {
        showRule: "follow_cross" as const,
        text: { size: 11, color: p.text },
      },
      lines: [
        { size: 1, color: "#FF9600" },
        { size: 1, color: "#935EBD" },
        { size: 1, color: "#2196F3" },
        { size: 1, color: "#E91E63" },
        { size: 1, color: "#00BCD4" },
      ],
    },
    xAxis: {
      show: true,
      size: "auto" as const,
      axisLine: { show: true, color: p.border, size: 1 },
      tickLine: { show: true, size: 1, length: 3, color: p.border },
      tickText: { show: true, color: p.text, size: 11 },
    },
    yAxis: {
      show: true,
      size: "auto" as const,
      position: "right" as const,
      type: "normal" as const,
      axisLine: { show: false },
      tickLine: { show: false },
      tickText: { show: true, color: p.text, size: 11 },
    },
    separator: {
      size: 1,
      color: p.border,
      fill: true,
      activeBackgroundColor: isDark ? "rgba(100,100,100,0.15)" : "rgba(0,0,0,0.04)",
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: "dashed" as const, size: 1, color: p.crosshair },
        text: {
          show: true,
          size: 10,
          color: "#fff",
          backgroundColor: isDark ? "#555963" : "#6b7280",
          borderRadius: 2,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
      vertical: {
        show: true,
        line: { show: true, style: "dashed" as const, size: 1, color: p.crosshair },
        text: {
          show: true,
          size: 10,
          color: "#fff",
          backgroundColor: isDark ? "#555963" : "#6b7280",
          borderRadius: 2,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    },
    overlay: {
      point: {
        color: "#1677FF",
        borderColor: "rgba(22,119,255,0.35)",
        borderSize: 1,
        radius: 5,
        activeColor: "#1677FF",
        activeBorderColor: "rgba(22,119,255,0.35)",
        activeBorderSize: 3,
        activeRadius: 5,
      },
      line: { color: "#1677FF", size: 1, style: "solid" as const },
      rect: { color: "rgba(22,119,255,0.25)", borderColor: "#1677FF", borderSize: 1 },
      text: { color: p.text, size: 12, borderColor: p.border, borderSize: 1, backgroundColor: isDark ? "#2a2e3a" : "#f8f8f8", borderRadius: 2 },
    },
  };
}

/**
 * 返回 klinecharts init() 的选项。
 */
export function getKLineInitOptions(isDark: boolean) {
  return {
    styles: getKLineStyles(isDark),
    locale: "zh-CN",
    customApi: {
      formatDate: (dateTimeFormat: Intl.DateTimeFormat, timestamp: number, _pattern: string, _type: string) => {
        const d = new Date(timestamp);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      },
    },
  };
}

// ── 向后兼容（RS panel 纯 canvas 使用的色板） ──────

export function getChartColors(isDark: boolean) {
  return palette(isDark);
}

/**
 * 将 YYYYMMDD 字符串转为毫秒时间戳（UTC 0 时）。
 * klinecharts 的 data.timestamp 需要毫秒。
 */
export function dateToTimestamp(yyyymmdd: string): number {
  if (!yyyymmdd || yyyymmdd.length < 8) return 0;
  const clean = yyyymmdd.replace(/-/g, "");
  const y = parseInt(clean.slice(0, 4), 10);
  const m = parseInt(clean.slice(4, 6), 10) - 1;
  const d = parseInt(clean.slice(6, 8), 10);
  return Date.UTC(y, m, d);
}
