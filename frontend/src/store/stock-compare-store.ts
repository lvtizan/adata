import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SelectedStock } from '@/pages/stock-compare/types';

interface StockCompareState {
  // 选中的股票列表
  selectedStocks: SelectedStock[];

  // 当前启用显示的股票(用于快速切换显示/隐藏)
  enabledStockCodes: Set<string>;

  // UI状态
  view: 'selection' | 'comparison';

  // Actions
  addStock: (stock: SelectedStock) => void;
  removeStock: (tsCode: string) => void;
  toggleStock: (tsCode: string) => void;
  clearAll: () => void;
  startCompare: () => void;
  backToSelection: () => void;
}

export const useStockCompareStore = create<StockCompareState>()(
  persist(
    (set, get) => ({
      selectedStocks: [],
      enabledStockCodes: new Set(),
      view: 'selection',

      addStock: (stock: SelectedStock) => {
        const state = get();

        // 检查是否已存在
        const exists = state.selectedStocks.find(s => s.tsCode === stock.tsCode);
        if (exists) return;

        // 检查是否达到上限
        if (state.selectedStocks.length >= 8) {
          throw new Error('最多只能对比8只股票');
        }

        set((prev) => ({
          selectedStocks: [...prev.selectedStocks, stock],
          enabledStockCodes: new Set(prev.enabledStockCodes).add(stock.tsCode),
        }));
      },

      removeStock: (tsCode: string) => {
        set((prev) => ({
          selectedStocks: prev.selectedStocks.filter(s => s.tsCode !== tsCode),
          enabledStockCodes: new Set([...prev.enabledStockCodes].filter(c => c !== tsCode)),
        }));
      },

      toggleStock: (tsCode: string) => {
        const state = get();
        const newSet = new Set(state.enabledStockCodes);

        if (newSet.has(tsCode)) {
          newSet.delete(tsCode);
        } else {
          newSet.add(tsCode);
        }

        set({ enabledStockCodes: newSet });
      },

      clearAll: () => {
        set({
          selectedStocks: [],
          enabledStockCodes: new Set(),
          view: 'selection',
        });
      },

      startCompare: () => {
        const state = get();

        // 需要至少2只股票才能对比
        if (state.selectedStocks.length < 2) {
          throw new Error('至少需要选择2只股票才能对比');
        }

        // 确保至少启用2只股票
        if (state.enabledStockCodes.size < 2) {
          throw new Error('至少需要启用2只股票才能对比');
        }

        set({ view: 'comparison' });
      },

      backToSelection: () => {
        set({ view: 'selection' });
      },
    }),
    {
      name: 'stock-compare-selection',
      storage: createJSONStorage(() => localStorage, {
        // Set 无法直接序列化，需要转换
        reviver: (key, value) => {
          if (key === 'enabledStockCodes' && Array.isArray(value)) {
            return new Set(value);
          }
          return value;
        },
        replacer: (key, value) => {
          if (key === 'enabledStockCodes' && value instanceof Set) {
            return [...value];
          }
          return value;
        },
      }),
      // view 不需要持久化，每次打开都是 selection
      partialize: (state) => ({
        selectedStocks: state.selectedStocks,
        enabledStockCodes: state.enabledStockCodes,
      }),
    },
  ),
);
