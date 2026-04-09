import { useEffect, useRef, useState, useCallback } from "react";
import { type Chart } from "klinecharts";
import { useStockChart, useRelativeStrength, useStockPatterns, useChartDrawings } from "@/queries";
import { useAppStore } from "@/store";
import { KlineChart } from "@/shared/charts";
import { clearLocalDrawings, readLocalDrawings, writeLocalDrawings } from "@/lib/chart-drawings";
import { saveChartDrawings, clearChartDrawings, createPriceAlert } from "@/services";
import type { ChartDrawingOverlay, RelativeStrengthData } from "@/shared/types";

const ALERT_ICON = "🔔 ";

// ── RS 迷你三线图（个股 / 板块 / 大盘）──
function RsMiniChart({ rsData, stockName }: { rsData: RelativeStrengthData; stockName?: string }) {
  const W = 150, H = 60;
  const stockSeries = rsData.stock.rpsSeries;
  const sectorSeries = rsData.sector.rpsSeries;
  const marketSeries = rsData.market?.rpsSeries ?? [];
  if (!stockSeries.length) return null;

  const allValues = [
    ...stockSeries.map((p) => p.value),
    ...sectorSeries.map((p) => p.value),
    ...marketSeries.map((p) => p.value),
  ];
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
  const marketPath = marketSeries.length > 0 ? toPath(marketSeries) : "";
  const lastStock = stockSeries[stockSeries.length - 1]?.value ?? 0;
  const lastSector = sectorSeries[sectorSeries.length - 1]?.value ?? 0;
  const lastMarket = marketSeries.length > 0 ? marketSeries[marketSeries.length - 1]?.value ?? 0 : null;

  return (
    <div
      className="absolute z-20 rounded overflow-hidden opacity-70 hover:opacity-100 transition-opacity bg-canvas/90 border border-border-default p-2"
      style={{ top: 38, left: 8, width: W + 20 }}
    >
      <div className="text-[10px] text-text-tertiary mb-0.5">RS 相对强度</div>
      <svg width={W} height={H} className="block">
        {marketPath && <path d={marketPath} fill="none" stroke="#333333" strokeWidth={1} opacity={0.5} />}
        <path d={sectorPath} fill="none" stroke="#3b82f6" strokeWidth={1.2} opacity={0.6} />
        <path d={stockPath} fill="none" stroke="#ef4444" strokeWidth={1.5} />
      </svg>
      <div className="flex items-center justify-between mt-1 text-[9px]">
        <span className="text-state-up">{lastStock.toFixed(1)}</span>
        <span className="text-text-quaternary">{rsData.summary.label}</span>
        <span className="text-blue-500">{lastSector.toFixed(1)}</span>
        {lastMarket != null && <span className="text-neutral-600">{lastMarket.toFixed(1)}</span>}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-quaternary flex-wrap">
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-0.5 bg-red-500 rounded" />{stockName || rsData.stock.name}</span>
        <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-0.5 bg-blue-500 rounded" />{rsData.sector.name}</span>
        {marketSeries.length > 0 && <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-0.5 bg-neutral-800 rounded" />沪深300</span>}
      </div>
    </div>
  );
}

interface WatchlistChartProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  activeTool?: string | null;
  drawingColor?: string;
  frequency?: string;
  onChangeOverlayColor?: (chart: any, overlayId: string, color: string) => void;
  onSelectionChange?: (selection: { id: string | null; locked: boolean; name: string | null }) => void;
  onDrawingsChange?: (overlays: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>) => void;
  onBuyPlanChange?: (plan: { entryPrice: number; stopLoss: number; takeProfit: number; riskReward: number | null }) => void;
}

