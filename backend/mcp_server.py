#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A股板块强度分析系统 — MCP Server

让 DeerFlow / Claude 等 LLM Agent 通过 MCP 协议调用本系统的数据接口。
运行方式：
  python3 mcp_server.py          # stdio 模式（本地 Agent）
  python3 mcp_server.py --http   # HTTP 模式（远程 Agent）
"""
from __future__ import annotations

import json
import sys
from typing import Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ConfigDict

# ── 配置 ─────────────────────────────────────────────
API_BASE = "http://127.0.0.1:8082"

mcp = FastMCP("astock_mcp")

# ── 通用 HTTP 客户端 ─────────────────────────────────


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        resp = await client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()


# ── 工具定义 ──────────────────────────────────────────


# 1. 市场概览
class MarketOverviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trade_date: Optional[str] = Field(
        default=None,
        description="交易日期 YYYYMMDD 格式，留空则返回最新交易日",
    )


@mcp.tool(
    name="astock_market_overview",
    annotations={
        "title": "A股市场概览",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def market_overview(params: MarketOverviewInput) -> str:
    """获取 A 股市场概览：涨跌家数、涨停跌停、市场风险度等"""
    query = {}
    if params.trade_date:
        query["tradeDate"] = params.trade_date
    data = await _get("/api/market/overview", query)
    return json.dumps(data, ensure_ascii=False, indent=2)


# 2. 板块排行
class SectorRankingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sort_by: str = Field(
        default="rps10",
        description="排序字段：rps10 / rps20 / pctChange",
    )
    keyword: Optional[str] = Field(
        default=None,
        description="板块名称关键词过滤",
    )


@mcp.tool(
    name="astock_sector_rankings",
    annotations={
        "title": "板块强度排行",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def sector_rankings(params: SectorRankingsInput) -> str:
    """获取当日板块排行榜，按 RPS 强度或涨跌幅排序"""
    query = {"sortBy": params.sort_by}
    if params.keyword:
        query["keyword"] = params.keyword
    data = await _get("/api/sectors/rankings", query)
    items = data.get("items", [])
    return json.dumps({"count": len(items), "items": items[:30]}, ensure_ascii=False, indent=2)


# 3. 板块成分股
class SectorStocksInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sector_code: str = Field(..., description="板块代码，如 '881101.TI'")
    sort_by: str = Field(default="rps10", description="排序字段")


@mcp.tool(
    name="astock_sector_stocks",
    annotations={
        "title": "板块成分股列表",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def sector_stocks(params: SectorStocksInput) -> str:
    """获取指定板块的成分股列表及其 RPS 排名"""
    data = await _get(
        f"/api/sectors/{params.sector_code}/stocks",
        {"sortBy": params.sort_by},
    )
    items = data.get("items", [])
    return json.dumps({"sectorCode": params.sector_code, "count": len(items), "items": items[:50]}, ensure_ascii=False, indent=2)


# 4. 牛股集中营
@mcp.tool(
    name="astock_bull_camp",
    annotations={
        "title": "牛股集中营",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def bull_camp() -> str:
    """获取当日牛股集中营：满足 RPS20>87、成交额>=10亿、个股强于板块等条件的强势股"""
    data = await _get("/api/camp/bull-stocks")
    items = data.get("items", [])
    return json.dumps(
        {"tradeDate": data.get("tradeDate"), "count": len(items), "items": items},
        ensure_ascii=False,
        indent=2,
    )


# 5. 个股 K 线
class StockKlineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ts_code: str = Field(..., description="股票代码，如 '000001.SZ'")
    bars: int = Field(default=120, description="K 线根数", ge=10, le=500)


@mcp.tool(
    name="astock_stock_kline",
    annotations={
        "title": "个股日线 K 线",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def stock_kline(params: StockKlineInput) -> str:
    """获取个股前复权日线 K 线数据（OHLCV + 均线）"""
    data = await _get(f"/api/charts/stock/{params.ts_code}", {"bars": params.bars})
    points = data.get("points", [])
    # 只返回最近 20 根的摘要，避免输出过长
    summary = points[-20:] if len(points) > 20 else points
    return json.dumps(
        {
            "code": data.get("code"),
            "name": data.get("name"),
            "totalBars": len(points),
            "recentBars": summary,
        },
        ensure_ascii=False,
        indent=2,
    )


# 6. 个股财务数据
class StockFinancialsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ts_code: str = Field(..., description="股票代码，如 '000001.SZ'")
    periods: int = Field(default=8, description="返回最近 N 个季度", ge=1, le=20)


@mcp.tool(
    name="astock_stock_financials",
    annotations={
        "title": "个股财务数据",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def stock_financials(params: StockFinancialsInput) -> str:
    """获取个股最近 N 个季度的核心财务数据：营收、净利润、毛利率、ROE 及同比增速"""
    data = await _get(f"/api/stock/{params.ts_code}/financials", {"periods": params.periods})
    return json.dumps(data, ensure_ascii=False, indent=2)


# 7. 相对强弱
class RelativeStrengthInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ts_code: str = Field(..., description="股票代码")
    sector_code: str = Field(..., description="所属板块代码")


@mcp.tool(
    name="astock_relative_strength",
    annotations={
        "title": "个股相对板块强弱",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def relative_strength(params: RelativeStrengthInput) -> str:
    """计算个股相对其所属板块的强弱：5/10/20 日涨幅差、领先/同步/落后标签"""
    data = await _get("/api/relative-strength", {
        "tsCode": params.ts_code,
        "sectorCode": params.sector_code,
    })
    # 只返回摘要，不返回完整序列
    result = {
        "stock": {k: v for k, v in data.get("stock", {}).items() if k != "rpsSeries"},
        "sector": {k: v for k, v in data.get("sector", {}).items() if k != "rpsSeries"},
        "summary": data.get("summary", {}),
    }
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 入口 ──────────────────────────────────────────────

if __name__ == "__main__":
    if "--http" in sys.argv:
        mcp.run(transport="streamable-http", host="127.0.0.1", port=8083)
    else:
        mcp.run(transport="stdio")
