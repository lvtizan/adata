"""
数据迁移脚本：本地 SQLite → Cloudflare D1
通过 Worker /api/push/:table 端点批量上传

用法:
  python scripts/migrate_to_d1.py

前置条件:
  1. Worker 已部署
  2. 设置环境变量:
     export WORKER_URL=https://a-data-api.xxx.workers.dev
     export ACCESS_TOKEN=your-token
"""

import os
import sys
import json
import sqlite3
import requests
from pathlib import Path

WORKER_URL = os.environ.get("WORKER_URL", "http://127.0.0.1:8787")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "dev-token")
DATA_DIR = Path(__file__).parent.parent / "backend" / "data"

HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}


def push_rows(table: str, rows: list[dict], batch_size: int = 100):
    """批量推送到 D1"""
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        resp = requests.post(
            f"{WORKER_URL}/api/push/{table}",
            headers=HEADERS,
            json={"rows": batch},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  ERROR pushing {table} batch {i}: {resp.text}")
            return False
        result = resp.json()
        print(f"  {table}: pushed {result.get('inserted', 0)} rows (batch {i // batch_size + 1})")
    print(f"  {table}: total {total} rows migrated")
    return True


def migrate_watchlist():
    """迁移自选股"""
    db_path = DATA_DIR / "watchlist.db"
    if not db_path.exists():
        print("watchlist.db not found, skipping")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM watchlist").fetchall()]
    conn.close()

    if rows:
        # 直接用 watchlist CRUD 接口逐条写入
        for row in rows:
            resp = requests.post(
                f"{WORKER_URL}/api/watchlist",
                headers=HEADERS,
                json=row,
                timeout=10,
            )
            if resp.status_code != 200:
                print(f"  ERROR: {row.get('ts_code')}: {resp.text}")
        print(f"  watchlist: {len(rows)} rows migrated")
    else:
        print("  watchlist: empty, skipping")


def migrate_drawings():
    """迁移画线数据"""
    db_path = DATA_DIR / "drawings.db"
    if not db_path.exists():
        print("drawings.db not found, skipping")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM chart_drawings").fetchall()]
    conn.close()

    for row in rows:
        symbol = row.get("symbol")
        timeframe = row.get("timeframe", "D")
        drawings = json.loads(row.get("payload", "[]")) if "payload" in row else json.loads(row.get("drawings", "[]"))
        resp = requests.put(
            f"{WORKER_URL}/api/drawings/{symbol}?timeframe={timeframe}",
            headers=HEADERS,
            json={"drawings": drawings},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"  ERROR: {symbol}: {resp.text}")
    print(f"  drawings: {len(rows)} rows migrated")


def migrate_alerts():
    """迁移价格预警"""
    db_path = DATA_DIR / "price_alerts.db"
    if not db_path.exists():
        print("price_alerts.db not found, skipping")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM price_alerts").fetchall()]
    conn.close()

    for row in rows:
        resp = requests.post(
            f"{WORKER_URL}/api/alerts",
            headers=HEADERS,
            json=row,
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"  ERROR: {row.get('id')}: {resp.text}")
    print(f"  alerts: {len(rows)} rows migrated")


def migrate_trade_plans():
    """迁移交易计划"""
    db_path = DATA_DIR / "trade_plans.db"
    if not db_path.exists():
        print("trade_plans.db not found, skipping")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute("SELECT * FROM trade_plans").fetchall()]
    conn.close()

    for row in rows:
        resp = requests.post(
            f"{WORKER_URL}/api/trade-plans",
            headers=HEADERS,
            json=row,
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"  ERROR: {row.get('id')}: {resp.text}")
    print(f"  trade_plans: {len(rows)} rows migrated")


def main():
    print("=" * 50)
    print("A数据 SQLite → Cloudflare D1 Migration")
    print(f"Worker: {WORKER_URL}")
    print("=" * 50)

    # 测试连接
    try:
        resp = requests.get(f"{WORKER_URL}/api/watchlist", headers=HEADERS, timeout=5)
        if resp.status_code == 401:
            print("ERROR: Authentication failed. Check ACCESS_TOKEN.")
            sys.exit(1)
        print("Connection OK\n")
    except requests.ConnectionError:
        print(f"ERROR: Cannot connect to {WORKER_URL}")
        sys.exit(1)

    print("[1/4] Migrating watchlist...")
    migrate_watchlist()

    print("\n[2/4] Migrating drawings...")
    migrate_drawings()

    print("\n[3/4] Migrating price alerts...")
    migrate_alerts()

    print("\n[4/4] Migrating trade plans...")
    migrate_trade_plans()

    print("\n" + "=" * 50)
    print("Migration complete!")
    print("=" * 50)


if __name__ == "__main__":
    main()
