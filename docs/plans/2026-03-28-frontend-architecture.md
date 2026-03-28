# 前端技术栈架构方案（shadcn/ui + Tailwind + Lightweight Charts）

## 1. 方案目标

为股票分析 / 复盘 / 选股 / 观察系统建立一套适合长期迭代的前端技术架构。

## 2. 技术栈

- React + Vite + TypeScript
- Tailwind CSS
- shadcn/ui
- Lightweight Charts
- Zustand（客户端 UI 状态）
- TanStack Query（服务端数据状态）
- React Router（页面路由）

## 3. 总体架构分层

```
App Shell (TopBar / LeftRail / MainWorkspace / RightPanel / BottomBar)
    |
Page Layer (dashboard / chart / screener / review / watchlist / positions / alerts / settings)
    |
Feature Layer (market / chart / screener / review / alerts / watchlist / positions)
    |
Shared UI Layer (shadcn/ui wrappers + design system + table + layout)
    |
State & Data Layer (Zustand / TanStack Query / API services)
    |
Backend API Layer (stock / sector / review / alert / holdings / market)
```

## 4. App Shell 结构

```
AppShell
  +-- TopBar (48px): 搜索、周期、指标、布局切换、主题切换
  +-- LeftRail (52px): 图表工具、页面主导航、复盘工具
  +-- MainWorkspace: 页面主内容（图表/表格/复盘）
  +-- RightPanel (320px, 可折叠): 自选列表、标的详情、新闻、预警
  +-- BottomBar (36px, 可选): 时间窗口、回放、日志
```

## 5. 页面规划

```
/pages
  +-- dashboard    — 全局市场摘要、板块排名、自选异动、预警摘要
  +-- chart        — 个股/板块 K 线、双图对比、指标叠加
  +-- screener     — 筛选条件、结果表格、个股快速预览
  +-- review       — 当日大盘环境、板块主线、复盘记录、交易点评
  +-- watchlist    — 自选列表、快速切换、异动标签、强弱排序
  +-- positions    — 当前持仓、已清仓交易、盈亏、复盘入口
  +-- alerts       — 大盘/板块/个股预警、触发记录
  +-- settings     — 系统设置
```

## 6. 目录结构

```
src/
  app/
    router/
    providers/
    layouts/
    theme/
  pages/
    dashboard/
    chart/
    screener/
    review/
    watchlist/
    positions/
    alerts/
    settings/
  features/
    market/     (components/ hooks/ utils/)
    chart/      (components/ hooks/ adapters/ utils/)
    sectors/    (components/ hooks/ utils/)
    stocks/     (components/ hooks/ utils/)
    screener/   (components/ hooks/ utils/)
    review/     (components/ hooks/ utils/)
    alerts/     (components/ hooks/ utils/)
    watchlist/  (components/ hooks/ utils/)
    positions/  (components/ hooks/ utils/)
    ai-review/  (components/ hooks/ utils/)
  shared/
    ui/         (shadcn/ui 组件)
    charts/     (图表通用组件)
    layout/     (AppShell 等布局组件)
    table/      (表格通用组件)
    form/
    hooks/
    utils/
    constants/
    types/
    lib/
  store/
    app-store.ts
    chart-store.ts
    screener-store.ts
    review-store.ts
    watchlist-store.ts
    alert-store.ts
  services/
    api-client.ts
    market.service.ts
    stock.service.ts
    sector.service.ts
    screener.service.ts
    review.service.ts
    alert.service.ts
    position.service.ts
  queries/
    market.queries.ts
    stock.queries.ts
    sector.queries.ts
    screener.queries.ts
    review.queries.ts
    alert.queries.ts
    position.queries.ts
  styles/
    globals.css
    tokens.css
  main.tsx
```

## 7. 设计系统层

### 7.1 shared/ui 组件清单

