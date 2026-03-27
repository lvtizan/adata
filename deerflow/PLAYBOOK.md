# DeerFlow 2.0 × A股系统 — 炒股信息聚合方案

## 架构总览

```
DeerFlow 2.0 (调度中枢)
├── MCP: A股后端 API (8082)  ← 量化数据源（Tushare Pro）
├── Tool: Web Search          ← 新闻/公告/研报
├── Tool: Python REPL         ← 数据分析/可视化
├── Skill: 个股深度研究       ← 自定义工作流
├── Skill: 每日作战地图       ← 定时任务
├── Skill: 板块轮动图谱       ← 周度分析
└── Memory: 持久化           ← 记住历史研究结果、交易日志
```

## MCP 工具清单（已实现）

| 工具名 | 功能 |
|--------|------|
| `astock_market_overview` | 市场概览（涨跌家数、风险度） |
| `astock_sector_rankings` | 板块强度排行 |
| `astock_sector_stocks` | 板块成分股 |
| `astock_bull_camp` | 牛股集中营 |
| `astock_stock_kline` | 个股日线 K 线 |
| `astock_stock_financials` | 个股财务数据（营收/利润/ROE） |
| `astock_relative_strength` | 个股相对板块强弱 |

MCP Server 文件：`backend/mcp_server.py`
配置示例：`deerflow/extensions_config_example.json`

---

## 场景 1：盘前作战地图（每日 8:30）

### 触发方式
定时任务，每个交易日早上自动执行

### 执行流程

```
主 Agent（任务拆解）
│
├─ 子 Agent A：调 astock_bull_camp
│   └─ 和昨天列表对比 → 标出"新进"和"掉出"的股票
│
├─ 子 Agent B：调 astock_sector_rankings
│   └─ 找 RPS10 前 5 板块，对比昨日排名 → 识别加速轮动的板块
│
├─ 子 Agent C：web_search
│   ├─ "今日A股 利好 政策"
│   ├─ 隔夜美股/港股表现
│   └─ 期货夜盘数据
│
├─ 子 Agent D：检查自选股持仓
│   ├─ 调 astock_stock_financials（检查是否有新财报）
│   └─ web_search "{持仓股} 公告"
│
└─ 汇总输出：今日作战地图
    - 今天该重点盯什么板块
    - 哪些股可能有机会
    - 哪些需要警惕
```

### 输出格式
Markdown 简报，包含板块热度变化、新进牛股、持仓预警、当日关注清单

---

## 场景 2：个股深度研究（按需触发）

### 触发方式
用户输入："研究一下 XXX"

### 执行流程

```
主 Agent
│
├─ 子 Agent 1：量化数据
│   ├─ astock_stock_financials → 8 季度营收/利润/ROE
│   ├─ astock_stock_kline → K 线形态判断
│   ├─ astock_relative_strength → 相对强弱
│   └─ astock_sector_rankings → 所属板块热度
│
├─ 子 Agent 2：公开信息（并行搜索）
│   ├─ web_search "{股票名} 业绩预告 OR 业绩快报"
│   ├─ web_search "{股票名} 公告 OR 重组 OR 增持 OR 回购"
│   ├─ web_search "{所属板块} 行业政策 OR 景气度"
│   └─ web_search "{股票名} 研报 OR 目标价 OR 评级"
│
└─ 汇总 Agent：综合打分 + 生成研究简报
    - 营收增长（1-5分）
    - 盈利质量
    - 技术强度
    - 板块热度
    - 催化剂
    - 风险因素
```

### 输出格式
详见 `deerflow/skill_stock_research.md`

---

## 场景 3：盘中异动捕捉（长时间任务）

### 触发方式
盘中启动，每 15-30 分钟轮询

### 监控指标

- 牛股集中营是否有新成员突然冲进来
- 板块排行是否出现剧烈变化（从第 20 名冲到前 5）
- 自选股相对强弱是否从"同步"变成"领先"或"落后"

### 触发条件满足后
自动搜索该股票/板块的最新消息，推送带上下文的提醒

---

## 场景 4："为什么涨/跌" 归因分析（按需触发）

### 触发方式
用户输入："XXX 今天为什么涨了 8%？"

### 执行流程

- 调 K 线数据确认涨幅和量能
- 搜新闻公告（业绩、政策、机构调研、股东增持）
- 搜同板块其他股票表现（板块普涨 vs 个股独立行情）
- 搜龙虎榜数据
- 综合判断：资金驱动 / 事件驱动 / 板块联动

---

## 场景 5：板块轮动图谱（每周末）

### 执行内容

- 拉最近 20 个交易日的板块排名数据
- 在沙箱里用 Python 画板块轮动热力图
  - 横轴：时间
  - 纵轴：板块
  - 颜色：RPS 排名深浅
- 标注正在加速的板块和正在衰退的板块

### 输出
PNG 热力图 + Markdown 轮动分析

---

## 场景 6：持仓周度体检报告（每周末）

### 检查内容

对自选股里每只持仓股：

- 最新财务数据 vs 上季度变化
- RPS 是否在滑落
- 所属板块是否还在轮动周期内
- 有没有出利空消息
- 给出"继续持有 / 减仓 / 加仓观察"建议

---

## 场景 7：财报季自动扫描（季度触发：4/8/10月）

### 执行内容

- 监控牛股集中营和自选股里所有股票的业绩预告
- 新公告一出来就抓取并分析
- 判断：超预期 / 符合预期 / 不及预期
- 和市场一致预期对比（搜券商预测）

---

## 场景 8：跨市场情报网（按需触发）

### 适用场景
关注某个产业链时

### 执行流程
同时搜 A 股 + 港股 + 美股的关联公司动态

示例：关注光伏板块时
- 隆基绿能（A 股）
- 信义光能（港股）
- First Solar（美股）

综合全球产业链信号

---

## 场景 9：策略回测日志（持续积累）

### 利用 DeerFlow 持久化记忆

- 记录每次交易的买入逻辑、目标价、止损位
- 定期回顾：哪些决策对了、哪些错了、错在哪里
- 跨会话积累，形成个人交易经验库

---

## 数据获取方式总结

| 数据类型 | 获取方式 | 说明 |
|----------|----------|------|
| 日线行情/K线 | MCP → Tushare Pro | 最可靠，已有接口 |
| 财务数据 | MCP → Tushare Pro | 已实现 `stock_financials` |
| 板块/RPS数据 | MCP → A股后端 | 已有接口 |
| 新闻公告 | DeerFlow web_search | 搜东财/同花顺/新浪 |
| 研报观点 | DeerFlow web_search | 搜券商研报摘要 |
| 实时行情 | 沙箱 akshare（备选） | 免费但不如Tushare稳定 |
| 龙虎榜 | Tushare Pro（待接入） | 可后续加接口 |

---

## 启动方式

```bash
# 1. 启动 A 股后端
cd backend && python3 api_app.py

# 2. 启动 MCP Server（stdio 模式供 DeerFlow 调用）
# DeerFlow 会根据 extensions_config.json 自动拉起

# 3. 或独立运行 MCP Server（HTTP 模式）
python3 backend/mcp_server.py --http  # 端口 8083
```
