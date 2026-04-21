"""
多因子评分引擎 — 替代 AI 审判

每日收盘后运行，对 RPS250 > 85 的候选股打分（满分 100）。
结果 push 到 D1 stock_scores 表。

用法:
  python scripts/scoring_engine.py

依赖:
  - 本地 market_cache.db 有最新日线数据
  - 已计算 RPS (rps_master)
  - 已运行 pattern_detector
"""

import os
import json
import sqlite3
import numpy as np
import requests
from pathlib import Path
from datetime import datetime, timedelta

WORKER_URL = os.environ.get("WORKER_URL", "http://127.0.0.1:8787")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "dev-token")
DATA_DIR = Path(__file__).parent.parent / "backend" / "data"
HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}


def get_db(name: str) -> sqlite3.Connection:
    conn = sqlite3.connect(DATA_DIR / name)
    conn.row_factory = sqlite3.Row
    return conn


def calc_rps250_all(trade_date: str) -> dict[str, float]:
    """计算全市场 RPS250（250日涨幅百分位排名）"""
    conn = get_db("market_cache.db")

    # 获取所有股票最近 250 个交易日的收盘价
    date_250 = (datetime.strptime(trade_date, "%Y%m%d") - timedelta(days=365)).strftime("%Y%m%d")

    rows = conn.execute("""
        SELECT ts_code,
               MAX(CASE WHEN trade_date = ? THEN close END) as close_now,
               MAX(CASE WHEN trade_date <= ? THEN close END) as close_250
        FROM daily_cache
        WHERE trade_date >= ?
        GROUP BY ts_code
        HAVING close_now IS NOT NULL AND close_250 IS NOT NULL
    """, (trade_date, date_250, date_250)).fetchall()
    conn.close()

    if not rows:
        return {}

    # 计算涨幅
    changes = []
    for r in rows:
        if r["close_250"] and r["close_250"] > 0:
            pct = (r["close_now"] - r["close_250"]) / r["close_250"] * 100
            changes.append((r["ts_code"], pct))

    # 排名 → 百分位
    changes.sort(key=lambda x: x[1])
    total = len(changes)
    rps_map = {}
    for rank, (ts_code, _) in enumerate(changes):
        rps_map[ts_code] = round((rank / total) * 100, 1)

    return rps_map


def get_rps_history(ts_code: str, days: int = 60) -> list[float]:
    """获取某只票最近 N 天的 RPS250 历史"""
    conn = get_db("market_cache.db")
    # 从已有的 precomputed 数据获取，如果没有则返回空
    conn.close()
    return []  # TODO: 接入实际 RPS 历史数据


def score_candidate(
    ts_code: str,
    rps250: float,
    rps50: float,
    rps250_min_60d: float,
    vol_shrink_ratio: float,
    pattern: str,
    handle_depth_ratio: float,
    cup_depth_ratio: float,
    ma120_250_gap: float,
    sector_resonant: bool,
    sector_rps_rank: float,
) -> dict:
    """
    多因子评分，满分 100

    Returns: {score, verdict, reasons}
    """
    s = 0
    reasons = []

    # 1. RPS250 强度（30分）
    if rps250 >= 95:
        s += 30
        reasons.append(f"RPS250={rps250}，顶级强度")
    elif rps250 >= 90:
        s += 20
        reasons.append(f"RPS250={rps250}，强势")
    elif rps250 >= 85:
        s += 10
        reasons.append(f"RPS250={rps250}，中等偏强")

    # 2. RPS250 抗跌性（15分）
    if rps250_min_60d >= 90:
        s += 15
        reasons.append(f"60日RPS最低{rps250_min_60d}，极抗跌")
    elif rps250_min_60d >= 85:
        s += 10
        reasons.append(f"60日RPS最低{rps250_min_60d}，较抗跌")
    elif rps250_min_60d >= 80:
        s += 5

    # 3. 缩量质量（15分）
    if vol_shrink_ratio < 0.3:
        s += 15
        reasons.append(f"极度缩量{vol_shrink_ratio:.2f}x，地量确认")
    elif vol_shrink_ratio < 0.5:
        s += 10
        reasons.append(f"明显缩量{vol_shrink_ratio:.2f}x")
    elif vol_shrink_ratio < 0.7:
        s += 5

    # 4. 形态质量（15分）
    if pattern == "cupHandle" and handle_depth_ratio < 0.33:
        s += 15
        reasons.append("标准杯柄，柄浅于杯身1/3")
    elif pattern == "doubleBottomH2":
        s += 14
        reasons.append("双底H2确认")
    elif pattern == "vcp":
        s += 12
        reasons.append("VCP波动收缩")
    elif pattern == "tightBase":
        s += 10
        reasons.append("紧密盘整")
    elif pattern:
        s += 8

    # 5. 均线收敛（10分）
    if ma120_250_gap < 0.02:
        s += 10
        reasons.append(f"MA120/250收敛{ma120_250_gap:.1%}，蓄势")
    elif ma120_250_gap < 0.05:
        s += 5
        reasons.append(f"MA120/250间距{ma120_250_gap:.1%}")

    # 6. 板块共振（15分）
    if sector_resonant:
        s += 10
        reasons.append("板块共振确认")
    if sector_rps_rank <= 0.2:
        s += 5
        reasons.append("板块强度前20%")
    elif sector_rps_rank <= 0.4:
        s += 2

    # 裁决
    if s >= 80:
        verdict = "强烈关注"
    elif s >= 60:
        verdict = "值得跟踪"
    elif s >= 40:
        verdict = "观望"
    else:
        verdict = "不符合"

    return {
        "score": s,
        "verdict": verdict,
        "reasons": reasons,
    }


def push_scores(trade_date: str, scores: list[dict]):
    """推送评分结果到 D1"""
    rows = []
    for item in scores:
        rows.append({
            "ts_code": item["ts_code"],
            "trade_date": trade_date,
            "score": item["score"],
            "verdict": item["verdict"],
            "reasons": json.dumps(item["reasons"], ensure_ascii=False),
            "rps250": item.get("rps250", 0),
            "rps50": item.get("rps50", 0),
            "vol_shrink_ratio": item.get("vol_shrink_ratio", 0),
            "pattern": item.get("pattern", ""),
            "distance_to_high": item.get("distance_to_high", 0),
        })

    resp = requests.post(
        f"{WORKER_URL}/api/push/stock_scores",
        headers=HEADERS,
        json={"rows": rows},
        timeout=30,
    )
    if resp.status_code == 200:
        print(f"Pushed {len(rows)} scores to D1")
    else:
        print(f"ERROR: {resp.text}")


def main():
    print("=" * 50)
    print("A数据 Scoring Engine")
    print("=" * 50)

    # TODO: 接入实际数据后完善
    # 1. 从本地 SQLite 读取最新交易日数据
    # 2. 计算 RPS250/RPS50
    # 3. 筛选 RPS250 > 85 的候选
    # 4. 对每只候选调用 score_candidate()
    # 5. push_scores() 到 D1

    print("Scoring engine ready. Connect to market_engine data to run.")


if __name__ == "__main__":
    main()
