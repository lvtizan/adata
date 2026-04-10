"""价格预警数据存储 — SQLite"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


class PriceAlertStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS price_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts_code TEXT NOT NULL,
                    stock_name TEXT NOT NULL DEFAULT '',
                    entry_price REAL NOT NULL,
                    stop_loss REAL,
                    take_profit REAL,
                    status TEXT NOT NULL DEFAULT 'active',
                    triggered_type TEXT,
                    triggered_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

    @staticmethod
    def _now() -> str:
        return datetime.now().isoformat(timespec="seconds")

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "tsCode": row["ts_code"],
            "stockName": row["stock_name"],
            "entryPrice": row["entry_price"],
            "stopLoss": row["stop_loss"],
            "takeProfit": row["take_profit"],
            "status": row["status"],
            "triggeredType": row["triggered_type"],
            "triggeredAt": row["triggered_at"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def create_alert(
        self,
        ts_code: str,
        stock_name: str,
        entry_price: float,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        now = self._now()
        with self._connect() as conn:
            # 同一股票仅保留一条 active 预警，避免拖线时产生大量重复记录
            conn.execute(
                """
                UPDATE price_alerts
                SET status = 'replaced', updated_at = ?
                WHERE ts_code = ? AND status = 'active'
                """,
                (now, ts_code),
            )
            cur = conn.execute(
                """
                INSERT INTO price_alerts (ts_code, stock_name, entry_price, stop_loss, take_profit, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
                """,
                (ts_code, stock_name, entry_price, stop_loss, take_profit, now, now),
            )
            return self._row_to_dict(
                conn.execute("SELECT * FROM price_alerts WHERE id = ?", (cur.lastrowid,)).fetchone()
            )

    def list_alerts(self, status: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM price_alerts WHERE status = ? ORDER BY created_at DESC", (status,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM price_alerts ORDER BY created_at DESC"
                ).fetchall()
            return [self._row_to_dict(r) for r in rows]

    def get_active_alerts(self) -> list[dict[str, Any]]:
        return self.list_alerts(status="active")

    def update_status(self, alert_id: int, status: str, triggered_type: str | None = None) -> bool:
        now = self._now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE price_alerts
                SET status = ?, triggered_type = ?, triggered_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, triggered_type, now if triggered_type else None, now, alert_id),
            )
            return cur.rowcount > 0

    def delete_alert(self, alert_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM price_alerts WHERE id = ?", (alert_id,))
            return cur.rowcount > 0
