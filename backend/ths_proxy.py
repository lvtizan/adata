"""同花顺网页端 K 线数据代理。

同花顺网页图表用的 JSONP 接口，本地后端代理一下：
- 带 Referer 头规避 403
- 剥 JSONP 壳
- CSV 字符串 → 标准化 points

接口格式：
  http://d.10jqka.com.cn/v6/line/{prefix}_{code}/{type}/last.js
    prefix: hs=个股/指数, bk=板块
    type:   01=日K 11=周K 21=月K 41=5分钟

Index code 特殊：上证 1A0001 / 深证成指 399001 / 创业板 399006
"""
from __future__ import annotations

import json
import logging
import re
import time
import threading
from typing import Any
from urllib.parse import urlparse

import requests

logger = logging.getLogger("ths_proxy")

_THS_HEADERS = {
    "Referer": "http://stockpage.10jqka.com.cn/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

# freq -> THS type
_FREQ_MAP = {
    "1d": "01",
    "1w": "11",
    "1M": "21",
    "5m": "41",
}

# 常用指数代码映射 (通用代码 -> 同花顺代码)
_INDEX_CODE_MAP = {
    "000001.SH": "1A0001",   # 上证指数
    "sh000001": "1A0001",
    "000300.SH": "000300",   # 沪深300
    "399001.SZ": "399001",   # 深证成指
    "399006.SZ": "399006",   # 创业板指
    "000852.SH": "000852",   # 中证1000
    "000688.SH": "000688",   # 科创50
}


def _normalize_code(code: str, market: str) -> str:
    """把通用代码转成同花顺格式。"""
    if market == "index":
        return _INDEX_CODE_MAP.get(code, code.split(".")[0])
    # 个股/板块：去掉 .SH/.SZ 后缀
    return code.split(".")[0]


def _prefix(market: str) -> str:
    if market == "sector":
        return "bk"
    return "hs"  # stock / index 都用 hs


def _strip_jsonp(text: str) -> dict[str, Any]:
    """剥掉 `quotebridge_xxx({...})` 的 JSONP 壳。"""
    m = re.match(r"^[^(]+\((.*)\);?\s*$", text, re.DOTALL)
    if not m:
        raise ValueError(f"non-JSONP response: {text[:120]}")
    return json.loads(m.group(1))


def _parse_kline_csv(raw: dict[str, Any], freq: str) -> list[dict[str, Any]]:
    """解析 data 字段的 CSV 字符串。

    日线  data: "YYYYMMDD,o,h,l,c,vol,amount;..."
    分钟  data: "YYYYMMDDHHMM,o,h,l,c,vol,amount,...;..."
    """
    data_str = raw.get("data") or ""
    if not data_str:
        return []
    points: list[dict[str, Any]] = []
    for row in data_str.split(";"):
        cols = row.split(",")
        if len(cols) < 6:
            continue
        try:
            points.append({
                "time": cols[0],
                "open": float(cols[1]),
                "high": float(cols[2]),
                "low": float(cols[3]),
                "close": float(cols[4]),
                "volume": float(cols[5]),
                "amount": float(cols[6]) if len(cols) > 6 and cols[6] else 0.0,
            })
        except (ValueError, IndexError):
            continue
    return points


# ── 内存缓存 ──────────────────────────────────────────────
# key: (code, market, freq)  value: (timestamp, result_dict)
_cache: dict[tuple[str, str, str], tuple[float, dict[str, Any]]] = {}
_cache_lock = threading.Lock()

# 缓存 TTL（秒）：日K/周K/月K 缓存 1 小时，5 分钟线缓存 60 秒
_TTL = {"1d": 3600, "1w": 3600, "1M": 3600, "5m": 60}


def _get_cached(code: str, market: str, freq: str) -> dict[str, Any] | None:
    key = (code, market, freq)
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        ts, result = entry
        if time.time() - ts > _TTL.get(freq, 3600):
            del _cache[key]
            return None
        return result


def _set_cached(code: str, market: str, freq: str, result: dict[str, Any]) -> None:
    if not result.get("points"):
        return  # 不缓存空结果
    key = (code, market, freq)
    with _cache_lock:
        _cache[key] = (time.time(), result)


def fetch_ths_kline(code: str, market: str = "stock", freq: str = "1d", bars: int = 240) -> dict[str, Any]:
    """取同花顺 K线数据。

    Args:
        code: 代码。个股 600519 或 600519.SH；板块 881101；指数 000001.SH / sh000001
        market: stock / sector / index
        freq: 1d / 5m / 1w / 1M
        bars: 返回最近多少根

    Returns:
        {code, name, market, freq, points: [{time,open,high,low,close,volume,amount}], source: "ths"}
    """
    if freq not in _FREQ_MAP:
        raise ValueError(f"unsupported freq: {freq}")
    if market not in ("stock", "sector", "index"):
        raise ValueError(f"unsupported market: {market}")

    cached = _get_cached(code, market, freq)
    if cached is not None:
        # 按 bars 截断返回
        pts = cached["points"]
        if bars and len(pts) > bars:
            pts = pts[-bars:]
        return {**cached, "points": pts, "_cached": True}

    ths_code = _normalize_code(code, market)
    prefix = _prefix(market)
    url = f"http://d.10jqka.com.cn/v6/line/{prefix}_{ths_code}/{_FREQ_MAP[freq]}/last.js"

    try:
        resp = requests.get(url, headers=_THS_HEADERS, timeout=6)
        if resp.status_code != 200 or not resp.text.strip():
            logger.warning(f"THS kline empty: code={code} market={market} freq={freq} status={resp.status_code}")
            return {"code": code, "name": code, "market": market, "freq": freq, "points": [], "source": "ths"}
        raw = _strip_jsonp(resp.text)
    except Exception as exc:
        logger.warning(f"THS kline fetch failed: code={code} freq={freq} err={exc}")
        return {"code": code, "name": code, "market": market, "freq": freq, "points": [], "source": "ths", "error": str(exc)}

    points = _parse_kline_csv(raw, freq)
    if bars and len(points) > bars:
        points = points[-bars:]

    name = raw.get("name") or code
    result = {
        "code": code,
        "name": name,
        "market": market,
        "freq": freq,
        "points": points,
        "source": "ths",
    }
    _set_cached(code, market, freq, result)
    return result


# ── 板块列表爬虫 ─────────────────────────────────────────
_sector_list_cache: tuple[float, list[dict[str, Any]]] | None = None
_SECTOR_LIST_TTL = 86400  # 24 小时（板块列表基本一天内不变）

# 以任意一个已知板块详情页为入口，其侧栏含有全量板块列表
_SECTOR_BOOTSTRAP_URL = "https://q.10jqka.com.cn/thshy/detail/code/881121/"


def fetch_ths_sector_list() -> list[dict[str, Any]]:
    """从 q.10jqka.com.cn 爬取全量 881xxx 板块列表（24h 缓存）。

    使用板块详情页侧栏作为入口，该侧栏包含所有行业板块的链接。

    返回: [{"code": "881121", "name": "半导体"}, ...]
    """
    global _sector_list_cache
    if _sector_list_cache is not None:
        ts, data = _sector_list_cache
        if time.time() - ts < _SECTOR_LIST_TTL:
            return data

    try:
        resp = requests.get(_SECTOR_BOOTSTRAP_URL, headers=_THS_HEADERS, timeout=10)
        resp.encoding = "gbk"
        html = resp.text
    except Exception as exc:
        logger.warning(f"THS sector list fetch failed: {exc}")
        # 失败时返回上次缓存（即使过期）
        return _sector_list_cache[1] if _sector_list_cache else []

    # 侧栏链接格式:
    #   <a href="http://q.10jqka.com.cn/thshy/detail/code/881121/" target="_blank">半导体</a>
    pattern = r'href="[^"]*code/(881\d{3})/?"[^>]*>([^<]+)</a>'
    matches = re.findall(pattern, html)
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for code, name in matches:
        if code in seen:
            continue
        name = name.strip()
        if not name:
            continue
        seen.add(code)
        result.append({"code": code, "name": name})

    if result:
        _sector_list_cache = (time.time(), result)
    else:
        logger.warning("THS sector list: no sectors parsed from HTML")
    return result
