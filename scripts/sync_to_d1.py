"""
本地行情数据 → Cloudflare D1 同步脚本

从本地 market_cache.db 读取 K 线数据，push 到 D1 stock_daily 表。
支持增量同步（只推最近 N 天的数据）。

用法:
  # 同步自选股最近 60 天
  python scripts/sync_to_d1.py --watchlist --days 60

  # 同步指定股票
  python scripts/sync_to_d1.py --codes 300476.SZ,002463.SZ --days 250

  # 同步所有缓存的股票（慎用，数据量大）
  python scripts/sync_to_d1.py --all --days 30
"""

import os
import sys
import json
import gzip
import sqlite3
import requests
from pathlib import Path

WORKER_URL = os.environ.get("WORKER_URL", "https://a-data-api.bbtizan.workers.dev")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
DATA_DIR = Path(__file__).parent.parent / "backend" / "data"
HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "A-Data-Sync/1.0",
}


def push_rows(table: str, rows: list[dict], batch_size: int = 100):
    """批量推送到 D1"""
    total = len(rows)
    pushed = 0
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        resp = requests.post(
            f"{WORKER_URL}/api/push/{table}",
            headers=HEADERS,
            json={"rows": batch},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  ERROR: {resp.text[:200]}")
            return pushed
        pushed += batch_size
    return min(pushed, total)


def get_watchlist_codes() -> list[str]:
    """从 D1 获取自选股代码"""
    resp = requests.get(f"{WORKER_URL}/api/watchlist", headers=HEADERS, timeout=10)
    if resp.status_code != 200:
        print(f"ERROR fetching watchlist: {resp.text}")
        return []
    data = resp.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    return [item.get("tsCode") or item.get("ts_code") for item in items]


def read_kline_cache(ts_code: str) -> list[dict]:
    """从本地 frame_cache 读取 K 线数据"""
    db_path = DATA_DIR / "market_cache.db"
    if not db_path.exists():
        return []

    conn = sqlite3.connect(db_path)
    # 取最新的缓存条目
    row = conn.execute(
        "SELECT payload FROM frame_cache WHERE cache_key LIKE ? AND kind='stock_kline_qfq' ORDER BY cache_key DESC LIMIT 1",
        (f"{ts_code}%",),
    ).fetchone()
    conn.close()

    if not row:
        return []

    raw = row[0]
    try:
        if raw[0:2] == b'\x1f\x8b':
            data = json.loads(gzip.decompress(raw))
        elif raw[0:1] == b'[':
            data = json.loads(raw)
        else:
            return []
        return data
    except Exception as e:
        print(f"  ERROR parsing {ts_code}: {e}")
        return []


def sync_stock(ts_code: str, days: int) -> int:
    """同步单只股票的日线数据"""
    klines = read_kline_cache(ts_code)
    if not klines:
        return 0

    # 只取最近 N 天
    klines = klines[-days:]

    rows = []
    for k in klines:
        rows.append({
            "ts_code": k.get("ts_code", ts_code),
            "trade_date": k["trade_date"],
            "open": k["open"],
            "high": k["high"],
            "low": k["low"],
            "close": k["close"],
            "vol": k.get("vol", 0),
            "amount": k.get("amount", 0),
            "pct_chg": k.get("pct_chg", 0),
        })

    pushed = push_rows("stock_daily", rows)
    return pushed


def get_all_cached_codes() -> list[str]:
    """获取所有有缓存的股票代码"""
    db_path = DATA_DIR / "market_cache.db"
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT DISTINCT SUBSTR(cache_key, 1, INSTR(cache_key, ':') - 1) FROM frame_cache WHERE kind='stock_kline_qfq'"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows if r[0]]


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Sync local kline data to D1")
    parser.add_argument("--watchlist", action="store_true", help="同步自选股")
    parser.add_argument("--codes", type=str, help="指定股票代码，逗号分隔")
    parser.add_argument("--all", action="store_true", help="同步所有缓存股票")
    parser.add_argument("--days", type=int, default=60, help="同步最近 N 天（默认60）")
    args = parser.parse_args()

    if args.watchlist:
        codes = get_watchlist_codes()
        print(f"自选股: {len(codes)} 只")
    elif args.codes:
        codes = [c.strip() for c in args.codes.split(",")]
    elif args.all:
        codes = get_all_cached_codes()
        print(f"全部缓存: {len(codes)} 只")
    else:
        parser.print_help()
        sys.exit(1)

    print(f"同步最近 {args.days} 天数据...\n")

    total_rows = 0
    for i, code in enumerate(codes):
        pushed = sync_stock(code, args.days)
        total_rows += pushed
        if pushed > 0:
            print(f"  [{i+1}/{len(codes)}] {code}: {pushed} rows")
        else:
            print(f"  [{i+1}/{len(codes)}] {code}: no cache data")

    print(f"\nDone! Total: {total_rows} rows pushed to D1")


if __name__ == "__main__":
    main()
