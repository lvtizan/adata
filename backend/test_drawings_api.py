#!/usr/bin/env python3
import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api_app
from drawings_store import DrawingsStore


class DrawingsApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = DrawingsStore(Path(self.tmpdir.name) / "drawings.db")
        self.original_drawings = api_app.drawings
        api_app.drawings = self.store

    def tearDown(self):
        api_app.drawings = self.original_drawings
        self.tmpdir.cleanup()

    def test_drawings_routes_use_current_store(self):
        payload = {
            "overlays": [
                {
                    "id": "line-1",
                    "name": "horizontalStraightLine",
                    "points": [{"timestamp": 1710000000000, "value": 12.34}],
                    "lock": False,
                    "extendData": "支撑 12.34",
                }
            ]
        }

        saved = asyncio.run(api_app.put_drawings("000001.SZ", payload, scope="stock", timeframe="1d"))
        self.assertEqual("000001.SZ", saved["symbol"])
        self.assertEqual(1, len(saved["overlays"]))

        loaded = asyncio.run(api_app.get_drawings("000001.SZ", scope="stock", timeframe="1d"))
        self.assertEqual("line-1", loaded["overlays"][0]["id"])

        deleted = asyncio.run(api_app.delete_drawings("000001.SZ", scope="stock", timeframe="1d"))
        self.assertTrue(deleted["deleted"])

        empty = asyncio.run(api_app.get_drawings("000001.SZ", scope="stock", timeframe="1d"))
        self.assertEqual([], empty["overlays"])


if __name__ == "__main__":
    unittest.main()
