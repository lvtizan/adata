#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


class WatchlistStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                    ts_code TEXT PRIMARY KEY,
                    stock_name TEXT NOT NULL,
                    sector_code TEXT,
                    sector_name TEXT,
                    subgroup TEXT DEFAULT '',
                    close REAL,
                    pct_change_1d REAL,
                    pct_change_5d REAL,
                    pct_change_10d REAL,
                    rps20 REAL,
                    amount REAL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _now(self) -> str:
        return datetime.now().isoformat(timespec="seconds")

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "tsCode": row["ts_code"],
            "stockName": row["stock_name"],
            "sectorCode": row["sector_code"] or "",
            "sectorName": row["sector_name"] or "",
            "subgroup": row["subgroup"] or "",
            "close": row["close"],
            "pctChange1d": row["pct_change_1d"],
            "pctChange5d": row["pct_change_5d"],
            "pctChange10d": row["pct_change_10d"],
            "rps20": row["rps20"],
            "amount": row["amount"],
            "sortOrder": row["sort_order"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list_items(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM watchlist
                ORDER BY sort_order ASC, updated_at DESC, ts_code ASC
                """
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def upsert_item(self, item: dict[str, Any]) -> dict[str, Any]:
        ts_code = str(item.get("tsCode", "")).strip()
        stock_name = str(item.get("stockName", "")).strip()
        if not ts_code or not stock_name:
            raise ValueError("missing tsCode or stockName")

        now = self._now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT sort_order, subgroup, created_at FROM watchlist WHERE ts_code = ?",
                (ts_code,),
            ).fetchone()
            sort_order = existing["sort_order"] if existing else self._next_sort_order(conn)
            subgroup = item.get("subgroup")
            if subgroup is None and existing:
                subgroup = existing["subgroup"]
            subgroup = str(subgroup or "").strip()
            created_at = existing["created_at"] if existing else now

            conn.execute(
                """
                INSERT INTO watchlist (
                    ts_code, stock_name, sector_code, sector_name, subgroup,
                    close, pct_change_1d, pct_change_5d, pct_change_10d, rps20, amount,
                    sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ts_code) DO UPDATE SET
                    stock_name = excluded.stock_name,
                    sector_code = excluded.sector_code,
                    sector_name = excluded.sector_name,
                    subgroup = excluded.subgroup,
                    close = excluded.close,
                    pct_change_1d = excluded.pct_change_1d,
                    pct_change_5d = excluded.pct_change_5d,
                    pct_change_10d = excluded.pct_change_10d,
                    rps20 = excluded.rps20,
                    amount = excluded.amount,
                    updated_at = excluded.updated_at
                """,
                (
                    ts_code,
                    stock_name,
                    str(item.get("sectorCode", "") or "").strip(),
                    str(item.get("sectorName", "") or "").strip(),
                    subgroup,
                    self._to_float(item.get("close")),
                    self._to_float(item.get("pctChange1d")),
                    self._to_float(item.get("pctChange5d")),
                    self._to_float(item.get("pctChange10d")),
                    self._to_float(item.get("rps20")),
                    self._to_float(item.get("amount")),
                    sort_order,
                    created_at,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM watchlist WHERE ts_code = ?", (ts_code,)).fetchone()
        if row is None:
            raise ValueError("watchlist item not found after upsert")
        return self._row_to_dict(row)

    def update_item(self, ts_code: str, fields: dict[str, Any]) -> dict[str, Any]:
        ts_code = str(ts_code).strip()
        if not ts_code:
            raise ValueError("missing tsCode")

        allowed = {
            "stockName": "stock_name",
            "sectorCode": "sector_code",
            "sectorName": "sector_name",
            "subgroup": "subgroup",
            "close": "close",
            "pctChange1d": "pct_change_1d",
            "pctChange5d": "pct_change_5d",
            "pctChange10d": "pct_change_10d",
            "rps20": "rps20",
            "amount": "amount",
        }

        updates: list[str] = []
        values: list[Any] = []
        for key, column in allowed.items():
            if key not in fields:
                continue
            value = fields[key]
            if key in {"close", "pctChange1d", "pctChange5d", "pctChange10d", "rps20", "amount"}:
                value = self._to_float(value)
            else:
                value = str(value or "").strip()
            updates.append(f"{column} = ?")
            values.append(value)

        if not updates:
            raise ValueError("no updatable fields")

        values.append(self._now())
        values.append(ts_code)
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE watchlist SET {', '.join(updates)}, updated_at = ? WHERE ts_code = ?",
                values,
            )
            if cur.rowcount == 0:
                raise ValueError("watchlist item not found")
            row = conn.execute("SELECT * FROM watchlist WHERE ts_code = ?", (ts_code,)).fetchone()
        if row is None:
            raise ValueError("watchlist item not found after update")
        return self._row_to_dict(row)

    def delete_item(self, ts_code: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM watchlist WHERE ts_code = ?", (ts_code,))
        return cur.rowcount > 0

    def _next_sort_order(self, conn: sqlite3.Connection) -> int:
        row = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM watchlist").fetchone()
        return int(row["next_order"]) if row else 0

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value is None or value == "":
            return None
        return float(value)
