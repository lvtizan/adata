import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import { useStockChart, useRelativeStrength, useStockPatterns } from "@/queries";
import { getChartTheme, getCandleColors } from "@/app/theme/chart-theme";
import { useAppStore } from "@/store";

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
}

function toChartDate(value: string): string {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

// ═══════════════════════════════════════
//  Canvas 画中画 — 纯 Canvas 绘制 RS 曲线
// ═══════════════════════════════════════

interface RsPipProps {
  rsData: any;
  stockName?: string;
  isDark: boolean;
}

function RsPip({ rsData, stockName, isDark }: RsPipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = isDark ? "rgba(15,17,22,0.92)" : "rgba(255,255,255,0.94)";
    ctx.fillRect(0, 0, w, h);

    const stockPts: number[] = (rsData?.stock?.rpsSeries || []).map((p: any) => p.value);
    const sectorPts: number[] = (rsData?.sector?.rpsSeries || []).map((p: any) => p.value);
    const maxLen = Math.max(stockPts.length, sectorPts.length);

    if (maxLen < 2) {
      // 无数据
      ctx.fillStyle = isDark ? "#4b5563" : "#9ca3af";
      ctx.font = "10px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RS 数据加载中...", w / 2, h / 2);
      return;
    }

    // 计算范围
    const allVals = [...stockPts, ...sectorPts].filter((v) => Number.isFinite(v));
    let minVal = Math.min(...allVals);
    let maxVal = Math.max(...allVals);
    if (maxVal - minVal < 5) {
      const mid = (maxVal + minVal) / 2;
      minVal = mid - 5;
      maxVal = mid + 5;
    }
    const pad = (maxVal - minVal) * 0.1;
    minVal -= pad;
    maxVal += pad;

    const plotTop = 22;
    const plotBottom = h - 22;
    const plotLeft = 6;
    const plotRight = w - 36;
    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;

    // 网格线
    ctx.strokeStyle = isDark ? "#1e2130" : "#f0f0f0";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = plotTop + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    // 右侧刻度
    ctx.fillStyle = isDark ? "#4b5563" : "#9ca3af";
    ctx.font = "9px SF Mono, Monaco, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = plotTop + (plotH / 4) * i;
      const val = maxVal - ((maxVal - minVal) / 4) * i;
      ctx.fillText(val.toFixed(0), w - 4, y + 3);
    }

    // 画线函数
    const drawLine = (pts: number[], color: string, lineWidth: number) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = plotLeft + (i / (maxLen - 1)) * plotW;
        const y = plotTop + ((maxVal - pts[i]) / (maxVal - minVal)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 末尾圆点
      const lastX = plotLeft + ((pts.length - 1) / (maxLen - 1)) * plotW;
      const lastY = plotTop + ((maxVal - pts[pts.length - 1]) / (maxVal - minVal)) * plotH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    // 先画板块（蓝），再画个股（红）— 个股在上层
    drawLine(sectorPts, "#2962ff", 1.2);
    drawLine(stockPts, "#f23645", 1.5);

    // 标题
    ctx.font = "bold 9px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = isDark ? "#6b7280" : "#9ca3af";
    ctx.fillText("RS 相对强度", plotLeft, 13);

    // 最新值标注
    const drawLabel = (pts: number[], color: string, yOffset: number) => {
      if (pts.length === 0) return;
      const val = pts[pts.length - 1];
      const x = plotLeft + ((pts.length - 1) / (maxLen - 1)) * plotW + 6;
      const y = plotTop + ((maxVal - val) / (maxVal - minVal)) * plotH;
      ctx.fillStyle = color;
      ctx.font = "bold 10px SF Mono, Monaco, monospace";
      ctx.textAlign = "left";
      ctx.fillText(val.toFixed(1), Math.min(x, plotRight - 28), y + yOffset);
    };

    // 调整标签位置避免重叠
    if (stockPts.length > 0 && sectorPts.length > 0) {
      const stockLast = stockPts[stockPts.length - 1];
      const sectorLast = sectorPts[sectorPts.length - 1];
      const diff = Math.abs(
        ((maxVal - stockLast) / (maxVal - minVal)) * plotH -
        ((maxVal - sectorLast) / (maxVal - minVal)) * plotH
      );
      if (diff < 14) {
        // 太近，上下错开
        drawLabel(stockPts, "#f23645", stockLast > sectorLast ? -4 : 12);
        drawLabel(sectorPts, "#2962ff", sectorLast > stockLast ? -4 : 12);
      } else {
        drawLabel(stockPts, "#f23645", 3);
        drawLabel(sectorPts, "#2962ff", 3);
      }
    } else {
      drawLabel(stockPts, "#f23645", 3);
      drawLabel(sectorPts, "#2962ff", 3);
    }

    // 底部图例
    const legendY = h - 6;
    ctx.font = "9px -apple-system, sans-serif";

    // 个股
    ctx.fillStyle = "#f23645";
    ctx.beginPath();
    ctx.arc(plotLeft + 4, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? "#787b86" : "#9aa1ad";
    ctx.textAlign = "left";
    ctx.fillText(stockName || "个股", plotLeft + 10, legendY);

    // 板块
    const sectorLabelX = plotLeft + 10 + ctx.measureText(stockName || "个股").width + 12;
    ctx.fillStyle = "#2962ff";
    ctx.beginPath();
    ctx.arc(sectorLabelX, legendY - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? "#787b86" : "#9aa1ad";
    ctx.fillText("板块", sectorLabelX + 6, legendY);

  }, [rsData, stockName, isDark]);

  useEffect(() => {
    draw();
  }, [draw]);

  // 响应尺寸变化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}


// ═══════════════════════════════════════
//  主图组件
// ═══════════════════════════════════════

export function WatchlistChart({ tsCode, sectorCode, stockName }: WatchlistChartProps) {
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  const priceRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const priceChartRef = useRef<IChartApi | null>(null);
  const lowerChartRef = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  const { data: stockData, isLoading: stockLoading, error: stockError } = useStockChart(tsCode);
  const { data: rsData, isFetching: rsFetching } = useRelativeStrength(tsCode, sectorCode);
  const { data: patternData } = useStockPatterns(tsCode);

  // RS 不阻塞图表渲染 — K 线先显示，RS 小窗异步加载
  const loading = stockLoading;
  const error = stockError ? (stockError as Error).message : "";

  // Create charts — only price + volume
  useLayoutEffect(() => {
    if (!priceRef.current || !lowerRef.current) return;

    const borderColor = isDark ? "#2a2e3a" : "#e8eaee";
    const baseOpts = {
      autoSize: true,
      ...getChartTheme(isDark),
      rightPriceScale: { borderColor, scaleMargins: { top: 0.08, bottom: 0.12 } },
      timeScale: { borderColor, timeVisible: false },
    };

    const priceChart = createChart(priceRef.current, baseOpts);
    const lowerChart = createChart(lowerRef.current, baseOpts);

    const cc = getCandleColors(isDark);
    candleSeriesRef.current = priceChart.addSeries(CandlestickSeries, {
      upColor: cc.up,
      downColor: cc.down,
      wickUpColor: cc.upWick,
      wickDownColor: cc.downWick,
      borderUpColor: cc.upBorder,
      borderDownColor: cc.downBorder,
    });

    volumeSeriesRef.current = lowerChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Sync time ranges
    let lock = false;
    const syncCharts = (source: IChartApi, targets: IChartApi[]) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (lock || !range) return;
        lock = true;
        targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range));
        lock = false;
      });
    };
    syncCharts(priceChart, [lowerChart]);
    syncCharts(lowerChart, [priceChart]);

    priceChartRef.current = priceChart;
    lowerChartRef.current = lowerChart;

    return () => {
      priceChart.remove();
      lowerChart.remove();
      priceChartRef.current = null;
      lowerChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [isDark]);

  const prevTsCodeRef = useRef(tsCode);

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !stockData) return;

    if (prevTsCodeRef.current !== tsCode) {
      prevTsCodeRef.current = tsCode;
      createSeriesMarkers(candleSeriesRef.current, []);
    }

    const points = (stockData.points || []).filter(
      (p) => [p.open, p.high, p.low, p.close].every((v) => Number.isFinite(v) && v > 0)
    );

    const candles = points.map((p) => ({
      time: toChartDate(p.time),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    const volumes = points.map((p) => ({
      time: toChartDate(p.time),
      value: p.amount != null && Number.isFinite(p.amount) ? p.amount : p.volume,
      color: p.close >= p.open
        ? (isDark ? "rgba(209,212,220,0.35)" : "rgba(26,26,26,0.18)")
        : (isDark ? "rgba(209,212,220,0.55)" : "rgba(26,26,26,0.45)"),
    }));

    const candleTimes = new Set(candles.map((c) => c.time));

    candleSeriesRef.current?.setData(candles);

    // ── 标记 ──
    if (candleSeriesRef.current) {
      const allMarkers: Array<{
        time: string;
        position: "aboveBar" | "belowBar";
        color: string;
        shape: "arrowUp" | "arrowDown" | "circle";
        text: string;
        size?: number;
      }> = [];

      if (patternData?.signals) {
        for (const s of patternData.signals) {
          if (!s.date || !candleTimes.has(toChartDate(s.date))) continue;
          const isH1 = s.type === "H1";
          const isBuy = !!s.buySignal;
          allMarkers.push({
            time: toChartDate(s.date),
            position: "aboveBar",
            color: isBuy ? "#22c55e" : isH1 ? "#6b7280" : "#f59e0b",
            shape: "arrowUp",
            text: isBuy ? `${s.type}★` : s.type,
          });
        }
      }

      if (patternData?.drawdowns) {
        for (const dd of patternData.drawdowns) {
          if (!dd.date || !candleTimes.has(toChartDate(dd.date))) continue;
          allMarkers.push({
            time: toChartDate(dd.date),
            position: "belowBar",
            color: "#ef4444",
            shape: "circle",
            size: 0.5,
            text: `${dd.pct > 0 ? "+" : ""}${dd.pct}%`,
          });
        }
      }

      allMarkers.sort((a, b) => (a.time < b.time ? -1 : 1));
      createSeriesMarkers(candleSeriesRef.current, allMarkers);
    }

    volumeSeriesRef.current?.setData(volumes);

    // ── 支撑/压力线 ──
    if (candleSeriesRef.current) {
      const series = candleSeriesRef.current;

      // 清除旧的 price lines
      for (const line of priceLinesRef.current) {
        try { series.removePriceLine(line); } catch { /* ignore */ }
      }
      priceLinesRef.current = [];

      // 压力位 — 红色实线 + "压力" 标签
      if (patternData?.resistances) {
        for (const res of patternData.resistances) {
          priceLinesRef.current.push(series.createPriceLine({
            price: res.price,
            color: "#ef4444",
            lineWidth: 1,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: res.count >= 2 ? `压力 ×${res.count}` : "压力",
            axisLabelColor: "#ef4444",
            axisLabelTextColor: "#ffffff",
          }));
        }
      }

      // 支撑位 — 绿色虚线 + "支撑" 标签
      if (patternData?.supports) {
        for (const sup of patternData.supports) {
          priceLinesRef.current.push(series.createPriceLine({
            price: sup.price,
            color: "#22c55e",
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: sup.count >= 2 ? `支撑 ×${sup.count}` : "支撑",
            axisLabelColor: "#22c55e",
            axisLabelTextColor: "#ffffff",
          }));
        }
      }
    }

    priceChartRef.current?.timeScale().fitContent();
    lowerChartRef.current?.timeScale().fitContent();
  }, [tsCode, stockData, patternData]);

  // ── 画压力顶圆圈 (Canvas overlay) ──
  const drawResistanceCircles = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const chart = priceChartRef.current;
    const series = candleSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!patternData?.resistances) return;

    const radius = 18; // 圆圈半径

    for (const res of patternData.resistances) {
      if (!res.touches) continue;
      for (const touch of res.touches) {
        try {
          const timeStr = toChartDate(touch.date);
          // @ts-ignore — lightweight-charts v5 coordinate API
          const x = chart.timeScale().timeToCoordinate(timeStr);
          const y = series.priceToCoordinate(touch.price);
          if (x == null || y == null || x < 0 || y < 0) continue;

          // 半透明红色圆圈
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
          ctx.fill();
          ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } catch {
          // coordinate conversion may fail for out-of-view points
        }
      }
    }
  }, [patternData]);

  // 重绘圆圈：数据变化时 + 图表滚动/缩放时
  useEffect(() => {
    drawResistanceCircles();

    const chart = priceChartRef.current;
    if (!chart) return;

    // 滚动/缩放时重绘
    const handler = () => { drawResistanceCircles(); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      } catch { /* chart may be disposed */ }
    };
  }, [drawResistanceCircles, stockData]);

  // 容器大小变化时重绘
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawResistanceCircles());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawResistanceCircles]);

  return (
    <div className="flex flex-col h-full">
      {/* 主图区 — K 线 + Canvas 画中画，占 80% 高度 */}
      <div className="relative flex-[4] min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            加载中...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-state-up text-sm z-10 bg-canvas/80">
            {error}
          </div>
        )}
        <div ref={priceRef} className="w-full h-full" />

        {/* 压力顶圆圈叠加层 — 覆盖在K线图上 */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 5 }}
        />

        {/* ── Canvas 画中画 RS 曲线 ── */}
        <div
          className="absolute z-20 rounded-md overflow-hidden shadow-sm"
          style={{
            top: 8,
            left: 8,
            width: 220,
            height: 130,
            border: `1px solid ${isDark ? "#2a2e3a" : "#d7dce4"}`,
          }}
        >
          <RsPip rsData={rsData} stockName={stockName} isDark={isDark} />
        </div>
      </div>

      {/* 成交额 — 占 20% 高度 */}
      <div className="relative flex-1 min-h-0">
        <div ref={lowerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
