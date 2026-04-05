'use client';

import { useStockCompareStore } from '@/store/stock-compare-store';
import { Button } from '@/shared/ui/button';
import { X } from 'lucide-react';

interface StockLegendProps {
  stocks: Array<{
    tsCode: string;
    stockName: string;
    sectorName: string;
    pctChange1d: number;
    rps10: number;
  }>;
}

export function StockLegend({ stocks }: StockLegendProps) {
  const { enabledStockCodes, removeStock, toggleStock } = useStockCompareStore();

  // 颜色方案
  const COMPARE_PALETTE = [
    '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
    '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
  ];

  // 格式化百分比
  const fmtPct = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-t border-border-default bg-surface-elevated">
      <div className="flex-1 overflow-x-auto">
        <div className="flex items-center gap-4 min-w-max">
          {stocks.map((stock, index) => {
            const enabled = enabledStockCodes.has(stock.tsCode);
            const color = COMPARE_PALETTE[index % COMPARE_PALETTE.length];

            return (
              <div
                key={stock.tsCode}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                  ${enabled
                    ? 'border-border-default bg-background hover:bg-surface-hover'
                    : 'border-transparent/30 bg-transparent/50'
                  }
                `}
              >
                {/* 颜色指示器 */}
                <div
                  className={`
                    w-3 h-3 rounded-full flex-shrink-0 transition-all
                    ${enabled ? 'opacity-100' : 'opacity-30'}
                  `}
                  style={{ backgroundColor: color }}
                />

                {/* 复选框 */}
                <div
                  className={`
                    w-4 h-4 rounded border-2 cursor-pointer transition-all
                    flex items-center justify-center
                    ${enabled
                      ? 'border-primary bg-primary hover:bg-primary/90'
                      : 'border-muted-foreground/30 hover:border-primary'
                    }
                  `}
                  onClick={() => toggleStock(stock.tsCode)}
                >
                  {enabled && (
                    <svg
                      className="w-3 h-3 text-primary-foreground"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* 股票信息 */}
                <div className="flex-1 min-w-0">
                  <span className={`
                    text-sm font-medium truncate block
                    ${enabled ? 'text-text-primary' : 'text-text-tertiary'}
                  `}>
                    {stock.stockName}
                  </span>
                  <span className={`
                    text-xs text-tertiary truncate block
                    ${enabled ? 'text-text-secondary' : 'text-text-tertiary/50'}
                  `}>
                    {stock.tsCode} · {stock.sectorName}
                  </span>
                </div>

                {/* 涨跌幅 */}
                {enabled && (
                  <div className="text-xs text-right">
                    <div className={`
                      ${stock.pctChange1d >= 0 ? 'text-state-up' : 'text-state-down'}
                    `}>
                      {fmtPct(stock.pctChange1d)}
                    </div>
                    <div className="text-text-tertiary">
                      RPS10 {stock.rps10.toFixed(0)}
                    </div>
                  </div>
                )}

                {/* 删除按钮 */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStock(stock.tsCode)}
                  className={`
                    h-6 w-6 p-0 ml-1 hover:bg-destructive/10
                    ${enabled ? 'opacity-100 hover:bg-destructive/10' : 'opacity-30'}
                  `}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧操作提示 */}
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <span>取消勾选隐藏图表</span>
        <span className="text-muted-foreground">|</span>
        <span>× 删除股票</span>
      </div>
    </div>
  );
}