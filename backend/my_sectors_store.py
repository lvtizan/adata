"""用户'我的主流板块'池的 SQLite 存储。"""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path


class MySectorsStore:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _init(self) -> None:
        with sqlite3.connect(self.db_path) as con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS my_sectors (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    added_at REAL NOT NULL
                )
            """)

    def list(self) -> list[dict]:
        with sqlite3.connect(self.db_path) as con:
            rows = con.execute(
                "SELECT code, name, added_at FROM my_sectors ORDER BY added_at"
            ).fetchall()
        return [{"code": r[0], "name": r[1], "addedAt": r[2]} for r in rows]

    def add(self, code: str, name: str) -> None:
        code = code.strip()
        name = name.strip()
        if not code or not name:
            return
        with sqlite3.connect(self.db_path) as con:
            con.execute(
                "INSERT OR REPLACE INTO my_sectors (code, name, added_at) VALUES (?, ?, ?)",
                (code, name, time.time()),
            )

    def remove(self, code: str) -> None:
        with sqlite3.connect(self.db_path) as con:
            con.execute("DELETE FROM my_sectors WHERE code = ?", (code,))

    def contains(self, code: str) -> bool:
        with sqlite3.connect(self.db_path) as con:
            row = con.execute(
                "SELECT 1 FROM my_sectors WHERE code = ?", (code,)
            ).fetchone()
        return row is not None
