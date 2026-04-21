# A数据 系统升级设计文档

> 日期: 2026-04-21
> 目标: 从本地 SQLite 迁移到 Cloudflare 全家桶，整合 Obsidian 知识库，新增 RPS250/板块共振/新高标签/评分引擎

## 背景

当前 A数据 所有数据存储在本地 SQLite，只能在开发机上访问。升级后：
- 手机/电脑通过 URL 随时访问
- 自选股、牛股、画线、交易计划云端同步
- 行情数据每日自动 push 到云端
- 盘中实时行情通过 Worker 代理新浪/腾讯接口
- Obsidian 知识库（板块/个股）导入系统
- 多因子评分引擎替代 AI 审判
- 将来支持多用户 + 收费（Authing 认证）

## 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 数据库 | Cloudflare D1 | SQLite 方言，迁移成本最低，5GB 免费 |
| 缓存 | Cloudflare KV | 盘中实时行情热缓存，100K reads/day 免费 |
| API | Cloudflare Workers | 替代本地 FastAPI，100K requests/day 免费 |
| 前端托管 | Cloudflare Pages | Vite 构建部署，手机/电脑 URL 访问 |
| 认证（现在） | Bearer Token | 环境变量，简单安全 |
| 认证（将来） | Authing | 微信扫码/手机号，8000 MAU 免费 |
| 图表 | KlineCharts v10 | 保持现有，箱体/通道/水平线/射线已内置 |
| 数据采集 | 本地 Python + launchd | Tushare 日线 + 新浪/腾讯盘中实时 |
| AI 替代 | Python 规则引擎 | 多因子评分，零成本，确定性更强 |

## 架构

```
Cloudflare Pages (前端)
  https://a-data.pages.dev
       |
       | fetch /api/*
       v
Cloudflare Worker: a-data-api
  Bearer Token 验证
  路由 → D1 / KV
       |            |
       v            v
  D1 (结构化)    KV (实时缓存)
       ^
       |
本地 Mac Python 数据泵
  launchd 15:35 收盘同步
  launchd 盘中每3秒实时抓取
```

## D1 表设计

### 个人数据（从 SQLite 迁移）

```sql
CREATE TABLE watchlist (
  ts_code TEXT PRIMARY KEY,
  stock_name TEXT,
  sector_code TEXT,
  sector_name TEXT,
  subgroup TEXT,
  close REAL,
  pct_change_1d REAL,
  pct_change_5d REAL,
  pct_change_10d REAL,
  rps20 REAL,
  amount REAL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE chart_drawings (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  drawings TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, timeframe)
);

CREATE TABLE price_alerts (
  id TEXT PRIMARY KEY,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT DEFAULT 'active',
  triggered_type TEXT,
  triggered_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE trade_plans (
  id TEXT PRIMARY KEY,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  entry_price REAL,
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  risk_r REAL,
  status TEXT DEFAULT 'planned',
  result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE my_sectors (
  code TEXT PRIMARY KEY,
  name TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);
```

### 行情数据（Python 每日 push）

```sql
CREATE TABLE stock_daily (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  vol REAL, amount REAL, pct_chg REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE TABLE rps_master (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  rps5 REAL, rps10 REAL, rps20 REAL,
  rps50 REAL, rps250 REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE TABLE sector_rankings (
  trade_date TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  sector_name TEXT,
  rank INTEGER,
  pct_1d REAL, pct_5d REAL, pct_10d REAL,
  rps10 REAL, amount REAL, limit_up_count INTEGER,
  PRIMARY KEY (trade_date, sector_code)
);

CREATE TABLE sector_resonance (
  trade_date TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  total_count INTEGER,
  up_count INTEGER,
  strength REAL,
  resonant INTEGER DEFAULT 0,
  members_up TEXT, -- JSON array
  PRIMARY KEY (trade_date, sector_code)
);
```

### 评分引擎

```sql
CREATE TABLE stock_scores (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  score INTEGER,
  verdict TEXT,
  reasons TEXT, -- JSON array
  rps250 REAL, rps50 REAL,
  vol_shrink_ratio REAL,
  pattern TEXT,
  distance_to_high REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE TABLE pattern_hits (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  patterns TEXT, -- JSON: {cupHandle, vcp, doubleBottomH2, tightBase, ...}
  PRIMARY KEY (ts_code, trade_date)
);
```

### 知识数据（Obsidian 导入）

