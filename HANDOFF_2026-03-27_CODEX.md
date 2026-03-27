# 交接记录 2026-03-27 Codex

## 当前目标

把现有 A 股板块强度分析站点改成更接近 TradingView 的工作台，重点推进：

- 首页终端化改造
- 自选股页改成主图 K 线 + 副图
- 新增 `牛股集中营`
- 后续准备做 `板块详情工作台`

## 本轮已完成

### 1. 运行边界与端口梳理

- 当前项目路径确认：
  `/Users/kp/Library/Mobile Documents/com~apple~CloudDocs/AI项目/A数据`
- 前端开发端口确认：
  `5173`
- 后端 API 端口确认：
  `8082`
- 清理过一次误占用 `5173` 的其他项目进程，并重新拉起当前项目前端

### 2. TradingView 风格首页 / 自选股基础改造

已核对并沿用这些改动：

- `backend/market_engine.py`
  已新增 `marketRisk`
- `frontend/src/App.jsx`
  已切到终端式布局
- `frontend/src/components/MarketRiskGauge.jsx`
  已新增并后续压成顶部摘要样式
- `frontend/src/components/WatchlistWorkbench.jsx`
  已新增
- `frontend/src/components/WatchlistChart.jsx`
  已改成主图 + 副图，并在本轮被重写为更稳定版本
- `frontend/src/styles.css`
  已整体改成更扁平的 TradingView 风格
- `docs/plans/2026-03-27-tradingview-terminal-redesign.md`
  已存在

### 3. 页面视觉与交互细化

- 页面背景改成纯白 `#FFFFFF`
- 细分板块 / 个股 K 线标题副文案改成优先显示中文名称，不再默认显示代码
- 滚动条改成：
  默认隐藏，鼠标移上滚动区域再显示
- `自选股` 和 `牛股集中营` 的左右分栏之间加入拖拽中缝，可调整宽度

### 4. 牛股集中营已接入

后端：

- 新增接口：
  `GET /api/camp/bull-stocks`
- 筛选逻辑已接入 `backend/market_engine.py`

当前口径：

- `RPS20 > 87`
- `成交额 >= 10亿`
- `收盘价 > 昨收`
- `relative_strength / spreadSeries` 最新值 `> 0`
- `个股近 5 日涨幅 > 所属板块近 5 日涨幅`
- `个股 RPS20 > 所属板块 RPS10`

并计算：

- `campScore`

前端：

- 顶部导航新增：
  `牛股集中营`
- 左侧股票列表支持全表头排序
- 右侧接主图 + 副图工作区

### 5. 缓存 / 预加载已做

前端 `frontend/src/lib/api.js` 已做：

- GET 请求内存缓存
- 并发请求去重
- 各接口 TTL
- `watchlist` 写操作后自动失效缓存

首页 `frontend/src/App.jsx` 已做：

- 首页加载完成后后台预取 `牛股集中营`
- 预取 `牛股集中营` 首只股票的图表数据

后端 `backend/api_app.py` 已做：

- 启动后后台预热：
  - `market_overview`
  - `sector_rankings`
  - `bull_camp`

### 6. 自我修正规则已落文件

新增：

- `docs/system.md`
- `docs/self-learning.md`

已经记录了这次踩过的坑和后续默认规则，包括：

- 改后端接口后必须重启服务
- 先区分接口不存在和数据为空
- DataFrame 降级分支必须做空列保护
- UI 默认优先显示中文名称
- 所有列表型数据表头默认支持排序

## 当前最大未完成项

### 牛股集中营右侧 K 线图仍不稳定

这是当前最重要的未收口问题。

现象：

- 右侧 K 线图曾出现比例失控、横向拉宽、显示异常
- 多轮前端调整后仍未完全确认稳定

已经做过的处理：

- 前端 `WatchlistChart.jsx` 重写过一版，简化图表承载
- 对牛股集中营右侧先关闭左侧画线工具栏，减少布局干扰
- 后端 `stock_kline` 已改成优先使用 `前复权` 日线，失败时才降级到原始日线

当前判断：

- 前面的很多修复偏前端止血，未必命中根因
- 更可能的根因在 `stock_kline` 返回的价格口径或个别股票的异常 OHLC 数据

当前状态：

- 这块还没有被验证为“彻底正常”

## 下一步建议

### 最高优先级

1. 先验证当前 `8082` 后端是否已经运行在最新代码上
2. 直接抓取一只异常样本股的 `/api/charts/stock/{tsCode}` 返回
3. 检查：
   - 点数是否完整
   - `open/high/low/close` 是否有异常跳点
   - 是否存在复权前后混杂问题
4. 如果后端数据异常：
   在 `backend/market_engine.py -> stock_kline()` 源头修
5. 如果后端数据正常：
   再看前端 `WatchlistChart.jsx` 的价格轴和容器尺寸问题

### 次优先级

在 `牛股集中营` 稳定后继续推进：

1. 新做 `板块详情工作台`
2. 左侧保留现成画线控件
3. 中间主图显示板块 K 线
4. 右侧做：
   - 顶部 `板块概览卡`
   - 下方 `全部成分股 / 板块强势股(HH)` Tab

## 当前关键文件

后端：

- `backend/api_app.py`
- `backend/market_engine.py`

前端：

- `frontend/src/App.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/components/BullCampWorkbench.jsx`
- `frontend/src/components/WatchlistWorkbench.jsx`
- `frontend/src/components/WatchlistChart.jsx`
- `frontend/src/components/CandlestickPanel.jsx`
- `frontend/src/styles.css`

文档：

- `docs/system.md`
- `docs/self-learning.md`
- `docs/plans/2026-03-27-tradingview-terminal-redesign.md`

## 本轮验证情况

已通过：

- `python3 -m py_compile backend/*.py backend/providers/*.py`
- `npm run build`

未完全闭环：

- `牛股集中营` 右侧 K 线最终显示效果

## 启动方式

后端：

```bash
cd backend
python3 api_app.py
```

前端：

```bash
cd frontend
npm run dev
```

访问：

- 前端：
  `http://127.0.0.1:5173/`
- 后端：
  `http://127.0.0.1:8082/`

## 交接一句话

当前项目已经从“基础终端化改造”推进到“牛股集中营 + 缓存预加载 + 交互细化”阶段，最大卡点只剩 `牛股集中营` 右侧 K 线显示稳定性，建议下一步不要再表层止血，直接从 `stock_kline` 返回数据做源头校验。
