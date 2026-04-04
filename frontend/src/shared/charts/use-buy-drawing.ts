import { useState, useCallback } from 'react';
import type { Chart } from 'klinecharts';

interface UseBuyDrawingOptions {
  supports?: Array<{ price: number }>;
  tsCode?: string;
  stockName?: string;
  onCreatePriceAlert?: (data: { tsCode: string; stockName: string; entryPrice: number; stopLoss: number; takeProfit: number }) => void;
}

export function useBuyDrawing(options: UseBuyDrawingOptions = {}) {
  const [buyMode, setBuyMode] = useState(false);

  // 计算止盈止损（盈亏比2:1）
  const calcSlTp = useCallback((entry: number) => {
    const below = (options.supports ?? []).filter((s) => s.price < entry).sort((a, b) => b.price - a.price);
    const sl = below.length > 0 ? +below[0].price.toFixed(2) : +(entry * 0.95).toFixed(2);
    const risk = entry - sl;
    const tp = risk > 0 ? +(entry + risk * 2).toFixed(2) : +(entry * 1.1).toFixed(2);
    return { sl, tp };
  }, [options.supports]);

  // 根据止损计算入场和止盈
  const calcFromSl = useCallback((sl: number) => {
    const risk = sl * 0.05; // 估算风险
    const entry = sl + risk; // 入场价 = 止损 + 风险
    const tp = entry + risk * 2; // 止盈 = 入场 + 2*风险
    return { entry, tp };
  }, []);

  // 根据止盈计算入场和止损
  const calcFromTp = useCallback((tp: number) => {
    const risk = tp / 3; // 估算风险（止盈=入场+2R，所以R=止盈/3）
    const entry = tp - risk * 2; // 入场 = 止盈 - 2R
    const sl = entry - risk; // 止损 = 入场 - R
    return { entry, sl };
  }, []);

  // 更新止盈止损线
  const updateSlTpOverlays = useCallback((chart: Chart, groupId: string, entry: number, sl: number, tp: number) => {
    chart.overrideOverlay?.({ id: `${groupId}-sl`, points: [{ value: sl }] });
    chart.overrideOverlay?.({ id: `${groupId}-sl-tag`, points: [{ value: sl }], extendData: { text: `止损 ${sl}`, color: "#ffffff", bg: "rgba(239,68,68,0.85)" } });
    chart.overrideOverlay?.({ id: `${groupId}-tp`, points: [{ value: tp }] });
    chart.overrideOverlay?.({ id: `${groupId}-tp-tag`, points: [{ value: tp }], extendData: { text: `止盈 ${tp} (2R)`, color: "#ffffff", bg: "rgba(34,197,94,0.85)" } });
    chart.overrideOverlay?.({ id: `${groupId}-entry-tag`, points: [{ value: entry }], extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } });
  }, []);

  // 创建买入画线（所有线都可拖动调整）
  const createBuyDrawing = useCallback((chart: Chart, entry: number) => {
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
        // 更新预警
        if (options.tsCode && options.onCreatePriceAlert) {
          options.onCreatePriceAlert({
            tsCode: options.tsCode,
            stockName: options.stockName ?? options.tsCode,
            entryPrice: newEntry,
            stopLoss: newSl,
            takeProfit: newTp,
          });
        }
      },
    });

    // 入场标签（最左边）
    chart.createOverlay({ 
      id: `${groupId}-entry-tag`, 
      name: "leftTag", 
      lock: true, 
      points: [{ value: entry }], 
      extendData: { text: `入场 ${entry}`, color: "#ffffff", bg: "rgba(59,130,246,0.85)" } 
    });

    // 止损线（红色，可拖动）
    chart.createOverlay({
      id: `${groupId}-sl`,
      name: "horizontalStraightLine",
      lock: false, // 允许拖动
      points: [{ value: sl }],
      styles: { line: { color: "#ef4444", size: 1, style: "dashed" } },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event.overlay?.points?.[0]?.value;
        if (!newPrice || newPrice <= 0) return;
        const newSl = +newPrice.toFixed(2);
        // 根据新止损价重新计算入场和止盈
        const { entry: newEntry, tp: newTp } = calcFromSl(newSl);
        updateSlTpOverlays(chart, groupId, newEntry, newSl, newTp);
        // 更新入场线的位置
        chart.overrideOverlay?.({ id: `${groupId}-entry`, points: [{ value: newEntry }] });
        // 更新预警
        if (options.tsCode && options.onCreatePriceAlert) {
          options.onCreatePriceAlert({
            tsCode: options.tsCode,
            stockName: options.stockName ?? options.tsCode,
            entryPrice: newEntry,
            stopLoss: newSl,
            takeProfit: newTp,
          });
        }
      },
    });

    // 止损标签（最左边）
    chart.createOverlay({ 
      id: `${groupId}-sl-tag`, 
      name: "leftTag", 
      lock: true, 
      points: [{ value: sl }], 
      extendData: { text: `止损 ${sl}`, color: "#ffffff", bg: "rgba(239,68,68,0.85)" } 
    });

    // 止盈线（绿色，可拖动）
    chart.createOverlay({
      id: `${groupId}-tp`,
      name: "horizontalStraightLine",
      lock: false, // 允许拖动
      points: [{ value: tp }],
      styles: { line: { color: "#22c55e", size: 1, style: "dashed" } },
      onPressedMoveEnd: (event: any) => {
        const newPrice = event.overlay?.points?.[0]?.value;
        if (!newPrice || newPrice <= 0) return;
        const newTp = +newPrice.toFixed(2);
        // 根据新止盈价重新计算入场和止损
        const { entry: newEntry, sl: newSl } = calcFromTp(newTp);
        updateSlTpOverlays(chart, groupId, newEntry, newSl, newTp);
        // 更新入场线的位置
        chart.overrideOverlay?.({ id: `${groupId}-entry`, points: [{ value: newEntry }] });
        // 更新预警
        if (options.tsCode && options.onCreatePriceAlert) {
          options.onCreatePriceAlert({
            tsCode: options.tsCode,
            stockName: options.stockName ?? options.tsCode,
            entryPrice: newEntry,
            stopLoss: newSl,
            takeProfit: newTp,
          });
        }
      },
    });

    // 止盈标签（最左边）
    chart.createOverlay({ 
      id: `${groupId}-tp-tag`, 
      name: "leftTag", 
      lock: true, 
      points: [{ value: tp }], 
      extendData: { text: `止盈 ${tp} (2R)`, color: "#ffffff", bg: "rgba(34,197,94,0.85)" } 
    });

    // 创建价格预警
    if (options.tsCode && options.onCreatePriceAlert) {
      options.onCreatePriceAlert({
        tsCode: options.tsCode,
        stockName: options.stockName ?? options.tsCode,
        entryPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
      });
    }
  }, [calcSlTp, calcFromSl, calcFromTp, updateSlTpOverlays, options]);

  return {
    buyMode,
    setBuyMode,
    createBuyDrawing,
    calcSlTp,
    updateSlTpOverlays,
  };
}
