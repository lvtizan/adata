#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
指数风险分析模块 — 基于 YTC 六步法的大盘 / 板块顶底风险预判。

YTC 六步法:
  1. 确定结构 (Structure)     — 关键支撑 / 阻力位
  2. 确定趋势 (Trend)         — HH/HL vs LH/LL 序列
  3. 趋势强弱 (Strength)      — 推动波 vs 回调波 动量对比
  4. 未来方向 (Direction)      — 综合 1-3 得出预判
  5. 价格预期 (Projection)    — 最可能的走势路径
  6. 机会区域 (Opportunity)   — 关键操作位

应用于用户日常跟踪的主要指数:
  大盘:  上证指数, 深证综指, 沪深300, 同花顺全A
  大中小: 上证50, 中证A500, 中证1000, 中证2000
  成长:  创业板指, 科创50
  港股:  恒生科技指数
  情绪:  宽基ETF, 近期新高, A股平均股价
  外盘:  富时A50
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── 用户跟踪的指数清单 ──
# tushare index_daily 使用 ts_code 格式
# 部分同花顺特有指数用 ths_daily / thindex_daily
TRACKED_INDICES = [
    # ── 大盘 ──
    {"ts_code": "000001.SH", "name": "上证指数",   "group": "大盘", "asset": "I"},
    {"ts_code": "399106.SZ", "name": "深证综指",   "group": "大盘", "asset": "I"},
    {"ts_code": "000300.SH", "name": "沪深300",    "group": "大盘", "asset": "I"},
    {"ts_code": "883421.TI", "name": "同花顺全A",  "group": "大盘", "asset": "THS"},
    # ── 大中小 ──
    {"ts_code": "000016.SH", "name": "上证50",     "group": "大中小", "asset": "I"},
    {"ts_code": "000852.SH", "name": "中证1000",   "group": "大中小", "asset": "I"},
    {"ts_code": "932000.CSI","name": "中证2000",   "group": "大中小", "asset": "I"},
    # ── 成长 ──
    {"ts_code": "399006.SZ", "name": "创业板指",   "group": "成长",  "asset": "I"},
    {"ts_code": "000688.SH", "name": "科创50",     "group": "成长",  "asset": "I"},
    # ── 情绪 ──
    {"ts_code": "883307.TI", "name": "宽基ETF",    "group": "情绪",  "asset": "THS"},
    {"ts_code": "883408.TI", "name": "近期新高",   "group": "情绪",  "asset": "THS"},
    {"ts_code": "830000.TI", "name": "A股平均股价", "group": "情绪",  "asset": "THS"},
    # ── 港股 ──
    {"ts_code": "HSTECH.HI", "name": "恒生科技",   "group": "港股",  "asset": "HK"},
]


