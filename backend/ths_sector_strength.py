"""板块 RS120 百分位计算与缓存。"""
from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path

from ths_proxy import fetch_ths_kline, fetch_ths_sector_list

logger = logging.getLogger("ths_sector_strength")

# 缓存 SQLite 路径（data 目录已存在）
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "ths_sector_strength.db"


def _init_db() -> None:
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS sector_rs120 (
                sector_code TEXT PRIMARY KEY,
                rs120 INTEGER NOT NULL,
                updated_at REAL NOT NULL
            )
        """)


def compute_sector_rs120(sector_closes: dict[str, list[float]]) -> dict[str, int]:
    """基于 120 天 K 线收盘价计算 RS120 百分位。

    RS = 累计涨幅 = (close[-1] / close[0]) - 1
    百分位 = 排名 / (n-1) * 100

    最强板块 → 100，最弱 → 0。
    """
    if not sector_closes:
        return {}
    perf: dict[str, float] = {}
    for code, closes in sector_closes.items():
        if len(closes) < 2 or closes[0] <= 0:
            continue
        perf[code] = (closes[-1] / closes[0]) - 1
    if not perf:
        return {}
    sorted_codes = sorted(perf.keys(), key=lambda c: perf[c])
    n = len(sorted_codes)
    if n == 1:
        return {sorted_codes[0]: 50}
    result: dict[str, int] = {}
    for rank, code in enumerate(sorted_codes):
        result[code] = int(round(rank / (n - 1) * 100))
    return result


def refresh_all_sector_rs120() -> dict[str, int]:
    """拉全量板块，计算并写缓存。"""
    _init_db()
    sectors = fetch_ths_sector_list()
    if not sectors:
        logger.warning("refresh_all_sector_rs120: empty sector list")
        return {}

    sector_closes: dict[str, list[float]] = {}
    for i, s in enumerate(sectors):
        code = s["code"]
        try:
            result = fetch_ths_kline(code, market="sector", freq="1d", bars=130)
            pts = result.get("points") or []
            if len(pts) < 120:
                logger.debug(f"sector {code} has only {len(pts)} bars, skip")
                continue
            closes = [float(p["close"]) for p in pts[-120:]]
            sector_closes[code] = closes
        except Exception as exc:
            logger.warning(f"fetch kline failed for sector {code}: {exc}")
            continue
        # 进度日志
        if (i + 1) % 20 == 0:
            logger.info(f"RS120: fetched {i+1}/{len(sectors)} sectors")

    rs_map = compute_sector_rs120(sector_closes)

    # 写 SQLite
    now = time.time()
    with sqlite3.connect(DB_PATH) as con:
        con.execute("DELETE FROM sector_rs120")
        con.executemany(
            "INSERT INTO sector_rs120 (sector_code, rs120, updated_at) VALUES (?, ?, ?)",
            [(code, rs, now) for code, rs in rs_map.items()],
        )
    logger.info(f"RS120 refresh done: {len(rs_map)} sectors")
    return rs_map


def load_cached_sector_rs120() -> dict[str, int]:
    """从 SQLite 读最新缓存。空表返回 {}。"""
    if not DB_PATH.exists():
        return {}
    try:
        with sqlite3.connect(DB_PATH) as con:
            rows = con.execute("SELECT sector_code, rs120 FROM sector_rs120").fetchall()
        return {code: int(rs) for code, rs in rows}
    except sqlite3.Error as exc:
        logger.warning(f"load cached RS120 failed: {exc}")
        return {}


def get_last_refresh_time() -> float | None:
    """最近一次缓存更新时间（unix timestamp）。无数据返回 None。"""
    if not DB_PATH.exists():
        return None
    try:
        with sqlite3.connect(DB_PATH) as con:
            row = con.execute("SELECT MAX(updated_at) FROM sector_rs120").fetchone()
        return row[0] if row and row[0] else None
    except sqlite3.Error:
        return None
