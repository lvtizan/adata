#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日简报数据存储 — 读取 daily_scheduler.py 生成的简报
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "data" / "daily_briefs.db"


class DailyBriefsStore:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DB_PATH
        self._ensure_db()

    def _ensure_db(self):
        if not self.db_path.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.db_path)
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS daily_briefs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    trade_date  TEXT NOT NULL,
                    brief_type  TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    content     TEXT NOT NULL,
                    metadata    TEXT,
                    created_at  TEXT NOT NULL,
                    UNIQUE(trade_date, brief_type)
                );
                CREATE INDEX IF NOT EXISTS idx_briefs_date ON daily_briefs(trade_date);
            """)
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def list_briefs(
        self,
        date: str | None = None,
        brief_type: str | None = None,
        limit: int = 10,
    ) -> list[dict]:
        """查询简报列表"""
        sql = "SELECT * FROM daily_briefs WHERE 1=1"
        params: list = []
        if date:
            sql += " AND trade_date = ?"
            params.append(date)
        if brief_type:
            sql += " AND brief_type = ?"
            params.append(brief_type)
        sql += " ORDER BY trade_date DESC, created_at DESC LIMIT ?"
        params.append(limit)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_latest(self, brief_type: str | None = None) -> dict | None:
        """获取最新的一条简报"""
        sql = "SELECT * FROM daily_briefs"
        params: list = []
        if brief_type:
            sql += " WHERE brief_type = ?"
            params.append(brief_type)
        sql += " ORDER BY trade_date DESC, created_at DESC LIMIT 1"

        with self._connect() as conn:
            row = conn.execute(sql, params).fetchone()
        return self._row_to_dict(row) if row else None

    def count(self) -> int:
        """简报总数"""
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM daily_briefs").fetchone()
        return row["cnt"] if row else 0

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        d = dict(row)
        if d.get("metadata"):
            try:
                d["metadata"] = json.loads(d["metadata"])
            except (json.JSONDecodeError, TypeError):
                d["metadata"] = {}
        return d
