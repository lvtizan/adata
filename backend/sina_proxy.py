"""新浪财经板块 / 个股行情代理。

替代同花顺网页爬虫（被 IP 封后的主要数据源）。
用的是新浪公开的 finance.sina.com.cn quotes_service API。

接口：
- getHQNodes         返回全部板块分类树
- getHQNodeData      返回指定板块的成分股

板块分类前缀：
- new_   新浪行业（48）
- sw_    申万一级（31）
- sw2_   申万二级（131，颗粒度接近 THS 881xxx）
- gn_    概念板块（214）
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger("sina_proxy")

_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
_HEADERS = {
    "User-Agent": _UA,
    "Referer": "http://vip.stock.finance.sina.com.cn/mkt/",
}

_NODES_URL = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodes"
_NODE_DATA_URL = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"

# 明确绕过系统代理（很多机器上 VPN 代理会把国内 IP 请求搞坏）
_NO_PROXY = {"http": "", "https": ""}

# ── 文件持久化缓存 ───────────────────────────────
_DATA_DIR = Path(__file__).parent / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_SECTOR_LIST_FILE = _DATA_DIR / "sina_sector_list.json"
_SECTOR_LIST_TTL = 7 * 86400  # 7 天（板块列表几乎不变）

# ── 内存缓存 ──────────────────────────────────
_sector_list_cache: tuple[float, list[dict[str, Any]]] | None = None
_members_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_members_cache_lock = threading.Lock()
_MEMBERS_TTL = 3600  # 1 小时


def _extract_sector_leaves(tree: Any, prefixes: tuple[str, ...] = ("new_", "sw_", "sw2_", "gn_")) -> list[dict[str, Any]]:
    """从 getHQNodes 返回的树形结构中提取指定前缀的板块节点。"""
    result: list[dict[str, Any]] = []
    seen: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, list):
            if len(node) == 3 and all(isinstance(x, str) for x in node) and node[1] == "":
                name, _, code = node
                if code.startswith(prefixes) and code not in seen:
                    seen.add(code)
                    result.append({"code": code, "name": name.strip()})
            else:
                for item in node:
                    walk(item)

    walk(tree)
    return result


def _load_sector_list_from_file() -> list[dict[str, Any]] | None:
    if not _SECTOR_LIST_FILE.exists():
        return None
    try:
        mtime = _SECTOR_LIST_FILE.stat().st_mtime
        if time.time() - mtime > _SECTOR_LIST_TTL:
            return None
        return json.loads(_SECTOR_LIST_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"sina sector list file read failed: {exc}")
        return None


def _save_sector_list_to_file(data: list[dict[str, Any]]) -> None:
    try:
        _SECTOR_LIST_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning(f"sina sector list file write failed: {exc}")


def fetch_sina_sector_list(
    prefixes: tuple[str, ...] = ("new_", "sw2_", "gn_"),
) -> list[dict[str, Any]]:
    """从新浪 quotes_service 爬取全量 A 股板块节点。

    默认只要 new_（新浪行业 48）+ sw2_（申万二级 131）+ gn_（概念 214）共 393 个。
    缓存层次：内存 → 文件（7 天）→ 网络。
    """
    global _sector_list_cache

    # 1. 内存缓存
    if _sector_list_cache is not None:
        ts, data = _sector_list_cache
        if time.time() - ts < 86400:
            return data

    # 2. 文件缓存
    file_data = _load_sector_list_from_file()
    if file_data:
        _sector_list_cache = (time.time(), file_data)
        return file_data

    # 3. 网络
    try:
        resp = requests.get(
            _NODES_URL, headers=_HEADERS, proxies=_NO_PROXY, timeout=10
        )
        if resp.status_code != 200 or not resp.text:
            logger.warning(f"sina nodes failed: status={resp.status_code}")
            return _sector_list_cache[1] if _sector_list_cache else []
        tree = resp.json()
    except Exception as exc:
        logger.warning(f"sina nodes fetch failed: {exc}")
        return _sector_list_cache[1] if _sector_list_cache else []

    result = _extract_sector_leaves(tree, prefixes)
    if not result:
        logger.warning("sina sector list: empty after extract")
        return _sector_list_cache[1] if _sector_list_cache else []

    _sector_list_cache = (time.time(), result)
    _save_sector_list_to_file(result)
    logger.info(f"sina sector list: {len(result)} sectors cached")
    return result


def _parse_sina_symbol_to_ts_code(symbol: str) -> str | None:
    """'sh600519' / 'sz000001' / 'bj430047' → '600519.SH' / '000001.SZ' / '430047.BJ'"""
    if not symbol or len(symbol) < 8:
        return None
    prefix = symbol[:2].lower()
    code = symbol[2:]
    if not code.isdigit() or len(code) != 6:
        return None
    suffix_map = {"sh": "SH", "sz": "SZ", "bj": "BJ"}
    suffix = suffix_map.get(prefix)
    if not suffix:
        return None
    return f"{code}.{suffix}"


def fetch_sina_sector_members(sector_code: str, max_per_page: int = 100) -> list[dict[str, Any]]:
    """爬取指定板块的成分股。

    Args:
        sector_code: 新浪板块 code（如 'new_blhy', 'sw2_电池', 'gn_xxx'）
        max_per_page: 每页数量，上限约 100

    Returns:
        [{code, name, tsCode, price, pctChange, amount}, ...]
        - code: 6 位裸代码
        - tsCode: 加后缀（600519.SH）
        - price: 最新价
        - pctChange: 涨跌百分比（如 2.35）
        - amount: 成交额（元）
    """
    sector_code = sector_code.strip()
    if not sector_code:
        return []

    with _members_cache_lock:
        cached = _members_cache.get(sector_code)
        if cached and time.time() - cached[0] < _MEMBERS_TTL:
            return cached[1]

    all_members: list[dict[str, Any]] = []
    seen_codes: set[str] = set()
    for page in range(1, 11):  # 上限 10 页（1000 只），一般板块不会超过这个
        params = {
            "page": page,
            "num": max_per_page,
            "sort": "changepercent",
            "asc": 0,
            "node": sector_code,
        }
        try:
            resp = requests.get(
                _NODE_DATA_URL,
                params=params,
                headers=_HEADERS,
                proxies=_NO_PROXY,
                timeout=10,
            )
            if resp.status_code != 200 or not resp.text:
                break
            data = resp.json()
        except Exception as exc:
            logger.warning(f"sina members fetch failed sector={sector_code} page={page}: {exc}")
            break
        if not isinstance(data, list) or not data:
            break

        new_count = 0
        for row in data:
            try:
                sym = row.get("symbol", "")
                ts_code = _parse_sina_symbol_to_ts_code(sym)
                if not ts_code:
                    continue
                code = ts_code.split(".")[0]
                if code in seen_codes:
                    continue
                seen_codes.add(code)
                all_members.append({
                    "code": code,
                    "tsCode": ts_code,
                    "name": row.get("name", "").strip(),
                    "price": float(row.get("trade", 0) or 0),
                    "pctChange": float(row.get("changepercent", 0) or 0),
                    "amount": float(row.get("amount", 0) or 0),
                })
                new_count += 1
            except (ValueError, TypeError):
                continue
        if new_count < max_per_page:
            break  # 本页未满说明到底了

    if all_members:
        with _members_cache_lock:
            _members_cache[sector_code] = (time.time(), all_members)
    return all_members


# ── 合成板块 K 线 ─────────────────────────────────
# 新浪没有公开的板块历史 K 线 API，用成分股等权合成
_synth_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_synth_cache_lock = threading.Lock()
_SYNTH_TTL = 3600  # 1 小时


def compute_sector_kline_from_members(
    sector_code: str,
    get_stock_kline,  # callable: (ts_code: str, bars: int) -> list[{time, close, ...}]
    bars: int = 240,
    top_n: int = 20,
) -> list[dict[str, Any]]:
    """按 top N 成分股（按成交额）等权合成板块 K 线。

    Args:
        sector_code: 新浪板块 code（sw2_/new_/gn_）
        get_stock_kline: 取个股 K 线的 callable，返回 [{time, open, high, low, close, volume}]
        bars: 返回 K 线根数
        top_n: 用前 N 只（按当日成交额）合成

    Returns:
        [{time, open, high, low, close, volume}, ...] 归一化为以首日 close=100 的相对指数
        失败返回 []
    """
    with _synth_cache_lock:
        cached = _synth_cache.get(sector_code)
        if cached and time.time() - cached[0] < _SYNTH_TTL:
            return cached[1]

    members = fetch_sina_sector_members(sector_code)
    if not members:
        return []
    # 按成交额降序取前 N
    members_sorted = sorted(members, key=lambda m: m.get("amount", 0), reverse=True)[:top_n]

    # 收集每只股票的 K 线（dict: time → close）
    stock_series: list[dict[str, dict[str, float]]] = []
    for m in members_sorted:
        ts_code = m.get("tsCode")
        if not ts_code:
            continue
        try:
            pts = get_stock_kline(ts_code, bars)
        except Exception as exc:
            logger.warning(f"kline fetch failed {ts_code}: {exc}")
            continue
        if not pts:
            continue
        series = {}
        for p in pts:
            t = str(p.get("time", ""))
            if not t:
                continue
            series[t] = {
                "open": float(p.get("open", 0) or 0),
                "high": float(p.get("high", 0) or 0),
                "low": float(p.get("low", 0) or 0),
                "close": float(p.get("close", 0) or 0),
                "volume": float(p.get("volume", 0) or 0),
            }
        if series:
            stock_series.append(series)

    if not stock_series:
        logger.warning(f"合成板块 K 线 {sector_code}: 无股票数据")
        return []

    # 所有日期的并集，作为合成指数的时间轴
    all_dates = sorted({t for s in stock_series for t in s.keys()})
    if not all_dates:
        return []

    # 对每只股票，以第一个有数据的 close 作为基准 100，后续按相对涨跌幅
    # 然后每日所有股票的相对值等权平均
    synth_points: list[dict[str, Any]] = []
    for date in all_dates:
        day_opens: list[float] = []
        day_highs: list[float] = []
        day_lows: list[float] = []
        day_closes: list[float] = []
        day_vols: list[float] = []
        for series in stock_series:
            # 找基准：这只股票第一个有数据的 close
            base_date = min((d for d in series if d <= date), default=None)
            base_row = series.get(base_date) if base_date else None
            base = base_row["close"] if base_row and base_row["close"] > 0 else 0
            if base <= 0:
                continue
            row = series.get(date)
            if not row:
                continue
            scale = 100.0 / base
            day_opens.append(row["open"] * scale)
            day_highs.append(row["high"] * scale)
            day_lows.append(row["low"] * scale)
            day_closes.append(row["close"] * scale)
            day_vols.append(row["volume"])
        if not day_closes:
            continue
        synth_points.append({
            "time": date,
            "open": round(sum(day_opens) / len(day_opens), 2),
            "high": round(sum(day_highs) / len(day_highs), 2),
            "low": round(sum(day_lows) / len(day_lows), 2),
            "close": round(sum(day_closes) / len(day_closes), 2),
            "volume": sum(day_vols),
        })

    # 按 bars 截断最近 N 根
    if bars and len(synth_points) > bars:
        synth_points = synth_points[-bars:]

    with _synth_cache_lock:
        _synth_cache[sector_code] = (time.time(), synth_points)
    return synth_points
