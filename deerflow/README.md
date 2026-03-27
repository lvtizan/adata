# DeerFlow 2.0 集成指南

## 前提条件

1. 已安装 DeerFlow 2.0（https://github.com/bytedance/deer-flow）
2. A 股后端 API 正在运行（`python3 backend/api_app.py`，端口 8082）
3. Python 环境已安装 MCP SDK：`pip install mcp httpx`

## 集成步骤

### 1. 注册 MCP Server

将 `extensions_config_example.json` 中的 `mcpServers.astock` 配置
合并到你 DeerFlow 项目的 `extensions_config.json` 中。

记得把 `/path/to/A数据` 改成你实际的项目路径。

### 2. 复制 Skill 文件

将 `skill_stock_research.md` 复制到 DeerFlow 的 skills 目录中：

```bash
cp skill_stock_research.md /path/to/deer-flow/skills/stock_research.md
```

### 3. 启动

```bash
# 终端 1：启动 A 股后端
cd /path/to/A数据/backend
python3 api_app.py

# 终端 2：启动 DeerFlow
cd /path/to/deer-flow
# 按 DeerFlow 文档启动
```

### 4. 测试

在 DeerFlow 中输入：

- "帮我看看今天牛股集中营有哪些股票"
- "研究一下 000001.SZ 的最新财务数据和技术面"
- "对比牛股集中营前 3 名的营收增长情况"

## MCP 工具清单

| 工具名 | 功能 |
|--------|------|
| `astock_market_overview` | 市场概览（涨跌家数、风险度） |
| `astock_sector_rankings` | 板块强度排行 |
| `astock_sector_stocks` | 板块成分股 |
| `astock_bull_camp` | 牛股集中营 |
| `astock_stock_kline` | 个股日线 K 线 |
| `astock_stock_financials` | 个股财务数据（营收/利润/ROE） |
| `astock_relative_strength` | 个股相对板块强弱 |

## 独立运行 MCP Server

如果不通过 DeerFlow，也可以直接运行 MCP Server：

```bash
# stdio 模式（本地 Agent 通过管道通信）
python3 backend/mcp_server.py

# HTTP 模式（远程调用，端口 8083）
python3 backend/mcp_server.py --http
```
