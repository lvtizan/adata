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
    return {
        "code": code,
        "name": name,
        "market": market,
        "freq": freq,
        "points": points,
        "source": "ths",
    }
