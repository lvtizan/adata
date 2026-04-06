"""
形态预测引擎 — 检测"正在形成中"的经典形态并预测完成路径。

只在高概率情况下输出预测（confidence >= 0.6），附带应对方案。

预测形态:
  1. 双底 (W底)     — 第一底确认 + 回调接近第一底
  2. 杯柄           — 杯体完成 + 正在形成柄部
  3. 上升三角       — 水平压力 + 抬升低点
  4. 头肩底         — 左肩+头 + 正在形成右肩
  5. 下降楔形(看涨) — 高点低点同时下行但收敛

返回结构:
  {
    "predictions": [
      {
        "pattern": "doubleBottom",
        "label": "双底(W底)",
        "confidence": 0.75,
        "phase": "回调形成第二底中",
        "projectedPath": [                # 虚线路径点
          {"date": "20260403", "price": 15.2, "type": "current"},
          {"date": "20260408", "price": 14.5, "type": "predicted_low"},
          {"date": "20260415", "price": 16.8, "type": "target"},
        ],
        "keyLevels": {
          "support": 14.3,               # 预期支撑
          "neckline": 16.2,              # 颈线
          "target": 18.1,               # 目标价
          "stopLoss": 13.8,             # 止损位
        },
        "action": {
          "entry": "回调至14.3-14.8区间轻仓试探，放量站上颈线16.2加仓",
          "stop": "跌破13.8止损（第一底下方3%）",
          "target": "目标18.1（颈线上方等距投影）",
          "riskReward": 2.3,
        },
      }
    ]
  }
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _ma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).mean()


def _ensure_sorted(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    if "trade_date" in df.columns:
        df = df.sort_values("trade_date").reset_index(drop=True)
    return df


def _find_swing_lows(low: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    troughs = []
    for i in range(window, len(low) - window):
        if all(low[i] <= low[i - j] for j in range(1, window + 1)) and \
           all(low[i] <= low[i + j] for j in range(1, window + 1)):
            troughs.append((i, float(low[i])))
    return troughs


def _find_swing_highs(high: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    peaks = []
    for i in range(window, len(high) - window):
        if all(high[i] >= high[i - j] for j in range(1, window + 1)) and \
           all(high[i] >= high[i + j] for j in range(1, window + 1)):
            peaks.append((i, float(high[i])))
    return peaks


def _extrapolate_dates(dates: np.ndarray, n_future: int) -> list[str]:
    """从现有日期序列外推 N 个未来交易日（简单+1天）"""
    last = str(dates[-1])
    result = []
    y, m, d = int(last[:4]), int(last[4:6]), int(last[6:8])
    from datetime import date, timedelta
    current = date(y, m, d)
    count = 0
    while count < n_future:
        current += timedelta(days=1)
        if current.weekday() < 5:  # 跳过周末
            result.append(current.strftime("%Y%m%d"))
            count += 1
    return result


# ══════════════════════════════════════════════
#  1. 双底预测
# ══════════════════════════════════════════════

def predict_double_bottom(df: pd.DataFrame) -> dict[str, Any] | None:
    """
    条件:
    - 近60日内有明显底部(跌幅>15%)
    - 从底部反弹>8%后正在回调
    - 当前价格接近第一底(在其上方3-10%)
    - 回调缩量（量比<0.8）
    """
    df = _ensure_sorted(df)
    n = len(df)
    if n < 60:
        return None

    close = df["close"].values.astype(float)
    low = df["low"].values.astype(float)
    high = df["high"].values.astype(float)
    vol = df["vol"].values.astype(float)
    dates = df["trade_date"].values

    # 找近60日最低点
    lookback = min(60, n)
    recent = close[-lookback:]
    recent_low = low[-lookback:]

    low_idx_rel = int(np.argmin(recent_low))
    low_idx = n - lookback + low_idx_rel
    first_bottom = float(recent_low[low_idx_rel])

    # 底部前必须有明显下跌(从前高跌>15%)
    pre_high = float(np.max(high[max(0, low_idx - 30):low_idx])) if low_idx > 5 else float(high[0])
    decline_pct = (pre_high - first_bottom) / pre_high if pre_high > 0 else 0
    if decline_pct < 0.15:
        return None

    # 底部后必须有反弹(>8%)
    post_bottom = close[low_idx:]
    if len(post_bottom) < 5:
        return None
    post_high = float(np.max(post_bottom))
    bounce_pct = (post_high - first_bottom) / first_bottom if first_bottom > 0 else 0
    if bounce_pct < 0.08:
        return None

    # 当前价格必须在回调中（低于反弹高点）且接近第一底
    current_price = float(close[-1])
    if current_price >= post_high:
        return None  # 还在涨，没回调

    # 当前价距第一底: 3-12%以内
    dist_to_bottom = (current_price - first_bottom) / first_bottom if first_bottom > 0 else 999
    if dist_to_bottom < 0.0 or dist_to_bottom > 0.12:
        return None

    # 回调缩量检查
    avg_vol_20 = float(np.mean(vol[-20:])) if n >= 20 else float(np.mean(vol))
    recent_vol = float(np.mean(vol[-5:])) if n >= 5 else avg_vol_20
    vol_ratio = recent_vol / avg_vol_20 if avg_vol_20 > 0 else 1

    # 置信度计算
    confidence = 0.5
    if dist_to_bottom <= 0.05:
        confidence += 0.15  # 非常接近第一底
    elif dist_to_bottom <= 0.08:
        confidence += 0.1
    if vol_ratio < 0.8:
        confidence += 0.1   # 缩量回调
    if bounce_pct > 0.15:
        confidence += 0.05  # 反弹力度大

    if confidence < 0.6:
        return None

    # 关键价位
    neckline = post_high
    cup_depth = neckline - first_bottom
    target = neckline + cup_depth  # 等距投影
    stop_loss = first_bottom * 0.97  # 第一底下方3%

    # 预测路径
    future_dates = _extrapolate_dates(dates, 15)
    projected = [
        {"date": str(dates[-1]), "price": round(current_price, 2), "type": "current"},
    ]
    # 预测再跌到接近第一底
    predicted_low = first_bottom * 1.01
    if len(future_dates) >= 5:
        projected.append({"date": future_dates[4], "price": round(predicted_low, 2), "type": "predicted_low"})
    # 反弹至颈线
    if len(future_dates) >= 10:
        projected.append({"date": future_dates[9], "price": round(neckline, 2), "type": "neckline"})
    # 突破目标
    if len(future_dates) >= 14:
        projected.append({"date": future_dates[14], "price": round(target, 2), "type": "target"})

    rr = (target - current_price) / (current_price - stop_loss) if current_price > stop_loss else 0

    return {
        "pattern": "doubleBottom",
        "label": "双底(W底)",
        "confidence": round(min(confidence, 0.95), 2),
        "phase": f"回调中，距第一底{dist_to_bottom*100:.1f}%",
        "projectedPath": projected,
        "keyLevels": {
            "firstBottom": round(first_bottom, 2),
            "neckline": round(neckline, 2),
            "target": round(target, 2),
            "stopLoss": round(stop_loss, 2),
        },
        "action": {
            "entry": f"回调至{first_bottom:.2f}-{first_bottom*1.03:.2f}区间轻仓试探，放量站上颈线{neckline:.2f}加仓",
            "stop": f"跌破{stop_loss:.2f}止损（第一底下方3%）",
            "target": f"目标{target:.2f}（颈线等距投影）",
            "riskReward": round(rr, 1),
        },
    }


# ══════════════════════════════════════════════
#  2. 杯柄预测
# ══════════════════════════════════════════════

def predict_cup_handle(df: pd.DataFrame) -> dict[str, Any] | None:
    """
    条件:
    - 杯体形成：U型下跌>15%后回升至杯沿附近(回升>80%跌幅)
    - 柄部形成中：小幅回调<10%，时间<15天
    - 柄部缩量
    """
    df = _ensure_sorted(df)
    n = len(df)
    if n < 80:
        return None

    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    vol = df["vol"].values.astype(float)
    dates = df["trade_date"].values

    # 找杯体：近120日内的最高点→最低点→回升
    lookback = min(120, n)
    segment = close[-lookback:]
    seg_high = high[-lookback:]
    seg_low = low[-lookback:]

    # 杯沿（左侧高点）
    rim_idx_rel = int(np.argmax(seg_high[:lookback // 2]))  # 前半段最高点
    rim_price = float(seg_high[rim_idx_rel])

    # 杯底
    bottom_idx_rel = int(np.argmin(seg_low[rim_idx_rel:rim_idx_rel + 60])) + rim_idx_rel
    if bottom_idx_rel <= rim_idx_rel:
        return None
    bottom_price = float(seg_low[bottom_idx_rel])

    cup_depth_pct = (rim_price - bottom_price) / rim_price if rim_price > 0 else 0
    if cup_depth_pct < 0.15 or cup_depth_pct > 0.50:
        return None  # 杯太浅或太深

    # 回升检查：杯底之后最高点需回升>80%杯深
    post_bottom = segment[bottom_idx_rel:]
    if len(post_bottom) < 10:
        return None
    recovery_high = float(np.max(post_bottom))
    recovery_pct = (recovery_high - bottom_price) / (rim_price - bottom_price) if rim_price > bottom_price else 0
    if recovery_pct < 0.75:
        return None  # 回升不够

    # 柄部检查：当前正在小幅回调
    current_price = float(close[-1])
    handle_pullback = (recovery_high - current_price) / recovery_high if recovery_high > 0 else 0
    if handle_pullback < 0.02 or handle_pullback > 0.12:
        return None  # 没回调或回调太深

    # 柄部时间<15天
    recovery_high_idx = bottom_idx_rel + int(np.argmax(post_bottom))
    handle_duration = lookback - 1 - recovery_high_idx
    if handle_duration > 15 or handle_duration < 2:
        return None

    # 柄部缩量
    handle_vol = float(np.mean(vol[-handle_duration:])) if handle_duration > 0 else 0
    cup_vol = float(np.mean(vol[-(lookback):-(lookback - bottom_idx_rel + rim_idx_rel)])) if bottom_idx_rel > rim_idx_rel else float(np.mean(vol))
    vol_ratio = handle_vol / cup_vol if cup_vol > 0 else 1

    confidence = 0.55
    if recovery_pct > 0.9:
        confidence += 0.1
    if vol_ratio < 0.7:
        confidence += 0.1
    if handle_pullback < 0.08:
        confidence += 0.05
    if cup_depth_pct > 0.2:
        confidence += 0.05

    if confidence < 0.6:
        return None

    # 关键价位
    breakout_level = rim_price
    cup_depth = rim_price - bottom_price
    target = breakout_level + cup_depth
    stop_loss = current_price * 0.95

    future_dates = _extrapolate_dates(dates, 15)
    handle_low = current_price * 0.98
    projected = [
        {"date": str(dates[-1]), "price": round(current_price, 2), "type": "current"},
    ]
    if len(future_dates) >= 3:
        projected.append({"date": future_dates[2], "price": round(handle_low, 2), "type": "handle_low"})
    if len(future_dates) >= 7:
        projected.append({"date": future_dates[6], "price": round(breakout_level, 2), "type": "breakout"})
    if len(future_dates) >= 14:
        projected.append({"date": future_dates[13], "price": round(target, 2), "type": "target"})

    rr = (target - current_price) / (current_price - stop_loss) if current_price > stop_loss else 0

    return {
        "pattern": "cupHandle",
        "label": "杯柄形态",
        "confidence": round(min(confidence, 0.95), 2),
        "phase": f"柄部回调中({handle_pullback*100:.1f}%)",
        "projectedPath": projected,
        "keyLevels": {
            "cupBottom": round(bottom_price, 2),
            "rim": round(rim_price, 2),
            "target": round(target, 2),
            "stopLoss": round(stop_loss, 2),
        },
        "action": {
            "entry": f"柄部企稳后轻仓，放量突破杯沿{rim_price:.2f}加仓",
            "stop": f"跌破{stop_loss:.2f}止损",
            "target": f"目标{target:.2f}（杯深等距投影）",
            "riskReward": round(rr, 1),
        },
    }


# ══════════════════════════════════════════════
#  3. 上升三角预测
# ══════════════════════════════════════════════

def predict_ascending_triangle(df: pd.DataFrame) -> dict[str, Any] | None:
    """
    条件:
    - 水平压力线：近40日内 >= 2次触及同一价位(±2%)
    - 抬升低点：至少2个依次抬升的低点
    - 当前价格在三角区间内（压力线下方5%以内）
    """
    df = _ensure_sorted(df)
    n = len(df)
    if n < 40:
        return None

    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    dates = df["trade_date"].values

    lookback = min(40, n)
    seg_high = high[-lookback:]
    seg_low = low[-lookback:]

    # 找水平压力：聚类高点
    swing_highs = _find_swing_highs(seg_high, window=3)
    if len(swing_highs) < 2:
        return None

    # 检查是否有水平压力（高点价格差<2%）
    resistance_candidates = []
    for i in range(len(swing_highs)):
        for j in range(i + 1, len(swing_highs)):
            p1 = swing_highs[i][1]
            p2 = swing_highs[j][1]
            if p1 > 0 and abs(p1 - p2) / p1 < 0.025:
                resistance_candidates.append((swing_highs[i], swing_highs[j]))

    if not resistance_candidates:
        return None

    # 取最强的压力（触及次数最多、最近的）
    best_pair = resistance_candidates[-1]  # 最近的
    resistance_price = (best_pair[0][1] + best_pair[1][1]) / 2

    # 找抬升低点
    swing_lows = _find_swing_lows(seg_low, window=3)
    if len(swing_lows) < 2:
        return None

    # 检查低点是否依次抬升
    rising_lows = []
    for idx, price in sorted(swing_lows):
        if not rising_lows or price > rising_lows[-1][1]:
            rising_lows.append((idx, price))

    if len(rising_lows) < 2:
        return None

    # 当前价格在三角区间内
    current_price = float(close[-1])
    dist_to_resistance = (resistance_price - current_price) / resistance_price if resistance_price > 0 else 999
    if dist_to_resistance < 0 or dist_to_resistance > 0.05:
        return None  # 已突破或距离太远

    # 支撑线斜率
    last_low = rising_lows[-1][1]
    support_line = last_low

    confidence = 0.55
    touch_count = len(resistance_candidates) + 1
    if touch_count >= 3:
        confidence += 0.1
    if len(rising_lows) >= 3:
        confidence += 0.1
    if dist_to_resistance < 0.02:
        confidence += 0.1  # 很接近压力线

    if confidence < 0.6:
        return None

    triangle_height = resistance_price - support_line
    target = resistance_price + triangle_height
    stop_loss = support_line * 0.97

    future_dates = _extrapolate_dates(dates, 10)
    projected = [
        {"date": str(dates[-1]), "price": round(current_price, 2), "type": "current"},
    ]
    if len(future_dates) >= 3:
        projected.append({"date": future_dates[2], "price": round(resistance_price, 2), "type": "breakout"})
    if len(future_dates) >= 8:
        projected.append({"date": future_dates[7], "price": round(target, 2), "type": "target"})

    rr = (target - current_price) / (current_price - stop_loss) if current_price > stop_loss else 0

    return {
        "pattern": "ascendingTriangle",
        "label": "上升三角",
        "confidence": round(min(confidence, 0.95), 2),
        "phase": f"逼近压力线（距{dist_to_resistance*100:.1f}%）",
        "projectedPath": projected,
        "keyLevels": {
            "resistance": round(resistance_price, 2),
            "support": round(support_line, 2),
            "target": round(target, 2),
            "stopLoss": round(stop_loss, 2),
        },
        "action": {
            "entry": f"放量突破{resistance_price:.2f}入场",
            "stop": f"跌破支撑{stop_loss:.2f}止损",
            "target": f"目标{target:.2f}（三角高度等距）",
            "riskReward": round(rr, 1),
        },
    }


# ══════════════════════════════════════════════
#  主入口
# ══════════════════════════════════════════════

def predict_patterns(df: pd.DataFrame) -> dict[str, Any]:
    """
    对单只股票运行所有形态预测器。
    只返回 confidence >= 0.6 的高概率预测。
    """
    if df is None or df.empty or len(df) < 40:
        return {"predictions": []}

    predictors = [
        predict_double_bottom,
        predict_cup_handle,
        predict_ascending_triangle,
    ]

    predictions = []
    for fn in predictors:
        try:
            result = fn(df)
            if result and result.get("confidence", 0) >= 0.6:
                predictions.append(result)
        except Exception as exc:
            logger.debug(f"预测异常 {fn.__name__}: {exc}")

    # 按置信度降序
    predictions.sort(key=lambda x: x["confidence"], reverse=True)

    return {"predictions": predictions}


def predict_patterns_for_precompute(engine: "MarketEngine", ts_code: str, trade_date: str) -> dict[str, Any]:
    """
    预计算用的入口 — 获取K线数据并运行预测。
    """
    try:
        kline = engine.stock_kline(ts_code, trade_date, bars=150)
        points = kline.get("points", [])
        if not points or len(points) < 40:
            return {"predictions": []}

        import pandas as _pd
        df = _pd.DataFrame(points)
        col_map = {"time": "trade_date", "o": "open", "h": "high", "l": "low", "c": "close", "v": "vol"}
        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})
        return predict_patterns(df)
    except Exception as exc:
        logger.debug(f"预测失败 {ts_code}: {exc}")
        return {"predictions": []}
