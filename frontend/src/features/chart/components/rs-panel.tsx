import { useEffect, useRef, useCallback } from "react";
import { ChartShell } from "@/shared/charts";
import { useRelativeStrength } from "@/queries";
import { useAppStore } from "@/store";
import { getChartColors } from "@/app/theme/chart-theme";
import { cn } from "@/lib/utils";

interface RsPanelProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  sectorName?: string;
}

/**
 * 纯 Canvas 实现的 RS 双线对比图。
 * 不依赖 lightweight-charts / klinecharts —— 两条折线用不着上大炮。
 */
export function RsPanel({ tsCode, sectorCode, stockName, sectorName }: RsPanelProps) {
  const { data, isLoading, error } = useRelativeStrength(tsCode, sectorCode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const colors = getChartColors(isDark);

    // 清除背景
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    const stockPts: number[] = (data.stock?.rpsSeries || []).map((p: any) => p.value);
    const sectorPts: number[] = (data.sector?.rpsSeries || []).map((p: any) => p.value);
    const maxLen = Math.max(stockPts.length, sectorPts.length);
    if (maxLen < 2) return;

    // 计算值域
    const allVals = [...stockPts, ...sectorPts];
    let minV = Math.min(...allVals);
    let maxV = Math.max(...allVals);
    if (maxV - minV < 5) {
      const mid = (maxV + minV) / 2;
      minV = mid - 5;
      maxV = mid + 5;
    }

    const pad = { top: 16, bottom: 24, left: 36, right: 12 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // 网格线
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Y 轴标签
      const val = maxV - ((maxV - minV) / gridLines) * i;
      ctx.fillStyle = colors.text;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(0), pad.left - 4, y + 4);
    }

    function drawLine(pts: number[], color: string, lineW: number) {
      if (pts.length < 2) return;
      ctx!.beginPath();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = lineW;
      for (let i = 0; i < pts.length; i++) {
        const x = pad.left + (i / (maxLen - 1)) * chartW;
        const y = pad.top + ((maxV - pts[i]) / (maxV - minV)) * chartH;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();
    }

    // 板块线（蓝，较粗但在底层）
    drawLine(sectorPts, "#2962ff", 1.5);
    // 个股线（红，在上层）
    drawLine(stockPts, "#f23645", 2);
  }, [data, isDark]);

  useEffect(() => {
    draw();
  }, [draw]);

  // 容器大小变化时重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const summary = data?.summary;

  return (
    <ChartShell
      title="相对强弱"
      subtitle={stockName && sectorName ? `${stockName} vs ${sectorName}` : undefined}
      loading={isLoading}
      error={error?.message}
      empty={!tsCode || !sectorCode ? "选择个股后显示" : undefined}
      actions={
        summary ? (
          <div className="flex gap-1.5">
            {[
              { label: `5日 ${summary.relativeStrength5d}` },
              { label: `10日 ${summary.relativeStrength10d}` },
              { label: summary.label, emphasis: true },
            ].map((b, i) => (
              <span
                key={i}
                className={cn(
                  "px-2 py-1 text-xs border border-border-default rounded-sm",
                  b.emphasis && "text-accent border-accent/30 bg-accent-soft"
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      <canvas ref={canvasRef} className="w-full" style={{ height: 200 }} />
      {data && (
        <div className="flex gap-3 px-3 pb-2 text-xs text-text-secondary">
          <span><span className="inline-block w-2 h-2 rounded-full bg-state-up mr-1" />{stockName || "个股"} RPS</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-accent mr-1" />{sectorName || "板块"} RPS</span>
        </div>
      )}
    </ChartShell>
  );
}
