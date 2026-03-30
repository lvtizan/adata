# 交接文档 — 2026-03-30（Codex）

## 当前状态

本轮主要完成了三件事：

1. `KLineCharts` 迁移继续推进
2. 页面跳转链路开始成体系化
3. 顶部统一搜索（股票/板块）已接入代码

当前项目能编译，后端也通过语法检查，但还有几块 UI/交互需要继续收口。

---

## 本轮已完成

### 1. 图表库迁移与画线/标记系统

已完成：
- `frontend/src/features/watchlist/components/watchlist-chart.tsx`
- `frontend/src/shared/charts/kline-chart.tsx`

当前已具备：
- `KLineCharts` 主图替换
- 用户画线自动保存/恢复
- 自定义 overlay:
  - `hhMarker`
  - `drawdownMarker`
  - `resistanceCircle`
  - `levelTag`
- 支撑/压力标签恢复：
  - `支撑 xN`
  - `压力 xN`
- `HH` 标记改成箭头 + 文本
- 回撤标记改成止跌 K 线下方圆点 + 数值
- 图表容器 `ResizeObserver` 自适应恢复
- 默认右侧留白清零，最新一根贴右显示：
  - `chart.setOffsetRightDistance(0)`
  - `chart.setRightMinVisibleBarCount(0)`
  - `chart.scrollToRealTime()`

### 2. 首页 dashboard 结构调整

已完成：
- 去掉顶部大标题说明区，保留信息条
- `RiskGauge` 缩窄，减少上部留白
- 第三列改成上下两块：
  - 上半：细分板块 K 线
  - 下半：选中个股 K 线
- 原来单独的大 `RsPanel` 已去掉
- 个股 K 线改为复用 `WatchlistChart`，左上角带 RS 画中画

相关文件：
- `frontend/src/pages/dashboard/page.tsx`
- `frontend/src/features/market/components/risk-gauge.tsx`

### 3. 指数雷达页面与 API

已完成：
- 独立页面：
  - `frontend/src/pages/index-radar/page.tsx`
- 路由：
  - `frontend/src/app/router/routes.tsx`
- 顶部导航：
  - `frontend/src/app/layouts/root-layout.tsx`
- `server.py` 已补 `/api/index-risk`
- `api_app.py` 也有 `/api/index-risk`

相关文件：
- `backend/server.py`
- `backend/api_app.py`
- `backend/index_risk_analyzer.py`

### 4. 首页个股点击 -> 细分板块工作台

已完成：
- 新页面：
  - `frontend/src/pages/sector-workbench/page.tsx`
- 首页 `dashboard` 第二列点击个股后：
  - 跳转到 `/sector-workbench`
  - 自动带 `sectorCode / sectorName / stockCode`
- 顶部导航高亮已处理：
  - `sector-workbench` 归属到“板块分析”

相关文件：
- `frontend/src/pages/sector-workbench/page.tsx`
- `frontend/src/pages/dashboard/page.tsx`
- `frontend/src/app/layouts/root-layout.tsx`

### 5. 顶部统一搜索（股票 + 板块）

已完成代码接入：
- 后端搜索：
  - `backend/market_engine.py` 新增 `search_market()`
  - `backend/server.py` 新增 `/api/search`
  - `backend/api_app.py` 新增 `/api/search`
- 前端搜索：
  - `frontend/src/shared/layout/market-search.tsx`
  - `frontend/src/shared/layout/top-bar.tsx`
  - `frontend/src/services/stock.service.ts`
  - `frontend/src/queries/stock.queries.ts`
  - `frontend/src/shared/types/stock.ts`

当前搜索目标：
- 搜板块 -> 打开 `sector-workbench`
- 搜股票 -> 打开 `sector-workbench` 对应板块 + 可直接加自选

---

## 已跑检查

前端：
```bash
cd frontend
./node_modules/.bin/tsc --noEmit --pretty --ignoreDeprecations 6.0
```

后端：
```bash
python3 -m compileall backend
```

本轮结束时，两项均通过。

---

## 当前未完成 / 需要 CC 继续做

### A. 首页两张 K 线图的布局还不够紧凑

用户刚反馈的重点：

1. 首页“细分板块 K 线”的成交额副图不一定要保留
   - 用户判断：只标日成交额即可，不必单独给副图高度
2. 首页两张图上下仍有大块留白
   - 显示不紧凑
   - 视觉上“很抵挡”

建议 CC 继续：

1. 优先处理首页第三列两张图的垂直空间
2. 对“细分板块 K 线”单独支持：
   - 不显示成交量副图
   - 或者压缩副图高度到极小
3. 检查 `ChartShell` 与 `WatchlistChart` 的最小高度和 padding
4. 目标：
   - 上下两块真正各占 50%
   - 无大块空白
   - 标签/画中画不挤压主图

