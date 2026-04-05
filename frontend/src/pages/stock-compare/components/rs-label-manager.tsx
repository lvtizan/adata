'use client';

import { useEffect, useRef, useState } from 'react';
import type { Chart, Coordinate } from 'klinecharts';
import type { RSLabel } from '../types';

interface RSLabelManagerProps {
  data: Array<{
    tsCode: string;
    normalizedData: { time: string; value: number }[];
    rps10: number;
    color: string;
  }>;
  chartWidth: number;
  chartHeight: number;
}

export function RSLabelManager({ data, chartWidth, chartHeight }: RSLabelManagerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<RSLabel[]>([]);

  // 颜色方案
  const COMPARE_PALETTE = [
    '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
    '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
  ];

  // 计算标签位置
  useEffect(() => {
    if (data.length === 0) return;

    const newLabels: RSLabel[] = [];

    // 为每只股票计算最后一个数据点的标签
    data.forEach((stock, index) => {
      const lastPoint = stock.normalizedData[stock.normalizedData.length - 1];
      if (!lastPoint) return;

      const color = COMPARE_PALETTE[index % COMPARE_PALETTE.length];

      // 将数据点转换为图表坐标
      const x = dataPointToX(lastPoint.time);
      const y = dataPointToY(lastPoint.value);

      newLabels.push({
        tsCode: stock.tsCode,
        value: stock.rps10,
        x,
        y,
        color,
      });
    });

    // 应用防碰撞算法
    const positionedLabels = layoutLabels(newLabels);
    setLabels(positionedLabels);
  }, [data]);

  // 防碰撞布局算法
  const layoutLabels = (inputLabels: RSLabel[]): RSLabel[] => {
    const positioned = [...inputLabels];
    const gridSize = { width: 80, height: 30 }; // 网格大小
    const occupied = new Map<string, RSLabel>(); // 已占用的位置

    // 按数值排序，先处理数值较大的
    positioned.sort((a, b) => b.value - a.value);

    positioned.forEach((label, index) => {
      let bestY = label.y;
      let offset = 0;
      let attempts = 0;
      const maxAttempts = 10;

      // 寻找合适的Y坐标，避免碰撞
      while (attempts < maxAttempts) {
        const gridX = Math.floor(label.x / gridSize.width);
        const gridY = Math.floor((bestY + offset) / gridSize.height);
        const gridKey = `${gridX}-${gridY}`;

        if (!occupied.has(gridKey)) {
          occupied.set(gridKey, label);
          label.y = bestY + offset;
          break;
        }

        // 螺旋搜索策略
        if (attempts % 2 === 0) {
          offset += attempts === 0 ? 0 : 20;
        } else {
          offset = -offset;
        }
        attempts++;
      }

      // 如果尝试多次后仍然冲突，使用默认位置
      if (attempts >= maxAttempts) {
        const gridX = Math.floor(label.x / gridSize.width);
        const gridY = Math.floor(label.y / gridSize.height);
        let finalOffset = 0;

        // 向上寻找空闲位置
        while (occupied.has(`${gridX}-${gridY}`)) {
          finalOffset += gridSize.height;
          if (finalOffset > chartHeight) break;
        }

        label.y = label.y + finalOffset;
        if (finalOffset <= chartHeight) {
          occupied.set(`${gridX}-${gridY}`, label);
        }
      }
    });

    return positioned;
  };

  // 将数据点时间转换为X坐标（简化版）
  const dataPointToX = (time: string): number => {
    // 这里应该根据图表的实际X轴刻度转换
    // 简化处理：假设时间均匀分布
    const totalPoints = 120; // 默认120天
    const xPosition = ((parseInt(time) % 10000) / totalPoints) * chartWidth;
    return Math.max(10, Math.min(chartWidth - 50, xPosition));
  };

  // 将数据点值转换为Y坐标（百分比）
  const dataPointToY = (value: number): number => {
    // 将百分比值转换为图表坐标
    // 假设Y轴范围：-50% 到 +100%
    const normalizedY = (value + 50) / 150; // 归一化到 0-1
    const yPosition = chartHeight - (normalizedY * chartHeight);
    return Math.max(10, Math.min(chartHeight - 20, yPosition));
  };

  // 渲染标签
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = ''; // 清空现有内容

    labels.forEach((label) => {
      const labelEl = document.createElement('div');
      labelEl.className = 'absolute text-xs font-medium bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm border transition-all hover:shadow-md';
      labelEl.style.color = label.color;
      labelEl.style.left = `${label.x}px`;
      labelEl.style.top = `${label.y}px`;
      labelEl.style.transform = 'translateY(-100%)'; // 向上偏移，避免遮挡数据点
      labelEl.style.whiteSpace = 'nowrap';
      labelEl.style.pointerEvents = 'none';
      labelEl.style.zIndex = '1000';

      // 鼠标悬停效果
      labelEl.addEventListener('mouseenter', () => {
        labelEl.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        labelEl.style.transform = 'translateY(-100%) scale(1.1)';
      });

      labelEl.addEventListener('mouseleave', () => {
        labelEl.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        labelEl.style.transform = 'translateY(-100%) scale(1)';
      });

      labelEl.textContent = `RS10: ${label.value.toFixed(0)}`;
      container.appendChild(labelEl);
    });
  }, [labels]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
    />
  );
}