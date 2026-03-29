#!/usr/bin/env python3
"""pattern_detector.py 单元测试（使用 unittest，无需额外安装）"""
import math
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pattern_detector import (
    _ensure_sorted,
    _find_rally_start,
    detect_hh_signals,
    _find_swing_highs,
    _find_swing_lows,
    _ma,
    detect_all_patterns,
    detect_all_patterns_detail,
    detect_all_patterns_with_signals,
    detect_cup_handle,
    detect_pocket_pivot,
    detect_three_line_bloom,
    detect_tight_consolidation,
    detect_vcp,
)


def _make_df(closes, vol=1e6):
    """构造最小 DataFrame"""
    n = len(closes)
    dates = pd.date_range("20240101", periods=n, freq="B").strftime("%Y%m%d").tolist()
    return pd.DataFrame({
        "trade_date": dates,
        "open": [c * 0.99 for c in closes],
        "high": [c * 1.01 for c in closes],
        "low": [c * 0.98 for c in closes],
        "close": closes,
        "vol": [vol] * n,
    })


class TestHelpers(unittest.TestCase):
    def test_ensure_sorted_asc(self):
        df = pd.DataFrame({"trade_date": ["20240103", "20240101", "20240102"], "close": [3, 1, 2]})
        result = _ensure_sorted(df)
        self.assertEqual(list(result["trade_date"]), ["20240101", "20240102", "20240103"])

    def test_ma(self):
        s = pd.Series([1.0, 2, 3, 4, 5])
        result = _ma(s, 3)
        self.assertAlmostEqual(result.iloc[2], 2.0)
        self.assertAlmostEqual(result.iloc[4], 4.0)
        self.assertTrue(pd.isna(result.iloc[0]))

    def test_find_swing_highs(self):
        closes = pd.Series([1, 3, 2, 4, 1, 5, 2])
        highs = _find_swing_highs(closes, window=1)
        # 返回 [(idx, value), ...] 元组列表
        high_indices = [h[0] for h in highs]
        self.assertIn(1, high_indices)
        self.assertIn(3, high_indices)
        self.assertIn(5, high_indices)

    def test_find_swing_lows(self):
        closes = pd.Series([3, 1, 4, 2, 5, 0, 6])
        lows = _find_swing_lows(closes, window=1)
        low_indices = [l[0] for l in lows]
        self.assertIn(1, low_indices)
        self.assertIn(3, low_indices)
        self.assertIn(5, low_indices)


class TestEdgeCases(unittest.TestCase):
    def test_empty_df(self):
        df = pd.DataFrame()
        result = detect_cup_handle(df)
        self.assertFalse(result["detected"])

    def test_short_df(self):
        df = _make_df([10.0] * 10)
        result = detect_cup_handle(df)
        self.assertFalse(result["detected"])

    def test_flat_data(self):
        df = _make_df([50.0] * 120)
        for fn in [detect_cup_handle, detect_vcp, detect_tight_consolidation, detect_three_line_bloom, detect_pocket_pivot]:
            result = fn(df)
            self.assertFalse(result["detected"], f"{fn.__name__} should not trigger on flat data")

    def test_all_patterns_returns_list(self):
        df = _make_df([50.0] * 60)
        tags = detect_all_patterns(df)
        self.assertIsInstance(tags, list)

    def test_all_patterns_detail_structure(self):
        df = _make_df([50.0] * 60)
        details = detect_all_patterns_detail(df)
        self.assertIsInstance(details, list)
        self.assertEqual(len(details), 5)
        for d in details:
            self.assertIn("tag", d)
            self.assertIn("label", d)
            self.assertIn("detected", d)

    def test_all_patterns_with_signals_structure(self):
        df = _make_df([50.0] * 60)
        result = detect_all_patterns_with_signals(df)
        self.assertIn("tags", result)
        self.assertIn("signals", result)
        self.assertIn("maAlignment", result)


class TestCupHandle(unittest.TestCase):
    def test_ideal_cup_handle_structure(self):
        """理想杯柄形态返回结构正确"""
        n = 180
        closes = []
        for i in range(60):
            closes.append(30 + 20 * (i / 59))
        for i in range(30):
            closes.append(50 - 12 * (i / 29))
        for i in range(40):
            closes.append(38 + 2 * np.sin(i * np.pi / 20))
        for i in range(30):
            closes.append(38 + 10 * (i / 29))
        for i in range(10):
            closes.append(48 - 3 * (i / 9))
        for i in range(10):
            closes.append(45 + 7 * (i / 9))

        df = _make_df(closes)
        result = detect_cup_handle(df)
        self.assertIn("detected", result)
        self.assertIn("confidence", result)
        self.assertIn("detail", result)

    def test_cup_handle_needs_rally(self):
        """没有 30%+ 拉升不应检测到杯柄"""
        closes = []
        for i in range(60):
            closes.append(40 + 6 * (i / 59))  # +15%
        for i in range(60):
            closes.append(46 - 3 * np.sin(i * np.pi / 60))
        df = _make_df(closes)
        result = detect_cup_handle(df)
        self.assertFalse(result["detected"])


class TestVCP(unittest.TestCase):
    def test_vcp_structure(self):
        df = _make_df([50.0 + np.sin(i * 0.1) * (10 - i * 0.05) for i in range(120)])
        result = detect_vcp(df)
        self.assertIn("detected", result)
        self.assertIn("confidence", result)


