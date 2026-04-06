import { useRef, useEffect, useCallback, useMemo } from "react";

// ── 类型 ──
export interface LineSeriesData {
  label: string;
  color: string;
  data: Array<{ time: string; value: number }>;
  enabled?: boolean;
  endLabel?: string; // 末尾标签，如 "RS 85"
}

interface LineCompareChartProps {
  series: LineSeriesData[];
  height?: number;
  yLabel?: string;
  showLegend?: boolean;
  onToggleSeries?: (label: string) => void;
}

// ── 颜色 ──
const PALETTE = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#14b8a6",
];

// ── 主组件 ──
export function LineCompareChart({
  series,
  height = 400,
  yLabel = "%",
  showLegend = true,
  onToggleSeries,
}: LineCompareChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(800);

  // 只取启用的系列
  const enabledSeries = useMemo(
    () => series.filter((s) => s.enabled !== false && s.data.length > 0),
    [series],
  );

  // 所有日期的并集（排序后）
  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const s of enabledSeries) {
      for (const p of s.data) dateSet.add(p.time);
    }
    return Array.from(dateSet).sort();
  }, [enabledSeries]);

  // Y 轴范围
  const [yMin, yMax] = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const s of enabledSeries) {
      for (const p of s.data) {
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      }
    }
    const pad = Math.max(Math.abs(hi - lo) * 0.1, 1);
    return [lo - pad, hi + pad];
  }, [enabledSeries]);

  // ── 绘制 ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || allDates.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = widthRef.current;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 布局
    const hasEndLabels = enabledSeries.some((s) => s.endLabel);
    const ml = 50, mr = hasEndLabels ? 56 : 16, mt = 16, mb = 30;
    const pw = w - ml - mr;
    const ph = h - mt - mb;

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 背景
    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    const zeroColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

    // 坐标转换
    const xOf = (i: number) => ml + (i / Math.max(allDates.length - 1, 1)) * pw;
    const yOf = (v: number) => mt + (1 - (v - yMin) / (yMax - yMin)) * ph;

    // Y 轴网格 + 标签
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yTicks = 6;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (yMax - yMin) * (i / yTicks);
      const y = yOf(v);
      ctx.strokeStyle = Math.abs(v) < 0.01 ? zeroColor : gridColor;
      ctx.lineWidth = Math.abs(v) < 0.01 ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(ml, y);
      ctx.lineTo(w - mr, y);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(`${v > 0 ? "+" : ""}${v.toFixed(1)}${yLabel}`, ml - 4, y);
    }

    // X 轴标签（每隔 N 个日期显示一个）
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xStep = Math.max(1, Math.floor(allDates.length / 8));
    for (let i = 0; i < allDates.length; i += xStep) {
      const x = xOf(i);
      const d = allDates[i];
      const label = `${d.substring(4, 6)}/${d.substring(6, 8)}`;
      ctx.fillStyle = textColor;
      ctx.fillText(label, x, h - mb + 6);
    }

    // 画线
    const endLabels: Array<{ y: number; label: string; color: string; x: number }> = [];
    for (const s of enabledSeries) {
      const dateMap = new Map(s.data.map((p) => [p.time, p.value]));
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < allDates.length; i++) {
        const v = dateMap.get(allDates[i]);
        if (v === undefined) continue;
        const x = xOf(i);
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // 收集末尾位置用于标签
      const last = s.data[s.data.length - 1];
      if (last) {
        const lastIdx = allDates.indexOf(last.time);
        if (lastIdx >= 0) {
          const lx = xOf(lastIdx);
          const ly = yOf(last.value);
          // 圆点
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(lx, ly, 3, 0, Math.PI * 2);
          ctx.fill();
          // 收集标签
          if (s.endLabel) {
            endLabels.push({ y: ly, label: s.endLabel, color: s.color, x: lx });
          }
        }
      }
    }

    // ── 末尾标签绘制（防重叠）──
    if (endLabels.length > 0) {
      endLabels.sort((a, b) => a.y - b.y);
      const MIN_GAP = 14;
      for (let i = 1; i < endLabels.length; i++) {
        if (endLabels[i].y - endLabels[i - 1].y < MIN_GAP) {
          endLabels[i].y = endLabels[i - 1].y + MIN_GAP;
        }
      }
      // 限制不超出图表底部
      const yBottom = mt + ph;
      for (let i = endLabels.length - 1; i >= 0; i--) {
        if (endLabels[i].y > yBottom) endLabels[i].y = yBottom;
        if (i > 0 && endLabels[i].y - endLabels[i - 1].y < MIN_GAP) {
          endLabels[i - 1].y = endLabels[i].y - MIN_GAP;
        }
      }
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const el of endLabels) {
        ctx.fillStyle = el.color;
        ctx.fillText(el.label, el.x + 6, el.y);
      }
    }
  }, [enabledSeries, allDates, yMin, yMax, height, yLabel]);

  // 监听容器大小
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        widthRef.current = entry.contentRect.width;
        draw();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // 响应数据变化
  useEffect(() => {
    draw();
  }, [draw]);

  // tooltip + 十字线交互
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const tooltip = tooltipRef.current;
      if (!canvas || !overlay || !tooltip || allDates.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const w = widthRef.current;
      const h = height;
      const dpr = window.devicePixelRatio || 1;
      const hasEndLabels = enabledSeries.some((s) => s.endLabel);
      const ml = 50, mr = hasEndLabels ? 56 : 16, mt = 16, mb = 30;
      const pw = w - ml - mr;
      const ph = h - mt - mb;
      const idx = Math.round(((mx - ml) / pw) * (allDates.length - 1));

      // 绘制十字竖线
      overlay.width = w * dpr;
      overlay.height = h * dpr;
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
      const octx = overlay.getContext("2d");
      if (octx) {
        octx.scale(dpr, dpr);
        octx.clearRect(0, 0, w, h);
        if (idx >= 0 && idx < allDates.length) {
          const xPos = ml + (idx / Math.max(allDates.length - 1, 1)) * pw;
          const isDark = document.documentElement.classList.contains("dark");
          octx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)";
          octx.lineWidth = 1;
          octx.setLineDash([3, 3]);
          octx.beginPath();
          octx.moveTo(xPos, mt);
          octx.lineTo(xPos, mt + ph);
          octx.stroke();
          octx.setLineDash([]);

          // 每条线在竖线位置画小圆点
          for (const s of enabledSeries) {
            const dateMap = new Map(s.data.map((p) => [p.time, p.value]));
            const v = dateMap.get(allDates[idx]);
            if (v !== undefined) {
              const yPos = mt + (1 - (v - yMin) / (yMax - yMin)) * ph;
              octx.fillStyle = s.color;
              octx.beginPath();
              octx.arc(xPos, yPos, 4, 0, Math.PI * 2);
              octx.fill();
            }
          }
        }
      }

      if (idx < 0 || idx >= allDates.length) {
        tooltip.style.display = "none";
        return;
      }

      const date = allDates[idx];
      const dateLabel = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
      let html = `<div class="text-xs text-text-secondary mb-1">${dateLabel}</div>`;
      for (const s of enabledSeries) {
        const v = s.data.find((p) => p.time === date);
        if (v) {
          const sign = v.value >= 0 ? "+" : "";
          html += `<div class="flex items-center gap-1.5 text-xs"><span style="color:${s.color}">●</span> ${s.label}: <span class="font-mono">${sign}${v.value.toFixed(2)}%</span></div>`;
        }
      }

      tooltip.innerHTML = html;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(mx + 12, w - 180)}px`;
      tooltip.style.top = "16px";
    },
    [enabledSeries, allDates, yMin, yMax, height],
  );

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
    // 清除十字线
    const overlay = overlayRef.current;
    if (overlay) {
      const octx = overlay.getContext("2d");
      if (octx) octx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* 图表容器 */}
      <div ref={containerRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height }}
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full cursor-crosshair"
          style={{ height }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div
          ref={tooltipRef}
          className="absolute hidden bg-canvas/95 backdrop-blur-sm border border-border-default rounded-md px-2.5 py-1.5 shadow-md pointer-events-none z-20"
          style={{ minWidth: 140 }}
        />
      </div>

      {/* 图例 */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {series.map((s) => {
            const enabled = s.enabled !== false;
            return (
              <button
                key={s.label}
                onClick={() => onToggleSeries?.(s.label)}
                className={`flex items-center gap-1.5 text-xs transition-opacity ${
                  enabled ? "opacity-100" : "opacity-35"
                }`}
              >
                <span
                  className="inline-block w-3 h-0.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