button, icon-button, input, search-input, tabs, dropdown, tooltip, dialog, drawer, command, badge, scroll-area, separator, panel, section-header, stat-card, empty-state, loading-state, error-state

### 7.2 shared/charts 组件清单

chart-shell, kline-chart, volume-chart, sector-chart, compare-chart, chart-legend, chart-toolbar, chart-tooltip, crosshair-sync, indicator-overlay, chart-theme

### 7.3 shared/table 组件清单

data-table, table-toolbar, table-empty, table-loading, table-header-cell, numeric-cell, tag-cell, row-actions

## 8. 图表模块架构

```
ChartFeature
  +-- ChartContainer    — 容器尺寸、主题、边界、加载态
  +-- ChartToolbar      — 周期切换、指标开关、对比模式
  +-- ChartViewport     — 挂载 Lightweight Charts 实例
  +-- IndicatorLayer    — MA、成交量、强弱线
  +-- CompareLayer      — 个股 vs 板块、双图联动
  +-- DrawingLayer      — (future)
  +-- ChartInfoOverlay  — 左上角：股票名、周期、当前价
```

图表页面结构：
```
ChartPage
  +-- ChartPageHeader
  +-- ChartWorkspace
  |     +-- MainChartPanel (ChartToolbar + KlineChart + VolumePanel)
  |     +-- ComparePanel (SectorCompareChart)
  |     +-- RightInfoPanel (WatchlistTabs + StockSummary + SectorSummary + NewsList)
  +-- BottomTimelineBar
```

## 9. 状态管理架构

### 服务端状态（TanStack Query）

行情数据、板块数据、选股结果、复盘记录、预警记录、持仓数据

### 客户端 UI 状态（Zustand）

- app-store: 主题、右侧面板开关、左侧栏折叠、布局模式
- chart-store: 当前股票、板块、周期、指标开关、对比模式
- screener-store: 筛选条件、排序
- review-store: 复盘筛选、当前选中交易记录
- watchlist-store: 自选列表状态
- alert-store: 预警配置

### 数据流

```
UI Interaction -> Zustand 更新参数 -> TanStack Query 请求数据 -> service 调后端 API -> 返回标准化数据 -> Chart/Table/Panel 渲染
```

## 10. 类型系统

```
shared/types/
  stock.ts     — StockBasic, StockQuote, StockDetail
  sector.ts    — SectorStrength, SectorRanking
  market.ts    — MarketOverview, MarketBreadth
  screener.ts  — ScreenerFilter, ScreenerResult
  review.ts    — ReviewEntry, TradeRecord
  alert.ts     — AlertRule, AlertTrigger
  position.ts  — Position, ClosedTrade
  chart.ts     — CandlePoint, VolumePoint, IndicatorData
  common.ts    — PaginatedResult, ApiResponse
```

## 11. 主题架构

```
app/theme/
  theme-provider.tsx   — 主题上下文、切换逻辑
  theme-tokens.ts      — 颜色/间距/字号/圆角 token 定义
  chart-theme.ts       — Lightweight Charts 专用主题映射
```

亮色/深色两套 CSS 变量，Tailwind 引用。图表区单独映射 chart-theme 给 Lightweight Charts。

## 12. 开发优先级

### Phase 1：工作台骨架
- AppShell + TopBar + LeftRail + RightPanel
- 基础主题（亮/深色切换）
- Design tokens
- 基础 shadcn/ui 组件
- React Router 页面框架
- Dashboard 空壳 + Chart 空壳 + Watchlist 基础版

### Phase 2：接图表
- K 线图 + 成交量
- 周期切换 + 个股切换
- 板块图
- 双图对比
- 右侧详情联动

### Phase 3：接选股和复盘
- Screener 表格 + 条件筛选
- Review 页面 + 交易记录 + 复盘点评

### Phase 4：预警和智能模块
- Alert Center
- 大盘/板块/个股预警
- 智能复盘面板 + AI 摘要
