#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import gzip
import json
import sqlite3
from datetime import datetime
from io import StringIO
from pathlib import Path

import pandas as pd


class MarketDataStore:
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
                CREATE TABLE IF NOT EXISTS frame_cache (
                    kind TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload BLOB NOT NULL,
                    row_count INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (kind, cache_key)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS json_cache (
                    kind TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (kind, cache_key)
                )
                """
            )

    @staticmethod
    def _now() -> str:
        return datetime.now().isoformat(timespec="seconds")

    def get_frame(self, kind: str, cache_key: str) -> pd.DataFrame | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM frame_cache WHERE kind = ? AND cache_key = ?",
                (kind, cache_key),
            ).fetchone()
        if row is None:
            return None
        raw = gzip.decompress(row["payload"]).decode("utf-8")
        if not raw:
            return pd.DataFrame()
        return pd.read_json(StringIO(raw), orient="records")

    def set_frame(self, kind: str, cache_key: str, df: pd.DataFrame) -> None:
        payload = gzip.compress(df.to_json(orient="records", force_ascii=False).encode("utf-8"))
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO frame_cache (kind, cache_key, payload, row_count, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(kind, cache_key) DO UPDATE SET
                    payload = excluded.payload,
                    row_count = excluded.row_count,
                    updated_at = excluded.updated_at
                """,
                (kind, cache_key, payload, len(df), self._now()),
            )

    def list_keys(self, kind: str) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT cache_key FROM frame_cache WHERE kind = ? ORDER BY cache_key",
                (kind,),
            ).fetchall()
        return [str(row["cache_key"]) for row in rows]

    # ── JSON 缓存（财务数据等）──

    def get_json(self, kind: str, cache_key: str, max_age_hours: float = 24) -> dict | list | None:
        """读取 JSON 缓存，超过 max_age_hours 则返回 None"""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload, updated_at FROM json_cache WHERE kind = ? AND cache_key = ?",
                (kind, cache_key),
            ).fetchone()
        if row is None:
            return None
        age = (datetime.now() - datetime.fromisoformat(row["updated_at"])).total_seconds() / 3600
        if age > max_age_hours:
            return None
        return json.loads(row["payload"])

    def set_json(self, kind: str, cache_key: str, data: dict | list) -> None:
        payload = json.dumps(data, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO json_cache (kind, cache_key, payload, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(kind, cache_key) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (kind, cache_key, payload, self._now()),
            )
