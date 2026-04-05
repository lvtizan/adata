'use client';

import { useEffect } from 'react';
import { useStockCompareStore } from '@/store/stock-compare-store';
import { useMultiStockCharts } from '@/queries/stock-compare.queries';
import { ErrorBoundary } from '@/components/error-boundary';
import { StockSelector } from './components/stock-selector';
import { CompareChart } from './components/compare-chart';
import { StockLegend } from './components/stock-legend';

// 颜色方案
const COMPARE_PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
];

// 类型定义
interface SelectedStock {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  close: number;
  pctChange1d: number;
  rps10: number;
  amount: number;
}

export default function StockComparePage() {
  const { view, selectedStocks, clearAll, backToSelection } = useStockCompareStore();

  // 获取选中的股票数据
  const enabledStocks = Array.from(useStockCompareStore(state => state.enabledStockCodes))
    .map(tsCode => selectedStocks.find(s => s.tsCode === tsCode))
    .filter(Boolean) as SelectedStock[];

  // 并行获取股票数据
  const { data: chartData, isLoading, errors } = useMultiStockCharts(enabledStocks);

  // 处理图表数据
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
      if (e.key === 'Escape' && view === 'comparison') {
        backToSelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [view, clearAll, backToSelection]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-canvas">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-medium text-text-primary">股票对比</h1>
          {selectedStocks.length > 0 && (
            <span className="text-sm text-text-tertiary">
              已选择 {selectedStocks.length} 只股票
            </span>
          )}
        </div>

        {selectedStocks.length > 0 && view === 'selection' && (
          <button
            onClick={() => {
              try {
                useStockCompareStore.getState().startCompare();
              } catch (error) {
                if (error instanceof Error) {
                  alert(error.message);
                }
              }
            }}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            开始对比
          </button>
        )}

        {view === 'comparison' && (
          <button
            onClick={() => {
              try {
                useStockCompareStore.getState().backToSelection();
              } catch (error) {
                if (error instanceof Error) {
                  alert(error.message);
                }
              }
            }}
            className="px-4 py-2 text-sm font-medium bg-muted text-muted-foreground rounded-lg hover:bg-muted/90 transition-colors"
          >
            返回选择
          </button>
        )}
      </div>

      {/* 主内容 */}
      <div className="flex-1 overflow-hidden">
        {view === 'selection' ? (
          <ErrorBoundary componentName="StockSelector">
            <StockSelector />
          </ErrorBoundary>
        ) : (
          <div className="flex h-full flex-col">
            {/* 图表区域 */}
            <div className="flex-1 p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-lg mb-2">⏳</div>
                    <div>正在加载股票数据...</div>
                  </div>
                </div>
              ) : errors > 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-text-destructive">
                    <div className="text-lg mb-2">❌</div>
                    <div>数据加载失败</div>
                  </div>
                </div>
              ) : processedChartData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-lg mb-2">📊</div>
                    <div>请至少选择2只股票</div>
                  </div>
                </div>
              ) : (
                <ErrorBoundary componentName="CompareChart">
                  <CompareChart data={processedChartData} />
                </ErrorBoundary>
              )}
            </div>

            {/* 底部股票图例 */}
            <ErrorBoundary componentName="StockLegend">
              <StockLegend stocks={selectedStocks} />
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
}
