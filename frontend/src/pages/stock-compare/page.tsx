'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStockCompareStore } from '@/store/stock-compare-store';
import { useMultiStockCharts } from '@/queries/stock-compare.queries';
import { useMarketSearch } from '@/queries';
import { ErrorBoundary } from '@/components/error-boundary';
import { CompareChart } from './components/compare-chart';
import { StockLegend } from './components/stock-legend';
import { Search, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPct } from '@/shared/utils/format';
import type { SelectedStock } from './types';

const COMPARE_PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
];

function createSelectedStock(item: any): SelectedStock {
  return {
    tsCode: item.tsCode,
    stockName: item.stockName,
    sectorCode: item.sectorCode ?? "",
    sectorName: item.sectorName ?? "",
    close: item.close ?? 0,
    pctChange1d: item.pctChange1d ?? 0,
    rps10: item.rps10 ?? item.rps20 ?? 0,
    amount: item.amount ?? 0,
  };
}

export default function StockComparePage() {
  const { selectedStocks, addStock, clearAll } = useStockCompareStore();

  const enabledStocks = Array.from(useStockCompareStore(state => state.enabledStockCodes))
    .map(tsCode => selectedStocks.find(s => s.tsCode === tsCode))
    .filter(Boolean) as SelectedStock[];

  const { data: chartData, isLoading, errors } = useMultiStockCharts(enabledStocks);

  const processedChartData = chartData.map((item, index) => ({
    tsCode: item.stock.tsCode,
    stockName: item.stock.stockName,
    sectorName: item.stock.sectorName,
    normalizedData: item.normalizedData,
    rps10: item.rps10,
    color: COMPARE_PALETTE[index % COMPARE_PALETTE.length],
  }));

  // 监听键盘快捷键
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        clearAll();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [clearAll]);

  const hasEnoughStocks = enabledStocks.length >= 2;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部：搜索框 + 已选信息 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle bg-canvas">
        <h1 className="text-lg font-medium text-text-primary shrink-0">股票对比</h1>
        <InlineSearch onAdd={addStock} selectedStocks={selectedStocks} />
        {selectedStocks.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
            清空
          </button>
        )}
      </div>

      {/* 图表区域 */}
      <div className="flex-1 overflow-hidden">
        {!hasEnoughStocks ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-text-tertiary">
              <p className="text-sm">在上方搜索框输入股票名称或代码</p>
              <p className="text-xs mt-1">至少添加 2 只股票开始对比（已选 {selectedStocks.length}）</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            加载数据中...
          </div>
        ) : errors > 0 ? (
          <div className="flex items-center justify-center h-full text-state-up text-sm">
            部分数据加载失败
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4">
              <ErrorBoundary componentName="CompareChart">
                <CompareChart data={processedChartData} />
              </ErrorBoundary>
            </div>
            <ErrorBoundary componentName="StockLegend">
              <StockLegend stocks={selectedStocks} />
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 内联搜索组件 ──
function InlineSearch({
  onAdd,
  selectedStocks,
}: {
  onAdd: (stock: SelectedStock) => void;
  selectedStocks: SelectedStock[];
}) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 80);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const { data, isFetching } = useMarketSearch(debounced, 8);
  const hasQuery = debounced.length >= 2;
  const showDropdown = open && text.trim().length >= 2;

  const availableStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return data.stocks
      .filter(stock => !selectedStocks.find(s => s.tsCode === stock.tsCode))
      .slice(0, 8);
  }, [data?.stocks, selectedStocks]);

  const handleAdd = (item: any) => {
    try {
      onAdd(createSelectedStock(item));
      setText('');
      setOpen(false);
    } catch (error) {
      if (error instanceof Error) alert(error.message);
    }
  };

  return (
    <div className="relative flex-1 max-w-md" ref={wrapRef}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary z-10" />
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => text.trim().length >= 2 && setOpen(true)}
        placeholder="搜索股票名称或代码添加..."
        className="w-full h-8 pl-8 pr-3 text-sm bg-surface border border-border-default rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border-default bg-canvas shadow-lg overflow-hidden max-h-[280px] overflow-y-auto">
          {hasQuery && isFetching && availableStocks.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">搜索中...</div>
          )}

          {hasQuery && !isFetching && availableStocks.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">没有匹配结果</div>
          )}

          {availableStocks.map((item) => (
            <button
              key={item.tsCode}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
              onClick={() => handleAdd(item)}
            >
              <Plus className="w-3 h-3 text-text-tertiary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm">{item.stockName}</span>
                <span className="text-[10px] text-text-tertiary ml-1.5 font-mono">{item.tsCode}</span>
              </div>
              <div className="text-right text-[11px] shrink-0">
                <span className={cn(item.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>
                  {fmtPct(item.pctChange1d)}
                </span>
              </div>
            </button>
          ))}

          {selectedStocks.length >= 8 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">已达上限 8 只</div>
          )}
        </div>
      )}
    </div>
  );
}
