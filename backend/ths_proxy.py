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

# 多个引导页 URL 防单点失败/限频（任一个能访问就能拿到完整侧栏列表）
_SECTOR_BOOTSTRAP_URLS = [
    "https://q.10jqka.com.cn/thshy/detail/code/881121/",  # 半导体
    "https://q.10jqka.com.cn/thshy/detail/code/881273/",  # 白酒
    "https://q.10jqka.com.cn/thshy/detail/code/881155/",  # 银行
    "https://q.10jqka.com.cn/thshy/detail/code/881281/",  # 电池
]

# 持久化文件缓存路径（板块列表很少变，跨重启保留）
from pathlib import Path as _Path
_SECTOR_LIST_FILE = _Path(__file__).parent / "data" / "ths_sector_list.json"


def _load_sector_list_from_file() -> list[dict[str, Any]] | None:
    """从持久化文件读板块列表。"""
    if not _SECTOR_LIST_FILE.exists():
        return None
    try:
        return json.loads(_SECTOR_LIST_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"sector list file read failed: {exc}")
        return None


def _save_sector_list_to_file(data: list[dict[str, Any]]) -> None:
    """写持久化文件。"""
    try:
        _SECTOR_LIST_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SECTOR_LIST_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning(f"sector list file write failed: {exc}")


def fetch_ths_sector_list() -> list[dict[str, Any]]:
    """从 q.10jqka.com.cn 爬取全量 881xxx 板块列表。

    缓存层次（从快到慢）：
    1. 内存缓存（24h TTL）
    2. JSON 文件缓存（持久化，跨重启）
    3. 多个引导 URL 轮询爬取
    4. 全失败：返回内存或文件中的旧数据

    返回: [{"code": "881121", "name": "半导体"}, ...]
    """
    global _sector_list_cache

    # 1. 内存缓存
    if _sector_list_cache is not None:
        ts, data = _sector_list_cache
        if time.time() - ts < _SECTOR_LIST_TTL:
            return data

    # 2. 文件缓存（重启后第一次使用）
    file_data = _load_sector_list_from_file()
    if file_data:
        _sector_list_cache = (time.time(), file_data)
        # 已读到文件后仍异步重新爬一次没意义，文件够用
        return file_data

    # 3. 网络爬取，多个引导 URL 轮询
    pattern = r'href="[^"]*code/(881\d{3})/?"[^>]*>([^<]+)</a>'
    for url in _SECTOR_BOOTSTRAP_URLS:
        try:
            resp = requests.get(url, headers=_THS_HEADERS, timeout=10)
            resp.encoding = "gbk"
            html = resp.text
        except Exception as exc:
            logger.warning(f"THS sector list fetch failed: url={url} err={exc}")
            continue

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

        if len(result) >= 50:  # 至少 50 个才算成功（防部分爬到）
            _sector_list_cache = (time.time(), result)
            _save_sector_list_to_file(result)
            logger.info(f"THS sector list: {len(result)} sectors from {url}")
            return result
        else:
            logger.warning(f"THS sector list partial: only {len(result)} from {url}, retry next URL")

    # 4. 全失败兜底
    logger.warning("THS sector list: all bootstrap URLs failed")
    return _sector_list_cache[1] if _sector_list_cache else []


# ── 板块成分股爬虫 ────────────────────────────────────────
# key: sector_code, value: (timestamp, data)
_members_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_MEMBERS_TTL = 3600  # 1 小时


def _parse_amount(text: str) -> float:
    """'1.23亿' → 1.23e8, '5230万' → 5.23e7"""
    text = text.replace(",", "").strip()
    if text in ("--", ""):
        return 0.0
    try:
        if text.endswith("亿"):
            return float(text[:-1]) * 1e8
        if text.endswith("万"):
            return float(text[:-1]) * 1e4
        return float(text)
    except ValueError:
        return 0.0


def _parse_members_rows(html: str) -> list[dict[str, Any]]:
    """解析成分股 HTML 表格（非 ajax 完整页面格式）。"""
    # 提取 tbody 里的每行
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)
    result: list[dict[str, Any]] = []
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 11:
            continue

        # 代码在第 2 列（含 <a href="...stockpage...">600519</a>）
        code_match = re.search(r"(\d{6})", cells[1])
        if not code_match:
            continue
        code = code_match.group(1)

        # 名称在第 3 列
        name_match = re.search(r">([^<]+)</a>", cells[2])
        name = name_match.group(1).strip() if name_match else re.sub(r"<[^>]+>", "", cells[2]).strip()
        if not name:
            continue

        def _clean(text: str) -> str:
            return re.sub(r"<[^>]+>", "", text).strip()

        # 最新价：第 4 列（index 3）
        try:
            price = float(_clean(cells[3]))
        except (ValueError, IndexError):
            price = 0.0

        # 涨跌幅：第 5 列（index 4），格式 "1.48" 或 "-0.25"（无百分号）
        try:
            pct_text = _clean(cells[4]).rstrip("%")
            pct = float(pct_text) if pct_text not in ("--", "") else 0.0
        except (ValueError, IndexError):
            pct = 0.0

        # 成交额：第 11 列（index 10），固定位置，格式 "7.24亿"
        try:
            amount = _parse_amount(_clean(cells[10]))
        except IndexError:
            amount = 0.0
        # 兜底：如果 col[10] 没有亿/万，扫其余列
        if amount == 0.0:
            for c in cells[5:]:
                text = _clean(c)
                if text.endswith("亿") or text.endswith("万"):
                    amount = _parse_amount(text)
                    if amount > 0:
                        break

        result.append({
            "code": code,
            "name": name,
            "price": price,
            "pctChange": pct,
            "amount": amount,
        })
    return result


def fetch_ths_sector_members(sector_code: str) -> list[dict[str, Any]]:
    """爬取指定板块的成分股（1 小时缓存）。

    Args:
        sector_code: 881xxx 的板块代码

    Returns:
        [
            {
              "code": "600519",
              "name": "贵州茅台",
              "price": 1688.0,     # 最新价
              "pctChange": 2.35,   # 涨跌幅（百分比数字，如 2.35 表示 +2.35%）
              "amount": 1.23e9,    # 成交额（单位：元）
            },
            ...
        ]
    """
    sector_code = sector_code.strip()
    if not sector_code.startswith("881") or len(sector_code) != 6:
        return []

    # 缓存命中
    cached = _members_cache.get(sector_code)
    if cached and time.time() - cached[0] < _MEMBERS_TTL:
        return cached[1]

    all_results: list[dict[str, Any]] = []
    seen: set[str] = set()

    # 最多翻 10 页（每页 20 只，上限 200 只）
    for page in range(1, 11):
        if page == 1:
            url = f"https://q.10jqka.com.cn/thshy/detail/code/{sector_code}/"
        else:
            url = f"https://q.10jqka.com.cn/thshy/detail/code/{sector_code}/page/{page}/"
        try:
            resp = requests.get(url, headers=_THS_HEADERS, timeout=10)
            resp.encoding = "gbk"
            html = resp.text
        except Exception as exc:
            logger.warning(f"THS members fetch failed: sector={sector_code} page={page} err={exc}")
            break
        if not html or "<tr" not in html:
            break

        page_results = _parse_members_rows(html)
        new_count = 0
        for item in page_results:
            if item["code"] in seen:
                continue
            seen.add(item["code"])
            all_results.append(item)
            new_count += 1
        # 本页没有新数据 → 已到末页
        if new_count == 0:
            break

    if all_results:
        _members_cache[sector_code] = (time.time(), all_results)
    return all_results
