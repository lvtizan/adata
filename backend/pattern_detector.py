"""
K 线形态识别模块 — 检测杯柄、VCP、紧凑盘整、三线开花等经典突破形态。

每个检测函数接收 OHLCV DataFrame (columns: trade_date, open, high, low, close, vol, amount)
返回 dict: {"detected": bool, "confidence": float 0-1, "detail": str}

调用方式:
    tags = detect_all_patterns(df)
    # => ["cupHandle", "vcp", "tightConsolidation", "threeLineBloom"]
"""

import numpy as np
import pandas as pd
from typing import Any

import logging
logger = logging.getLogger(__name__)


def _ma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).mean()


def _ensure_sorted(df: pd.DataFrame) -> pd.DataFrame:
    """确保按日期升序排列"""
    if df.empty:
        return df
    date_col = "trade_date"
    if date_col not in df.columns:
        return df
    return df.sort_values(date_col, ascending=True).reset_index(drop=True)


# ────────────────────────────────────────────────
# 1. 杯柄形态 (Cup and Handle)
# ────────────────────────────────────────────────
def _find_rally_start(close: np.ndarray, peak_idx: int, min_gain: float = 0.30) -> int:
    """
    从 peak_idx 向左回溯，找到连续拉升的起点。
    拉升起点定义：从某个低点到 peak_idx 的涨幅 >= min_gain，且中间无超过 15% 的深度回调。
    返回起点索引，找不到返回 -1。
    """
    if peak_idx < 5:
        return -1
    peak_val = float(close[peak_idx])
    # 从 peak 向左扫描，找到累计涨幅 >= min_gain 的低点
    best_start = -1
    for i in range(peak_idx - 1, -1, -1):
        gain = (peak_val - float(close[i])) / float(close[i])
        if gain >= min_gain:
            # 检查 i → peak_idx 之间是否有超过 15% 的中途回调
            sub = close[i:peak_idx + 1]
            running_max = np.maximum.accumulate(sub)
            drawdowns = (running_max - sub) / running_max
            max_dd = float(np.max(drawdowns))
            if max_dd <= 0.18:  # 拉升途中最大回撤不超过 18%
                best_start = i
            break  # 找到第一个满足涨幅的即可
    return best_start