```sql
CREATE TABLE stock_profiles (
  ts_code TEXT PRIMARY KEY,
  stock_name TEXT,
  one_liner TEXT,
  core_clients TEXT,
  industry_position TEXT,
  sector_code TEXT
);

CREATE TABLE industry_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  relation TEXT NOT NULL, -- upstream/downstream/partner
  description TEXT,
  UNIQUE(from_code, to_code, relation)
);

CREATE TABLE sector_cards (
  sector_code TEXT PRIMARY KEY,
  sector_name TEXT,
  summary TEXT,
  drivers TEXT, -- JSON array
  trading_sequence TEXT,
  risks TEXT, -- JSON array
  chain_map TEXT, -- JSON: {upstream: [], midstream: [], downstream: []}
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## Worker API 路由

### Phase 1: 个人数据 CRUD
```
GET/POST/PUT/DELETE  /api/watchlist
GET/PUT/DELETE       /api/drawings/:symbol
GET/POST/DELETE      /api/alerts
GET/POST/PUT         /api/trade-plans
GET/POST/DELETE      /api/my-sectors
```

### Phase 2: 行情查询
```
GET  /api/stock/:code/daily?days=250
GET  /api/stock/:code/rps
GET  /api/sectors/rankings?date=latest
GET  /api/sectors/:code/stocks
GET  /api/resonance?date=latest
GET  /api/search?q=keyword
```

### Phase 3: 评分 + 知识
```
GET  /api/watchpool?min_score=60
GET  /api/stock/:code/score
GET  /api/stock/:code/profile
GET  /api/stock/:code/chain
GET  /api/sector/:code/card
```

### Phase 4: 实时行情
```
GET  /api/realtime/quotes?codes=sh600000,sz300476
```

## Python 评分引擎

多因子加权评分，满分 100：

| 因子 | 权重 | 阈值 |
|------|------|------|
| RPS250 强度 | 30分 | >=95: 30, >=90: 20 |
| RPS250 抗跌性（60日最低值）| 15分 | min>=90: 15, min>=85: 10 |
| 缩量质量 | 15分 | ratio<0.3: 15, <0.5: 10 |
| 形态质量 | 15分 | 杯柄+柄浅: 15, VCP/双底: 12 |
| 均线收敛 | 10分 | MA120/250 gap<2%: 10, <5%: 5 |
| 板块共振 | 15分 | 共振: 10, 板块RPS前20%: +5 |

verdict: >=80 强烈关注, >=60 值得跟踪, <60 观望

## 分阶段实施

### Phase 1（第1-3天）: 地基
- [x] 设计文档
- [ ] wrangler 项目初始化
- [ ] D1 建库 + 全部建表 SQL
- [ ] Worker API: 个人数据 CRUD (watchlist/drawings/alerts/plans/sectors)
- [ ] Bearer Token 认证中间件
- [ ] 数据迁移脚本: SQLite → D1
- [ ] 前端 api-client.ts 切换到 Worker URL
- [ ] Cloudflare Pages 部署
- [ ] 验证: 手机打开能看到自选股

### Phase 2（第4-5天）: 数据泵
- [ ] Python D1 写入工具 (cloudflare API client)
- [ ] 收盘同步脚本: Tushare daily → D1 stock_daily
- [ ] RPS250/RPS50 全市场计算 + push D1
- [ ] 板块共振计算 + push D1
- [ ] 新高检测 + push D1
- [ ] Worker API: 行情查询路由
- [ ] launchd 定时任务配置
- [ ] 验证: 收盘后手机能看到当日数据

### Phase 3（第6-7天）: 展示层
- [ ] 多因子评分函数
- [ ] 双底H2 形态检测 (pattern_detector.py 扩展)
- [ ] 观察池筛选逻辑
- [ ] Worker API: 评分 + 观察池路由
- [ ] 前端 ResonanceBadge 组件
- [ ] 前端 NewHighTag 组件
- [ ] 前端 ChainBrief 组件
- [ ] 股票列表行改造 (one_liner + 标签 + 评分)
- [ ] 新增 /watchpool 观察池页面
- [ ] 验证: 列表页信息丰富化

### Phase 4（第2周）: 增强
- [ ] Obsidian md 解析脚本 → stock_profiles + industry_edges + sector_cards
- [ ] 盘中实时: Worker 代理新浪/腾讯 + KV 缓存
- [ ] 盘中实时: 本地 Python 抓取进程
- [ ] 盘中实时: 前端轮询显示
- [ ] UI 框架抽离: 审查 + 清理散落样式
- [ ] 画线/交易计划对接 D1
- [ ] 验证: 盘中手机看实时价格

## 需要用户手动操作的步骤

1. Cloudflare Dashboard 创建 D1 数据库
2. Cloudflare Dashboard 创建 KV 命名空间
3. 设置 Worker 环境变量 (ACCESS_TOKEN, TUSHARE_TOKEN)
4. Cloudflare Pages 关联 Git 仓库
5. 本地 wrangler login 授权
