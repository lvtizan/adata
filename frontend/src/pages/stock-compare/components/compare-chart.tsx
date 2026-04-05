'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, type Chart, type Indicator } from 'klinecharts';
import { useAppStore } from '@/store';
import { getKLineStyles } from '@/app/theme/chart-theme';
import { useStockCompareStore } from '@/store/stock-compare-store';
import { useErrorHandler } from '@/lib/error-tracking';
import type { ChartPoint, RSLabel } from '../types';

// 颜色方案
const COMPARE_PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
];

// 注册自定义 Indicator 类型（百分比折线）
let _indicatorRegistered = false;

function registerCompareIndicator() {
  if (_indicatorRegistered) return;
  _indicatorRegistered = true;

  // 注册百分比折线指标
  try {
    // @ts-ignore - klinecharts 内部 API
    if (typeof window.klinecharts?.registerIndicator === 'function') {
      window.klinecharts.registerIndicator({
        name: 'COMPARE_LINE',
        shortName: '对比线',
        series: 'normal',
        calc: () => [],
        figures: [{
          key: 'line',
          title: '折线',
          type: 'line',
        }],
        // 自定义渲染逻辑
        createFigures: ({ indicator, chart, coordinates }) => {
          const data = indicator.data;
          if (!data || data.length === 0) return [];

          const figures = [];
          const lines = indicator.styles?.lines || [];

          // 绘制折线
          const linePoints = coordinates.map((coord, index) => ({
            x: coord.x,
            y: data[index]?.y ?? coord.y,
          }));

          if (linePoints.length > 1) {
            figures.push({
              type: 'line',
              attrs: {
                coordinates: linePoints,
              },
              styles: {
                style: 'stroke',
                color: lines[0]?.color || '#3b82f6',
                size: lines[0]?.size || 2,
                smooth: true,
              },
              ignoreEvent: true,
            });
          }

          return figures;
        },
      });
    }
  } catch (error) {
    console.warn('Failed to register compare indicator:', error);
  }
}

interface CompareChartProps {
  data: Array<{
    tsCode: string;
    stockName: string;
    sectorName: string;
    normalizedData: ChartPoint[];
    rps10: number;
    color: string;
  }>;
}

export function CompareChart({ data }: CompareChartProps) {
  const handleError = useErrorHandler('CompareChart');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [indicators, setIndicators] = useState<{[key: string]: Indicator}>({});
  const [rsLabels, setRsLabels] = useState<RSLabel[]>([]);
  const theme = useAppStore(state => state.theme);

  // 初始化图表
  useEffect(() => {
    registerCompareIndicator();

    if (chartRef.current) {
      const chart = init(chartRef.current);
      chartInstance.current = chart;

      // 设置基础样式
      chart.applyOptions(getKLineStyles(theme));

      // 配置百分比 Y 轴
      chart.setStyles({
        yAxis: {
          type: 'percentage',
          min: -50,  // -50%
          max: 100,  // +100%
          position: 'right',
          tick: {
            values: [-50, -25, 0, 25, 50, 75, 100],
            format: (value: number) => `${value > 0 ? '+' : ''}${value}%`,
          },
        },
      });

      // 创建基础K线（使用第一只股票的数据作为背景）
      if (data.length > 0) {
        const firstStock = data[0];
        chart.createIndicator('MA', false, {
          id: 'ma',
          styles: {
            lines: [
              { color: '#cccccc', size: 1 },
              { color: '#cccccc', size: 1 },
            ],
          },
          data: firstStock.normalizedData.map(p => ({
            time: toTs(p.time),
            value: p.value,
          })),
        });
      }

      return () => {
        dispose(chart);
        chartInstance.current = null;
      };
    }
  }, []);

  // 当数据变化时更新图表
  useEffect(() => {
    if (!chartInstance.current || !data || data.length === 0) return;

    const chart = chartInstance.current;

    try {
      // 更新或创建对比线
      data.forEach((stock, index) => {
        if (!stock || !stock.normalizedData || stock.normalizedData.length === 0) return;

        const indicatorId = `compare-${stock.tsCode}`;
        const color = COMPARE_PALETTE[index % COMPARE_PALETTE.length];

        // 准备百分比数据
        const percentData = stock.normalizedData.map(p => ({
          time: toTs(p.time),
          value: p.value,
        }));

        // 如果指标已存在，更新数据
        if (indicators[indicatorId]) {
          indicators[indicatorId].updateData(percentData);
        } else {
          // 创建新指标
          const indicator = chart.createIndicator('COMPARE_LINE', false, {
            id: indicatorId,
            styles: {
              lines: [{ color, size: 2 }],
            },
            data: percentData,
          });
          if (indicator) {
            setIndicators(prev => ({ ...prev, [indicatorId]: indicator }));
          }
        }
      });

      // 移除不再需要的指标
      Object.keys(indicators).forEach(id => {
        const shouldKeep = data.some(stock => id === `compare-${stock.tsCode}`);
        if (!shouldKeep) {
          chart.removeOverlay(id);
          delete indicators[id];
        }
      });

      // 更新 RS 标签
      updateRsLabels(data);
    } catch (error) {
      handleError(error, { data });
    }
  }, [data, indicators, handleError]);

  // 更新 RS 标签
  const updateRsLabels = useCallback((stockData: typeof data) => {
    const labels: RSLabel[] = [];

    stockData.forEach((stock, index) => {
      const color = COMPARE_PALETTE[index % COMPARE_PALETTE.length];
      const lastPoint = stock.normalizedData[stock.normalizedData.length - 1];

      if (lastPoint) {
        labels.push({
          tsCode: stock.tsCode,
          value: stock.rps10,
          x: lastPoint.time, // 这里需要转换为坐标
          y: lastPoint.value, // 这里需要转换为坐标
          color,
        });
      }
    });

    // 简单的防碰撞处理
    const positionedLabels = positionLabels(labels);
    setRsLabels(positionedLabels);
  }, []);

  // 标签位置计算（简化版）
  const positionLabels = (labels: RSLabel[]): RSLabel[] => {
    const positioned = [...labels];
    const gridHeight = 20; // 网格高度

    // 对按Y值排序，避免重叠
    positioned.sort((a, b) => a.value - b.value);

    positioned.forEach((label, index) => {
      // 使用简单的网格偏移
      const offset = Math.floor(index / 2) * gridHeight;
      label.y = label.y + offset;
    });

    return positioned;
  };

  // 工具函数：时间戳转换
  function toTs(time: string): number {
    return new Date(`${time.substring(0, 4)}-${time.substring(4, 6)}-${time.substring(6, 8)}`).getTime();
  }

  // 处理图表大小变化
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-full h-full">
      <div
        ref={chartRef}
        className="w-full h-[calc(100%-40px)]"
      />

      {/* RS 标签渲染容器 */}
      <div className="relative w-full h-full">
        {rsLabels.map((label, index) => (
          <div
            key={label.tsCode}
            className="absolute text-xs font-medium bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm border"
            style={{
              color: label.color,
              left: '10px', // 暂时固定位置，需要根据实际坐标计算
              top: `${50 + (index * 30)}px`, // 暂时固定位置
            }}
          >
            RS10: {label.value.toFixed(0)}
          </div>
        ))}
      </div>
    </div>
  );
}