def _find_swing_highs(high: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    peaks = []
    for i in range(window, len(high) - window):
        if high[i] == np.max(high[i - window:i + window + 1]):
            peaks.append((i, float(high[i])))
    return peaks


def _find_swing_lows(low: np.ndarray, window: int = 5) -> list[tuple[int, float]]:
    troughs = []
    for i in range(window, len(low) - window):
        if low[i] == np.min(low[i - window:i + window + 1]):
            troughs.append((i, float(low[i])))
    return troughs


# ═══════════════════════════════════════════
# Step 1: 确定结构 — 支撑 / 阻力区域
# ═══════════════════════════════════════════
def _analyze_structure(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                       dates: np.ndarray | None = None,
                       tolerance: float = 0.03) -> dict[str, Any]:
    """
    对指数使用更小的聚类容差 (3% vs 个股的 5%)，因为指数波动率更小。
    返回: supports[], resistances[], 当前价格相对位置 (positionInRange)
    """
    swing_highs = _find_swing_highs(high, window=7)
    swing_lows = _find_swing_lows(low, window=7)

    def _cluster(points: list[tuple[int, float]], tol: float) -> list[dict]:
        if not points:
            return []
        sorted_pts = sorted(points, key=lambda x: x[1])
        clusters: list[list[tuple[int, float]]] = []
        cur = [sorted_pts[0]]
        for i in range(1, len(sorted_pts)):
            _, prev_p = sorted_pts[i - 1]
            _, curr_p = sorted_pts[i]
            if prev_p > 0 and abs(curr_p - prev_p) / prev_p <= tol:
                cur.append(sorted_pts[i])
            else:
                clusters.append(cur)
                cur = [sorted_pts[i]]
        clusters.append(cur)

        result = []
        for cl in clusters:
            prices = [p for _, p in cl]
            indices = [idx for idx, _ in cl]
            result.append({
                "price": round(float(np.mean(prices)), 2),
                "count": len(cl),
                "indices": indices,
                "lastIndex": max(indices),
                "zone": [round(float(min(prices)), 2), round(float(max(prices)), 2)],
            })
        return result

    sup_clusters = _cluster(swing_lows, tolerance)
    res_clusters = _cluster(swing_highs, tolerance)

    current_price = float(close[-1]) if len(close) > 0 else 0
    # 只保留 count >= 2 的强支撑/阻力，否则回退到最近 swing
    strong_supports = [s for s in sup_clusters if s["count"] >= 2 and s["price"] < current_price * 1.02]
    strong_resistances = [r for r in res_clusters if r["count"] >= 2 and r["price"] > current_price * 0.98]

    if not strong_supports and swing_lows:
        recent = sorted(swing_lows, key=lambda x: x[0], reverse=True)[:2]
        for idx, val in recent:
            strong_supports.append({"price": round(val, 2), "count": 1, "indices": [idx],
                                    "lastIndex": idx, "zone": [round(val, 2), round(val, 2)]})
    if not strong_resistances and swing_highs:
        recent = sorted(swing_highs, key=lambda x: x[0], reverse=True)[:2]
        for idx, val in recent:
            strong_resistances.append({"price": round(val, 2), "count": 1, "indices": [idx],
                                       "lastIndex": idx, "zone": [round(val, 2), round(val, 2)]})

    strong_supports.sort(key=lambda x: x["price"], reverse=True)  # 从高到低
    strong_resistances.sort(key=lambda x: x["price"])  # 从低到高

    # 当前价格在 S/R 区间中的位置 (0=底, 1=顶)
    lowest_sup = strong_supports[-1]["price"] if strong_supports else current_price * 0.95
    highest_res = strong_resistances[-1]["price"] if strong_resistances else current_price * 1.05
    price_range = highest_res - lowest_sup
    position = (current_price - lowest_sup) / price_range if price_range > 0 else 0.5
    position = max(0.0, min(1.0, position))

    return {
        "supports": strong_supports[:3],
        "resistances": strong_resistances[:3],
        "positionInRange": round(position, 2),
        "nearSupport": position < 0.25,
        "nearResistance": position > 0.75,
        "swingHighCount": len(swing_highs),
        "swingLowCount": len(swing_lows),
    }


# ═══════════════════════════════════════════
# Step 2: 确定趋势 — HH/HL vs LH/LL 序列
# ═══════════════════════════════════════════
def _analyze_trend(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                   dates: np.ndarray | None = None) -> dict[str, Any]:
    """
    基于最近 N 个 swing point 的序列判定趋势状态。
    HH + HL = uptrend, LH + LL = downtrend, 混合 = sideways
    """
    swing_highs = _find_swing_highs(high, window=7)
    swing_lows = _find_swing_lows(low, window=7)

    # 取最近 6 个 swing point 来判断趋势
    recent_highs = sorted(swing_highs, key=lambda x: x[0])[-4:] if len(swing_highs) >= 2 else swing_highs
    recent_lows = sorted(swing_lows, key=lambda x: x[0])[-4:] if len(swing_lows) >= 2 else swing_lows

    hh_count = 0  # Higher High 计数
    lh_count = 0  # Lower High 计数
    hl_count = 0  # Higher Low 计数
    ll_count = 0  # Lower Low 计数

    for i in range(1, len(recent_highs)):
        if recent_highs[i][1] > recent_highs[i - 1][1]:
            hh_count += 1
        elif recent_highs[i][1] < recent_highs[i - 1][1]:
            lh_count += 1

    for i in range(1, len(recent_lows)):
        if recent_lows[i][1] > recent_lows[i - 1][1]:
            hl_count += 1
        elif recent_lows[i][1] < recent_lows[i - 1][1]:
            ll_count += 1

    # 趋势判定
    up_score = hh_count + hl_count
    down_score = lh_count + ll_count

    if up_score >= 2 and up_score > down_score:
        trend = "uptrend"
        trend_cn = "上升趋势"
    elif down_score >= 2 and down_score > up_score:
        trend = "downtrend"
        trend_cn = "下降趋势"
    else:
        trend = "sideways"
        trend_cn = "横盘震荡"

    # MA 辅助验证
    ma20 = pd.Series(close).rolling(20).mean().iloc[-1] if len(close) >= 20 else close[-1]
    ma60 = pd.Series(close).rolling(60).mean().iloc[-1] if len(close) >= 60 else close[-1]
    current = float(close[-1])
    ma_alignment = "bullish" if current > ma20 > ma60 else ("bearish" if current < ma20 < ma60 else "mixed")

    return {
        "trend": trend,
        "trendCn": trend_cn,
        "hhCount": hh_count,
        "lhCount": lh_count,
        "hlCount": hl_count,
        "llCount": ll_count,
        "upScore": up_score,
        "downScore": down_score,
        "maAlignment": ma_alignment,
        "aboveMa20": bool(current > ma20),
        "aboveMa60": bool(current > ma60),
    }


# ═══════════════════════════════════════════
# Step 3: 趋势强弱 — 推动波 vs 回调波 动量对比
# ═══════════════════════════════════════════
def _analyze_strength(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                      vol: np.ndarray | None = None) -> dict[str, Any]:
    """
    比较最近 2-3 波推动波和回调波的:
      - 价格幅度 (amplitude)
      - 持续天数 (duration)
      - 成交量变化 (volume)
    如果推动波缩短 + 回调波加深 → 趋势衰弱
    """
    swing_highs = _find_swing_highs(high, window=7)
    swing_lows = _find_swing_lows(low, window=7)

    # 合并并排序所有 swing points
    all_swings = [(idx, val, "H") for idx, val in swing_highs] + \
                 [(idx, val, "L") for idx, val in swing_lows]
    all_swings.sort(key=lambda x: x[0])

    # 消除连续同向 swing，保留交替序列
    alternating = []
    for sw in all_swings:
        if not alternating or alternating[-1][2] != sw[2]:
            alternating.append(sw)
        else:
            # 同向：保留更极端的
            if sw[2] == "H" and sw[1] > alternating[-1][1]:
                alternating[-1] = sw
            elif sw[2] == "L" and sw[1] < alternating[-1][1]:
                alternating[-1] = sw

    impulse_waves = []  # 推动波 (with-trend leg)
    correction_waves = []  # 回调波 (counter-trend leg)

    for i in range(1, len(alternating)):
        prev_idx, prev_val, prev_type = alternating[i - 1]
        curr_idx, curr_val, curr_type = alternating[i]
        amplitude = abs(curr_val - prev_val) / prev_val * 100 if prev_val > 0 else 0
        duration = curr_idx - prev_idx

        avg_vol = float(np.mean(vol[prev_idx:curr_idx + 1])) if vol is not None and curr_idx > prev_idx else 0

        wave = {
            "amplitude": round(amplitude, 2),
            "duration": duration,
            "avgVol": round(avg_vol, 0),
            "fromIdx": prev_idx,
            "toIdx": curr_idx,
            "direction": "up" if curr_val > prev_val else "down",
        }

        # 判断是推动波还是回调波
        if curr_type == "H":
            impulse_waves.append(wave)
        else:
            correction_waves.append(wave)

    # 分析最近 2 波推动/回调的变化趋势
    weakening = False
    strengthening = False
    detail = "数据不足"

    if len(impulse_waves) >= 2 and len(correction_waves) >= 1:
        last_impulse = impulse_waves[-1]
        prev_impulse = impulse_waves[-2]
        last_correction = correction_waves[-1]

        impulse_shrinking = last_impulse["amplitude"] < prev_impulse["amplitude"] * 0.8
        correction_growing = False
        if len(correction_waves) >= 2:
            correction_growing = correction_waves[-1]["amplitude"] > correction_waves[-2]["amplitude"] * 1.2

        if impulse_shrinking and correction_growing:
            weakening = True
            detail = "推动波缩短 + 回调波加深 → 趋势明显衰弱"
        elif impulse_shrinking:
            weakening = True
            detail = "推动波幅度缩短 → 趋势动力减弱"
        elif correction_growing:
            detail = "回调波加深 → 趋势可能接近拐点"
        else:
            if last_impulse["amplitude"] > prev_impulse["amplitude"] * 1.2:
                strengthening = True
                detail = "推动波加速 → 趋势强化中"
            else:
                detail = "推动波与回调波均衡 → 趋势维持"

    return {
        "weakening": weakening,
        "strengthening": strengthening,
        "detail": detail,
        "impulseWaves": impulse_waves[-3:] if impulse_waves else [],
        "correctionWaves": correction_waves[-3:] if correction_waves else [],
    }


# ═══════════════════════════════════════════
# Step 4-6: 综合判定 + 风险评级
# ═══════════════════════════════════════════
def _compute_risk_verdict(structure: dict, trend: dict, strength: dict) -> dict[str, Any]:
    """
    综合 Step 1-3 的结论，输出:
      - riskLevel: 1-5 (1=极低, 5=极高)
      - riskLabel: 中文风险标签
      - signal: "见顶风险" / "见底机会" / "趋势延续" / "震荡观望"
      - projection: 最可能的走势路径描述
      - opportunityZone: 关键操作位描述
    """
    risk_score = 0  # 0-100, 越高 = 顶部风险越大

    # ── Structure 评分 ──
    pos = structure["positionInRange"]
    if pos > 0.85:
        risk_score += 30  # 非常接近阻力顶部
    elif pos > 0.70:
        risk_score += 20
    elif pos < 0.15:
        risk_score -= 15  # 底部区域，风险反而小
    elif pos < 0.30:
        risk_score -= 5

    # ── Trend 评分 ──
    if trend["trend"] == "uptrend":
        risk_score += 5   # 上升趋势本身不是风险，但如果在顶部就是
        if pos > 0.75:
            risk_score += 10  # 上升趋势 + 接近阻力 = 额外风险
    elif trend["trend"] == "downtrend":
        risk_score += 15  # 下降趋势 = 风险偏高
        if pos > 0.50:
            risk_score += 10  # 下降趋势但还在高位 = 可能继续跌
    # MA 对齐
    if trend["maAlignment"] == "bearish":
        risk_score += 10
    elif trend["maAlignment"] == "bullish":
        risk_score -= 5

    # ── Strength 评分 ──
    if strength["weakening"]:
        risk_score += 20  # 趋势衰弱 → 风险加大
    if strength["strengthening"]:
        risk_score -= 10  # 趋势强化 → 风险降低

    # 归一化到 0-100
    risk_score = max(0, min(100, risk_score + 40))  # base 40

    # 风险等级
    if risk_score >= 80:
        level, label, tone = 5, "极高风险", "danger"
    elif risk_score >= 65:
        level, label, tone = 4, "高风险", "danger"
    elif risk_score >= 45:
        level, label, tone = 3, "中等风险", "warning"
    elif risk_score >= 30:
        level, label, tone = 2, "低风险", "positive"
    else:
        level, label, tone = 1, "极低风险", "positive"

    # 信号判定
    signal = "趋势延续"
    if risk_score >= 70 and strength["weakening"]:
        signal = "见顶风险"
    elif risk_score >= 65 and structure["nearResistance"]:
        signal = "逼近压力"
    elif risk_score <= 30 and structure["nearSupport"]:
        signal = "见底机会"
    elif risk_score <= 35 and trend["trend"] == "uptrend" and strength["strengthening"]:
        signal = "强势上攻"
    elif trend["trend"] == "sideways":
        signal = "震荡观望"

    # 走势预判
    if signal == "见顶风险":
        projection = "动量衰竭接近阻力区，大概率出现回调或横盘消化"
    elif signal == "逼近压力":
        projection = "接近关键阻力区，注意放量突破或缩量回落的分歧"
    elif signal == "见底机会":
        projection = "接近支撑区且下跌动量减弱，关注企稳反弹信号"
    elif signal == "强势上攻":
        projection = "趋势强化中，回调幅度有限，新高可期"
    elif signal == "震荡观望":
        projection = "多空力量均衡，等待方向选择突破"
    else:
        projection = "当前趋势大概率延续，关注波段节奏"

    # 关键操作位
    sup_price = structure["supports"][0]["price"] if structure["supports"] else None
    res_price = structure["resistances"][0]["price"] if structure["resistances"] else None
    opp_parts = []
    if sup_price:
        opp_parts.append(f"支撑 {sup_price}")
    if res_price:
        opp_parts.append(f"压力 {res_price}")
    opportunity = " / ".join(opp_parts) if opp_parts else "暂无明确关键位"

    return {
        "riskScore": risk_score,
        "riskLevel": level,
        "riskLabel": label,
        "tone": tone,
        "signal": signal,
        "signalDetail": strength["detail"],
        "projection": projection,
        "opportunityZone": opportunity,
    }


def analyze_single_index(pro, index_info: dict, trade_date: str, bars: int = 120) -> dict[str, Any]:
    """
    对单个指数执行 YTC 六步分析。

    参数:
      pro: tushare pro API 实例
      index_info: TRACKED_INDICES 中的一项
      trade_date: 分析截止日期 (YYYYMMDD)
      bars: K 线根数
    """
    ts_code = index_info["ts_code"]
    asset = index_info["asset"]
    name = index_info["name"]
    group = index_info["group"]

    try:
        # 获取日线数据
        start_date = (pd.Timestamp(trade_date) - pd.Timedelta(days=int(bars * 1.8))).strftime("%Y%m%d")

        if asset == "THS":
            # 同花顺特有指数
            df = pro.ths_daily(ts_code=ts_code, start_date=start_date, end_date=trade_date)
        elif asset == "HK":
            # 港股指数 - 用 index_global 或 hk_daily
            try:
                df = pro.index_global(ts_code=ts_code, start_date=start_date, end_date=trade_date)
            except Exception:
                logger.warning(f"港股指数 {ts_code} 全球指数接口失败，尝试备选")
                df = None
        else:
            # A 股常规指数
            df = pro.index_daily(ts_code=ts_code, start_date=start_date, end_date=trade_date)

        if df is None or df.empty:
            logger.warning(f"指数 {name}({ts_code}) 无数据")
            return _empty_result(index_info)

        df = df.sort_values("trade_date").reset_index(drop=True)
        df = df.tail(bars)

        high = df["high"].values.astype(float)
        low = df["low"].values.astype(float)
        close = df["close"].values.astype(float)
        vol = df["vol"].values.astype(float) if "vol" in df.columns else None
        dates = df["trade_date"].values

        if len(close) < 30:
            logger.warning(f"指数 {name} 数据不足 30 根: {len(close)}")
            return _empty_result(index_info)

        # ── YTC 六步分析 ──
        structure = _analyze_structure(high, low, close, dates)
        trend = _analyze_trend(high, low, close, dates)
        strength_result = _analyze_strength(high, low, close, vol)
        verdict = _compute_risk_verdict(structure, trend, strength_result)

        # 当前指标
        current_price = float(close[-1])
        prev_close = float(close[-2]) if len(close) >= 2 else current_price
        pct_chg = round((current_price - prev_close) / prev_close * 100, 2) if prev_close > 0 else 0
        ret5 = round((current_price / float(close[-6]) - 1) * 100, 2) if len(close) >= 6 else 0
        ret20 = round((current_price / float(close[-21]) - 1) * 100, 2) if len(close) >= 21 else 0

        return {
            "tsCode": ts_code,
            "name": name,
            "group": group,
            "price": round(current_price, 2),
            "pctChg": pct_chg,
            "ret5": ret5,
            "ret20": ret20,
            # YTC 分析结果
            "structure": structure,
            "trend": trend,
            "strength": strength_result,
            "verdict": verdict,
        }

    except Exception as exc:
        logger.warning(f"分析指数 {name}({ts_code}) 失败: {exc}")
        return _empty_result(index_info)


def _empty_result(index_info: dict) -> dict[str, Any]:
    return {
        "tsCode": index_info["ts_code"],
        "name": index_info["name"],
        "group": index_info["group"],
        "price": 0,
        "pctChg": 0,
        "ret5": 0,
        "ret20": 0,
        "structure": {"supports": [], "resistances": [], "positionInRange": 0.5,
                       "nearSupport": False, "nearResistance": False,
                       "swingHighCount": 0, "swingLowCount": 0},
        "trend": {"trend": "unknown", "trendCn": "数据不足",
                  "hhCount": 0, "lhCount": 0, "hlCount": 0, "llCount": 0,
                  "upScore": 0, "downScore": 0,
                  "maAlignment": "unknown", "aboveMa20": False, "aboveMa60": False},
        "strength": {"weakening": False, "strengthening": False, "detail": "数据不足",
                     "impulseWaves": [], "correctionWaves": []},
        "verdict": {"riskScore": 50, "riskLevel": 3, "riskLabel": "数据不足",
                    "tone": "neutral", "signal": "数据不足",
                    "signalDetail": "数据不足", "projection": "暂无",
                    "opportunityZone": "暂无"},
    }


def analyze_all_indices(pro, trade_date: str, bars: int = 120) -> dict[str, Any]:
    """
    分析所有跟踪指数，返回:
      - indices: 各指数的 YTC 分析结果
      - summary: 市场整体风险综合
    """
    results = []
    for idx_info in TRACKED_INDICES:
        result = analyze_single_index(pro, idx_info, trade_date, bars)
        results.append(result)

    # ── 综合风险汇总 ──
    valid = [r for r in results if r["verdict"]["riskScore"] > 0]
    if valid:
        avg_risk = np.mean([r["verdict"]["riskScore"] for r in valid])
        # 分组风险
        groups = {}
        for r in valid:
            g = r["group"]
            if g not in groups:
                groups[g] = []
            groups[g].append(r["verdict"]["riskScore"])
        group_risks = {g: round(float(np.mean(scores)), 1) for g, scores in groups.items()}

        # 见顶/见底信号统计
        top_signals = sum(1 for r in valid if r["verdict"]["signal"] in ("见顶风险", "逼近压力"))
        bottom_signals = sum(1 for r in valid if r["verdict"]["signal"] in ("见底机会",))
        strong_signals = sum(1 for r in valid if r["verdict"]["signal"] in ("强势上攻",))
        weakening_count = sum(1 for r in valid if r["strength"]["weakening"])
        uptrend_count = sum(1 for r in valid if r["trend"]["trend"] == "uptrend")
        downtrend_count = sum(1 for r in valid if r["trend"]["trend"] == "downtrend")

        # 整体判定
        if avg_risk >= 70:
            overall = "高风险区"
            overall_tone = "danger"
            advice = "多数指数接近压力区且动量衰弱，防守优先"
        elif avg_risk >= 55:
            overall = "偏高风险"
            overall_tone = "warning"
            advice = "部分指数显示衰弱信号，仓位适当收缩"
        elif avg_risk >= 40:
            overall = "中性"
            overall_tone = "neutral"
            advice = "市场处于均衡区间，跟随趋势但控制仓位"
        elif avg_risk >= 25:
            overall = "偏低风险"
            overall_tone = "positive"
            advice = "多数指数趋势向好，可积极布局"
        else:
            overall = "低风险区"
            overall_tone = "positive"
            advice = "底部区域信号明显，关注反弹机会"

        summary = {
            "avgRiskScore": round(float(avg_risk), 1),
            "overall": overall,
            "overallTone": overall_tone,
            "advice": advice,
            "groupRisks": group_risks,
            "topSignals": top_signals,
            "bottomSignals": bottom_signals,
            "strongSignals": strong_signals,
            "weakeningCount": weakening_count,
            "uptrendCount": uptrend_count,
            "downtrendCount": downtrend_count,
            "totalAnalyzed": len(valid),
        }
    else:
        summary = {
            "avgRiskScore": 50,
            "overall": "数据不足",
            "overallTone": "neutral",
            "advice": "指数数据获取失败，无法判断",
            "groupRisks": {},
            "topSignals": 0,
            "bottomSignals": 0,
            "strongSignals": 0,
            "weakeningCount": 0,
            "uptrendCount": 0,
            "downtrendCount": 0,
            "totalAnalyzed": 0,
        }

    return {
        "tradeDate": trade_date,
        "indices": results,
        "summary": summary,
    }
