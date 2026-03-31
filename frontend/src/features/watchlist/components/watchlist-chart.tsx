import { useEffect, useRef, useState, useCallback } from "react";
import { type Chart } from "klinecharts";
import { useStockChart, useRelativeStrength, useStockPatterns, useChartDrawings } from "@/queries";
import { useAppStore } from "@/store";
import { KlineChart } from "@/shared/charts";
import { clearLocalDrawings, readLocalDrawings, writeLocalDrawings } from "@/lib/chart-drawings";
import { saveChartDrawings, clearChartDrawings } from "@/services";
import type { ChartDrawingOverlay, RelativeStrengthData } from "@/shared/types";

// ── RS 迷你双线图 ──
function RsMiniChart({ rsData, stockName }: { rsData: RelativeStrengthData; stockName?: string }) {
  const W = 150, H = 60;
  const stockSeries = rsData.stock.rpsSeries;
  const sectorSeries = rsData.sector.rpsSeries;
  if (!stockSeries.length) return null;

  const allValues = [...stockSeries.map((p) => p.value), ...sectorSeries.map((p) => p.value)];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;

  const toPath = (series: typeof stockSeries) =>
    series.map((p, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * W;
      const y = H - ((p.value - minV) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  const stockPath = toPath(stockSeries);
  const sectorPath = toPath(sectorSeries);
  const lastStock = stockSeries[stockSeries.length - 1]?.value ?? 0;
  const lastSector = sectorSeries[sectorSeries.length - 1]?.value ?? 0;

  return (
    <div
      className="absolute z-20 rounded overflow-hidden opacity-70 hover:opacity-100 transition-opacity bg-canvas/90 border border-border-default p-2"
      style={{ top: 38, left: 8, width: W + 20 }}
    >
      <div className="text-[10px] text-text-tertiary mb-0.5">RS 相对强度</div>
      <svg width={W} height={H} className="block">
        <path d={sectorPath} fill="none" stroke="#3b82f6" strokeWidth={1.2} opacity={0.6} />
        <path d={stockPath} fill="none" stroke="#ef4444" strokeWidth={1.5} />
      </svg>
      <div className="flex items-center justify-between mt-1 text-[9px]">
        <span className="text-state-up">{lastStock.toFixed(1)}</span>
        <span className="text-text-quaternary">{rsData.summary.label}</span>
        <span className="text-blue-500">{lastSector.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-quaternary">
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-0.5 bg-red-500 rounded" />{stockName || rsData.stock.name}</span>
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-0.5 bg-blue-500 rounded" />{rsData.sector.name}</span>
      </div>
    </div>
  );
}

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  activeTool?: string | null;
  onSelectionChange?: (selection: { id: string | null; locked: boolean; name: string | null }) => void;
  onDrawingsChange?: (overlays: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>) => void;
}

const FREQ_OPTIONS = [
  { value: "1d", label: "日" },
  { value: "1w", label: "周" },
  { value: "1M", label: "月" },
] as const;

export function WatchlistChart({ tsCode, sectorCode, stockName, activeTool, onSelectionChange, onDrawingsChange }: WatchlistChartProps) {
  const [frequency, setFrequency] = useState<string>("1d");
  const [buyMode, setBuyMode] = useState(false);
  const chartRef = useRef<Chart | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  const barsMap: Record<string, number> = { "1d": 120, "1w": 104, "1M": 60 };
  const { data: stockData, isLoading, error: stockError } = useStockChart(tsCode, barsMap[frequency] ?? 120, frequency);
  const { data: rsData } = useRelativeStrength(tsCode, sectorCode);
  const { data: patternData } = useStockPatterns(tsCode);
  const { data: drawingsDoc } = useChartDrawings(tsCode, "stock", "1d");

  // 读取保存的画线
  const [savedDrawings, setSavedDrawings] = useState<ChartDrawingOverlay[]>([]);
  useEffect(() => {
    const local = readLocalDrawings(tsCode, "stock", "1d");
    const remote = drawingsDoc?.overlays ?? [];
    setSavedDrawings(local.length > 0 ? local : remote);
  }, [tsCode, drawingsDoc]);

  // 画线变更：自动保存
  const handleDrawingsChange = useCallback((overlays: ChartDrawingOverlay[]) => {
    writeLocalDrawings(tsCode, "stock", "1d", overlays);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveChartDrawings(tsCode, overlays, "stock", "1d");
    }, 2000);
    // 通知父组件
    onDrawingsChange?.(overlays.map((o) => ({
      id: o.id ?? "", name: o.name, lock: o.lock ?? false, points: o.points?.length ?? 0, label: o.name,
    })));
  }, [tsCode, onDrawingsChange]);

  // 买入模式：点击图表选价位（用K线数据的价格范围手动算）
  useEffect(() => {
    if (!buyMode || !stockData?.points?.length) return;
    const container = chartContainerRef.current;
    const chart = chartRef.current as any;
    if (!container || !chart) return;

    container.style.cursor = "crosshair";

    // 计算可见价格范围
    const pts = stockData.points;
    const allHighs = pts.map((p) => p.high);
    const allLows = pts.map((p) => p.low);
    const maxPrice = Math.max(...allHighs);
    const minPrice = Math.min(...allLows);

    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setBuyMode(false); };
    window.addEventListener("keydown", onKeyDown);

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const chartHeight = rect.height * 0.78; // K线主图区域约占78%（剩余是成交量）
      const ratio = Math.max(0, Math.min(1, y / chartHeight));
      const price = maxPrice - ratio * (maxPrice - minPrice);
      if (price <= 0) { setBuyMode(false); return; }

      const entry = +price.toFixed(2);
      const supports = patternData?.supports ?? [];
      const below = supports.filter((s: any) => s.price < entry).sort((a: any, b: any) => b.price - a.price);
      const sl = below.length > 0 ? +below[0].price.toFixed(2) : +(entry * 0.95).toFixed(2);
      const risk = entry - sl;
      if (risk <= 0) { setBuyMode(false); return; }
      const tp = +(entry + risk * 2).toFixed(2);

      // 入场线（蓝色）
      chart.createOverlay({ name: "horizontalStraightLine", lock: true, points: [{ value: entry }], styles: { line: { color: "#3b82f6", size: 1.5, style: "solid" } } });
      chart.createOverlay({ name: "leftTag", lock: true, points: [{ value: entry }], extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } });
      // 止损线（红色）
      chart.createOverlay({ name: "horizontalStraightLine", lock: true, points: [{ value: sl }], styles: { line: { color: "#ef4444", size: 1, style: "dashed" } } });
      chart.createOverlay({ name: "leftTag", lock: true, points: [{ value: sl }], extendData: { text: `止损 ${sl}`, color: "#ffffff", bg: "rgba(239,68,68,0.85)" } });
      // 止盈线（绿色）
      chart.createOverlay({ name: "horizontalStraightLine", lock: true, points: [{ value: tp }], styles: { line: { color: "#22c55e", size: 1, style: "dashed" } } });
      chart.createOverlay({ name: "leftTag", lock: true, points: [{ value: tp }], extendData: { text: `止盈 ${tp} (2R)`, color: "#ffffff", bg: "rgba(34,197,94,0.85)" } });

      setBuyMode(false);
    };

    container.addEventListener("click", onClick, { once: true });
    return () => {
      container.style.cursor = "";
      container.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [buyMode, stockData, patternData]);

  // 画线事件
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action: string }>).detail;
      if (!detail || !chartRef.current) return;
      const chart = chartRef.current as any;

      if (detail.action === "addBuyEntry") {
        setBuyMode(true);
        return;
      }

      if (detail.action === "addSupportAtClose" || detail.action === "addResistanceAtClose") {
        const latest = stockData?.points?.[stockData.points.length - 1];
        if (!latest) return;
        const isSup = detail.action === "addSupportAtClose";
        chart.createOverlay({
          id: `${isSup ? "support" : "resistance"}-${Date.now()}`, name: "horizontalStraightLine",
          styles: { line: { color: isSup ? "#22c55e" : "#ef4444", size: 1, style: isSup ? "dashed" : "solid" } },
          points: [{ value: latest.close }],
        });
      }

      if (detail.action === "clearAll") {
        clearLocalDrawings(tsCode, "stock", "1d");
        void clearChartDrawings(tsCode, "stock", "1d");
      }
    };
    window.addEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
    return () => window.removeEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
  }, [tsCode, stockData, patternData]);

  const error = stockError?.message;

  return (
    <div className="flex flex-col h-full">
      {/* 日/周/月切换 */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-default shrink-0">
        {FREQ_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFrequency(opt.value)}
            className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
              frequency === opt.value
                ? "bg-accent/15 text-accent font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-[10px] text-text-quaternary ml-1">
          {frequency === "1d" ? "日线" : frequency === "1w" ? "周线" : "月线"}
        </span>
      </div>

      <div ref={chartContainerRef} className="relative flex-1 min-h-0">
        {buyMode && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-amber-500/90 text-white text-center text-xs py-1 cursor-crosshair">
            点击K线图选择入场价位 · 按 ESC 取消
          </div>
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">加载中...</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-state-up text-sm z-10 bg-canvas/80">{error}</div>
        )}
        {stockData?.points && (
          <KlineChart
            points={stockData.points}
            signals={patternData?.signals}
            drawdowns={patternData?.drawdowns}
            supports={patternData?.supports}
            resistances={patternData?.resistances}
            fengSignals={stockData.fengSignals}
            enableDrawing
            activeTool={activeTool}
            initialDrawings={savedDrawings}
            onDrawingsChange={handleDrawingsChange}
            chartRef={chartRef}
          />
        )}

        {/* RS 相对强弱迷你图 */}
        {rsData && <RsMiniChart rsData={rsData} stockName={stockName} />}
      </div>
    </div>
  );
}
