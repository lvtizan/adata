#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from config import get_config, init_logging
from market_engine import MarketEngine
from watchlist_store import WatchlistStore
from daily_briefs_store import DailyBriefsStore
from drawings_store import DrawingsStore
from price_alert_store import PriceAlertStore
from price_monitor import PriceMonitor
from index_risk_analyzer import analyze_all_indices
from news_aggregator import (
    init_db as init_news_db, fetch_all as fetch_all_news, query_news, generate_brief_summary,
    fetch_zsxq, save_zsxq_topics, query_zsxq_topics, query_zsxq_stock_stats, query_zsxq_summary, init_zsxq_db,
    save_zsxq_cookies, _load_zsxq_cookies, search_zsxq_topics, query_zsxq_stock_detail,
    reindex_zsxq_stock_mentions, compute_zsxq_mainlines,
)
from ths_proxy import fetch_ths_kline, fetch_ths_sector_list, fetch_ths_sector_members
from ths_sector_strength import load_cached_sector_rs120, refresh_all_sector_rs120
from my_sectors_store import MySectorsStore
from pattern_predictor import predict_patterns

# 初始化日志和配置
init_logging()
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
BACKEND = ROOT / "backend"
WATCHLIST_DB = ROOT / "backend" / "data" / "watchlist.db"
DRAWINGS_DB = ROOT / "backend" / "data" / "drawings.db"
ALERTS_DB = ROOT / "backend" / "data" / "price_alerts.db"
SETTINGS_PATH = ROOT / "backend" / "data" / "settings.json"

# 加载配置
config = get_config()

# 初始化引擎
logger.info("初始化MarketEngine...")
engine = MarketEngine(config)
watchlist_store = WatchlistStore(WATCHLIST_DB)
briefs_store = DailyBriefsStore()
drawings_store = DrawingsStore(DRAWINGS_DB)
my_sectors_store = MySectorsStore(ROOT / "backend" / "data" / "my_sectors.db")

# 初始化新闻数据库
init_news_db()
init_zsxq_db()
alert_store = PriceAlertStore(ALERTS_DB)


def _load_settings() -> dict:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_settings(data: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_webhook_url() -> str:
    s = _load_settings()
    return s.get("webhook_url", "") or os.getenv("WECHAT_WORK_WEBHOOK_URL", "")


def get_pushplus_token() -> str:
    s = _load_settings()
    return s.get("pushplus_token", "") or os.getenv("PUSHPLUS_TOKEN", "")


def get_notify_config() -> dict[str, str]:
    return {
        "pushplus_token": get_pushplus_token(),
        "webhook_url": get_webhook_url(),
    }


def get_monitor_enabled() -> bool:
    s = _load_settings()
    return bool(s.get("monitor_enabled", True))

# 预热缓存（后台线程）
logger.info("启动缓存预热...")
warmup_thread = threading.Thread(target=engine.warmup, daemon=True, name="WarmupThread")
warmup_thread.start()

# 启动价格监控线程
price_monitor = PriceMonitor(alert_store, get_notify_config, get_monitor_enabled)
price_monitor.start()


class _NumpyEncoder(json.JSONEncoder):
    """处理 numpy 类型的 JSON 序列化"""
    def default(self, o):
        import numpy as np
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            v = float(o)
            return 0.0 if (v != v) else v  # NaN guard
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        return super().default(o)

    def encode(self, o):
        """Override to sanitize NaN/Inf in plain floats"""
        import math
        def sanitize(val):
            if isinstance(val, float):
                if math.isnan(val) or math.isinf(val):
                    return 0.0
            if isinstance(val, dict):
                return {k: sanitize(v) for k, v in val.items()}
            if isinstance(val, list):
                return [sanitize(v) for v in val]
            return val
        return super().encode(sanitize(o))


def json_response(handler: BaseHTTPRequestHandler, obj: Any, code: int = 200) -> None:
    """发送JSON响应"""
    try:
        payload = json.dumps(obj, ensure_ascii=False, cls=_NumpyEncoder, allow_nan=False).encode("utf-8")
        handler.send_response(code)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(payload)))
        handler.end_headers()
        handler.wfile.write(payload)
    except Exception as e:
        logger.error(f"发送JSON响应失败: {e}")


