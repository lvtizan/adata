#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


class DrawingsStore:
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
                CREATE TABLE IF NOT EXISTS chart_drawings (
                    symbol TEXT NOT NULL,
                    scope TEXT NOT NULL DEFAULT 'stock',
                    timeframe TEXT NOT NULL DEFAULT '1d',
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (symbol, scope, timeframe)
                )
                """
            )

    @staticmethod
    def _now() -> str:
        return datetime.now().isoformat(timespec="seconds")

    def get_drawings(self, symbol: str, scope: str = "stock", timeframe: str = "1d") -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT symbol, scope, timeframe, payload, created_at, updated_at
                FROM chart_drawings
                WHERE symbol = ? AND scope = ? AND timeframe = ?
                """,
                (symbol, scope, timeframe),
            ).fetchone()

        if row is None:
            return {
                "symbol": symbol,
                "scope": scope,
                "timeframe": timeframe,
                "overlays": [],
                "createdAt": None,
                "updatedAt": None,
            }

        payload = json.loads(row["payload"]) if row["payload"] else []
        return {
            "symbol": row["symbol"],
            "scope": row["scope"],
            "timeframe": row["timeframe"],
            "overlays": payload if isinstance(payload, list) else [],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def save_drawings(
        self,
        symbol: str,
        overlays: list[dict[str, Any]],
        scope: str = "stock",
        timeframe: str = "1d",
    ) -> dict[str, Any]:
        now = self._now()
        payload = json.dumps(overlays, ensure_ascii=False)
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT created_at
                FROM chart_drawings
                WHERE symbol = ? AND scope = ? AND timeframe = ?
                """,
                (symbol, scope, timeframe),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            conn.execute(
                """
                INSERT INTO chart_drawings (symbol, scope, timeframe, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, scope, timeframe) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (symbol, scope, timeframe, payload, created_at, now),
            )
        return self.get_drawings(symbol, scope=scope, timeframe=timeframe)

    def delete_drawings(self, symbol: str, scope: str = "stock", timeframe: str = "1d") -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                """
                DELETE FROM chart_drawings
                WHERE symbol = ? AND scope = ? AND timeframe = ?
                """,
                (symbol, scope, timeframe),
            )
        return cur.rowcount > 0
