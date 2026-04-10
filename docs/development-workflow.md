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
- 核心主线页要求：股票名必须可点击并联动右侧K线
- 核心主线页要求：股票名称区域必须展示当日涨跌幅与 RS（RPS20 口径）

---

## 变更防错清单（新增）

### 1. 接口返回类型变更（强制）

当任一 hook/service 返回类型变化时（例如 `number` → `object`）：

1. 全局检索调用点：`rg -n "useXxx|getXxx|字段名"`  
2. 逐页修复访问方式（例如从 `quoteMap.get(code)` 改为 `quoteMap.get(code)?.pctChange`）。  
3. 禁止使用 `as number` 强转掩盖类型问题。  
4. 执行 `npm run build` 与关键页面手测后才允许提交。  

### 2. 实时与快照一致性（强制）

涉及列表 + 右侧K线的页面，必须满足：

1. 同一页面同一字段口径一致。  
2. 个股列表 `现价/当日涨跌` 优先实时行情，失败再回退快照。  
3. 右图与左表使用同一只股票、同一交易时点数据。  
4. 对比抽查至少 2 只股票（如截图中点名股票 + 随机一只）。  

### 3. K线组件统一（进行中规则）

1. 统一组件源：`StockKlineWorkbench`（含画线、买入线、止损止盈计算）。  
2. 页面禁止重复拼装画线工具栏逻辑，统一复用该组件。  
3. 新增K线页时默认接入统一组件，不再直接使用裸 `KlineChart`（除纯只读指数对比场景）。  

---

## Harness Engineering（基于 Anthropic 长任务实践）

来源：Anthropic Engineering《Harness design for long-running application development》（2026-03-24）

### 核心结构（默认）

采用三角色闭环：

1. Planner：把 1-4 句需求扩展成分阶段规格（高层，不写死实现细节）。  
2. Generator：按 Sprint 实现一个可验证特性。  
3. Evaluator：独立验收（UI + API + DB + 可用性 + 代码质量），不参与实现。  

### Sprint 合同（强制）

每个 Sprint 开始前必须先产出 `Sprint Contract`：

1. 本 Sprint 交付范围（只做一件可完成的事）。  
2. 可验证验收标准（可测、可重复）。  
3. 风险点与回退策略。  

未达成合同一致，不进入编码。

### 评分门禁（强制）

Evaluator 对每个 Sprint 做 4 维评分并设置硬阈值：

1. Product Depth（是否真正完成用户目标）  
2. Functionality（真实可用，流程可走通）  
3. Visual/UX（信息层级、交互清晰度）  
4. Code Quality（结构、可维护、可扩展）  

任一维度低于阈值，Sprint 直接判定失败并返工。

### 长任务上下文策略

1. 优先单会话 + 自动压缩（compaction）。  
2. 如出现上下文漂移或提前收尾倾向，执行 `context reset + 结构化交接`。  
3. 交接必须包含：当前状态、未完成项、下一步、已知风险、验证证据。  

### 工程化落地规则

1. 生成与评估职责隔离，禁止“自评即通过”。  
2. 每次改动先定义评估标准，再实现。  
3. 评估证据必须可追溯（测试输出、构建日志、关键截图/接口响应）。  
4. 复杂改动默认拆 Sprint，避免一次大改。  

### 我们项目的执行模板

每个大任务按以下文件流转：

1. `docs/plans/<date>-<topic>-contract.md`（Sprint 合同）  
2. 实现改动（代码）  
3. `docs/plans/<date>-<topic>-evaluation.md`（Evaluator 结果）  
4. 未通过则回到 1，直到满足门禁

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

---

## Harness Engineering 工作流（推荐）

目标：把需求开发变成“可追踪、可验证、可回滚”的流水线，而不是临时改代码。

### 0. 流程状态机

每个任务都走同一状态：

`Intake → Scope → Implement → Verify → Release → Observe → Close`

状态说明：
- `Intake`：记录需求、截图、复现步骤、验收标准
- `Scope`：限定改动文件和影响范围（前端/后端/数据）
- `Implement`：仅在范围内实现，避免扩散
- `Verify`：本地验证 + 回归关键路径
- `Release`：提交、推送、合并、发布说明
- `Observe`：上线后观察日志/指标/用户反馈
- `Close`：沉淀到文档和自检项

### 1. 任务模板（Issue/需求卡）

每个任务必须包含：
- 背景与目标：为什么做
- 验收标准：用户可见的结果
- 非目标：明确不做什么
- 风险点：可能破坏哪些页面/接口
- 回滚方案：失败时怎么退回

### 2. 分支与提交规范

- 分支命名：`feat/<topic>`、`fix/<topic>`
- 提交格式：`feat|fix|refactor(scope): message`
- 一次提交只做一件事（UI 布局、K线算法、数据下载分开）
- 合并策略：优先 `main` 快速合并，小步快跑

### 3. 实现阶段约束

- 先改最小闭环：先让功能可用，再做增强
- 新能力优先封装成共享组件（例如 `InteractiveStockKline`）
- 避免页面内重复逻辑，统一走 service/query/component 三层
- 后端策略类改动（如 HH 算法）必须保留 fallback

### 4. 验证门禁（Harness Gate）

提交前必须通过：
- 前端：`cd frontend && npm run build`
- 后端关键路径：至少跑目标脚本/接口冒烟
- 手工回归页面：
  - 核心主线：卡片切换 → 右侧K线联动
  - 画线工具：新增/删除/锁定/改色/买入线
  - 预警：止盈止损触发推送链路

建议加一个轻量验证脚本（后续可扩展）：
- `scripts/harness/check.sh`：统一执行 build + smoke + 状态检查

可直接执行：

```bash
# 日常提交前（推荐）
bash scripts/harness/check.sh quick

# 严格模式（会尝试跑后端 pytest）
bash scripts/harness/check.sh strict
```

### 5. 发布与观察

发布后 30 分钟内必须观察：
- 后端日志：异常率、超时、数据源失败率
- 前端反馈：空白页、图表不刷新、交互失效
- 数据完整性：当日快照写入条数、关键股票K线可见性

如果异常，按“最近一次提交”快速回滚。

### 6. 针对本项目的三条硬规则

- 图表能力统一：所有股票K线页面必须复用同一交互组件
- 数据源多路兜底：Tushare/AKShare/Sina 至少两路可用
- 自检前置：启动时检查数据库、关键表、配置、代理状态

### 7. 每日节奏（你这个项目建议）

- 09:00 前：确认服务状态 + 当日数据可用性
- 盘中：只做小修（UI与告警），避免大规模重构
- 15:30 后：跑数据补全与算法回测
- 收盘后：合并当天改动，更新 `docs/development-workflow.md` 的变更记录
