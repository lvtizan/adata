#!/usr/bin/env python3
import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api_app
from watchlist_store import WatchlistStore


class WatchlistApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = WatchlistStore(Path(self.tmpdir.name) / "watchlist.db")
        self.original_watchlist = api_app.watchlist
        api_app.watchlist = self.store

    def tearDown(self):
        api_app.watchlist = self.original_watchlist
        self.tmpdir.cleanup()

    def test_watchlist_crud_routes_use_current_store_api(self):
        item = {
            "tsCode": "000001.SZ",
            "stockName": "平安银行",
            "sectorCode": "BK001",
            "sectorName": "银行",
            "pctChange5d": 1.23,
        }

        created = asyncio.run(api_app.add_watchlist(item))
        self.assertTrue(created["success"])

        listed = asyncio.run(api_app.get_watchlist())
        self.assertEqual(1, len(listed["items"]))
        self.assertEqual("000001.SZ", listed["items"][0]["tsCode"])

        updated = asyncio.run(api_app.update_watchlist("000001.SZ", {"subgroup": "国有大行"}))
        self.assertTrue(updated["success"])
        listed_after_update = asyncio.run(api_app.get_watchlist())
        self.assertEqual("国有大行", listed_after_update["items"][0]["subgroup"])

        removed = asyncio.run(api_app.remove_watchlist("000001.SZ"))
        self.assertTrue(removed["success"])
        listed_after_delete = asyncio.run(api_app.get_watchlist())
        self.assertEqual([], listed_after_delete["items"])


if __name__ == "__main__":
    unittest.main()
