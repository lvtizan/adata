import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { type Chart } from "klinecharts";
import { useChartDrawings } from "@/queries";
import { KlineChart } from "./kline-chart";
import { clearLocalDrawings, readLocalDrawings, writeLocalDrawings } from "@/lib/chart-drawings";
import { clearChartDrawings, createPriceAlert, saveChartDrawings } from "@/services";
import type { CandlePoint, ChartDrawingOverlay, RelativeStrengthData, FengSignals, ChartSignal } from "@/shared/types";
import type { DrawdownMarker, SupportLevel, ResistanceLevel } from "@/services/stock.service";

const ALERT_ICON = "🔔 ";

function RsMiniChart({ rsData, stockName }: { rsData: RelativeStrengthData; stockName?: string }) {
  const W = 150, H = 60;
  const stockSeries = rsData.stock?.rpsSeries ?? [];
  const sectorSeries = rsData.sector?.rpsSeries ?? [];
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

interface InteractiveStockKlineProps {
  tsCode: string;
  stockName?: string;
  points: CandlePoint[];
  frequency?: string;
  signals?: ChartSignal[];
  drawdowns?: DrawdownMarker[];
  supports?: SupportLevel[];
  resistances?: ResistanceLevel[];
  fengSignals?: FengSignals;
  rsData?: RelativeStrengthData;
  sectorNormalizedPoints?: Array<{ time: string; value: number }>;
  isLoading?: boolean;
  error?: string;
  activeTool?: string | null;
  drawingColor?: string;
  onSelectionChange?: (selection: { id: string | null; locked: boolean; name: string | null }) => void;
  onChangeOverlayColor?: (chart: any, overlayId: string, color: string) => void;
  onDrawingsChange?: (overlays: Array<{ id: string; name: string; lock: boolean; points: number; label?: string }>) => void;
  onBuyPlanChange?: (plan: { entryPrice: number; stopLoss: number; takeProfit: number; riskReward: number | null }) => void;
  onToolReset?: () => void;
}

interface ContextMenu {
  x: number;
  y: number;
  overlayId: string;
  locked: boolean;
}

export function InteractiveStockKline({
  tsCode,
  stockName,
  points,
  frequency = "1d",
  signals,
  drawdowns,
  supports,
  resistances,
  fengSignals,
  rsData,
  sectorNormalizedPoints,
  isLoading,
  error,
  activeTool,
  drawingColor,
  onSelectionChange,
  onDrawingsChange,
  onBuyPlanChange,
  onToolReset,
}: InteractiveStockKlineProps) {
  const [buyMode, setBuyMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  // ── Undo/Redo history stack ──
  const historyRef = useRef<ChartDrawingOverlay[][]>([[]]);
  const historyIdxRef = useRef(0);

  const { data: drawingsDoc } = useChartDrawings(tsCode, "stock", "1d");

  const [savedDrawings, setSavedDrawings] = useState<ChartDrawingOverlay[]>([]);
  useEffect(() => {
    const local = readLocalDrawings(tsCode, "stock", "1d");
    const remote = drawingsDoc?.overlays ?? [];
    setSavedDrawings(local.length > 0 ? local : remote);
  }, [tsCode, drawingsDoc]);

  const handleDrawingsChange = useCallback((overlays: ChartDrawingOverlay[]) => {
    writeLocalDrawings(tsCode, "stock", "1d", overlays);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveChartDrawings(tsCode, overlays, "stock", "1d");
    }, 2000);
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

  const pushHistory = useCallback((overlays: ChartDrawingOverlay[]) => {
    const newStack = historyRef.current.slice(0, historyIdxRef.current + 1);
    newStack.push(overlays);
    historyRef.current = newStack;
    historyIdxRef.current = newStack.length - 1;
  }, []);

  const restoreSnapshot = useCallback((overlays: ChartDrawingOverlay[]) => {
    const chart = chartRef.current as any;
    if (!chart) return;
    const all: any[] = chart.getOverlaysByType?.() ?? [];
    for (const o of all) {
      if (o.groupId !== "__system__") chart.removeOverlay?.({ id: o.id });
    }
    for (const d of overlays) {
      chart.createOverlay({ id: d.id, name: d.name, points: d.points as any, styles: d.styles as any, extendData: d.extendData });
    }
    handleDrawingsChange(overlays);
  }, [handleDrawingsChange]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    restoreSnapshot(historyRef.current[historyIdxRef.current] ?? []);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    restoreSnapshot(historyRef.current[historyIdxRef.current] ?? []);
  }, [restoreSnapshot]);

  // Expose undo/redo via window event for toolbar buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: string }>).detail?.action;
      if (action === "undo") undo();
      else if (action === "redo") redo();
    };
    window.addEventListener(`chart-history:${tsCode}`, handler as EventListener);
    return () => window.removeEventListener(`chart-history:${tsCode}`, handler as EventListener);
  }, [tsCode, undo, redo]);

  const updateSelection = useCallback((chart: any) => {
    try {
      const overlays = chart?.getOverlaysByType?.() ?? [];
      const selected = overlays.find((o: any) => o?.isSelected || o?.selected) ?? null;
      if (!selected) {
        onSelectionChange?.({ id: null, locked: false, name: null });
        return;
      }
      onSelectionChange?.({
        id: selected.id ?? null,
        locked: !!selected.lock,
        name: selected.name ?? null,
      });
    } catch {
      onSelectionChange?.({ id: null, locked: false, name: null });
    }
  }, [onSelectionChange]);

  const calcSlTp = useCallback((entry: number) => {
    const below = (supports ?? []).filter((s) => s.price < entry).sort((a, b) => b.price - a.price);
    const sl = below.length > 0 ? +below[0].price.toFixed(2) : +(entry * 0.95).toFixed(2);
    const risk = entry - sl;
    const tp = risk > 0 ? +(entry + risk * 2).toFixed(2) : +(entry * 1.1).toFixed(2);
    return { sl, tp };
  }, [supports]);

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

  const handleBuyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current as any;
    const container = chartContainerRef.current;
    if (!chart || !container || !points?.length) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const result = chart.convertFromPixel([{ x, y }], { paneId: "candle_pane" });
    const point = Array.isArray(result) ? result[0] : result;
    let price = point?.value;

    if (!price || price <= 0) {
      const maxPrice = Math.max(...points.map((p) => p.high));
      const minPrice = Math.min(...points.map((p) => p.low));
      const chartHeight = rect.height * 0.78;
      const ratio = Math.max(0, Math.min(1, y / chartHeight));
      price = maxPrice - ratio * (maxPrice - minPrice);
    }
    if (!price || price <= 0) { setBuyMode(false); return; }

    const entry = +price.toFixed(2);
    const { sl, tp } = calcSlTp(entry);
    const groupId = `buy-${Date.now()}`;

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
        void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: newEntry, stopLoss: newSl, takeProfit: newTp });
      },
    });
    chart.createOverlay({ id: `${groupId}-entry-tag`, name: "leftTag", lock: true, points: [{ value: entry }], extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } });

    chart.createOverlay({
      id: `${groupId}-sl`,
      name: "horizontalStraightLine",
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

    chart.createOverlay({
      id: `${groupId}-tp`,
      name: "horizontalStraightLine",
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

    void createPriceAlert({ tsCode, stockName: stockName ?? tsCode, entryPrice: entry, stopLoss: sl, takeProfit: tp });
    emitBuyPlan(entry, sl, tp);
    persistChartDrawings(chart);
    setBuyMode(false);
  }, [points, supports, tsCode, stockName, calcSlTp, updateSlTpOverlays, emitBuyPlan, persistChartDrawings]);

  useEffect(() => {
    if (!buyMode) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setBuyMode(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buyMode]);

  // ── Keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z, Delete, Escape ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const chart = chartRef.current as any;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        onToolReset?.();
        setContextMenu(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !buyMode) {
        if (!chart) return;
        const all: any[] = chart.getOverlaysByType?.() ?? [];
        const selected = all.find((o: any) => o.groupId !== "__system__" && (o.isSelected || o.selected));
        if (selected) {
          chart.removeOverlay?.({ id: selected.id });
          const snap = snapshotUserDrawings(chart);
          pushHistory(snap);
          handleDrawingsChange(snap);
          onSelectionChange?.({ id: null, locked: false, name: null });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buyMode, undo, redo, onToolReset, pushHistory, handleDrawingsChange, snapshotUserDrawings, onSelectionChange]);

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
        const latest = points?.[points.length - 1];
        if (!latest) return;
        const isSup = detail.action === "addSupportAtClose";
        chart.createOverlay({
          id: `${isSup ? "support" : "resistance"}-${Date.now()}`,
          name: "horizontalStraightLine",
          styles: { line: { color: isSup ? "#22c55e" : "#ef4444", size: 1, style: isSup ? "dashed" : "solid" } },
          points: [{ value: latest.close }],
        });
      }

      if (detail.action === "addTagAtLatest") {
        const latest = points?.[points.length - 1];
        if (!latest) return;
        chart.createOverlay({
          id: `tag-${Date.now()}`,
          name: "leftTag",
          lock: false,
          points: [{ value: latest.close }],
          extendData: { text: `价位 ${latest.close.toFixed(2)}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" },
        });
      }

      if (detail.action === "deleteById" && (detail as any).overlayId) {
        chart.removeOverlay?.({ id: (detail as any).overlayId });
        persistChartDrawings(chart);
        updateSelection(chart);
        return;
      }

      if (detail.action === "toggleLockById" && (detail as any).overlayId) {
        chart.overrideOverlay?.({ id: (detail as any).overlayId, lock: !!(detail as any).nextLocked });
        persistChartDrawings(chart);
        updateSelection(chart);
        return;
      }

      if (detail.action === "changeColorById" && (detail as any).overlayId && (detail as any).color) {
        chart.overrideOverlay?.({
          id: (detail as any).overlayId,
          styles: { line: { color: (detail as any).color } },
        });
        persistChartDrawings(chart);
        return;
      }

      if (detail.action === "clearAll") {
        clearLocalDrawings(tsCode, "stock", "1d");
        void clearChartDrawings(tsCode, "stock", "1d");
        onSelectionChange?.({ id: null, locked: false, name: null });
      }
    };
    window.addEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
    return () => window.removeEventListener(`chart-drawing:${tsCode}`, handler as EventListener);
  }, [tsCode, points, persistChartDrawings, updateSelection, onSelectionChange]);

  return (
    <div className="flex flex-col h-full">
      <div
        ref={chartContainerRef}
        className="relative flex-1 min-h-0"
        onContextMenu={(e: ReactMouseEvent) => {
          e.preventDefault();
          setTimeout(() => {
            const chart = chartRef.current as any;
            const all: any[] = chart?.getOverlaysByType?.() ?? [];
            const selected = all.find((o: any) => o.groupId !== "__system__" && (o.isSelected || o.selected));
            if (selected) {
              setContextMenu({ x: e.clientX, y: e.clientY, overlayId: selected.id, locked: !!selected.lock });
            }
          }, 30);
        }}
        onClick={() => setContextMenu(null)}
      >
        {buyMode && (
          <>
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

        <KlineChart
          points={points}
          signals={signals}
          drawdowns={drawdowns}
          supports={supports}
          resistances={resistances}
          fengSignals={fengSignals}
          tsCode={tsCode}
          sectorNormalizedPoints={sectorNormalizedPoints}
          enableDrawing
          activeTool={activeTool}
          drawingColor={drawingColor}
          initialDrawings={savedDrawings}
          onDrawingsChange={handleDrawingsChange}
          onDrawingComplete={() => {
            onToolReset?.();
            setTimeout(() => {
              const snap = snapshotUserDrawings(chartRef.current as any);
              pushHistory(snap);
            }, 50);
          }}
          chartRef={chartRef}
          frequency={frequency}
        />

        {rsData && <RsMiniChart rsData={rsData} stockName={stockName} />}

        {contextMenu && (
          <div
            className="fixed z-[100] min-w-[130px] bg-canvas border border-border-default rounded-lg shadow-lg py-1 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-surface-hover text-state-down"
              onClick={() => {
                const chart = chartRef.current as any;
                chart?.removeOverlay?.({ id: contextMenu.overlayId });
                const snap = snapshotUserDrawings(chart);
                pushHistory(snap);
                handleDrawingsChange(snap);
                onSelectionChange?.({ id: null, locked: false, name: null });
                setContextMenu(null);
              }}
            >
              删除
            </button>
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-surface-hover"
              onClick={() => {
                const chart = chartRef.current as any;
                chart?.overrideOverlay?.({ id: contextMenu.overlayId, lock: !contextMenu.locked });
                persistChartDrawings(chart);
                updateSelection(chart);
                setContextMenu(null);
              }}
            >
              {contextMenu.locked ? "解锁" : "锁定"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