可能相关文件：
- `frontend/src/pages/dashboard/page.tsx`
- `frontend/src/features/chart/components/candlestick-panel.tsx`
- `frontend/src/shared/charts/chart-shell.tsx`
- `frontend/src/shared/charts/kline-chart.tsx`
- `frontend/src/features/watchlist/components/watchlist-chart.tsx`

### B. 指数雷达的信息表达仍然偏弱

虽然算法存在，但用户觉得：
- 首页 `市场风险` 半圆图指导意义弱
- 指数雷达页“下面没数据感”

后端算法已在：
- `backend/index_risk_analyzer.py`

建议 CC 继续：

1. 弱化首页 `RiskGauge`
   - 甚至可以考虑移除或进一步简化
2. 强化 `IndexRiskPanel`
   - 每个指数显示：
     - 支撑 xN
     - 压力 xN
     - 趋势
     - 是否衰弱
     - 当前信号
     - `projection`
     - `opportunityZone`
3. 不要只给颜色条和一个信号徽章

相关文件：
- `frontend/src/features/market/components/index-risk-panel.tsx`
- `frontend/src/features/market/components/risk-gauge.tsx`
- `frontend/src/pages/index-radar/page.tsx`

### C. 搜索功能虽然已接线，但需要手工验收

代码已接入，但我这里没有做浏览器交互验收。

需要 CC 重点确认：

1. 顶部搜索框能否正常弹结果
2. 搜股票后：
   - 能否进入 `sector-workbench`
   - “加自选”是否成功
3. 搜板块后：
   - 能否打开整板块工作台
4. 搜索框点击外部后的收起逻辑是否符合预期
5. 搜索框与顶部导航在窄宽度下会不会挤压

相关文件：
- `frontend/src/shared/layout/market-search.tsx`
- `frontend/src/shared/layout/top-bar.tsx`
- `backend/server.py`
- `backend/market_engine.py`

### D. 跳转链路仍可继续完善

这轮已经补了一部分，但还没完全收口。

建议 CC 梳理以下链路：

1. `watchlist` -> 对应板块工作台
   - 现在有“概念标签 -> dashboard”
   - 但缺“直接打开所在细分板块工作台”
2. `bullcamp` -> 对应板块工作台
   - 同上
3. `index-radar` -> 对应板块/市场工作台
   - 现在指数条目不可继续钻取
4. 搜索 -> 页面后的面包屑/返回路径
5. `sector-workbench` 是否需要进入顶部导航显式可达
   - 目前只能通过跳转进入

---

## 关键事实 / 注意事项

### 1. 用户对“不要丢原有能力”非常敏感

这次反复强调过的必须保留项：
- `HH`
- 回撤标记
- 支撑线
- 压力位圆形色块提示
- `支撑 xN / 压力 xN`
- RS 画中画
- 用户画线自动保存

### 2. 用户明确要求

- 启动方式沿用原方案，不要改来改去
- 原方案入口：
```bash
cd /Users/kp/Code/A数据 && ./dev.command
```

### 3. 用户要求“开发前先看踩坑 MD”

本轮已持续更新：
- `.claude/skills/a-stock-dev/references/pitfalls-frontend.md`

### 4. 当前用户最新待办

最新明确要求是：

1. 首页细分板块 K 线不一定需要成交额副图
2. 首页上下两块图空间不紧凑，需要压缩留白

这是 CC 最优先该继续做的。

---

## 推荐接手顺序（给 CC）

1. 先启动原开发链路：
```bash
./dev.command
```

2. 先验这 4 个页面：
- `/dashboard`
- `/index-radar`
- `/watchlist`
- `/sector-workbench?...`

3. 优先改首页第三列：
- 去掉或压缩细分板块成交量副图
- 收紧上下留白

4. 再验顶部搜索：
- 股票
- 板块
- 加自选

5. 最后再增强指数雷达信息表达

---

## 本轮改动涉及的主要文件

### 后端
- `backend/server.py`
- `backend/api_app.py`
- `backend/market_engine.py`
- `backend/index_risk_analyzer.py`

### 前端页面
- `frontend/src/pages/dashboard/page.tsx`
- `frontend/src/pages/index-radar/page.tsx`
- `frontend/src/pages/sector-workbench/page.tsx`

### 前端图表/布局
- `frontend/src/shared/charts/kline-chart.tsx`
- `frontend/src/shared/charts/chart-shell.tsx`
- `frontend/src/features/watchlist/components/watchlist-chart.tsx`
- `frontend/src/features/chart/components/candlestick-panel.tsx`
- `frontend/src/features/market/components/risk-gauge.tsx`
- `frontend/src/features/market/components/index-risk-panel.tsx`
- `frontend/src/shared/layout/top-bar.tsx`
- `frontend/src/shared/layout/market-search.tsx`
- `frontend/src/app/layouts/root-layout.tsx`
- `frontend/src/app/router/routes.tsx`

### 前端服务/查询/类型
- `frontend/src/services/stock.service.ts`
- `frontend/src/queries/stock.queries.ts`
- `frontend/src/shared/types/stock.ts`

