# 自选股K线图重构计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 自选股页面复用共享 `KlineChart` 组件，利用 klinecharts 内置画线工具，消除 900 行重复代码。

**Architecture:** 把 `watchlist-chart.tsx` 从独立实现改为薄包装：KlineChart（渲染+信号） + 画线保存层 + klinecharts 内置工具。

---

## 现有功能清单（必须保留）

### K线图信号标注
- **H1**: Al Brooks 价格反包信号（橙色箭头▲）— `pattern_detector.py:detect_feng_signals()`
- **W**: 双底确认信号（橙色 W）— 同上
- **支撑线**: 聚类算法找多次测试的水平支撑（绿色虚线 + 绿底白字 "支撑 x2"）— `_find_support_levels()`
- **压力线**: 同上逻辑（红色实线 + 红底白字 "压力 x2"）— `_find_resistance_levels()`
- **回撤标注**: 红色圆点 + 百分比（如 -21.4%）— `detect_hh_signals()`
- **压力顶红圈**: 压力位触及点标记 — `resistanceCircle` overlay

### 画线工具（klinecharts 内置）
- 直线 (`horizontalStraightLine`)
- 线段 (`segment`)
- 射线 (`rayLine`)
- 箱体 (`rect`)
- 标注 (`simpleAnnotation`)

### 快捷模板按钮
- 支撑（在当前价画绿色水平线）
- 阻力（在当前价画红色水平线）
- 标签（价格标签）
- 买入（点击选价位→自动算止损止盈）

### 画线持久化
- 画线完成后自动保存到 localStorage + 后端 SQLite
- 切换股票时恢复历史画线
- 清空功能

### 日/周/月切换
- 日线: Tushare 前复权（含冯总信号）
- 周线/月线: Ashare 实时数据

### RS 相对强弱迷你图
- 左上角叠加显示

---

## 后端算法清单（不动）

| 文件 | 函数 | 功能 |
|------|------|------|
| `pattern_detector.py` | `detect_feng_signals()` | 冯总 H1/H2/W 信号链 |
| `pattern_detector.py` | `_find_support_levels()` | 聚类支撑位 |
| `pattern_detector.py` | `_find_resistance_levels()` | 聚类压力位 |
| `pattern_detector.py` | `detect_hh_signals()` | 回撤标注 |
| `pattern_detector.py` | `detect_all_patterns_with_signals()` | 形态+信号汇总 |
| `market_engine.py` | `stock_kline()` | 日线K线+冯总信号 |
| `market_engine.py` | `stock_kline_ashare()` | 周/月线实时 |

---

## 重构步骤

### Task 1: 扩展 KlineChart 组件

**文件:** `frontend/src/shared/charts/kline-chart.tsx`

新增 props:
- `enableDrawing?: boolean` — 开启内置画线工具
- `drawingTools?: string[]` — 启用的工具列表
- `onDrawingsChange?: (overlays) => void` — 画线变更回调
- `initialDrawings?: ChartDrawingOverlay[]` — 初始画线数据

klinecharts 内置画线只需调用 `chart.createOverlay({ name: "toolName" })`，用户画完后通过事件回调保存。

### Task 2: 画线保存层

**文件:** `frontend/src/shared/charts/chart-drawing-layer.tsx`（新建）

薄包装组件：
```tsx
function ChartWithDrawings({ tsCode, ...klineProps }) {
  // 1. 从 localStorage/API 读取历史画线
  // 2. 传给 KlineChart 的 initialDrawings
  // 3. 监听 onDrawingsChange，自动保存
}
```

### Task 3: 重写自选股图表

**文件:** `frontend/src/features/watchlist/components/watchlist-chart.tsx`

从 900 行缩减到 ~100 行：
```tsx
function WatchlistChart({ tsCode, sectorCode, ... }) {
  return (
    <ChartWithDrawings tsCode={tsCode}>
      <KlineChart
        points={...}
        fengSignals={...}
        supports={...}
        resistances={...}
        enableDrawing
        drawingTools={["horizontalStraightLine", "segment", "rayLine", "rect", "simpleAnnotation"]}
      />
    </ChartWithDrawings>
  )
}
```

### Task 4: 买入划线工具

保留现有逻辑：点击"买入"→用户选价位→自动算止损(最近支撑)和止盈(2R)→画三条线。

### Task 5: 验证 + 清理

- 确认所有信号（H1/W/支撑/压力/回撤）正常显示
- 确认画线保存/恢复正常
- 确认日周月切换正常
- 删除旧的 900 行 watchlist-chart.tsx 中不再需要的代码
