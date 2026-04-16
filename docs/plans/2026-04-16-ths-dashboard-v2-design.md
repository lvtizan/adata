# Dashboard 主工作台 v2 + 统一 UI 组件库

**日期**: 2026-04-16
**状态**: 设计已批准，待实施

## 背景

当前系统存在两个根本问题：

1. **数据源**：Dashboard 用 Tushare 的板块/个股数据，覆盖粗、延迟高、个股 K 线不稳定。同花顺（THS）数据更准、分类更细（881xxx 行业板块），已经接入 K 线接口（`ths_proxy.py`）。
2. **视觉风格**：各页面样式散乱，信息密度不一致，股票名字无法点击弹速览，整体缺少统一感。参考 Google Analytics 的框架感 + 股票工具的信息密度，做一套统一组件库。

## 目标

**Track 1 — 统一 UI 组件库**
- 固化设计 tokens（间距/圆角/字号/语义色）
- 新增 8 个业务组件，微调 3 个现有组件
- 把 3 个核心老页面迁移过来验证组件（自选股、早报、知识星球主线）

**Track 2 — Dashboard 主工作台 v2**
- 基于 THS 数据源重建
- 板块按 RS120 强度排序，支持系统推荐 + 用户自选两种板块池
- 成分股按成交额 + RS120 双条件筛选
- 同屏三图对比：板块日K、个股日K、上证 5 分钟（画中画）
- 所有 K 线用统一的 `<KlineChart>` 控件（带画线）

## 非目标

- 个股 K 线数据源本次不切到 THS（保持现状，THS 作为 fallback 以后再做）
- 东财股吧舆情监控（另起任务）
- 强板块内 HH/杯柄形态扫描（另起任务）
- 全站股票名字可点击弹速览（后续迭代，`StockTag` 组件打基础）

## 架构

### Track 1 - UI 组件库

#### 设计 Tokens（`styles/globals.css`）

| 类别 | 档位 |
|------|------|
| 间距 | 4 / 8 / 12 / 16 / 20 / 24 |
| 圆角 | 4（sm） / 6（md） / 8（lg） |
| 字号 | 10 / 11 / 12 / 13 / 14 / 16（h2） / 20（h1） |
| 行高 | tight（1.15） / normal（1.4） / relaxed（1.6） |
| 语义色 | state-up / state-down / state-neutral / rs-high / rs-mid / rs-low |
| 表面色 | canvas / surface-primary / surface-secondary / surface-hover |
| 文字色 | text-primary / secondary / tertiary / quaternary |

#### 新增组件（`shared/ui/`）

| 组件 | 文件 | 说明 |
|------|------|------|
| `<Panel>` | panel.tsx | 卡片容器，可选 header（title + subtitle + actions） |
| `<PageHeader>` | page-header.tsx | 页面顶栏，统一标题/副标题/操作区 |
| `<StatStrip>` | stat-strip.tsx | 行内指标条，支持多个 Stat 横排 |
| `<FilterChip>` + `<FilterBar>` | filter-chip.tsx | GA 风格圆角胶囊筛选标签 |
| `<SegmentedControl>` | segmented-control.tsx | 2-3 选胶囊切换（推荐/我的主流） |
| `<StockTag>` | stock-tag.tsx | 可点击股票名，带实时涨幅 + RS badge |
| `<EmptyState>` | empty-state.tsx | 统一空状态（icon + title + description + action） |
| `<ThresholdInput>` | threshold-input.tsx | 带标签的数值输入，用于筛选阈值 |

#### 现有组件微调

- **LeftRail** — 增加 `collapsed` 模式（只显示 icon，宽度 48px），可切换
- **Tabs** — 增加 `minimal` variant（无背景底条，下划线指示当前）
- **DataTable** — 增加 density token：`compact`（28px 行高）/ `normal`（32px）/ `relaxed`（40px）

### Track 1 - 老页面迁移

完成组件库后，迁移 3 个核心页面作为样板：

1. **自选股** `/watchlist` — 用 PageHeader + Panel + StatStrip + StockTag 重组
2. **每日简报** `/morning-brief` — 用 PageHeader + Panel + StockTag（新闻里的股票名可点）
3. **星球主线** `/zsxq-mainlines` — 用 PageHeader + Panel + FilterChip + StockTag

迁移标准：
- 样式完全用 tokens，不留 hardcoded 颜色/间距
- 交互一致（hover、active、disabled 状态统一）
- 信息密度不降（表格仍可一屏 20+ 行）

### Track 2 - Dashboard v2

#### 后端

```
ths_proxy.py（扩展）
├── fetch_ths_kline()           已有
├── fetch_ths_sector_list()     新增：爬 q.10jqka.com.cn/thshy/，返回所有 881xxx 板块
├── fetch_ths_sector_members()  新增：爬板块详情页，返回成分股
└── compute_sector_rs120()      新增：基于板块指数 120 天 K 线算 RS120 百分位

ths_sector_cache.py（新增）
└── 板块强度每日盘后计算，缓存到 SQLite

my_sectors_store.py（新增，参照 watchlist_store.py）
└── 用户"我的主流板块"池，SQLite 持久化
```

#### API

| 路由 | 返回 |
|------|------|
| `GET /api/ths/sectors` | 按 RS120 降序的全量板块列表（rs120、当日涨幅、成交额） |
| `GET /api/ths/sectors/{code}/members` | 板块成分股（rs120、成交额、最新价、涨幅） |
| `GET /api/ths/my-sectors` | 用户自选板块池 |
| `POST /api/ths/my-sectors` | 增 / 删 主流板块 |