class Handler(BaseHTTPRequestHandler):
    """HTTP请求处理器"""

    def log_message(self, format: str, *args):
        """自定义日志格式"""
        logger.info(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        self.dispatch_request("GET")

    def do_POST(self):
        self.dispatch_request("POST")

    def do_PUT(self):
        self.dispatch_request("PUT")

    def do_DELETE(self):
        self.dispatch_request("DELETE")

    def dispatch_request(self, method: str):
        """处理HTTP请求"""
        parsed = urlparse(self.path)
        path = parsed.path
        q = parse_qs(parsed.query)
        body = None

        try:
            if path.startswith("/api/"):
                if method in {"POST", "PUT"}:
                    body = self.read_json_body()
                return self.handle_api(method, path, q, body)
            if method != "GET":
                return json_response(self, {"error": "method not allowed"}, 405)
            return self.handle_static(path)
        except ValueError as e:
            logger.warning(f"请求参数错误: {path}, 错误: {e}")
            json_response(self, {"error": f"参数错误: {e}"}, 400)
        except Exception as exc:
            logger.error(f"请求处理失败: {path}, 错误: {exc}", exc_info=config.server.debug)
            json_response(self, {"error": "服务器内部错误"}, 500)

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            raise ValueError(f"无效JSON: {e}") from e
        if not isinstance(data, dict):
            raise ValueError("JSON body 必须是对象")
        return data

    def handle_api(self, method: str, path: str, q: dict[str, list[str]], body: dict[str, Any] | None):
        """处理API请求"""
        if path == "/api/watchlist":
            if method == "GET":
                return json_response(self, {"items": watchlist_store.list_items()})
            if method == "POST":
                return json_response(self, {"item": watchlist_store.upsert_item(body or {})}, 201)
            return json_response(self, {"error": "method not allowed"}, 405)

        if path.startswith("/api/watchlist/"):
            ts_code = path.split("/")[3]
            if not ts_code:
                return json_response(self, {"error": "missing tsCode"}, 400)
            if method == "PUT":
                return json_response(self, {"item": watchlist_store.update_item(ts_code, body or {})})
            if method == "DELETE":
                deleted = watchlist_store.delete_item(ts_code)
                if not deleted:
                    return json_response(self, {"error": "not found"}, 404)
                return json_response(self, {"ok": True})
            return json_response(self, {"error": "method not allowed"}, 405)

        if path.startswith("/api/drawings/"):
            symbol = path.split("/")[3]
            if not symbol:
                return json_response(self, {"error": "missing symbol"}, 400)
            scope = q.get("scope", ["stock"])[0]
            timeframe = q.get("timeframe", ["1d"])[0]
            if method == "GET":
                return json_response(self, drawings_store.get_drawings(symbol, scope=scope, timeframe=timeframe))
            if method == "PUT":
                overlays = (body or {}).get("overlays", [])
                if not isinstance(overlays, list):
                    return json_response(self, {"error": "overlays must be a list"}, 400)
                return json_response(
                    self,
                    drawings_store.save_drawings(symbol, overlays=overlays, scope=scope, timeframe=timeframe),
                )
            if method == "DELETE":
                deleted = drawings_store.delete_drawings(symbol, scope=scope, timeframe=timeframe)
                return json_response(
                    self,
                    {"ok": True, "deleted": deleted, "symbol": symbol, "scope": scope, "timeframe": timeframe},
                )
            return json_response(self, {"error": "method not allowed"}, 405)

        # ── 价格预警 API ──
        if path == "/api/price-alerts":
            if method == "GET":
                status_filter = q.get("status", [None])[0]
                return json_response(self, {"items": alert_store.list_alerts(status_filter)})
            if method == "POST":
                b = body or {}
                ts_code = b.get("tsCode", "")
                if not ts_code:
                    return json_response(self, {"error": "missing tsCode"}, 400)
                alert = alert_store.create_alert(
                    ts_code=ts_code,
                    stock_name=b.get("stockName", ""),
                    entry_price=float(b.get("entryPrice", 0)),
                    stop_loss=float(b["stopLoss"]) if b.get("stopLoss") else None,
                    take_profit=float(b["takeProfit"]) if b.get("takeProfit") else None,
                )
                return json_response(self, {"alert": alert}, 201)
            return json_response(self, {"error": "method not allowed"}, 405)

        if path.startswith("/api/price-alerts/"):
            parts = path.split("/")
            if len(parts) >= 4:
                alert_id_str = parts[3]
                if alert_id_str == "monitor-status":
                    if method == "GET":
                        return json_response(
                            self,
                            {
                                "alive": price_monitor.alive,
                                "enabled": get_monitor_enabled(),
                            },
                        )
                    if method in ("POST", "PUT"):
                        enabled = bool((body or {}).get("enabled", True))
                        settings = _load_settings()
                        settings["monitor_enabled"] = enabled
                        _save_settings(settings)
                        return json_response(self, {"ok": True, "enabled": enabled, "alive": price_monitor.alive})
                    return json_response(self, {"error": "method not allowed"}, 405)
                try:
                    alert_id = int(alert_id_str)
                except ValueError:
                    return json_response(self, {"error": "invalid alert id"}, 400)
                if method == "DELETE":
                    deleted = alert_store.delete_alert(alert_id)
                    return json_response(self, {"ok": deleted})
            return json_response(self, {"error": "not found"}, 404)

        # ── 设置 API ──
        if path == "/api/settings/webhook":
            if method == "GET":
                url = get_webhook_url()
                masked = url[:20] + "..." if len(url) > 20 else url
                return json_response(self, {"webhookUrl": masked, "configured": bool(url)})
            if method == "PUT":
                url = (body or {}).get("webhookUrl", "")
                settings = _load_settings()
                settings["webhook_url"] = url
                _save_settings(settings)
                return json_response(self, {"ok": True, "configured": bool(url)})
            return json_response(self, {"error": "method not allowed"}, 405)

        if path == "/api/settings/pushplus":
            if method == "GET":
                token = get_pushplus_token()
                masked = f"{token[:6]}***{token[-4:]}" if len(token) > 12 else ("***" if token else "")
                return json_response(self, {"token": masked, "configured": bool(token)})
            if method == "PUT":
                token = ((body or {}).get("token", "") or "").strip()
                settings = _load_settings()
                settings["pushplus_token"] = token
                _save_settings(settings)
                return json_response(self, {"ok": True, "configured": bool(token)})
            return json_response(self, {"error": "method not allowed"}, 405)

        # 服务器状态（不需要预热即可返回）
        if path == "/api/status":
            return json_response(self, {
                "ready": engine._warmed,
                "message": "数据加载中..." if not engine._warmed else "就绪",
            })

        if path == "/api/data-sources/status":
            return json_response(self, engine.data_sources_status())

        # 实时行情API（不依赖 trade_date，独立于其他 GET 路由）
        if path == "/api/realtime/quotes":
            codes_str = q.get("codes", [""])[0]
            ts_codes = [c.strip() for c in codes_str.split(",") if c.strip()] if codes_str else []
            return json_response(self, engine.realtime_quotes(ts_codes))

        # 获取交易日（优先请求参数；外部接口异常时降级本地快照日期）
        trade_date = q.get("tradeDate", [""])[0]
        if not trade_date:
            try:
                trade_date = engine.latest_data_trade_date()
            except Exception as exc:
                logger.warning(f"latest_data_trade_date 获取失败，回退本地快照: {exc}")
                local_dates = engine._cached_snapshot_dates("stock_snapshot")  # noqa: SLF001
                trade_date = local_dates[-1] if local_dates else ""
        if not trade_date:
            return json_response(self, {"error": "no trade date available"}, 500)

        # 盘中观察 - 同花顺概念板块排行
        if path == "/api/intraday/sectors":
            realtime = engine.intraday_sector_rankings(trade_date)
            items = list(realtime.get("items", []))
            if not items:
                fallback_items = engine.sector_rankings(trade_date, sort_by="rps10")
                return json_response(self, {"tradeDate": trade_date, "items": fallback_items, "dataMode": "snapshot-fallback"})
            return json_response(self, {"tradeDate": trade_date, "items": items, "dataMode": "realtime"})

        # 盘中观察 - 概念板块成分股（实时行情）
        if path.startswith("/api/intraday/sectors/") and path.endswith("/stocks"):
            sector_code = path.split("/")[4]
            try:
                realtime_items = engine.intraday_sector_stocks(sector_code, trade_date)
            except Exception as exc:
                logger.warning(f"intraday_sector_stocks 失败，降级快照: {sector_code}, {exc}")
                realtime_items = []
            if not realtime_items:
                try:
                    fallback_items = engine.sector_stocks(sector_code, trade_date, sort_by="rps10")
                except Exception as exc:
                    logger.warning(f"sector_stocks 失败，返回空列表: {sector_code}, {exc}")
                    fallback_items = []
                return json_response(self, {"items": fallback_items, "dataMode": "snapshot-fallback"})
            return json_response(self, {"items": realtime_items, "dataMode": "realtime"})

        # 配置规则API
        if path == "/api/config/rules":
            r = engine.rules
            return json_response(
                self,
                {
                    "sectorAmountMin": r.sector_amount_min,
                    "stockAmountMin": r.stock_amount_min,
                    "stockRpsMin": r.stock_rps_min,
                    "requireAboveMa20": r.require_above_ma20,
                },
            )

        # 市场概览API
        if path == "/api/market/overview":
            logger.debug(f"获取市场概览: {trade_date}")
            return json_response(self, engine.market_overview(trade_date))

        # 板块排行API
        if path == "/api/sectors/rankings":
            sort_by = q.get("sortBy", ["rps10"])[0]
            keyword = q.get("keyword", [""])[0]
            logger.debug(f"获取板块排行: {trade_date}, sort={sort_by}, keyword={keyword}")
            # 强制走本地快照，避免实时链路受限流/代理波动影响导致页面空白
            return json_response(
                self,
                {"items": engine.sector_rankings(trade_date, sort_by=sort_by, keyword=keyword), "dataMode": "snapshot"},
            )

        if path == "/api/search":
            query = q.get("q", [""])[0]
            limit = int(q.get("limit", ["12"])[0])
            return json_response(self, engine.search_market(query, trade_date, limit=limit))

        # 板块成分股API
        if path.startswith("/api/sectors/") and path.endswith("/stocks"):
            sector_code = path.split("/")[3]
            sort_by = q.get("sortBy", ["rps10"])[0]
            logger.debug(f"获取板块成分股: {sector_code}, {trade_date}")
            return json_response(
                self,
                {"sectorCode": sector_code, "items": engine.sector_stocks(sector_code, trade_date, sort_by=sort_by), "dataMode": "snapshot"},
            )

        # 个股K线API（支持 frequency=1d/1w/1M/1m/5m/15m/30m/60m）
        if path.startswith("/api/charts/stock/"):
            ts_code = path.split("/")[4]
            bars = int(q.get("bars", ["180"])[0])
            frequency = q.get("frequency", ["1d"])[0]
            real_only = q.get("realOnly", ["0"])[0] in ("1", "true", "True")
            import re as _re
            # 上证指数 5m：走带兜底的 synthetic 路径（真实5m → 腾讯直连 → 日K合成）
            if frequency == "5m" and ts_code == "000001.SH":
                logger.debug(f"获取上证5m(synthetic): {ts_code}, bars={bars}, realOnly={real_only}")
                return json_response(
                    self,
                    engine.stock_kline_5m_synthetic(
                        ts_code, trade_date, bars=bars, allow_daily_fallback=not real_only,
                    ),
                )
            if frequency in ("1d", "1w", "1M") or _re.match(r"^\d+m$", frequency):
                logger.debug(f"获取个股K线(Ashare): {ts_code}, freq={frequency}, bars={bars}")
                return json_response(self, engine.stock_kline_ashare(ts_code, frequency, bars=bars))
            logger.debug(f"获取个股K线: {ts_code}, {trade_date}, bars={bars}")
            return json_response(self, engine.stock_kline(ts_code, trade_date, bars=bars))

        # 板块K线API
        if path.startswith("/api/charts/sector/"):
            sector_code = path.split("/")[4]
            bars = int(q.get("bars", ["180"])[0])
            logger.debug(f"获取板块K线: {sector_code}, {trade_date}, bars={bars}")
            return json_response(self, engine.sector_kline(sector_code, trade_date, bars=bars))

        # 指数K线API（用于指数对比图表）
        if path.startswith("/api/charts/index/"):
            ts_code = path.split("/")[4]
            bars = int(q.get("bars", ["180"])[0])
            logger.debug(f"获取指数K线: {ts_code}, bars={bars}")
            return json_response(self, engine.index_kline(ts_code, trade_date, bars=bars))

        # 相对强弱API
        if path == "/api/relative-strength":
            ts_code = q.get("tsCode", [""])[0]
            sector_code = q.get("sectorCode", [""])[0]
            if not ts_code or not sector_code:
                return json_response(self, {"error": "missing tsCode or sectorCode"}, 400)
            logger.debug(f"获取相对强弱: {ts_code} vs {sector_code}")
            return json_response(self, engine.relative_strength(ts_code, sector_code, trade_date))

        # 在 Parallels Windows VM 的远航同花顺中打开个股
        if path == "/api/open-ths":
            ts_code = q.get("code", [""])[0]
            pure = ts_code.split(".")[0]
            if pure:
                import subprocess
                try:
                    subprocess.Popen(
                        ["prlctl", "exec", "Windows 11", "cmd", "/c",
                         f"start C:\\goldsun\\TdxW.exe /Stock {pure}"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    return json_response(self, {"ok": True, "code": pure})
                except Exception as exc:
                    logger.warning(f"启动远航同花顺失败: {exc}")
                    return json_response(self, {"ok": False, "error": str(exc)})
            return json_response(self, {"ok": False, "error": "missing code"})

        # 指数风险雷达API
        if path == "/api/index-risk":
            logger.debug(f"获取指数风险雷达: {trade_date}")
            return json_response(self, analyze_all_indices(engine.pro, trade_date))

        # 牛股集中营API
        if path == "/api/bullcamp" or path == "/api/camp/bull-stocks":
            logger.debug(f"获取牛股集中营: {trade_date}")
            return json_response(self, {"tradeDate": trade_date, "items": engine.bull_camp(trade_date)})

        # HH扫描API - 扫描牛股中的HH买入信号，按板块分组
        if path == "/api/hh-scan":
            logger.debug(f"HH扫描: {trade_date}")
            return json_response(self, engine.hh_scan(trade_date))

        # 双底扫描API
        if path == "/api/double-bottom-scan":
            logger.debug(f"双底扫描: {trade_date}")
            return json_response(self, engine.double_bottom_scan(trade_date))

        # 盘前纪要API - 涨停热点 / 机构买卖 / 游资动向 / 新高股票 / 异动预警
        if path == "/api/market-recap":
            logger.debug(f"获取盘前纪要: {trade_date}")
            return json_response(self, engine.market_recap(trade_date))

        # 牛股历史API (连营天数计算用)
        if path == "/api/camp/bull-stocks/history":
            days = int(q.get("days", ["20"])[0])
            days = max(1, min(days, 60))
            logger.debug(f"获取牛股历史: {trade_date}, days={days}")
            return json_response(self, {"tradeDate": trade_date, "days": days, "items": engine.bull_camp_history(trade_date, days=days)})

        # 个股财务数据API
        if path.startswith("/api/stock/") and path.endswith("/financials"):
            ts_code = path.split("/")[3]
            periods = int(q.get("periods", ["8"])[0])
            logger.debug(f"获取个股财务: {ts_code}, periods={periods}")
            return json_response(self, engine.stock_financials(ts_code, periods))

        # 个股形态检测API (含 HH 信号点坐标)
        if path.startswith("/api/stock/") and path.endswith("/patterns"):
            ts_code = path.split("/")[3]
            logger.debug(f"检测个股形态: {ts_code}")
            from pattern_detector import detect_all_patterns_detail, detect_all_patterns_with_signals
            try:
                kline = engine.stock_kline(ts_code, trade_date, bars=270)
                points = kline.get("points", [])
                if points:
                    import pandas as _pd
                    df = _pd.DataFrame(points)
                    col_map = {"time": "trade_date", "o": "open", "h": "high", "l": "low", "c": "close", "v": "vol"}
                    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})
                    detail_results = detect_all_patterns_detail(df)
                    signal_results = detect_all_patterns_with_signals(df)
                else:
                    detail_results = []
                    signal_results = {"tags": [], "signals": [], "maAlignment": None}
            except Exception as exc:
                logger.warning(f"形态检测失败: {ts_code}, {exc}")
                detail_results = []
                signal_results = {"tags": [], "signals": [], "maAlignment": None}
            return json_response(self, {
                "tsCode": ts_code,
                "patterns": detail_results,
                "signals": signal_results.get("signals", []),
                "drawdowns": signal_results.get("drawdowns", []),
                "supports": signal_results.get("supports", []),
                "resistances": signal_results.get("resistances", []),
                "maAlignment": signal_results.get("maAlignment"),
                "latestHH": signal_results.get("latestHH"),
                "hasBuySignal": signal_results.get("hasBuySignal", False),
            })

        # 个股形态预测API
        if path.startswith("/api/stock/") and path.endswith("/predictions"):
            ts_code = path.split("/")[3]
            logger.debug(f"获取形态预测: {ts_code}")
            # 优先查预计算
            try:
                _conn = __import__("sqlite3").connect(str(BACKEND / "data" / "precomputed.db"))
                row = _conn.execute(
                    "SELECT payload FROM pattern_predictions WHERE trade_date=? AND ts_code=?",
                    (trade_date, ts_code)
                ).fetchone()
                _conn.close()
                if row:
                    return json_response(self, __import__("json").loads(row[0]))
            except Exception:
                pass
            # 实时计算
            try:
                kline = engine.stock_kline(ts_code, trade_date, bars=150)
                points = kline.get("points", [])
                if points:
                    import pandas as _pd2
                    pdf = _pd2.DataFrame(points)
                    col_map = {"time": "trade_date", "o": "open", "h": "high", "l": "low", "c": "close", "v": "vol"}
                    pdf = pdf.rename(columns={k: v for k, v in col_map.items() if k in pdf.columns})
                    return json_response(self, predict_patterns(pdf))
            except Exception as exc:
                logger.warning(f"形态预测失败: {ts_code}, {exc}")
            return json_response(self, {"predictions": []})

        # 全市场形态预测列表（预计算结果）
        if path == "/api/predictions":
            logger.debug(f"获取全市场形态预测: {trade_date}")
            try:
                _conn = __import__("sqlite3").connect(str(BACKEND / "data" / "precomputed.db"))
                rows = _conn.execute(
                    "SELECT ts_code, payload FROM pattern_predictions WHERE trade_date=?",
                    (trade_date,)
                ).fetchall()
                _conn.close()
                items = []
                for ts_code, payload_str in rows:
                    data = __import__("json").loads(payload_str)
                    for pred in data.get("predictions", []):
                        pred["tsCode"] = ts_code
                        items.append(pred)
                items.sort(key=lambda x: x.get("confidence", 0), reverse=True)
                return json_response(self, {"tradeDate": trade_date, "items": items})
            except Exception as exc:
                logger.warning(f"全市场预测查询失败: {exc}")
            return json_response(self, {"tradeDate": trade_date, "items": []})

        # 个股上涨归因API
        if path.startswith("/api/stock/") and path.endswith("/attribution"):
            ts_code = path.split("/")[3]
            logger.debug(f"获取个股上涨归因: {ts_code}")
            try:
                return json_response(self, engine.stock_rise_attribution(ts_code, trade_date))
            except Exception as exc:
                logger.error(f"归因分析失败: {ts_code}, {exc}", exc_info=True)
                return json_response(self, {"tsCode": ts_code, "stockName": "", "attribution": []})

        # 个股所属板块查询API
        if path.startswith("/api/stock/") and path.endswith("/sector"):
            ts_code = path.split("/")[3]
            logger.debug(f"查询个股所属板块: {ts_code}")
            try:
                sector_info = engine.stock_sector_lookup(ts_code, trade_date)
                return json_response(self, sector_info)
            except Exception as exc:
                logger.warning(f"板块查询失败: {ts_code}, {exc}")
                return json_response(self, {"sectorCode": "", "sectorName": ""})

        # 个股标签API（概念题材 + 游资/基金 + 关联股）
        if path.startswith("/api/stock/") and path.endswith("/tags"):
            ts_code = path.split("/")[3]
            logger.debug(f"获取个股标签: {ts_code}")
            try:
                return json_response(self, engine.stock_tags(ts_code, trade_date))
            except Exception as exc:
                logger.warning(f"标签查询失败: {ts_code}, {exc}")
                return json_response(self, {
                    "tsCode": ts_code, "stockName": "",
                    "concepts": [], "capitalType": "未知",
                    "capitalDetail": "", "relatedStocks": [],
                })

        # 个股HH信号成功率统计API
        if path.startswith("/api/stock/") and path.endswith("/hh-stats"):
            ts_code = path.split("/")[3]
            logger.debug(f"获取HH成功率: {ts_code}")
            try:
                return json_response(self, engine.stock_hh_stats(ts_code, trade_date))
            except Exception as exc:
                logger.warning(f"HH统计失败: {ts_code}, {exc}")
                return json_response(self, {"tsCode": ts_code, "totalSignals": 0, "signals": [], "statsByType": {}, "overall": {}})

        # 个股新闻/公告API
        if path.startswith("/api/stock/") and path.endswith("/news"):
            ts_code = path.split("/")[3]
            limit = int(q.get("limit", ["20"])[0])
            logger.debug(f"获取个股新闻: {ts_code}, limit={limit}")
            return json_response(self, {"tsCode": ts_code, "items": engine.stock_news(ts_code, trade_date, limit=limit)})

        # ── 每日简报 API ──────────────────────────────

        # 获取每日简报列表
        if path == "/api/daily-briefs":
            date = q.get("date", [None])[0]
            brief_type = q.get("type", [None])[0]
            limit = int(q.get("limit", ["10"])[0])
            logger.debug(f"获取每日简报: date={date}, type={brief_type}, limit={limit}")
            items = briefs_store.list_briefs(date=date, brief_type=brief_type, limit=limit)
            return json_response(self, {"items": items})

        # 获取最新简报
        if path == "/api/daily-briefs/latest":
            brief_type = q.get("type", [None])[0]
            logger.debug(f"获取最新简报: type={brief_type}")
            brief = briefs_store.get_latest(brief_type=brief_type)
            if brief:
                return json_response(self, brief)
            return json_response(self, {"error": "暂无简报"}, 404)

        # 调度器状态
        if path == "/api/scheduler/status":
            import os as _os
            pid_file = ROOT / ".pids" / "scheduler.pid"
            running = False
            pid = None
            if pid_file.exists():
                pid = int(pid_file.read_text().strip())
                try:
                    _os.kill(pid, 0)
                    running = True
                except OSError:
                    running = False
            return json_response(self, {
                "running": running,
                "pid": pid,
                "briefCount": briefs_store.count(),
            })

        # 手动触发更新（POST）
        if path == "/api/scheduler/trigger" and method == "POST":
            import subprocess as _sp
            logger.info("手动触发调度器更新...")
            try:
                _sp.Popen(
                    [sys.executable, str(BACKEND / "daily_scheduler.py"), "--run-now"],
                    cwd=str(BACKEND),
                    stdout=_sp.DEVNULL,
                    stderr=_sp.DEVNULL,
                )
                return json_response(self, {"ok": True, "message": "更新已触发，请稍后刷新查看"})
            except Exception as exc:
                return json_response(self, {"error": str(exc)}, 500)

        # ── 新闻聚合 API ──────────────────────────────

        # 获取新闻列表
        if path == "/api/news-feed":
            source = q.get("source", [None])[0]
            category = q.get("category", [None])[0]
            date = q.get("date", [None])[0]
            limit = int(q.get("limit", ["50"])[0])
            logger.debug(f"获取新闻: source={source}, category={category}, limit={limit}")
            items = query_news(source=source, category=category, date=date, limit=limit)
            return json_response(self, {"items": items})

        # 获取新闻简报摘要
        if path == "/api/news-brief":
            date = q.get("date", [None])[0]
            logger.debug(f"获取新闻简报: date={date}")
            brief = generate_brief_summary(date=date)
            return json_response(self, brief)

        # 触发新闻采集
        if path == "/api/news-feed/refresh" and method == "POST":
            logger.info("手动触发新闻采集...")
            import threading as _threading
            def _do_fetch():
                try:
                    results = fetch_all_news()
                    logger.info(f"新闻采集完成: {results}")
                except Exception as exc:
                    logger.error(f"新闻采集失败: {exc}")
            _threading.Thread(target=_do_fetch, daemon=True).start()
            return json_response(self, {"ok": True, "message": "采集已触发"})

        # ── 知识星球图片静态服务 ──────────────────────
        if path.startswith("/api/zsxq/images/"):
            filename = path.split("/")[-1]
            img_path = BACKEND / "data" / "zsxq_images" / filename
            if img_path.exists() and img_path.is_file():
                data = img_path.read_bytes()
                content_type = "image/jpeg"
                if filename.endswith(".png"):
                    content_type = "image/png"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(data)
                return
            return json_response(self, {"error": "image not found"}, 404)

        # ── 知识星球 API ──────────────────────────────

        # 知识星球内容列表
        if path == "/api/zsxq/topics":
            limit = int(q.get("limit", ["50"])[0])
            offset = int(q.get("offset", ["0"])[0])
            logger.debug(f"获取知识星球: limit={limit}, offset={offset}")
            items = query_zsxq_topics(limit=limit, offset=offset)
            return json_response(self, {"items": items})

        # 知识星球搜索
        if path == "/api/zsxq/search":
            keyword = q.get("q", [""])[0]
            limit = int(q.get("limit", ["50"])[0])
            if not keyword:
                return json_response(self, {"error": "缺少搜索关键词 q"}, 400)
            items = search_zsxq_topics(keyword, limit=limit)
            return json_response(self, {"items": items, "keyword": keyword})

        # 知识星球股票详情（关联帖子+相关股票）
        if path == "/api/zsxq/stock-detail":
            name = q.get("name", [""])[0]
            if not name:
                return json_response(self, {"error": "缺少 name 参数"}, 400)
            detail = query_zsxq_stock_detail(name)
            return json_response(self, detail)

        # 知识星球股票提及统计
        if path == "/api/zsxq/stock-stats":
            limit = int(q.get("limit", ["50"])[0])
            logger.debug(f"获取知识星球股票统计: limit={limit}")
            stats = query_zsxq_stock_stats(limit=limit)
            return json_response(self, {"items": stats})

        # 同花顺 K线代理（code/market/freq）
        if path == "/api/ths/kline":
            code = q.get("code", [""])[0]
            market = q.get("market", ["stock"])[0]
            freq = q.get("freq", ["1d"])[0]
            bars = int(q.get("bars", ["240"])[0])
            if not code:
                return json_response(self, {"error": "missing code"}, 400)
            try:
                result = fetch_ths_kline(code, market=market, freq=freq, bars=bars)
                return json_response(self, result)
            except Exception as exc:
                logger.warning(f"THS kline error: {exc}")
                return json_response(self, {"error": str(exc)}, 500)

        # GET /api/ths/sectors - 按 RS120 降序的板块列表
        if path == "/api/ths/sectors":
            sectors = fetch_ths_sector_list()
            rs_map = load_cached_sector_rs120()
            enriched = []
            for s in sectors:
                rs = rs_map.get(s["code"])
                enriched.append({
                    "code": s["code"],
                    "name": s["name"],
                    "rs120": rs,
                })
            # RS120 降序（None 排最后）
            enriched.sort(key=lambda x: (x["rs120"] is None, -(x["rs120"] or 0)))
            return json_response(self, {"items": enriched})

        # GET /api/ths/sectors/{code}/members - 板块成分股
        if path.startswith("/api/ths/sectors/") and path.endswith("/members"):
            sector_code = path.split("/")[4]
            if not sector_code.startswith("881") or len(sector_code) != 6:
                return json_response(self, {"error": "invalid sector code"}, 400)
            members = fetch_ths_sector_members(sector_code)
            # 计算板块内 RS（按 pctChange 百分位，简化版，不读 K线）
            if members:
                sorted_by_pct = sorted(members, key=lambda m: m.get("pctChange", 0))
                n = len(sorted_by_pct)
                rank_map = {m["code"]: i for i, m in enumerate(sorted_by_pct)}
                for m in members:
                    rank = rank_map.get(m["code"], 0)
                    m["rs120"] = int(round(rank / max(n - 1, 1) * 100)) if n > 1 else 50
            return json_response(self, {"items": members})

        # GET /api/ths/my-sectors
        if path == "/api/ths/my-sectors" and method == "GET":
            return json_response(self, {"items": my_sectors_store.list()})

        # POST /api/ths/my-sectors
        if path == "/api/ths/my-sectors" and method == "POST":
            action = (body or {}).get("action")
            code = (body or {}).get("code", "").strip()
            name = (body or {}).get("name", "").strip()
            if action == "add":
                if not code or not name:
                    return json_response(self, {"error": "code and name required"}, 400)
                my_sectors_store.add(code, name)
                return json_response(self, {"ok": True, "action": "add", "code": code})
            elif action == "remove":
                if not code:
                    return json_response(self, {"error": "code required"}, 400)
                my_sectors_store.remove(code)
                return json_response(self, {"ok": True, "action": "remove", "code": code})
            return json_response(self, {"error": "invalid action"}, 400)

        # POST /api/ths/refresh-rs120 - 手动触发 RS120 重算（后台任务）
        if path == "/api/ths/refresh-rs120" and method == "POST":
            import threading as _thr
            def _do_refresh():
                try:
                    result = refresh_all_sector_rs120()
                    logger.info(f"RS120 refresh done: {len(result)} sectors")
                except Exception as exc:
                    logger.error(f"RS120 refresh failed: {exc}")
            _thr.Thread(target=_do_refresh, daemon=True).start()
            return json_response(self, {"ok": True, "message": "RS120 刷新已触发，约 5 分钟完成"})

        # 知识星球市场主线
        if path == "/api/zsxq/mainlines":
            days = int(q.get("days", ["7"])[0])
            limit = int(q.get("limit", ["30"])[0])
            logger.debug(f"获取知识星球主线: days={days}, limit={limit}")
            result = compute_zsxq_mainlines(days=days, limit=limit)
            return json_response(self, result)

        # 知识星球智能汇总
        if path == "/api/zsxq/summary":
            logger.debug("获取知识星球汇总")
            summary = query_zsxq_summary()
            return json_response(self, summary)

        # 知识星球 Cookie 状态
        if path == "/api/zsxq/cookie-status":
            cookies = _load_zsxq_cookies()
            if cookies and cookies.get("zsxq_access_token"):
                token = cookies["zsxq_access_token"]
                masked = token[:8] + "****" + token[-4:] if len(token) > 12 else "****"
                return json_response(self, {"configured": True, "token_preview": masked})
            return json_response(self, {"configured": False})

        # 保存知识星球 Cookie
        if path == "/api/zsxq/cookie" and method == "POST":
            raw = (body or {}).get("cookie", "").strip()
            if not raw:
                return json_response(self, {"error": "cookie 不能为空"}, 400)
            cookies: dict[str, str] = {}
            for pair in raw.split(";"):
                pair = pair.strip()
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    cookies[k.strip()] = v.strip()
            if not cookies.get("zsxq_access_token"):
                return json_response(self, {"error": "Cookie 中未找到 zsxq_access_token"}, 400)
            save_zsxq_cookies(cookies)
            return json_response(self, {"ok": True, "message": "Cookie 已保存"})

        # 重新索引知识星球股票提及
        if path == "/api/zsxq/reindex" and method == "POST":
            logger.info("触发知识星球股票重新索引...")
            import threading as _thr2
            def _do_reindex():
                try:
                    count = reindex_zsxq_stock_mentions()
                    logger.info(f"重新索引完成: {count} 条")
                except Exception as exc:
                    logger.error(f"重新索引失败: {exc}")
            _thr2.Thread(target=_do_reindex, daemon=True).start()
            return json_response(self, {"ok": True, "message": "重新索引已触发"})

        # 手动触发知识星球采集
        if path == "/api/zsxq/refresh" and method == "POST":
            logger.info("手动触发知识星球采集...")
            import threading as _thr
            def _do_zsxq():
                try:
                    items = fetch_zsxq(limit=90)
                    saved = save_zsxq_topics(items)
                    logger.info(f"知识星球采集完成: {len(items)} 条, 保存 {saved} 条")
                except Exception as exc:
                    logger.error(f"知识星球采集失败: {exc}")
            _thr.Thread(target=_do_zsxq, daemon=True).start()
            return json_response(self, {"ok": True, "message": "采集已触发"})

        # 未找到API
        logger.warning(f"未找到API: {path}")
        return json_response(self, {"error": "not found"}, 404)

    def handle_static(self, path: str):
        """处理静态文件请求"""
        if path == "/":
            path = "/index.html"

        file_path = (WEB_DIR / path.lstrip("/")).resolve()

        # 安全检查
        if WEB_DIR not in file_path.parents and file_path != WEB_DIR:
            logger.warning(f"非法路径访问: {path}")
            self.send_error(403)
            return

        if not file_path.exists() or not file_path.is_file():
            logger.debug(f"文件不存在: {path}")
            self.send_error(404)
            return

        # 读取文件
        data = file_path.read_bytes()

        # 设置Content-Type
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }
        content_type = content_types.get(file_path.suffix, "application/octet-stream")

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class ThreadedHTTPServer(ThreadingHTTPServer):
    """支持多线程的HTTP服务器"""
    daemon_threads = True
    timeout = 30


def main():
    """主函数"""
    server_config = config.server

    logger.info("=" * 50)
    logger.info("板块强度选股系统启动中...")
    logger.info(f"服务器地址: http://{server_config.host}:{server_config.port}")
    logger.info(f"调试模式: {server_config.debug}")
    logger.info("=" * 50)

    try:
        httpd = ThreadedHTTPServer((server_config.host, server_config.port), Handler)
        logger.info("✅ 服务器启动成功，按 Ctrl+C 停止")
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("收到停止信号，正在关闭服务器...")
    except OSError as e:
        logger.error(f"端口被占用或无法绑定: {e}")
        logger.error(f"请检查端口 {server_config.port} 是否被占用")
        raise
    finally:
        logger.info("服务器已停止")


if __name__ == "__main__":
    main()