export function WatchlistChart({ tsCode, sectorCode, stockName, activeTool, drawingColor, frequency = "1d", onChangeOverlayColor, onSelectionChange, onDrawingsChange, onBuyPlanChange }: WatchlistChartProps) {
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

  const snapshotUserDrawings = useCallback((chart: any): ChartDrawingOverlay[] => {
    if (!chart?.getOverlaysByType) return [];
    try {
      const all = chart.getOverlaysByType?.() ?? [];
      return all
        .filter((o: any) => o.groupId !== "__system__" && !o.lock)
        .map((o: any) => ({
          id: o.id,
          name: o.name,
          points: o.points,
          styles: o.styles,
          extendData: o.extendData,
        }));
    } catch {
      return [];
    }
  }, []);

  const persistChartDrawings = useCallback((chart: any) => {
    handleDrawingsChange(snapshotUserDrawings(chart));
  }, [handleDrawingsChange, snapshotUserDrawings]);

  // 根据入场价计算止损止盈
  const calcSlTp = useCallback((entry: number) => {
    const supports = patternData?.supports ?? [];
    const below = supports.filter((s: any) => s.price < entry).sort((a: any, b: any) => b.price - a.price);
    const sl = below.length > 0 ? +below[0].price.toFixed(2) : +(entry * 0.95).toFixed(2);
    const risk = entry - sl;
    const tp = risk > 0 ? +(entry + risk * 2).toFixed(2) : +(entry * 1.1).toFixed(2);
    return { sl, tp };
  }, [patternData]);

  // 更新止损止盈线位置和标签
  const updateSlTpOverlays = useCallback((chart: any, groupId: string, entry: number, sl: number, tp: number) => {
    chart.overrideOverlay({ id: `${groupId}-sl`, points: [{ value: sl }] });
    chart.overrideOverlay({ id: `${groupId}-sl-tag`, points: [{ value: sl }], extendData: { text: `${ALERT_ICON}止损 ${sl}`, color: "#ffffff", bg: "rgba(239,68,68,0.85)" } });
    chart.overrideOverlay({ id: `${groupId}-tp`, points: [{ value: tp }] });
    chart.overrideOverlay({ id: `${groupId}-tp-tag`, points: [{ value: tp }], extendData: { text: `${ALERT_ICON}止盈 ${tp} (2R)`, color: "#ffffff", bg: "rgba(34,197,94,0.85)" } });
    chart.overrideOverlay({ id: `${groupId}-entry-tag`, points: [{ value: entry }], extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } });
  }, []);

  const emitBuyPlan = useCallback((entry: number, sl: number, tp: number) => {
    const risk = entry - sl;
    const reward = tp - entry;
    const rr = risk > 0 ? +(reward / risk).toFixed(4) : null;
    onBuyPlanChange?.({
      entryPrice: +entry.toFixed(2),
      stopLoss: +sl.toFixed(2),
      takeProfit: +tp.toFixed(2),
      riskReward: rr,
    });
  }, [onBuyPlanChange]);

  // 买入模式：点击透明遮罩选价位
  const handleBuyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current as any;
    const container = chartContainerRef.current;
    if (!chart || !container || !stockData?.points?.length) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 用 klinecharts 精确转换坐标
    const result = chart.convertFromPixel([{ x, y }], { paneId: "candle_pane" });
    const point = Array.isArray(result) ? result[0] : result;
    let price = point?.value;

    // 备用方案：用像素比例估算
    if (!price || price <= 0) {
      const pts = stockData.points;
      const maxPrice = Math.max(...pts.map((p) => p.high));
      const minPrice = Math.min(...pts.map((p) => p.low));
      const chartHeight = rect.height * 0.78;
      const ratio = Math.max(0, Math.min(1, y / chartHeight));
      price = maxPrice - ratio * (maxPrice - minPrice);
    }
    if (!price || price <= 0) { setBuyMode(false); return; }

    const entry = +price.toFixed(2);
    const { sl, tp } = calcSlTp(entry);
    const groupId = `buy-${Date.now()}`;

    // 入场线（蓝色，可拖动）
    chart.createOverlay({
      id: `${groupId}-entry`,
      name: "horizontalStraightLine",
      points: [{ value: entry }],
      styles: { line: { color: "#3b82f6", size: 1.5, style: "solid" } },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event.overlay?.points?.[0]?.value;
        if (!newPrice || newPrice <= 0) return;
        const newEntry = +newPrice.toFixed(2);
        const { sl: newSl, tp: newTp } = calcSlTp(newEntry);
        updateSlTpOverlays(chart, groupId, newEntry, newSl, newTp);
        emitBuyPlan(newEntry, newSl, newTp);
        persistChartDrawings(chart);
        // 更新预警
        void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: newEntry, stopLoss: newSl, takeProfit: newTp });
      },
    });
    chart.createOverlay({ id: `${groupId}-entry-tag`, name: "leftTag", lock: true, points: [{ value: entry }], extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } });
    // 止损线（红色，可拖动）
    chart.createOverlay({
      id: `${groupId}-sl`,
      name: "horizontalStraightLine",
      lock: false,
      points: [{ value: sl }],
      styles: { line: { color: "#ef4444", size: 1, style: "dashed" } },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event.overlay?.points?.[0]?.value;
        if (!newPrice || newPrice <= 0) return;
        const newSl = +newPrice.toFixed(2);
        const risk = entry - newSl;
        const newTp = risk > 0 ? +(entry + risk * 2).toFixed(2) : tp;
        updateSlTpOverlays(chart, groupId, entry, newSl, newTp);
        emitBuyPlan(entry, newSl, newTp);
        persistChartDrawings(chart);
        void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: entry, stopLoss: newSl, takeProfit: newTp });
      },
    });
    chart.createOverlay({ id: `${groupId}-sl-tag`, name: "leftTag", lock: true, points: [{ value: sl }], extendData: { text: `${ALERT_ICON}止损 ${sl}`, color: "#ffffff", bg: "rgba(239,68,68,0.85)" } });
    // 止盈线（绿色，可拖动）
    chart.createOverlay({
      id: `${groupId}-tp`,
      name: "horizontalStraightLine",
      lock: false,
      points: [{ value: tp }],
      styles: { line: { color: "#22c55e", size: 1, style: "dashed" } },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event.overlay?.points?.[0]?.value;
        if (!newPrice || newPrice <= 0) return;
        const newTp = +newPrice.toFixed(2);
        const risk = (newTp - entry) / 2;
        const newSl = risk > 0 ? +(entry - risk).toFixed(2) : sl;
        updateSlTpOverlays(chart, groupId, entry, newSl, newTp);
        emitBuyPlan(entry, newSl, newTp);
        persistChartDrawings(chart);
        void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: entry, stopLoss: newSl, takeProfit: newTp });
      },
    });
    chart.createOverlay({ id: `${groupId}-tp-tag`, name: "leftTag", lock: true, points: [{ value: tp }], extendData: { text: `${ALERT_ICON}止盈 ${tp} (2R)`, color: "#ffffff", bg: "rgba(34,197,94,0.85)" } });

    // 创建价格预警
    void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: entry, stopLoss: sl, takeProfit: tp });
    emitBuyPlan(entry, sl, tp);
    persistChartDrawings(chart);

    setBuyMode(false);
  }, [stockData, patternData, tsCode, stockName, calcSlTp, updateSlTpOverlays, emitBuyPlan, persistChartDrawings]);

  // ESC 退出买入模式
  useEffect(() => {
    if (!buyMode) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setBuyMode(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buyMode]);

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
      <div ref={chartContainerRef} className="relative flex-1 min-h-0">
        {buyMode && (
          <>
            {/* 透明遮罩：挡在图表上面接收点击 */}
            <div
              className="absolute inset-0 z-40 cursor-crosshair"
              onClick={handleBuyClick}
              onKeyDown={(e) => { if (e.key === "Escape") setBuyMode(false); }}
              tabIndex={-1}
            />
            <div className="absolute top-0 left-0 right-0 z-50 bg-amber-500/90 text-white text-center text-xs py-1 pointer-events-none">
              点击K线图选择入场价位 · 按 ESC 取消
            </div>
          </>
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
            drawingColor={drawingColor}
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