缓存策略：
- K 线日/周/月：1 小时 TTL（已实现）
- K 线 5 分钟：60 秒 TTL（已实现）
- 板块列表 + RS120：每日盘后计算，次日开盘前失效
- 板块成分股：1 小时 TTL

#### 前端页面布局

```
┌────────────┬──────────────────┬─────────────────────────┐
│ 板块列表    │  成分股（筛选）    │  板块日K  ┌─上证5m──┐   │
│            │                  │          │ PiP    │    │
│ Segmented: │ FilterBar:       │          └────────┘    │
│ 推荐│我的   │ 成交额≥8亿        │                         │
│            │ RS120≥87          │ ─────────────────────── │
│ 白酒  94   │ ──────────        │  个股日K                │
│ 电池  91   │ 贵州茅台 +2.3%    │                         │
│ 半导体 89  │   RS:92 成交:12亿 │                         │
│ ...        │ 五粮液 +1.8%     │                         │
│            │   RS:88 成交:9亿  │                         │
└────────────┴──────────────────┴─────────────────────────┘
```

#### 新增/改动前端模块

- `pages/dashboard/page.tsx` — 重写
- `features/sectors/components/sector-list-tabs.tsx` — 新增
- `features/sectors/components/my-sectors-dialog.tsx` — 新增（管理主流板块）
- `features/stocks/components/stock-filter-bar.tsx` — 新增（成交额/RS120 阈值筛选）
- `features/chart/components/index-pip.tsx` — 新增（上证 5m 画中画）
- `services/ths.service.ts` — 扩展（板块列表/成分股/my-sectors）
- `queries/ths.queries.ts` — 新增（对应 hooks）

## 数据流

### 板块强度 RS120 计算

1. 盘后 16:30 调度任务：
   - 拉全量 881xxx 板块当日 K 线（并发，单并发上限 5）
   - 取 120 天累计涨幅：`(close[today] / close[-120]) - 1`
   - 所有板块按累计涨幅排名 → 百分位（顶部 100，底部 0）
   - 写入 `ths_sector_cache` 表
2. 前端 `/api/ths/sectors` 直接读缓存，毫秒级返回

### 个股筛选

后端返回板块全量成分股（不预筛），前端用 tokens 的 `FilterBar` + `ThresholdInput` 做客户端过滤。切阈值不触发网络请求。

默认阈值：成交额 ≥ 8 亿、RS120 ≥ 87。

### 画中画上证 5m

- `<IndexPip>` 组件基于 `<Panel>` + `<KlineChart>`
- 挂在板块 K 线容器右上角，默认 240×140，可拖拽/最小化
- 走 THS 5 分钟缓存（60s TTL），每分钟自动刷新

## 性能设计

| 场景 | 策略 | 目标延迟 |
|------|------|---------|
| 打开 Dashboard | 板块列表/成分股走后端缓存 | < 200ms |
| 切换板块 | 成分股 THS 缓存 + React Query | < 300ms |
| 切换个股 | K 线 THS 内存缓存 | < 100ms（二次） |
| 调整筛选阈值 | 前端过滤，0 网络请求 | < 16ms |
| 上证 5m 刷新 | 60s TTL 缓存 | 首次 500ms，后续 10ms |

## 错误处理

- THS 接口失败 → 返回空 + `source: "ths"` + `error` 字段，前端用 `<EmptyState>` 友好提示
- 板块爬虫失败 → 用上次缓存数据兜底，记日志
- 筛选条件过严导致成分股为空 → `<EmptyState>`：当前筛选无匹配股票，尝试放宽条件

## 实施顺序

```
Phase 1: 设计 Tokens 梳理（globals.css）
   ↓
Phase 2: 基础组件（Panel, PageHeader, StatStrip, StockTag）
   ↓
Phase 3: 控件（FilterChip/Bar, SegmentedControl, ThresholdInput, EmptyState）
   ↓
Phase 4: 微调（LeftRail 折叠态, Tabs minimal, DataTable density）
   ↓
Phase 5: 老页面迁移（自选股 → 早报 → 星球主线，一次一个）
   ↓
Phase 6: 后端 THS 扩展（sector list, members, RS120 计算）
   ↓
Phase 7: Dashboard v2 前端（用新组件搭）
   ↓
Phase 8: PiP 上证 5m + 画中画交互
```

## 测试清单

**Track 1 - 组件库**
- [ ] 所有新组件有 Storybook-like 演示页面（可放 `/debug`）
- [ ] 老页面迁移后视觉回归对比通过
- [ ] 深色模式下所有组件正常
- [ ] 组件在不同密度（compact/normal/relaxed）下显示正常

**Track 2 - Dashboard v2**
- [ ] 板块列表按 RS120 降序显示
- [ ] "我的主流"增删持久化到后端
- [ ] 筛选条改阈值，成分股实时更新
- [ ] 三个 K 线图正常显示，画线功能可用
- [ ] 上证 5m PiP 可拖拽、可最小化
- [ ] RS120 数值合理（0-100，强势板块在高位）
- [ ] 成交额单位正确（元，显示亿）
- [ ] 板块成分股数量与 THS 官网一致
- [ ] 首次打开 < 2s，切板块 < 500ms，切个股 < 300ms

## 后续扩展（本次不做）

- 个股 K 线切到 THS 数据源
- `<StockTag>` 全站接入（所有页面股票名可点）
- 东财股吧舆情监控
- 强板块内 HH/杯柄形态自动扫描
- 暗色模式的最终 token 调优
