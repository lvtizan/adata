# 开发工作流文档

## 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (React + Vite :5174)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 盘中观察  │  │ 板块分析  │  │ 指数雷达  │  │  盘前纪要   │  │
│  │ 市场总览  │  │ 自选股    │  │ 牛股集中营│  │  每日简报   │  │
│  │ 双底扫描  │  │ 股票对比  │  │ 研究助手  │  │  设置      │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                        ↕ API (/api/*)                        │
├─────────────────────────────────────────────────────────────┤
│                    后端 (Python HTTP :8088)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ market_engine │  │ precompute   │  │ pattern_predictor │  │
│  │ (数据引擎)    │  │ (预计算)      │  │ (形态预测)        │  │
│  ├──────────────┤  ├──────────────┤  ├───────────────────┤  │
│  │ server.py     │  │ news_daemon  │  │ daily_scheduler   │  │
│  │ (API路由)     │  │ (新闻采集)    │  │ (定时调度)        │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                        ↕ Tushare API                         │
├─────────────────────────────────────────────────────────────┤
│  SQLite: precomputed.db / watchlist.db / news_feed.db       │
│  Tushare Pro API (数据源)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 功能模块工作流

### 1. 盘前纪要 (market-recap)

**数据源**: Tushare `daily()` + `top_inst()` API

**工作流**:
```
Tushare API → market_engine.market_recap()
  ├─ _recap_limit_up_hotspots()  → 涨停热点（连板统计 + 板块分组）
  ├─ _recap_institutional()      → 机构买卖（top_inst 过滤机构席位）
  ├─ _recap_hot_money()          → 游资动向（top_inst 过滤非机构席位）
  ├─ _recap_new_highs()          → 股价新高（收盘 > 250日最高）
  └─ _recap_alerts()             → 异动预警（量价异动检测）
→ precompute 缓存(SQLite) → /api/market-recap → 前端5个Tab
```

**前端交互**: 左侧列表(Tab切换) + 右侧K线图，点击切换股票，默认选中第一只。

**性能**: 预计算后 <3ms，实时计算 ~14s。

---

### 2. 每日简报 (morning-brief)

**数据源**: 财联社 + 新浪财经 + 东方财富公告

**工作流**:
```
news_daemon.py (每5分钟轮询)
  ├─ fetch_cls()       → 财联社7x24电报 (50条/轮)
  ├─ fetch_sina()      → 新浪财经滚动新闻 (50条/轮)
  └─ fetch_eastmoney() → 东方财富上市公司公告 (30条/轮)
→ 自动分类(政策/板块/个股/宏观/资金/科技)
→ 存入 news_feed.db (3天自动清理)
→ /api/news-brief (结构化简报) + /api/news-feed (原始列表)
```

**知识星球接入**: `python3 news_aggregator.py --login-zsxq` → 浏览器扫码 → Cookie存储 → 后续自动抓取。

**设计原则**: 不长期存储，只保留近3天数据。

---

### 3. 形态预测 (pattern_predictor)

**数据源**: K线数据 (150根)

**预测形态**:
| 形态 | 检测条件 | 置信度阈值 |
|------|---------|-----------|
| 双底(W底) | 第一底确认 + 回调至第一底3-12% + 缩量 | ≥0.6 |
| 杯柄 | 杯体U型(跌>15%回升>75%) + 柄部回调<12% + 柄部缩量 | ≥0.6 |
| 上升三角 | 水平压力≥2次触及 + 低点抬升≥2次 + 当前距压力<5% | ≥0.6 |

**工作流**:
```
每日16:00 daily_scheduler → precompute.py
  → 扫描 top500 + 自选股
  → pattern_predictor.predict_patterns(df)
  → 只保存 confidence ≥ 0.6 的预测
  → 存入 precomputed.db/pattern_predictions
→ /api/stock/{code}/predictions (单股，优先查预计算)
→ /api/predictions (全市场预测列表)
→ K线图渲染: 紫色虚线路径 + 目标价/止损位水平线
```

**输出结构**: 每个预测包含 `projectedPath`(虚线点)、`keyLevels`(关键价位)、`action`(入场/止损/目标/盈亏比)。

---

### 4. 形态检测 (pattern_detector)

**数据源**: K线数据 (270根)

**已实现形态**: 杯柄、VCP、紧凑盘整、三线开花、口袋支点

**HH信号系统** (Al Brooks式):
```
找支撑位(swing low聚类) → 数反包次数
  H1 = 第一次反转（今高>昨高）
  H2 = H1失败后第二次反转 = W底确认
  buySignal = H≥2 且 量比1.2-3.0x（温和放量）
```

**API**: `/api/stock/{code}/patterns` → 信号点 + 回撤标记 + 支撑/阻力 + MA排列

---

### 5. 双底扫描 (hh-scan / double-bottom-scan)

**工作流**:
```
market_engine.double_bottom_scan(trade_date)
  → 扫描牛股集中营所有股票
  → pattern_detector.detect_all_patterns_with_signals(df)
  → 过滤有W底信号的股票，按板块分组
→ /api/double-bottom-scan → 前端按板块展示
```

**关键修复**: `pattern_detector.py:1213` — support_prices 使用回退支撑位，不再因空列表跳过所有股票。

---

### 6. 指数走势对比 (index-radar)

**数据源**: Tushare `index_daily()` + `ths_daily()`

**跟踪指数**: 13个（大盘4/大中小3/成长2/情绪3/港股1）

**工作流**:
```
market_engine.index_kline(ts_code, trade_date, bars)
  → A股指数: index_daily()
  → 同花顺指数: ths_daily()
  → 港股指数: ths_daily()
→ /api/charts/index/{ts_code}
→ 前端归一化为百分比变化 → LineCompareChart (Canvas渲染)
```

**交互**: 按组选择指数 + 1月/3月/6月/1年周期 + 十字线tooltip。

---

### 7. 股票对比 (stock-compare)

**工作流**:
```
搜索添加股票 → useMultiStockCharts() 并行获取K线
→ 归一化为百分比变化
→ LineCompareChart 渲染多条线
→ 末尾显示 RS 值标签（防重叠算法）
→ 十字竖线 + 交叉点高亮
```

**设计**: 单页面，顶部常驻搜索框随时添加，不需要"返回选择"步骤。

---

### 8. 研究助手 (ai-research-panel)

**纯本地数据聚合**，无需 LLM API。

**工作流**:
```
用户输入股票名/代码 → /api/search
→ 并行拉取 7 个维度:
  ├─ /api/stock/{code}/tags         → 板块 + 概念 + 资金属性
  ├─ /api/stock/{code}/patterns     → 技术形态 + 信号
  ├─ /api/stock/{code}/attribution  → 涨跌归因
  ├─ /api/relative-strength         → RS 相对强度
  ├─ /api/stock/{code}/financials   → 财务数据
  └─ /api/stock/{code}/hh-stats     → HH 信号历史胜率
→ 右下角浮窗展示结构化研报卡片
```

---

## 三层缓存架构

### 1. 预计算层 (precompute.py → SQLite precomputed.db)

**触发时机**: 服务启动 + 每日 15:10/16:00 定时调度

**预计算内容**:
| 表 | 内容 | 查询时间 |
|---|------|---------|
| stock_concepts | 股票→概念板块反向索引 | <1ms |
| stock_tags | 个股标签(概念+资金+关联股) | <1ms |
| stock_attribution | 上涨归因 | <1ms |
| stock_rs | 相对强度 | <1ms |
| search_snapshot | 全市场5400+股票指标+板块映射 | <1ms |
| market_recap_cache | 盘前纪要 | <3ms |
| pattern_predictions | 形态预测(双底/杯柄/三角) | <1ms |

### 2. 内存缓存层 (MarketEngine._cache dict)

| 缓存键 | TTL | 说明 |
|--------|-----|------|
| stock_metrics | 300s | 个股指标 |
| sector_metrics | 300s | 板块指标 |
| stock_kline / index_kline | 300s | K线数据 |
| ths_member 映射 | 24h | 板块成员关系 |
| trade_dates | 3600s | 交易日历 |

### 3. 前端缓存层 (React Query + cached-api)

| 机制 | 配置 | 说明 |
|------|------|------|
| React Query staleTime | 60s-600s | 数据在此时间内不重新请求 |
| cached-api.ts | localStorage | 跨刷新保留 |
| zustand persist | localStorage | 自选股/股票对比选中状态持久化 |

---

## 定时调度 (daily_scheduler.py)

| 时间 | 任务 | 内容 |
|------|------|------|
| 09:00 | job_pre_market | 多源新闻采集 + 盘前简报生成 |
| 11:35 | job_midday | precompute刷新 + 午间简报 |
| 15:10 | job_post_market | precompute刷新 + 收盘总结 |
| 16:00 | job_precompute_predictions | 全市场形态预测扫描 |

**新闻采集**: `news_daemon.py` 独立进程，每5分钟一轮，3天自动清理。

---

## 后台进程

| 进程 | 启动方式 | 日志 |
|------|---------|------|
| server.py | dev.sh 自动启动 | /tmp/a-data-backend.log |
| daily_scheduler.py | dev.sh --daemon | /tmp/a-data-scheduler.log |
| news_daemon.py | dev.sh --daemon | /tmp/a-data-news.log |
| 前端 Vite dev | dev.sh 自动启动 | /tmp/a-data-frontend.log |

---

## UI 设计原则

### 列表+图表布局
所有包含股票列表的页面统一采用 **左列表 + 右K线图** 布局：
- 左侧宽度 340-380px，紧凑表格
- 默认选中第一只股票，右侧立即显示K线
- 切换Tab时自动选中新列表第一只
- 行点击切换，选中行高亮

### 边距与文字
- 列表文字使用 `truncate` 防溢出
- 列宽显式设置，保证信息完整展示
- 所有数值 `.toFixed()` 前用 `?? 0` 保护
- 营业部等长文本加 `title` 属性显示完整内容

### 图表组件
- **KlineChart** (klinecharts): K线+信号+支撑阻力+形态预测虚线
- **LineCompareChart** (Canvas): 多线百分比对比+十字线+末尾标签
- 所有图表支持主题切换(dark/light)

---

## 开发流程

### 新增功能
1. **先查 precompute.py** — 是否已有预计算？有则直接查SQLite
2. **耗时>100ms的计算** — 加入预计算，16:00批量跑
3. **API优先查预计算** — 实时计算仅作fallback
4. **前端先加 service → query hook → 组件**

### 新增数据源
1. 在 `news_aggregator.py` 添加 `fetch_xxx()` 函数
2. 加入 `fetch_all()` 的 sources 列表
3. 前端 `morning-brief/page.tsx` 添加 SOURCE_LABELS
4. 知识星球等需登录的源：cookie注入方案

### 性能基准
| 指标 | 目标 | 当前 |
|------|------|------|
| 搜索 API | <30ms | 22ms |
| 盘前纪要 | <5ms | <3ms |
| K线加载 | <50ms(缓存) | ~10ms |
| 形态预测 | <1ms(预计算) | <1ms |
| 新闻简报 | <5ms | ~2ms |

---

## 启动方式

```bash
bash dev.sh          # 启动全部（后端 + 前端 + 调度器 + 新闻采集）
bash dev.sh stop     # 停止全部
bash dev.sh status   # 查看状态
```

前端: http://127.0.0.1:5174
后端: http://127.0.0.1:8088