def _find_swing_highs(high: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    """找局部波峰 (swing high)，返回 [(idx, value), ...]"""
    peaks = []
    for i in range(window, len(high) - window):
        if high[i] == np.max(high[i - window:i + window + 1]):
            peaks.append((i, float(high[i])))
    return peaks


def _find_swing_lows(low: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    """找局部波谷 (swing low)，返回 [(idx, value), ...]"""
    troughs = []
    for i in range(window, len(low) - window):
        if low[i] == np.min(low[i - window:i + window + 1]):
            troughs.append((i, float(low[i])))
    return troughs


def _find_support_levels(low: np.ndarray, close: np.ndarray, swing_lows: list[tuple[int, float]],
                          tolerance: float = 0.05) -> list[dict]:
    """
    找强支撑位 — 被多次测试的价格区域。

    判定方法:
      1. 找所有 swing lows
      2. 对 swing lows 做聚类：价差 < tolerance(5%) 的归为同一支撑区间
      3. 被测试 >= 2 次的区间 = 强支撑
      4. 如果没有多次测试的强支撑，回退到最近的显著 swing low 作为单点支撑
      5. 返回每个支撑位的 {price, count, indices}，按最近一次测试时间排序
    """
    if len(swing_lows) < 1:
        return []

    # 聚类：按价格排序，把相近的 swing lows 归到同一支撑区间
    sorted_lows = sorted(swing_lows, key=lambda x: x[1])
    clusters: list[list[tuple[int, float]]] = []
    current_cluster = [sorted_lows[0]]

    for i in range(1, len(sorted_lows)):
        _, prev_price = sorted_lows[i - 1]
        _, curr_price = sorted_lows[i]
        if prev_price > 0 and abs(curr_price - prev_price) / prev_price <= tolerance:
            current_cluster.append(sorted_lows[i])
        else:
            clusters.append(current_cluster)
            current_cluster = [sorted_lows[i]]
    clusters.append(current_cluster)

    supports = []
    for cluster in clusters:
        if len(cluster) >= 2:  # 至少被测试 2 次
            # 过滤：同一支撑区间内的触及点必须时间上分散（间隔>=10根K线）
            sorted_by_idx = sorted(cluster, key=lambda x: x[0])
            distinct_touches = [sorted_by_idx[0]]
            for j in range(1, len(sorted_by_idx)):
                if sorted_by_idx[j][0] - distinct_touches[-1][0] >= 10:
                    distinct_touches.append(sorted_by_idx[j])
            if len(distinct_touches) < 2:
                continue  # 触及都挤在一起，不算真正的多次测试
            prices = [p for _, p in distinct_touches]
            indices = [idx for idx, _ in distinct_touches]
            supports.append({
                "price": float(np.mean(prices)),
                "count": len(distinct_touches),
                "indices": indices,
                "lastIndex": max(indices),
                "lowPrice": float(min(prices)),
                "highPrice": float(max(prices)),
            })

    # ── 回退逻辑：如果没有多次测试的强支撑，用最近 3 个 swing low 作为单点支撑 ──
    if not supports:
        # 按时间倒序取最近的 swing lows
        recent_lows = sorted(swing_lows, key=lambda x: x[0], reverse=True)[:3]
        for idx, val in recent_lows:
            supports.append({
                "price": float(val),
                "count": 1,
                "indices": [idx],
                "lastIndex": idx,
                "lowPrice": float(val),
                "highPrice": float(val),
            })

    supports.sort(key=lambda x: x["lastIndex"], reverse=True)
    return supports


def _find_resistance_levels(high: np.ndarray, close: np.ndarray, swing_highs: list[tuple[int, float]],
                            tolerance: float = 0.05) -> list[dict]:
    """
    找强压力位 — 被多次测试的价格区域（与支撑对称）。

    判定方法:
      1. 找所有 swing highs
      2. 对 swing highs 做聚类：价差 < tolerance(5%) 的归为同一压力区间
      3. 被测试 >= 2 次的区间 = 强压力
      4. 如果没有多次测试的强压力，取最近的显著 swing high
      5. 返回每个压力位的 {price, count, lowPrice, highPrice, indices, lastIndex}
    """
    if len(swing_highs) < 1:
        return []

    sorted_highs = sorted(swing_highs, key=lambda x: x[1])
    clusters: list[list[tuple[int, float]]] = []
    current_cluster = [sorted_highs[0]]

    for i in range(1, len(sorted_highs)):
        _, prev_price = sorted_highs[i - 1]
        _, curr_price = sorted_highs[i]
        if prev_price > 0 and abs(curr_price - prev_price) / prev_price <= tolerance:
            current_cluster.append(sorted_highs[i])
        else:
            clusters.append(current_cluster)
            current_cluster = [sorted_highs[i]]
    clusters.append(current_cluster)

    resistances = []
    for cluster in clusters:
        if len(cluster) >= 2:
            prices = [p for _, p in cluster]
            indices = [idx for idx, _ in cluster]
            resistances.append({
                "price": float(np.mean(prices)),
                "count": len(cluster),
                "indices": indices,
                "lastIndex": max(indices),
                "lowPrice": float(min(prices)),
                "highPrice": float(max(prices)),
            })

    # 回退：没有强压力，取最近 2 个 swing high
    if not resistances:
        recent_highs = sorted(swing_highs, key=lambda x: x[0], reverse=True)[:2]
        for idx, val in recent_highs:
            resistances.append({
                "price": float(val),
                "count": 1,
                "indices": [idx],
                "lastIndex": idx,
                "lowPrice": float(val),
                "highPrice": float(val),
            })

    # 只保留当前价格上方的压力位（下方的已被突破）
    if len(close) > 0:
        current_price = float(close[-1])
        resistances = [r for r in resistances if r["price"] > current_price * 0.98]

    resistances.sort(key=lambda x: x["price"])  # 从低到高排序
    return resistances[:3]  # 最多 3 个压力位


def _is_reversal_bar(i: int, open_arr: np.ndarray, high_arr: np.ndarray,
                     low_arr: np.ndarray, close_arr: np.ndarray) -> bool:
    """
    判断第 i 根 K 线是否是反包（bullish reversal bar）。

    反包定义：
      1. 当前收阳 (close > open)
      2. 前面 1-3 根 K 线中存在阴线
      3. 当前 close > 最近阴线的 high（反包吞没）
      或: 当前 close > 前一根 K 线的 high 且前面有连续跌势(2+根 close 递减)
    """
    if i < 2:
        return False
    if close_arr[i] <= open_arr[i]:  # 必须收阳
        return False

    body = close_arr[i] - open_arr[i]
    bar_range = high_arr[i] - low_arr[i]
    if bar_range <= 0:
        return False

    # 方法 1: 标准反包 — close 高于最近阴线的 high
    for j in range(i - 1, max(i - 4, -1), -1):
        if close_arr[j] < open_arr[j]:  # 找到阴线
            if close_arr[i] > high_arr[j]:  # 反包吞没
                return True
            break  # 最近的阴线没被吞没，不算

    # 方法 2: 在连续下跌后强势收阳 — close > 前一根 high，且前 2 根连续收跌
    if (close_arr[i] > high_arr[i - 1] and
            close_arr[i - 1] < close_arr[i - 2] and
            i >= 3 and close_arr[i - 2] < close_arr[i - 3]):
        return True

    return False


def detect_hh_signals(df: pd.DataFrame, swing_window: int = 5, lookback: int = 120) -> dict[str, Any]:
    """
    支撑位驱动的 H1/H2 信号检测 — 数 K 线反包。

    核心逻辑（用户纠正后的正确版本）:
      1. 找到支撑位（swing low 聚类，≥2 次测试 = 强支撑）
      2. 价格触碰支撑线后，开始数 K 线
      3. H1 = 在靠近支撑位附近，跌完后第一个"反包"（bullish reversal bar）
         反包 = 阳线吞没前面的阴线（close > 前阴线 high）
      4. H1 后又跌，等第二个反包 = H2
      5. 如果价格跌破支撑，计数重置
      6. H2 + 温和放量 = 买入信号

    状态机:
      INACTIVE → 价格进入支撑区间 → WAITING_DECLINE
      WAITING_DECLINE → 出现下跌段(2+根阴线/连续下跌) → IN_DECLINE
      IN_DECLINE → 出现反包 → 标记 H(n), 回到 WAITING_DECLINE
      任意状态 → 跌破支撑 → INACTIVE

    温和放量: 当天成交量 1.2x-3.0x 20日均量

    返回: {signals, drawdowns, supports, latestHH, hasBuySignal}
    """
    if df is None or df.empty or len(df) < 30:
        return {"signals": [], "drawdowns": [], "supports": [], "latestHH": None, "hasBuySignal": False}

    df = _ensure_sorted(df)
    n = len(df)
    seg = df.iloc[-min(lookback, n):]
    seg = seg.reset_index(drop=True)

    dates = seg["trade_date"].values if "trade_date" in seg.columns else None
    open_arr = seg["open"].values.astype(float) if "open" in seg.columns else seg["close"].values.astype(float)
    high = seg["high"].values.astype(float) if "high" in seg.columns else seg["close"].values.astype(float)
    low = seg["low"].values.astype(float) if "low" in seg.columns else seg["close"].values.astype(float)
    close = seg["close"].values.astype(float)
    vol = seg["vol"].values.astype(float) if "vol" in seg.columns else None

    seg_n = len(close)

    # 20 日均量（用于温和放量判断）
    vol_ma20 = None
    if vol is not None and len(vol) >= 20:
        vol_ma20 = np.convolve(vol, np.ones(20) / 20, mode="valid")
        vol_ma20 = np.concatenate([np.full(len(vol) - len(vol_ma20), np.nan), vol_ma20])

    swing_highs = _find_swing_highs(high, window=swing_window)
    swing_lows = _find_swing_lows(low, window=swing_window)

    if len(swing_lows) < 1:
        return {"signals": [], "drawdowns": [], "supports": [], "latestHH": None, "hasBuySignal": False}

    # ── 1. 找支撑位 ──
    support_levels = _find_support_levels(low, close, swing_lows, tolerance=0.05)

    # 序列化支撑位供前端显示
    support_output = []
    for sup in support_levels:
        touches = []
        for idx in sup["indices"]:
            if dates is not None and idx < len(dates):
                touches.append({
                    "date": str(dates[idx]),
                    "price": round(float(low[idx]), 2),
                })
        s_info = {
            "price": round(sup["price"], 2),
            "count": sup["count"],
            "lowPrice": round(sup["lowPrice"], 2),
            "highPrice": round(sup["highPrice"], 2),
            "touches": touches,
        }
        if dates is not None and sup["lastIndex"] < len(dates):
            s_info["lastDate"] = str(dates[sup["lastIndex"]])
        support_output.append(s_info)

    # ── 1b. 找压力位 ──
    resistance_levels = _find_resistance_levels(high, close, swing_highs, tolerance=0.05)
    resistance_output = []
    for res in resistance_levels:
        # 序列化所有触碰点（日期 + 该日最高价），前端用来画圆圈标记
        touches = []
        for idx in res["indices"]:
            if dates is not None and idx < len(dates):
                touches.append({
                    "date": str(dates[idx]),
                    "price": round(float(high[idx]), 2),
                })
        r_info = {
            "price": round(res["price"], 2),
            "count": res["count"],
            "lowPrice": round(res["lowPrice"], 2),
            "highPrice": round(res["highPrice"], 2),
            "touches": touches,
        }
        if dates is not None and res["lastIndex"] < len(dates):
            r_info["lastDate"] = str(dates[res["lastIndex"]])
        resistance_output.append(r_info)

    # ── 2. 在每个支撑位数 HH (Higher High) ──
    # 以支撑位触发的上涨结构为基础：
    #   第一个 swing high 作为基准高点
    #   后续每一个更高的 swing high 依次记作 H1 / H2 / ...
    # 这样既能避免把每次小反包都记成 H，也与图上 HH 标记保持一致
    signals: list[dict[str, Any]] = []
    used_bars: set[int] = set()  # 避免同一根 K 线被多个支撑重复标记

    for sup in support_levels:
        sup_price = sup["price"]
        # 定义支撑区间
        if sup["count"] == 1:
            support_zone_top = sup_price * 1.05
            support_zone_bottom = sup_price * 0.95
        else:
            tol = sup_price * 0.05
            support_zone_top = sup["highPrice"] + tol
            support_zone_bottom = sup["lowPrice"] - tol

        # 找触碰支撑区间的 swing low — 这是计数起点
        touch_indices = sorted([idx for idx, val in swing_lows
                                if support_zone_bottom <= val <= support_zone_top])
        if not touch_indices:
            continue

        # 从最早触碰开始，寻找在该支撑之上的递增 swing high 序列
        start_bar = touch_indices[0]
        broken_at = None
        for i in range(start_bar, seg_n):
            if low[i] < support_zone_bottom:
                broken_at = i
                break

        candidate_highs = [(idx, val) for idx, val in swing_highs if idx > start_bar]
        if broken_at is not None:
            candidate_highs = [(idx, val) for idx, val in candidate_highs if idx < broken_at]
        if len(candidate_highs) < 2:
            continue

        baseline_idx, baseline_val = candidate_highs[0]
        h_count = 0
        prev_high_val = baseline_val

        for idx, val in candidate_highs[1:]:
            if idx in used_bars:
                continue
            if val <= prev_high_val:
                continue

            h_count += 1
            used_bars.add(idx)
            prev_high_val = val

            volume_ratio = None
            is_gentle_volume = False
            if vol is not None and vol_ma20 is not None and idx < len(vol):
                day_vol = vol[idx]
                avg_vol = vol_ma20[idx] if idx < len(vol_ma20) and not np.isnan(vol_ma20[idx]) else None
                if avg_vol and avg_vol > 0:
                    volume_ratio = round(float(day_vol / avg_vol), 2)
                    is_gentle_volume = 1.2 <= volume_ratio <= 3.0

            is_buy_signal = h_count >= 2 and is_gentle_volume

            sig: dict[str, Any] = {
                "price": round(float(high[idx]), 2),
                "type": f"H{h_count}",
                "supportPrice": round(sup_price, 2),
            }
            if dates is not None and idx < len(dates):
                sig["date"] = str(dates[idx])
            if volume_ratio is not None:
                sig["volumeRatio"] = volume_ratio
            if is_buy_signal:
                sig["buySignal"] = True
            signals.append(sig)

    # 按日期排序，去重（同一日期只保留一个信号）
    signals.sort(key=lambda s: s.get("date", ""))
    seen_dates: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for sig in signals:
        d = sig.get("date", "")
        if d not in seen_dates:
            seen_dates.add(d)
            deduped.append(sig)
    signals = deduped

    # ── 3. 回撤幅度检测 ──
    # 规则: 阈值 ≥10%, 时间相近(5根K线内)的只保留最深, 总数限 8 个
    # 使用 low_idx 和 low_date 双重去重，防止同一个低点被多次标记
    raw_dd: list[tuple[int, dict[str, Any]]] = []  # (low_idx, info)
    used_low_points: set[int] = set()  # 按索引去重，防止同一根 K 线被多个高点标记

    for sh_idx, sh_val in swing_highs:
        next_lows = [(li, lv) for li, lv in swing_lows if li > sh_idx]
        if not next_lows:
            continue
        low_idx, low_val = next_lows[0]

        # 防止同一根低点 K 线被多个高点重复标记
        if low_idx in used_low_points:
            continue

        dd_pct = (low_val - sh_val) / sh_val
        if dd_pct < -0.10:  # 只标注 ≥10% 的回撤
            used_low_points.add(low_idx)
            dd_info: dict[str, Any] = {
                "type": "drawdown",
                "price": round(float(low_val), 2),
                "highPrice": round(float(sh_val), 2),
                "pct": round(float(dd_pct * 100), 1),
            }
            if dates is not None and low_idx < len(dates):
                dd_info["date"] = str(dates[low_idx])
            if dates is not None and sh_idx < len(dates):
                dd_info["highDate"] = str(dates[sh_idx])
            raw_dd.append((low_idx, dd_info))

    # 合并相近的回撤（5根K线内只保留最深的）
    raw_dd.sort(key=lambda x: x[0])
    merged_dd: list[dict[str, Any]] = []
    i_dd = 0
    while i_dd < len(raw_dd):
        group = [raw_dd[i_dd]]
        j_dd = i_dd + 1
        while j_dd < len(raw_dd) and raw_dd[j_dd][0] - group[-1][0] <= 5:
            group.append(raw_dd[j_dd])
            j_dd += 1
        # 保留组内最深的回撤（pct 最小值 = 最大跌幅）
        deepest = min(group, key=lambda x: x[1]["pct"])
        merged_dd.append(deepest[1])
        i_dd = j_dd

    # 限制总数: 保留最深的 8 个
    drawdowns = sorted(merged_dd, key=lambda d: d["pct"])[:8]
    # 按日期重新排序用于显示
    drawdowns.sort(key=lambda d: d.get("date", ""))

    if signals:
        max_h = max(int(s.get("type", "H0").replace("H", "") or "0") for s in signals)
        latest_hh = f"H{max_h}" if max_h > 0 else None
    else:
        latest_hh = None
    has_buy = any(s.get("buySignal") for s in signals)

    return {
        "signals": signals,
        "drawdowns": drawdowns,
        "supports": support_output,
        "resistances": resistance_output,
        "latestHH": latest_hh,
        "hasBuySignal": has_buy,
    }


def detect_cup_handle(df: pd.DataFrame) -> dict[str, Any]:
    """
    杯柄形态核心逻辑 (市场行为驱动):

    第一步: 左侧必须有一波连续拉升 30%+ (市场选出来的，既有逻辑又有技术支持)
    第二步: 拉升见顶后回调企稳，形成杯底 (回调 12%-33%)
    第三步: K线运行在MA200/MA50/MA30之上，且 MA30 > MA50 > MA200 (多头排列)
    第四步: 从杯底回升，在右侧出现 HH (Higher High) 信号
           — 即回踩后 swing high 逐步抬高，最终接近或突破杯口

    HH 判定: 杯底之后至少出现 2 个 swing high，且后者 > 前者

    返回额外字段:
      - "signals": [{date, price, type}] — HH 信号点坐标，用于在 K 线图上标记

    需要约 60-260 个交易日的数据 (MA200 需要 200 天)。
    """
    df = _ensure_sorted(df)
    if len(df) < 60:
        return {"detected": False, "confidence": 0, "detail": "数据不足"}

    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    n = len(close)

    # 获取日期列 (如果有)
    dates = None
    if "trade_date" in df.columns:
        dates = df["trade_date"].values

    # ── 步骤 0: 检查均线多头排列 ──
    ma30 = _ma(pd.Series(close), 30).values
    ma50 = _ma(pd.Series(close), 50).values
    ma200 = _ma(pd.Series(close), 200).values if n >= 200 else np.full(n, np.nan)

    # 当前均线状态
    cur_ma30 = float(ma30[-1]) if not np.isnan(ma30[-1]) else 0
    cur_ma50 = float(ma50[-1]) if not np.isnan(ma50[-1]) else 0
    cur_ma200 = float(ma200[-1]) if not np.isnan(ma200[-1]) else 0
    cur_price = float(close[-1])

    # 多头排列: 价格 > MA30 > MA50 > MA200
    has_ma200 = not np.isnan(ma200[-1])
    if has_ma200:
        ma_bullish = cur_price > cur_ma30 > cur_ma50 > cur_ma200
        price_above_all = cur_price > cur_ma30 and cur_price > cur_ma50 and cur_price > cur_ma200
    else:
        # 数据不足 200 天，只检查 MA30 > MA50
        ma_bullish = cur_price > cur_ma30 > cur_ma50
        price_above_all = cur_price > cur_ma30 and cur_price > cur_ma50

    # ── 在最近 150 天内寻找杯形 ──
    lookback = min(n, 150)
    seg_close = close[-lookback:]
    seg_high = high[-lookback:]
    seg_low = low[-lookback:]

    # ── 步骤 1: 找左侧高点 (杯口左侧) ──
    # 高点应在区间的前 40%
    left_region = seg_high[: int(lookback * 0.4)]
    if len(left_region) < 5:
        return {"detected": False, "confidence": 0, "detail": "无左侧高点"}
    left_peak_rel = int(np.argmax(left_region))
    left_peak = float(left_region[left_peak_rel])

    # ── 步骤 2: 验证左侧拉升 30%+ ──
    # 在整个 close 数组上找拉升起点（需要比 lookback 更长的数据）
    abs_peak_idx = n - lookback + left_peak_rel
    rally_start = _find_rally_start(close, abs_peak_idx, min_gain=0.30)
    if rally_start < 0:
        return {"detected": False, "confidence": 0, "detail": "左侧无30%+连续拉升"}

    rally_gain = (left_peak - close[rally_start]) / close[rally_start]
    rally_days = abs_peak_idx - rally_start

    # ── 步骤 3: 找杯底 (左侧高点之后的最低点) ──
    after_peak = seg_low[left_peak_rel:]
    if len(after_peak) < 8:
        return {"detected": False, "confidence": 0, "detail": "杯身太短"}
    cup_bottom_rel_in_after = int(np.argmin(after_peak))
    cup_bottom_idx = left_peak_rel + cup_bottom_rel_in_after  # 在 segment 内的索引
    cup_bottom = float(after_peak[cup_bottom_rel_in_after])

    # ── 步骤 4: 检查回调幅度 (10%-40%) ──
    drawdown = (left_peak - cup_bottom) / left_peak
    if drawdown < 0.10 or drawdown > 0.40:
        return {"detected": False, "confidence": 0, "detail": f"回调幅度 {drawdown:.0%} 不合适"}

    # 杯底不能太靠近当前（至少 5 天前）
    if cup_bottom_idx >= lookback - 5:
        return {"detected": False, "confidence": 0, "detail": "杯底太近期"}

    # ── 步骤 5: 检查杯底企稳 (U 型而非 V 型) ──
    cup_segment = seg_close[left_peak_rel:cup_bottom_idx + 1]
    if len(cup_segment) < 8:
        return {"detected": False, "confidence": 0, "detail": "杯身太短"}
    bottom_zone = cup_bottom + (left_peak - cup_bottom) * 0.20  # 底部 20% 区间
    bottom_days = int(np.sum(cup_segment <= bottom_zone))
    cup_duration = len(cup_segment)
    is_u_shape = bottom_days >= max(3, cup_duration * 0.12)  # 至少 3 天或 12% 的时间在底部

    # ── 步骤 6: 检查 HH (Higher High) 信号 ──
    # 从杯底之后找 swing highs
    right_side = seg_high[cup_bottom_idx:]
    right_side_low = seg_low[cup_bottom_idx:]

    # 用较小窗口找局部峰值
    right_peaks = _find_swing_highs(right_side, window=3)
    right_troughs = _find_swing_lows(right_side_low, window=3)

    has_hh = False
    hh_count = 0

    if len(right_peaks) >= 2:
        # 检查 swing highs 是否递增 (HH)
        for i in range(1, len(right_peaks)):
            if right_peaks[i][1] > right_peaks[i - 1][1]:
                hh_count += 1

        has_hh = hh_count >= 1  # 至少一次 HH

    # 同时检查 swing lows 是否递增 (HL - Higher Low)，增强确认
    has_hl = False
    if len(right_troughs) >= 2:
        for i in range(1, len(right_troughs)):
            if right_troughs[i][1] > right_troughs[i - 1][1]:
                has_hl = True
                break

    # ── 步骤 7: 当前价格位置 ──
    current_price = float(seg_close[-1])
    # 距杯口（左侧高点）的位置
    price_vs_rim = current_price / left_peak
    near_breakout = price_vs_rim >= 0.92
    has_broken_out = price_vs_rim >= 1.0

    # 最近的高点
    recent_high = float(np.max(seg_high[-10:])) if len(seg_high) >= 10 else current_price
    recent_vs_rim = recent_high / left_peak

    # ── 步骤 7: 构建 HH 信号点列表（用于 K 线图标记） ──
    hh_signals: list[dict[str, Any]] = []
    if len(right_peaks) >= 2:
        for i in range(1, len(right_peaks)):
            if right_peaks[i][1] > right_peaks[i - 1][1]:
                # 这是一个 HH 点
                abs_idx = n - lookback + cup_bottom_idx + right_peaks[i][0]
                signal: dict[str, Any] = {
                    "price": round(right_peaks[i][1], 2),
                    "type": "HH",
                    "prevHigh": round(right_peaks[i - 1][1], 2),
                }
                if dates is not None and 0 <= abs_idx < len(dates):
                    signal["date"] = str(dates[abs_idx])
                hh_signals.append(signal)

    # 同样记录 HL 点
    hl_signals: list[dict[str, Any]] = []
    if len(right_troughs) >= 2:
        for i in range(1, len(right_troughs)):
            if right_troughs[i][1] > right_troughs[i - 1][1]:
                abs_idx = n - lookback + cup_bottom_idx + right_troughs[i][0]
                signal = {
                    "price": round(right_troughs[i][1], 2),
                    "type": "HL",
                    "prevLow": round(right_troughs[i - 1][1], 2),
                }
                if dates is not None and 0 <= abs_idx < len(dates):
                    signal["date"] = str(dates[abs_idx])
                hl_signals.append(signal)

    # ── 综合评分 ──
    confidence = 0.0

    # 左侧拉升质量 (核心条件)
    if rally_gain >= 0.50:
        confidence += 0.15
    elif rally_gain >= 0.30:
        confidence += 0.10

    # 均线多头排列 (核心条件: MA30 > MA50 > MA200, price above all)
    if ma_bullish and price_above_all:
        confidence += 0.20
    elif price_above_all:
        confidence += 0.10
    elif ma_bullish:
        confidence += 0.08

    # U 型杯底
    if is_u_shape:
        confidence += 0.10

    # 回调幅度合理
    if 0.12 <= drawdown <= 0.33:
        confidence += 0.10
    elif 0.10 <= drawdown <= 0.40:
        confidence += 0.05

    # HH 信号 (核心条件)
    if has_hh:
        confidence += 0.25
        if hh_count >= 2:
            confidence += 0.05  # 多次 HH 更强

    # HL 确认
    if has_hl:
        confidence += 0.10

    # 价格位置
    if has_broken_out:
        confidence += 0.10
    elif near_breakout:
        confidence += 0.05

    detected = confidence >= 0.55

    # ── 描述 ──
    detail_parts = [f"拉升{rally_gain:.0%}({rally_days}日)"]
    detail_parts.append(f"回调{drawdown:.0%}")
    if is_u_shape:
        detail_parts.append(f"U型底({bottom_days}日)")
    if ma_bullish:
        detail_parts.append("MA多头排列")
    elif price_above_all:
        detail_parts.append("价上三线")
    if has_hh:
        detail_parts.append(f"HH×{hh_count}")
    if has_hl:
        detail_parts.append("HL确认")
    if has_broken_out:
        detail_parts.append("已突破杯口")
    elif near_breakout:
        detail_parts.append(f"距杯口{(1 - price_vs_rim) * 100:.1f}%")

    return {
        "detected": detected,
        "confidence": round(confidence, 2),
        "detail": "杯柄: " + ", ".join(detail_parts),
        "signals": hh_signals + hl_signals,  # HH/HL 信号点坐标
        "maAlignment": {
            "ma30": round(cur_ma30, 2),
            "ma50": round(cur_ma50, 2),
            "ma200": round(cur_ma200, 2) if has_ma200 else None,
            "bullish": ma_bullish,
            "priceAboveAll": price_above_all,
        },
    }


# ────────────────────────────────────────────────
# 2. VCP — 波动收缩形态 (Volatility Contraction Pattern)
# ────────────────────────────────────────────────
def detect_vcp(df: pd.DataFrame) -> dict[str, Any]:
    """
    VCP (Mark Minervini):
    - 在上升趋势中，价格出现 2-4 次回调
    - 每次回调幅度递减 (例如 25% → 15% → 8%)
    - 波动率收缩，成交量缩量
    - 最终在收缩区间内突破

    足迹表示：总周数--最大回调/第二次回调--收缩次数T
    例：15W--32.99/14.8--3T
    """
    df = _ensure_sorted(df)
    if len(df) < 40:
        return {"detected": False, "confidence": 0, "detail": "数据不足"}

    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    n = len(close)

    # 在最近 120 天内分析
    lookback = min(n, 120)
    seg_close = close[-lookback:]
    seg_high = high[-lookback:]
    seg_low = low[-lookback:]

    # 步骤 1: 确认整体处于上升趋势
    # 当前价格应高于 lookback 区间起点
    if seg_close[-1] < seg_close[0] * 1.1:
        return {"detected": False, "confidence": 0, "detail": "非上升趋势"}

    # 步骤 2: 寻找波峰和波谷
    # 用滚动窗口找局部极值
    peaks = []
    troughs = []
    window = 5

    for i in range(window, lookback - window):
        if seg_high[i] == max(seg_high[i - window:i + window + 1]):
            peaks.append((i, float(seg_high[i])))
        if seg_low[i] == min(seg_low[i - window:i + window + 1]):
            troughs.append((i, float(seg_low[i])))

    if len(peaks) < 2 or len(troughs) < 2:
        return {"detected": False, "confidence": 0, "detail": "波动不足"}

    # 步骤 3: 计算连续回调幅度
    # 对每个 peak，找后面最近的 trough，计算回调深度
    contractions = []
    for pi, (p_idx, p_val) in enumerate(peaks):
        # 找此 peak 之后最近的 trough
        next_troughs = [(t_idx, t_val) for t_idx, t_val in troughs if t_idx > p_idx]
        if not next_troughs:
            continue
        t_idx, t_val = next_troughs[0]
        depth = (p_val - t_val) / p_val
        if depth > 0.03:  # 至少 3% 的回调才算
            contractions.append({"peak_idx": p_idx, "trough_idx": t_idx, "depth": depth})

    if len(contractions) < 2:
        return {"detected": False, "confidence": 0, "detail": "回调次数不足"}

    # 步骤 4: 检查回调是否递减
    depths = [c["depth"] for c in contractions]
    decreasing_count = 0
    for i in range(1, len(depths)):
        if depths[i] < depths[i - 1]:
            decreasing_count += 1

    contraction_ratio = decreasing_count / (len(depths) - 1) if len(depths) > 1 else 0

    # 步骤 5: 检查成交量是否收缩
    if "vol" in df.columns or "amount" in df.columns:
        vol_col = "amount" if "amount" in df.columns else "vol"
        vol = df[vol_col].values[-lookback:].astype(float)
        first_half_vol = np.mean(vol[: lookback // 2])
        second_half_vol = np.mean(vol[lookback // 2:])
        vol_contracting = second_half_vol < first_half_vol * 0.85
    else:
        vol_contracting = False

    # 步骤 6: 最后一次回调的幅度应较小 (< 15%)
    last_depth = depths[-1]
    tight_finish = last_depth < 0.15

    # 综合评分
    confidence = 0.0
    if contraction_ratio >= 0.6:
        confidence += 0.35
    elif contraction_ratio >= 0.4:
        confidence += 0.2
    if vol_contracting:
        confidence += 0.2
    if tight_finish:
        confidence += 0.2
    if len(contractions) >= 3:
        confidence += 0.15
    elif len(contractions) >= 2:
        confidence += 0.1

    detected = confidence >= 0.5

    detail_parts = [f"{len(contractions)}次收缩"]
    detail_parts.append(f"幅度{'→'.join(f'{d:.0%}' for d in depths[:4])}")
    if vol_contracting:
        detail_parts.append("量缩")
    if tight_finish:
        detail_parts.append(f"末端{last_depth:.0%}")

    return {
        "detected": detected,
        "confidence": round(confidence, 2),
        "detail": "VCP: " + ", ".join(detail_parts),
    }


# ────────────────────────────────────────────────
# 3. 紧凑盘整 (Tight Consolidation / Flat Base)
# ────────────────────────────────────────────────
def detect_tight_consolidation(df: pd.DataFrame) -> dict[str, Any]:
    """
    紧凑盘整特征 (如 300999 金龙鱼 2020.11-12):
    - 在上涨趋势后出现窄幅横盘
    - 最近 10-30 天的振幅 < 10%
    - 收盘价位于近期高位附近 (距最高点 < 8%)
    - 成交量相对萎缩
    - 价格在 MA20 附近
    """
    df = _ensure_sorted(df)
    if len(df) < 30:
        return {"detected": False, "confidence": 0, "detail": "数据不足"}

    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    n = len(close)

    # 检查最近 15-25 天的紧凑度
    for window in [15, 20, 25]:
        if n < window + 20:
            continue

        recent_high = np.max(high[-window:])
        recent_low = np.min(low[-window:])
        range_pct = (recent_high - recent_low) / recent_low

        # 先检查之前有上涨
        prior_close = close[-(window + 20): -window]
        if len(prior_close) < 10:
            continue
        prior_gain = (close[-window] - prior_close[0]) / prior_close[0]

        if range_pct <= 0.10 and prior_gain > 0.15:
            # 确认价格在高位
            period_high_60d = np.max(high[-60:]) if n >= 60 else np.max(high)
            near_high = close[-1] >= period_high_60d * 0.92

            # 成交量收缩
            vol_contracting = False
            if "amount" in df.columns:
                amt = df["amount"].values.astype(float)
                recent_amt = np.mean(amt[-window:])
                prior_amt = np.mean(amt[-(window + 20): -window])
                vol_contracting = recent_amt < prior_amt * 0.8

            confidence = 0.3  # 基础：range < 10%
            if range_pct <= 0.07:
                confidence += 0.15
            if near_high:
                confidence += 0.25
            if vol_contracting:
                confidence += 0.15
            if prior_gain > 0.30:
                confidence += 0.15

            detected = confidence >= 0.55

            detail = f"紧凑盘整: {window}日振幅{range_pct:.1%}, 前期涨{prior_gain:.0%}"
            if near_high:
                detail += ", 近高位"
            if vol_contracting:
                detail += ", 缩量"

            return {"detected": detected, "confidence": round(confidence, 2), "detail": detail}

    return {"detected": False, "confidence": 0, "detail": "无紧凑区间"}


# ────────────────────────────────────────────────
# 4. 三线开花 (Triple MA Convergence & Fan-out)
# ────────────────────────────────────────────────
def detect_three_line_bloom(df: pd.DataFrame) -> dict[str, Any]:
    """
    三线开花特征:
    - MA20, MA120, MA250 三条均线汇聚 (间距 < 5%)
    - 之后同时向上发散
    - 价格站上三线之上
    - 通常出现在长期底部或大型整理末期

    需要 250+ 天数据来计算 MA250。
    """
    df = _ensure_sorted(df)
    if len(df) < 260:
        return {"detected": False, "confidence": 0, "detail": "数据不足(需250日)"}

    close = df["close"].values.astype(float)
    ma20 = _ma(pd.Series(close), 20).values
    ma120 = _ma(pd.Series(close), 120).values
    ma250 = _ma(pd.Series(close), 250).values

    n = len(close)

    # 在最近 30 天内寻找三线汇聚点
    best_convergence = 1.0
    best_idx = -1

    for i in range(max(n - 40, 250), n):
        if np.isnan(ma20[i]) or np.isnan(ma120[i]) or np.isnan(ma250[i]):
            continue
        vals = [ma20[i], ma120[i], ma250[i]]
        spread = (max(vals) - min(vals)) / np.mean(vals)
        if spread < best_convergence:
            best_convergence = spread
            best_idx = i

    if best_idx < 0 or best_convergence > 0.08:
        return {"detected": False, "confidence": 0, "detail": f"三线间距{best_convergence:.1%}过大"}

    # 检查汇聚后是否向上发散
    current_ma20 = ma20[-1] if not np.isnan(ma20[-1]) else 0
    current_ma120 = ma120[-1] if not np.isnan(ma120[-1]) else 0
    current_ma250 = ma250[-1] if not np.isnan(ma250[-1]) else 0

    # 三线都在上升
    ma20_rising = current_ma20 > ma20[best_idx] if not np.isnan(ma20[best_idx]) else False
    ma120_rising = current_ma120 > ma120[best_idx] if not np.isnan(ma120[best_idx]) else False
    ma250_rising = current_ma250 > ma250[best_idx] if not np.isnan(ma250[best_idx]) else False

    rising_count = sum([ma20_rising, ma120_rising, ma250_rising])

    # 价格在三线之上
    price_above = close[-1] > max(current_ma20, current_ma120, current_ma250)

    # 当前发散度
    current_vals = [current_ma20, current_ma120, current_ma250]
    current_spread = (max(current_vals) - min(current_vals)) / np.mean(current_vals) if np.mean(current_vals) > 0 else 0

    # MA 排列：MA20 > MA120 > MA250 (多头排列)
    bullish_alignment = current_ma20 > current_ma120 > current_ma250

    confidence = 0.0
    if best_convergence <= 0.03:
        confidence += 0.3
    elif best_convergence <= 0.05:
        confidence += 0.2
    elif best_convergence <= 0.08:
        confidence += 0.1

    if rising_count >= 3:
        confidence += 0.25
    elif rising_count >= 2:
        confidence += 0.15

    if price_above:
        confidence += 0.2

    if bullish_alignment:
        confidence += 0.15

    if current_spread > best_convergence:
        confidence += 0.1  # 正在发散

    detected = confidence >= 0.55

    detail_parts = [f"汇聚{best_convergence:.1%}"]
    if rising_count >= 2:
        detail_parts.append(f"{rising_count}线上行")
    if bullish_alignment:
        detail_parts.append("多头排列")
    if price_above:
        detail_parts.append("价上三线")

    return {
        "detected": detected,
        "confidence": round(confidence, 2),
        "detail": "三线开花: " + ", ".join(detail_parts),
    }


# ────────────────────────────────────────────────
# 5. 口袋支点 (Pocket Pivot)
# ────────────────────────────────────────────────
def detect_pocket_pivot(df: pd.DataFrame) -> dict[str, Any]:
    """
    口袋支点 (Chris Kacher / Gil Morales):
    - 某日的成交量 > 过去 10 天内任意下跌日的成交量
    - 当日收盘价在 MA10 或 MA20 上方
    - 当日涨幅为正
    - 出现在整理区间或回调至均线支撑处
    """
    df = _ensure_sorted(df)
    if len(df) < 20:
        return {"detected": False, "confidence": 0, "detail": "数据不足"}

    close = df["close"].values.astype(float)
    vol_col = "amount" if "amount" in df.columns else "vol"
    if vol_col not in df.columns:
        return {"detected": False, "confidence": 0, "detail": "无成交量数据"}

    volume = df[vol_col].values.astype(float)
    n = len(close)
    ma10 = _ma(pd.Series(close), 10).values
    ma20 = _ma(pd.Series(close), 20).values

    # 检查最近 3 天是否有口袋支点
    for offset in range(0, min(3, n - 11)):
        idx = n - 1 - offset
        if idx < 11:
            continue

        today_vol = volume[idx]
        today_close = close[idx]
        today_change = (close[idx] - close[idx - 1]) / close[idx - 1]

        if today_change <= 0:
            continue  # 当日必须上涨

        # 过去 10 天内下跌日的成交量
        down_day_vols = []
        for j in range(idx - 10, idx):
            if j > 0 and close[j] < close[j - 1]:
                down_day_vols.append(volume[j])

        if not down_day_vols:
            continue

        max_down_vol = max(down_day_vols)
        is_pocket = today_vol > max_down_vol

        # 在均线上方
        above_ma = False
        if not np.isnan(ma10[idx]) and not np.isnan(ma20[idx]):
            above_ma = today_close > min(ma10[idx], ma20[idx])
        elif not np.isnan(ma20[idx]):
            above_ma = today_close > ma20[idx]

        if is_pocket and above_ma:
            vol_ratio = today_vol / max_down_vol
            confidence = min(0.9, 0.5 + (vol_ratio - 1) * 0.2)
            detail = f"口袋支点: 量比{vol_ratio:.1f}x, 涨{today_change:.1%}"
            if offset > 0:
                detail += f" ({offset}日前)"
            return {"detected": True, "confidence": round(confidence, 2), "detail": detail}

    return {"detected": False, "confidence": 0, "detail": "近期无口袋支点"}


# ════════════════════════════════════════════════
# 冯总极简交易系统 — 信号检测
# ════════════════════════════════════════════════
#
# 核心逻辑（信号链）：
#   支撑位附近 → 止跌K线 → 开始数K线 → 反包=H1 → 回调 → 再反包=H2(W底)
#
# H1: 止跌后第一个 "今高>昨高" 的阳线反包
# H2: H1 之后回调，再出现 "今高>昨高" 的阳线反包 = W 底确认


def _is_price_breakout(i: int, high: np.ndarray) -> bool:
    """价格反包：今高 > 昨高（不要求收阳，只要价格突破了）"""
    if i < 1:
        return False
    return bool(high[i] > high[i - 1])


def _near_support(price: float, supports: list[float], tolerance: float = 0.03) -> bool:
    """价格是否在某个支撑位附近"""
    for sp in supports:
        if sp > 0 and abs(price - sp) / sp < tolerance:
            return True
    return False


def _score_stop_k(idx: int, open_arr: np.ndarray, high_arr: np.ndarray,
                  low_arr: np.ndarray, close_arr: np.ndarray,
                  supports: list[float]) -> float:
    """对单根K线做止跌评分（满分10分）"""
    o, h, lo, c = open_arr[idx], high_arr[idx], low_arr[idx], close_arr[idx]
    body = abs(c - o)
    full_range = h - lo
    if full_range < 0.01:
        return 0

    is_yang = c > o
    is_fake_yin = (c < o) and idx > 0 and (c > close_arr[idx - 1])
    if not (is_yang or is_fake_yin):
        return 0

    score = 0.0
    score += 1.0 if is_yang else 0.5
    # 长下影
    lower_shadow = min(o, c) - lo
    if lower_shadow > body * 1.5 and lower_shadow > full_range * 0.4:
        score += 1
    # 小实体
    if idx >= 10:
        avg_body = float(np.mean([abs(close_arr[j] - open_arr[j]) for j in range(idx - 10, idx)]))
        if avg_body > 0 and body < avg_body * 0.5:
            score += 1
    # 涨幅
    if idx > 0:
        pct = (c - close_arr[idx - 1]) / close_arr[idx - 1] if close_arr[idx - 1] > 0 else 0
        if pct > 0.03:
            score += 1
    # 实体靠上
    body_pos = (min(o, c) - lo) / full_range
    if body_pos > 0.6:
        score += 1
    # 支撑位附近
    if _near_support(lo, supports):
        score += 1
    # 整数位附近
    round_base = 10 if lo > 20 else 5
    nearest_round = round(lo / round_base) * round_base
    if nearest_round > 0 and abs(lo - nearest_round) / nearest_round < 0.01:
        score += 1
    return score


def detect_feng_signals(df: pd.DataFrame) -> dict[str, Any]:
    """
    冯总极简交易系统：支撑位止跌 → 数K线(H1/H2) → W底确认。

    返回:
      signals: [{date, price, label, ...}]  — 标注在K线图上的信号点
      buySignals: [{date, price, stopLoss, takeProfit, ...}] — 最近一个买入信号
    """
    empty: dict[str, Any] = {"signals": [], "buySignals": []}
    if df is None or df.empty or len(df) < 30:
        return empty

    df = _ensure_sorted(df)
    n = len(df)
    open_arr = df["open"].values.astype(float)
    high_arr = df["high"].values.astype(float)
    low_arr = df["low"].values.astype(float)
    close_arr = df["close"].values.astype(float)
    dates = df["trade_date"].values

    # 支撑位 — 用聚类找真正的水平支撑
    swing_lows = _find_swing_lows(low_arr, window=3)
    strong_supports = _find_support_levels(low_arr, close_arr, swing_lows, tolerance=0.05)
    # count>=2 且触及间隔>=10根K线（同一波回调的两根K线不算）
    support_prices = [s["price"] for s in strong_supports if s["count"] >= 2]

    signals: list[dict[str, Any]] = []
    buy_signals: list[dict[str, Any]] = []
    used_bars: set[int] = set()  # 防止同一根K线被多个swing_high重复标记

    # ── Al Brooks 式 H1/H2 数法 ──
    #
    # 逻辑：扫描波段高点，高点之后价格回调到支撑位附近时，
    #        开始数 "今高>昨高" 的次数：
    #        第1次 = H1（第一次尝试反转）
    #        H1 失败后第2次 = H2 = W底确认
    #        H2 之后价格必须站稳（后3根不破W低点），否则不算

    swing_highs = _find_swing_highs(high_arr, window=5)

    for sh_idx, sh_price in swing_highs:
        h_count = 0
        h1_idx = -1
        pullback_low_price = sh_price

        for i in range(sh_idx + 1, min(sh_idx + 40, n)):
            if low_arr[i] < pullback_low_price:
                pullback_low_price = float(low_arr[i])

            drop = (sh_price - low_arr[i]) / sh_price if sh_price > 0 else 0
            if drop > 0.40:
                break
            if drop < 0.01:
                continue

            if not _near_support(pullback_low_price, support_prices, 0.05):
                continue

            if _is_price_breakout(i, high_arr):
                h_count += 1

                if h_count == 1 and i not in used_bars:
                    h1_idx = i
                    used_bars.add(i)
                    signals.append({
                        "date": str(dates[i]),
                        "price": round(float(high_arr[i]), 2),
                        "label": "H1",
                        "type": "h1",
                    })

                elif h_count == 2 and i not in used_bars:
                    # 验证 W 底有效：后续 3 根 K 线不能跌破 W 的低点
                    w_low = float(low_arr[i])
                    valid_w = True
                    for j in range(i + 1, min(i + 4, n)):
                        if low_arr[j] < w_low * 0.99:  # 允许 1% 误差
                            valid_w = False
                            break
                    if not valid_w:
                        break  # W 失败，这个波段放弃

                    sl = round(float(pullback_low_price), 2)
                    entry = round(float(close_arr[i]), 2)
                    risk = entry - sl
                    if risk > 0:
                        tp = round(entry + risk * 2, 2)
                        used_bars.add(i)
                        signals.append({
                            "date": str(dates[i]),
                            "price": round(float(low_arr[i]), 2),
                            "highPrice": round(float(high_arr[i]), 2),
                            "label": "W",
                            "type": "h2_w",
                        })
                        buy_signals.append({
                            "type": "buy",
                            "date": str(dates[i]),
                            "price": entry,
                            "pattern": "wBottom",
                            "patternLabel": "W底",
                            "stopLoss": sl,
                            "takeProfit": tp,
                            "riskReward": 2.0,
                        })
                    break  # 这个波段高点的 H1/H2 完成，去找下一个波段高点

    return {"signals": signals, "buySignals": buy_signals}


# ────────────────────────────────────────────────
# 汇总: 检测所有形态
# ────────────────────────────────────────────────
def detect_all_patterns(df: pd.DataFrame) -> list[str]:
    """
    对给定的 OHLCV DataFrame 运行所有形态检测，返回检测到的形态标签列表。
    标签格式: camelCase 英文名，前端用于匹配图标和颜色。
    """
    if df is None or df.empty or len(df) < 20:
        return []

    tags: list[str] = []

    detectors = [
        ("cupHandle", detect_cup_handle),
        ("vcp", detect_vcp),
        ("tightBase", detect_tight_consolidation),
        ("threeLineBloom", detect_three_line_bloom),
        ("pocketPivot", detect_pocket_pivot),
    ]

    for tag, fn in detectors:
        try:
            result = fn(df)
            if result.get("detected"):
                tags.append(tag)
                logger.debug(f"检测到形态 {tag}: {result.get('detail', '')}")
        except Exception as exc:
            logger.debug(f"形态检测异常 {tag}: {exc}")

    return tags


def detect_all_patterns_with_signals(df: pd.DataFrame) -> dict[str, Any]:
    """
    返回形态标签 + HH/HL 信号点（用于 K 线图叠加标记）。
    返回:
    {
      "tags": ["cupHandle", ...],
      "signals": [{"date": "20250315", "price": 14.5, "type": "HH"}, ...],
      "maAlignment": {"ma30": x, "ma50": y, "ma200": z, "bullish": bool}
    }
    """
    if df is None or df.empty or len(df) < 20:
        return {"tags": [], "signals": [], "maAlignment": None}

    tags: list[str] = []
    all_signals: list[dict[str, Any]] = []
    ma_info: dict[str, Any] | None = None

    detectors = [
        ("cupHandle", detect_cup_handle),
        ("vcp", detect_vcp),
        ("tightBase", detect_tight_consolidation),
        ("threeLineBloom", detect_three_line_bloom),
        ("pocketPivot", detect_pocket_pivot),
    ]

    for tag, fn in detectors:
        try:
            result = fn(df)
            if result.get("detected"):
                tags.append(tag)
            if "maAlignment" in result and result["maAlignment"]:
                ma_info = result["maAlignment"]
        except Exception as exc:
            logger.debug(f"形态检测异常 {tag}: {exc}")

    # 独立 HH 信号检测（数 K 线高点: H1, H2, ...）
    hh_result: dict[str, Any] = {"signals": [], "latestHH": None, "hasBuySignal": False}
    try:
        hh_result = detect_hh_signals(df)
        if hh_result.get("hasBuySignal"):
            tags.append("hhBuy")
    except Exception as exc:
        logger.debug(f"HH 信号检测异常: {exc}")

    return {
        "tags": tags,
        "signals": hh_result.get("signals", []),
        "drawdowns": hh_result.get("drawdowns", []),
        "supports": hh_result.get("supports", []),
        "resistances": hh_result.get("resistances", []),
        "maAlignment": ma_info,
        "latestHH": hh_result.get("latestHH"),
        "hasBuySignal": hh_result.get("hasBuySignal", False),
    }


def detect_all_patterns_detail(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    返回所有形态的详细检测结果（含未检测到的）。
    用于调试和展示。
    """
    if df is None or df.empty or len(df) < 20:
        return []

    detectors = [
        ("cupHandle", "杯柄", detect_cup_handle),
        ("vcp", "VCP", detect_vcp),
        ("tightBase", "紧凑盘整", detect_tight_consolidation),
        ("threeLineBloom", "三线开花", detect_three_line_bloom),
        ("pocketPivot", "口袋支点", detect_pocket_pivot),
    ]

    results = []
    for tag, label, fn in detectors:
        try:
            result = fn(df)
            result["tag"] = tag
            result["label"] = label
            results.append(result)
        except Exception as exc:
            results.append({"tag": tag, "label": label, "detected": False, "confidence": 0, "detail": f"异常: {exc}"})

    return results
