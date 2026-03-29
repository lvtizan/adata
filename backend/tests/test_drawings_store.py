#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drawings_store import DrawingsStore


class DrawingsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = DrawingsStore(Path(self.tmpdir.name) / "drawings.db")

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_save_get_delete_cycle(self) -> None:
        overlays = [
            {
                "id": "line-1",
                "name": "horizontalStraightLine",
                "points": [{"timestamp": 1710000000000, "value": 12.34}],
                "lock": False,
            }
        ]

        saved = self.store.save_drawings("000001.SZ", overlays, scope="stock", timeframe="1d")
        self.assertEqual("000001.SZ", saved["symbol"])
        self.assertEqual(1, len(saved["overlays"]))

        loaded = self.store.get_drawings("000001.SZ", scope="stock", timeframe="1d")
        self.assertEqual("line-1", loaded["overlays"][0]["id"])

        deleted = self.store.delete_drawings("000001.SZ", scope="stock", timeframe="1d")
        self.assertTrue(deleted)

        empty = self.store.get_drawings("000001.SZ", scope="stock", timeframe="1d")
        self.assertEqual([], empty["overlays"])


if __name__ == "__main__":
    unittest.main()
