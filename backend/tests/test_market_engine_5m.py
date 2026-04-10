#!/usr/bin/env python3
"""market_engine.py 5分钟K线回归测试（unittest，无需额外依赖）"""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from market_engine import MarketEngine


def _make_engine_stub() -> MarketEngine:
    """构造一个不执行 __init__ 的 MarketEngine 测试桩。"""
    engine = MarketEngine.__new__(MarketEngine)
    engine._cache = {}
    engine._cached = lambda _key, _ttl, fn: fn()
    engine._detect_5m_patterns = Mock(return_value=[])
    return engine


class TestStockKline5mSynthetic(unittest.TestCase):
    def test_prefers_real_5m_when_intraday_points_present(self):
        engine = _make_engine_stub()
        real_5m_points = [
            {"time": "202604081000", "open": 3960, "high": 3966, "low": 3958, "close": 3962, "volume": 1000, "amount": 3962000},
            {"time": "202604081005", "open": 3962, "high": 3968, "low": 3961, "close": 3967, "volume": 1200, "amount": 4760400},
        ]

        def fake_stock_kline_ashare(ts_code: str, frequency: str, bars: int):
            if frequency == "5m":
                return {"code": ts_code, "name": "上证指数", "points": real_5m_points, "frequency": "5m"}
            return {"code": ts_code, "name": "上证指数", "points": [], "frequency": frequency}

        engine.stock_kline_ashare = fake_stock_kline_ashare
        engine.stock_kline = Mock(return_value={"code": "000001.SH", "name": "上证指数", "points": []})

        result = engine.stock_kline_5m_synthetic("000001.SH", "20260408", bars=240)

        self.assertEqual("5m", result["frequency"])
        self.assertFalse(result["synthetic"])
        self.assertEqual("5m", result["sourceFrequency"])
        self.assertEqual(real_5m_points, result["points"])
        self.assertTrue(all(len(str(p["time"])) >= 12 for p in result["points"]))
        engine.stock_kline.assert_not_called()

    def test_fallback_from_daily_still_outputs_5m_timestamps(self):
        engine = _make_engine_stub()
        # 模拟分钟线不可用（只有日级时间，需判脏并回退）
        daily_like_points = [
            {"time": "20260407", "open": 3980, "high": 4000, "low": 3940, "close": 3960, "volume": 1, "amount": 1},
        ]
        daily_points = [
            {"time": "20260407", "open": 3980, "high": 4000, "low": 3940, "close": 3960, "volume": 100000, "amount": 0},
            {"time": "20260408", "open": 3960, "high": 3990, "low": 3950, "close": 3970, "volume": 110000, "amount": 0},
        ]

        def fake_stock_kline_ashare(ts_code: str, frequency: str, bars: int):
            if frequency == "5m":
                return {"code": ts_code, "name": "上证指数", "points": daily_like_points, "frequency": "5m"}
            if frequency == "1d":
                return {"code": ts_code, "name": "上证指数", "points": daily_points, "frequency": "1d"}
            return {"code": ts_code, "name": "上证指数", "points": [], "frequency": frequency}

        engine.stock_kline_ashare = fake_stock_kline_ashare
        engine.stock_kline = Mock(return_value={"code": "000001.SH", "name": "上证指数", "points": []})

        result = engine.stock_kline_5m_synthetic("000001.SH", "20260408", bars=96)

        self.assertEqual("5m", result["frequency"])
        self.assertTrue(result["synthetic"])
        self.assertEqual("1d", result["sourceFrequency"])
        self.assertEqual(96, len(result["points"]))
        self.assertTrue(all(len(str(p["time"])) == 12 for p in result["points"]))
        self.assertTrue(all(str(p["time"]).startswith(("20260407", "20260408")) for p in result["points"]))
        self.assertTrue(all(str(p["time"])[8:] in {
            "0935", "0940", "0945", "0950", "0955",
            "1000", "1005", "1010", "1015", "1020", "1025", "1030",
            "1035", "1040", "1045", "1050", "1055",
            "1100", "1105", "1110", "1115", "1120", "1125", "1130",
            "1305", "1310", "1315", "1320", "1325", "1330", "1335", "1340",
            "1345", "1350", "1355", "1400", "1405", "1410", "1415", "1420",
            "1425", "1430", "1435", "1440", "1445", "1450", "1455", "1500",
        } for p in result["points"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