class TestTightConsolidation(unittest.TestCase):
    def test_tight_at_highs(self):
        closes = []
        for i in range(80):
            closes.append(30 + 20 * (i / 79))
        for i in range(40):
            closes.append(50 + 0.3 * np.sin(i * 0.5))
        df = _make_df(closes)
        result = detect_tight_consolidation(df)
        self.assertIn("detected", result)


class TestThreeLineBloom(unittest.TestCase):
    def test_flat_not_detected(self):
        df = _make_df([50.0] * 260)
        result = detect_three_line_bloom(df)
        self.assertFalse(result["detected"])


class TestPocketPivot(unittest.TestCase):
    def test_volume_spike(self):
        closes = []
        vols = []
        for i in range(50):
            closes.append(40 + 0.5 * np.sin(i * 0.3))
            vols.append(1e6)
        closes.append(42.0)
        vols.append(3e6)

        df = pd.DataFrame({
            "trade_date": pd.date_range("20240101", periods=51, freq="B").strftime("%Y%m%d").tolist(),
            "open": [c * 0.99 for c in closes],
            "high": [c * 1.01 for c in closes],
            "low": [c * 0.98 for c in closes],
            "close": closes,
            "vol": vols,
        })
        result = detect_pocket_pivot(df)
        self.assertIn("detected", result)


class TestFindRallyStart(unittest.TestCase):
    def test_find_30pct_rally(self):
        # _find_rally_start(close: np.ndarray, peak_idx: int, min_gain: float)
        closes = np.array([30, 32, 35, 38, 40, 42, 45, 48, 50], dtype=float)
        result = _find_rally_start(closes, 8, min_gain=0.30)
        self.assertIsNotNone(result)
        self.assertGreaterEqual(result, 0)
        self.assertLess(result, 8)

    def test_no_rally(self):
        closes = np.array([40, 41, 42, 43, 44, 45, 46], dtype=float)
        result = _find_rally_start(closes, 6, min_gain=0.30)
        # 涨幅只有 15%，不应找到起点
        # _find_rally_start 返回 int（找到）或某个哨兵值
        # 如果涨幅不够，回溯到头也找不到合适起点
        # 检查实际行为
        if result is not None:
            gain = (closes[6] - closes[result]) / closes[result]
            # 如果找到了，涨幅应该 < 30%（实际不可能满足）
            self.assertLess(gain, 0.30)


class TestHHSignals(unittest.TestCase):
    def test_h1_h2_detection(self):
        """检测 H1 和 H2"""
        closes = (
            [50,49,48,47,46,45,44,43,42,41,40]
          + [41,42,43,44,45,46,45,44,43,42]
          + [43,44,45,46,47,48,47,46,45,44]
          + [45,46,47,48,49,50,49,48,47,46]
          + [47,48,49,50,51,52]
        )
        df = _make_df(closes)
        result = detect_hh_signals(df)
        self.assertEqual(len(result["signals"]), 2)
        self.assertEqual(result["signals"][0]["type"], "H1")
        self.assertEqual(result["signals"][1]["type"], "H2")
        self.assertEqual(result["latestHH"], "H2")

    def test_h2_buy_signal_with_volume(self):
        """H2 + 温和放量 = 买入信号"""
        closes = (
            [50,49,48,47,46,45,44,43,42,41,40]
          + [41,42,43,44,45,46,45,44,43,42]
          + [43,44,45,46,47,48,47,46,45,44]
          + [45,46,47,48,49,50,49,48,47,46]
          + [47,48,49,50,51,52]
        )
        n = len(closes)
        vols = [1e6] * n
        vols[36] = 1.8e6  # H2 当天温和放量
        df = pd.DataFrame({
            "trade_date": pd.date_range("20240101", periods=n, freq="B").strftime("%Y%m%d").tolist(),
            "open": [c*0.99 for c in closes],
            "high": [c*1.02 for c in closes],
            "low": [c*0.98 for c in closes],
            "close": closes,
            "vol": vols,
        })
        result = detect_hh_signals(df)
        self.assertTrue(result["hasBuySignal"])
        buy_signals = [s for s in result["signals"] if s.get("buySignal")]
        self.assertGreater(len(buy_signals), 0)

    def test_drawdowns_detected(self):
        """回撤幅度应被检测"""
        closes = (
            [50,49,48,47,46,45,44,43,42,41,40]
          + [41,42,43,44,45,46,45,44,43,42]
          + [43,44,45,46,47,48,47,46,45,44]
          + [45,46,47,48,49,50,49,48,47,46]
          + [47,48,49,50,51,52]
        )
        df = _make_df(closes)
        result = detect_hh_signals(df)
        self.assertGreater(len(result["drawdowns"]), 0)
        for dd in result["drawdowns"]:
            self.assertEqual(dd["type"], "drawdown")
            self.assertLess(dd["pct"], 0)
            self.assertIn("date", dd)

    def test_no_hh_on_monotonic_decline(self):
        """持续下跌不应有 HH"""
        closes = list(range(60, 20, -1))
        df = _make_df(closes)
        result = detect_hh_signals(df)
        self.assertIsNone(result["latestHH"])
        self.assertEqual(len(result["signals"]), 0)

    def test_short_data(self):
        """数据太短不应报错"""
        df = _make_df([50.0] * 10)
        result = detect_hh_signals(df)
        self.assertIsNone(result["latestHH"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
