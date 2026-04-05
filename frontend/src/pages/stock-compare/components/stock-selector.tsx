'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, AlertCircle } from 'lucide-react';
import { useMarketSearch } from '@/queries';
import { useStockCompareStore } from '@/store';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { cn } from '@/lib/utils';
import { SelectedStock } from '../types';
import { fmtPct } from '@/shared/utils/format';

// 从搜索结果创建 SelectedStock
function createSelectedStock(item: any): SelectedStock {
  return {
    tsCode: item.tsCode,
    stockName: item.stockName,
    sectorCode: item.sectorCode ?? item.sectorCode ?? "",
    sectorName: item.sectorName ?? "",
    close: item.close ?? 0,
    pctChange1d: item.pctChange1d ?? 0,
    rps10: item.rps10 ?? item.rps20 ?? 0,
    amount: item.amount ?? 0,
  };
}

export function StockSelector() {
  const { selectedStocks, addStock, removeStock, clearAll } = useStockCompareStore();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // 防抖处理搜索词（80ms 快速响应）
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 80);
    return () => window.clearTimeout(timer);
  }, [text]);

  // 点击外部关闭
  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setText('');
        setDebounced('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // 搜索结果
  const { data, isFetching } = useMarketSearch(debounced, 8);
  const hasQuery = debounced.length >= 2;
  const hasResults = (data?.stocks.length ?? 0) > 0 || (data?.sectors.length ?? 0) > 0;
  const open = text.trim().length >= 2;

  // 找出未选中的股票（最多8只）
  const availableStocks = useMemo(() => {
    if (!data?.stocks) return [];

    return data.stocks
      .filter(stock => !selectedStocks.find(s => s.tsCode === stock.tsCode))
      .slice(0, 8 - selectedStocks.length);
  }, [data?.stocks, selectedStocks.length]);

  // 找出未选中的板块
  const availableSectors = useMemo(() => {
    if (!data?.sectors) return [];

    return data.sectors.filter(sector =>
      !selectedStocks.find(s => s.sectorCode === sector.sectorCode)
    );
  }, [data?.sectors, selectedStocks]);

  const hasMoreSectors = availableSectors.length > 0;
  const showAddButton = availableStocks.length > 0 || availableSectors.length > 0;

  const handleAddStock = (item: any) => {
    try {
      const stock = createSelectedStock(item);
      addStock(stock);
      setText('');
      setDebounced('');
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  };

  const handleRemoveStock = (tsCode: string) => {
    removeStock(tsCode);
  };

  const handleClearAll = () => {
    if (selectedStocks.length > 0) {
      clearAll();
    }
  };

  return (
    <div className="flex h-full flex-col p-6 gap-4">
      {/* 顶部标题和清空按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">
          选择对比股票（最多8只）
        </h2>
        {selectedStocks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            清空
          </Button>
        )}
      </div>

      {/* 搜索框 + 下拉 */}
      <div className="relative" ref={wrapRef}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary z-10" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入股票名称或代码搜索..."
          className="h-10 pl-8"
        />

        {/* 搜索下拉框 */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border-default bg-canvas shadow-lg overflow-hidden max-h-[300px] overflow-y-auto">
          {!hasQuery && (
            <div className="px-3 py-2 text-xs text-text-tertiary">输入至少 2 个字符</div>
          )}

          {hasQuery && isFetching && !hasResults && (
            <div className="px-3 py-2 text-xs text-text-tertiary">搜索中...</div>
          )}

          {hasQuery && !isFetching && !hasResults && (
            <div className="px-3 py-2 text-xs text-text-tertiary">没有找到匹配的股票或板块</div>
          )}

          {/* 板块搜索结果 */}
          {availableSectors.length > 0 && (
            <div className="border-b border-border-subtle">
              <div className="px-3 py-2 text-[11px] text-text-tertiary">板块</div>
              {availableSectors.map((item) => (
                <button
                  key={item.sectorCode}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors flex items-center justify-between"
                  onClick={() => {
                    // 选择板块中的第一只股票（如果没有则创建虚拟股票）
                    const stock = createSelectedStock(item);
                    addStock(stock);
                    setText('');
                    setDebounced('');
                  }}
                >
                  <div>
                    <div className="text-sm">{item.sectorName}</div>
                    <div className="text-[10px] text-text-tertiary font-mono">{item.sectorCode}</div>
                  </div>
                  <div className="text-right text-xs">
                    {item.rps10 != null && <div className="text-text-secondary">RPS10 {item.rps10.toFixed(1)}</div>}
                    {item.pctChange5d != null && (
                      <div className={cn(item.pctChange5d >= 0 ? "text-state-up" : "text-state-down")}>
                        {fmtPct(item.pctChange5d)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 股票搜索结果 */}
          {availableStocks.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[11px] text-text-tertiary">股票</div>
              {availableStocks.map((item) => (
                <div key={item.tsCode} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.stockName}</div>
                    <div className="text-[10px] text-text-tertiary font-mono truncate">
                      {item.tsCode} · {item.sectorName || "未识别板块"}
                    </div>
                  </div>
                  <div className="text-right text-[11px] shrink-0">
                    <div className={cn(item.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>
                      {fmtPct(item.pctChange1d)}
                    </div>
                    <div className="text-text-tertiary">RPS {(item.rps20 ?? 0).toFixed(0)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] shrink-0"
                    onClick={() => handleAddStock(item)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    添加
                  </Button>
                </div>
              ))}
            </div>
          )}

          {hasQuery && !isFetching && !hasMoreSectors && availableStocks.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              已达到最大选择数量或没有可添加的股票
            </div>
          )}
          </div>
        )}
      </div>

      {/* 已选股票列表 */}
      {selectedStocks.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2">
          <h3 className="text-sm font-medium text-text-secondary mb-2">已选股票</h3>
          <div className="space-y-2">
            {selectedStocks.map((stock, index) => (
              <div
                key={stock.tsCode}
                className="flex items-center gap-3 px-4 py-3 bg-surface-hover rounded-lg"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#eab308'][index % 8]
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{stock.stockName}</div>
                  <div className="text-sm text-text-tertiary">
                    {stock.tsCode} · {stock.sectorName}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className={cn(stock.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>
                    {fmtPct(stock.pctChange1d)}
                  </div>
                  <div className="text-text-tertiary">RPS10 {(stock.rps10 ?? 0).toFixed(0)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveStock(stock.tsCode)}
                  className="h-8 w-8 p-0 hover:bg-text-destructive/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {selectedStocks.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-text-tertiary">
            <div className="text-lg mb-2">📈</div>
            <div>搜索并添加股票开始对比</div>
            <div className="text-sm mt-1">最多可选择8只股票</div>
          </div>
        </div>
      )}

      {/* 底部提示 */}
      {selectedStocks.length > 0 && (
        <div className="border-t border-border-subtle pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              已选择 {selectedStocks.length} / 8 只股票
            </span>
            {selectedStocks.length >= 2 && (
              <span className="text-state-success">可以开始对比</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}