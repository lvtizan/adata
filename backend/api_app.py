#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FastAPI 应用"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from threading import Thread

from config import get_config
from market_engine import MarketEngine
from watchlist_store import WatchlistStore
from pathlib import Path

# 初始化业务层
config = get_config()
engine = MarketEngine(config)
data_dir = Path(__file__).parent / "data"
watchlist = WatchlistStore(data_dir / "watchlist.db")

# 创建 FastAPI 应用
app = FastAPI(title="板块强度选股系统 API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def warm_common_views() -> None:
    try:
        date = engine.latest_data_trade_date()
        engine.market_overview(date)
        engine.sector_rankings(date, sort_by="rps10")
        engine.bull_camp(date)
    except Exception:
        pass


@app.on_event("startup")
async def startup_warmup():
    Thread(target=warm_common_views, daemon=True).start()


# ===== 根路径 =====
@app.get("/")
async def root():
    return {"name": "板块强度选股系统 API", "version": "2.0.0", "status": "running"}


# ===== 市场概览 =====
@app.get("/api/market/overview")
async def get_market_overview(tradeDate: str = ""):
    date = tradeDate or engine.latest_data_trade_date()
    return engine.market_overview(date)


# ===== 板块排行 =====
@app.get("/api/sectors/rankings")
async def get_sector_rankings(sortBy: str = "rps10", keyword: str = ""):
    date = engine.latest_data_trade_date()
    items = engine.sector_rankings(date, sort_by=sortBy, keyword=keyword)
    return {"items": items}


# ===== 板块成分股 =====
@app.get("/api/sectors/{sector_code}/stocks")
async def get_sector_stocks(sector_code: str, sortBy: str = "rps10"):
    date = engine.latest_data_trade_date()
    items = engine.sector_stocks(sector_code, date, sort_by=sortBy)
    return {"sectorCode": sector_code, "items": items}


# ===== 个股K线 =====
@app.get("/api/charts/stock/{ts_code}")
async def get_stock_chart(ts_code: str, bars: int = 120):
    date = engine.latest_data_trade_date()
    return engine.stock_kline(ts_code, date, bars=bars)


# ===== 板块K线 =====
@app.get("/api/charts/sector/{sector_code}")
async def get_sector_chart(sector_code: str, bars: int = 120):
    date = engine.latest_data_trade_date()
    return engine.sector_kline(sector_code, date, bars=bars)


# ===== 相对强弱 =====
@app.get("/api/relative-strength")
async def get_relative_strength(tsCode: str, sectorCode: str):
    date = engine.latest_data_trade_date()
    return engine.relative_strength(tsCode, sectorCode, date)


# ===== 个股财务 =====
@app.get("/api/stock/{ts_code}/financials")
async def get_stock_financials(ts_code: str, periods: int = 8):
    return engine.stock_financials(ts_code, periods=periods)


# ===== 自选股 =====
@app.get("/api/watchlist")
async def get_watchlist():
    items = watchlist.list_items()
    return {"items": items}


@app.get("/api/camp/bull-stocks")
async def get_bull_stocks():
    date = engine.latest_data_trade_date()
    items = engine.bull_camp(date)
    return {"tradeDate": date, "items": items}


@app.get("/api/camp/bull-stocks/history")
async def get_bull_stocks_history(days: int = 20):
    date = engine.latest_data_trade_date()
    history_items = engine.bull_camp_history(date, days=days)
    return {"tradeDate": date, "days": max(1, min(int(days), 60)), "items": history_items}


@app.get("/api/bullcamp")
async def get_bullcamp():
    date = engine.latest_data_trade_date()
    items = engine.bull_camp(date)
    return {"items": items}


@app.post("/api/watchlist")
async def add_watchlist(item: dict):
    saved_item = watchlist.upsert_item(item)
    return {"success": True, "item": saved_item}


@app.put("/api/watchlist/{ts_code}")
async def update_watchlist(ts_code: str, item: dict):
    updated_item = watchlist.update_item(ts_code, item)
    return {"success": True, "item": updated_item}


@app.delete("/api/watchlist/{ts_code}")
async def remove_watchlist(ts_code: str):
    deleted = watchlist.delete_item(ts_code)
    return {"success": deleted}


# ===== 健康检查 =====
@app.get("/health")
async def health():
    return {"status": "ok", "engine_ready": engine is not None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8082)
