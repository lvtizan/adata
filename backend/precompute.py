#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
预计算引擎 — 收盘后批量计算并存入 SQLite，API 查询变 <10ms。

用法:
  python3 precompute.py                # 自动检测最新交易日并计算
  python3 precompute.py 20260327       # 指定交易日

预计算内容:
  1. stock_concepts  — 股票→概念板块反向索引（消除逐板块查询瓶颈）
  2. stock_tags      — 个股标签（概念题材 + 资金属性 + 关联股）
  3. stock_attribution — 上涨归因
"""
from __future__ import annotations

import json
import logging
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from config import get_config, init_logging

logger = logging.getLogger("precompute")

DB_PATH = Path(__file__).parent / "data" / "precomputed.db"


# ═══════════════════════════════════════════════
#  SQLite 预计算存储
# ═══════════════════════════════════════════════

def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS stock_concepts (
            trade_date TEXT NOT NULL,
            ts_code    TEXT NOT NULL,
            concepts   TEXT NOT NULL,        -- JSON array: [{code, name, rps10}]
            updated_at TEXT NOT NULL,
            PRIMARY KEY (trade_date, ts_code)
        );
        CREATE TABLE IF NOT EXISTS stock_tags (
            trade_date TEXT NOT NULL,
            ts_code    TEXT NOT NULL,
            payload    TEXT NOT NULL,         -- JSON: full StockTagsResult
            updated_at TEXT NOT NULL,
            PRIMARY KEY (trade_date, ts_code)
        );
        CREATE TABLE IF NOT EXISTS stock_attribution (
            trade_date TEXT NOT NULL,
            ts_code    TEXT NOT NULL,
            payload    TEXT NOT NULL,         -- JSON: full AttributionResult
            updated_at TEXT NOT NULL,
            PRIMARY KEY (trade_date, ts_code)
        );
        CREATE TABLE IF NOT EXISTS stock_rs (
            trade_date  TEXT NOT NULL,
            ts_code     TEXT NOT NULL,
            sector_code TEXT NOT NULL,
            payload     TEXT NOT NULL,         -- JSON: full RelativeStrength result
            updated_at  TEXT NOT NULL,
            PRIMARY KEY (trade_date, ts_code)
        );
        CREATE INDEX IF NOT EXISTS idx_concepts_date ON stock_concepts(trade_date);
        CREATE INDEX IF NOT EXISTS idx_tags_date ON stock_tags(trade_date);
        CREATE INDEX IF NOT EXISTS idx_attr_date ON stock_attribution(trade_date);
        CREATE INDEX IF NOT EXISTS idx_rs_date ON stock_rs(trade_date);
    """)


def now_iso() -> str:
    return pd.Timestamp.now().isoformat(timespec="seconds")


# ═══════════════════════════════════════════════
#  Step 1: 股票→概念板块反向索引
# ═══════════════════════════════════════════════

def build_concept_reverse_index(engine: MarketEngine, trade_date: str) -> dict[str, list[dict]]:
    """
    一次性建立 {ts_code: [{code, name, rps10}, ...]} 反向索引。
    关键优化：只调 N 次 ths_member（N=板块数），而非 M 次（M=个股数）。
    """
    logger.info("构建概念反向索引...")
    sectors = engine.compute_sector_metrics(trade_date)
    if sectors is None or sectors.empty:
        logger.warning("板块指标为空，跳过反向索引")
        return {}

    reverse: dict[str, list[dict]] = {}
    total = len(sectors)
    done = 0

    def query_members(row_dict: dict) -> tuple[str, str, float, list[str]]:
        code = str(row_dict["ts_code"])
        name = str(row_dict.get("sector_name", ""))
        rps = float(row_dict.get("rps10", 0))
        try:
            members = engine.pro.ths_member(ts_code=code)
            if members is not None and not members.empty:
                codes = members["con_code"].dropna().unique().tolist()
                return code, name, rps, codes
        except Exception:
            pass
        return code, name, rps, []

    rows = sectors.to_dict("records")

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(query_members, r): r for r in rows}
        for future in as_completed(futures):
            done += 1
            try:
                code, name, rps, stock_codes = future.result()
                for sc in stock_codes:
                    if sc not in reverse:
                        reverse[sc] = []
                    reverse[sc].append({"code": code, "name": name, "rps10": round(rps, 1)})
            except Exception as exc:
                logger.debug(f"板块成员查询失败: {exc}")
            if done % 50 == 0:
                logger.info(f"  反向索引进度: {done}/{total}")

    # 每只股票的概念按 RPS 排序
    for sc in reverse:
        reverse[sc].sort(key=lambda x: x["rps10"], reverse=True)

    logger.info(f"反向索引完成: {len(reverse)} 只股票, {total} 个板块")
    return reverse


def save_concept_index(conn: sqlite3.Connection, trade_date: str, index: dict[str, list[dict]]) -> None:
    ts = now_iso()
    data = [(trade_date, sc, json.dumps(concepts, ensure_ascii=False), ts) for sc, concepts in index.items()]
    conn.executemany(
        "INSERT OR REPLACE INTO stock_concepts (trade_date, ts_code, concepts, updated_at) VALUES (?,?,?,?)",
        data,
    )
    conn.commit()
    logger.info(f"stock_concepts 写入 {len(data)} 条")


# ═══════════════════════════════════════════════
#  Step 2: 个股标签（利用反向索引，不再逐板块查）
# ═══════════════════════════════════════════════

def compute_stock_tags_batch(
    engine: MarketEngine,
    trade_date: str,
    concept_index: dict[str, list[dict]],
    stock_codes: list[str],
) -> dict[str, dict]:
    """批量计算个股标签，用反向索引取代逐板块 API 调用。"""
    logger.info(f"批量计算个股标签: {len(stock_codes)} 只...")
    name_map = engine.stock_name_map()

    # 预加载股票指标（一次性）
    stock_metrics = None
    try:
        stock_metrics = engine.compute_stock_metrics(trade_date)
    except Exception:
        pass

    results: dict[str, dict] = {}

    # 批量查龙虎榜（一次拉所有近60天数据）
    start_dt = (pd.Timestamp(trade_date) - pd.Timedelta(days=60)).strftime("%Y%m%d")
    top_list_cache: dict[str, pd.DataFrame] = {}
    top_inst_cache: dict[str, pd.DataFrame] = {}
    holder_cache: dict[str, pd.DataFrame] = {}

    # 预加载龙虎榜（批量比逐只快得多）
    logger.info("  预加载龙虎榜数据...")
    try:
        all_top = engine.pro.top_list(start_date=start_dt, end_date=trade_date)
        if all_top is not None and not all_top.empty:
            for code, group in all_top.groupby("ts_code"):
                top_list_cache[str(code)] = group
    except Exception as exc:
        logger.debug(f"龙虎榜批量加载失败: {exc}")

    try:
        all_inst = engine.pro.top_inst(start_date=start_dt, end_date=trade_date)
        if all_inst is not None and not all_inst.empty:
            for code, group in all_inst.groupby("ts_code"):
                top_inst_cache[str(code)] = group
    except Exception as exc:
        logger.debug(f"龙虎榜机构批量加载失败: {exc}")

    done = 0
    for ts_code in stock_codes:
        done += 1
        if done % 200 == 0:
            logger.info(f"  标签进度: {done}/{len(stock_codes)}")

        name = name_map.get(ts_code, ts_code)
        concepts = concept_index.get(ts_code, [])[:8]

        # ── 资金属性 ──
        capital_signals: list[str] = []
        fund_score = 0

        # 龙虎榜
        top_df = top_list_cache.get(ts_code)
        if top_df is not None and not top_df.empty:
            capital_signals.append(f"近期{len(top_df)}次登龙虎榜")
            fund_score -= 2

            inst_df = top_inst_cache.get(ts_code)
            if inst_df is not None and not inst_df.empty:
                if "exalter" in inst_df.columns:
                    inst_rows = inst_df[inst_df["exalter"].fillna("").str.contains("机构|基金", regex=True)]
                    if not inst_rows.empty:
                        net_buy = inst_rows["buy"].sum() - inst_rows["sell"].sum() if {"buy", "sell"}.issubset(inst_rows.columns) else 0
                        if net_buy > 0:
                            capital_signals.append("机构席位净买入")
                            fund_score += 3
                        else:
                            capital_signals.append("机构席位净卖出")
                            fund_score -= 1
                    hot_money_kw = ["华鑫", "东方财富", "国金", "天风", "国泰君安"]
                    hot_rows = inst_df[inst_df["exalter"].fillna("").str.contains("|".join(hot_money_kw), regex=True)]
                    if not hot_rows.empty:
                        capital_signals.append("知名游资席位活跃")
                        fund_score -= 2

        # 成交额特征
        if stock_metrics is not None and not stock_metrics.empty:
            row = stock_metrics[stock_metrics["ts_code"] == ts_code]
            if not row.empty:
                amt = float(row.iloc[0].get("amount", 0))
                if amt < 5e5:
                    fund_score -= 1
                elif amt > 2e6:
                    fund_score += 1

        if fund_score >= 3:
            capital_type = "基金重仓"
        elif fund_score <= -3:
            capital_type = "游资主导"
        elif capital_signals:
            capital_type = "混合"
        else:
            capital_type = "未知"

        # ── 关联股票（从最强概念板块提取）──
        related: list[dict] = []
        if concepts and stock_metrics is not None and not stock_metrics.empty:
            best_concept = concepts[0]
            # 从反向索引找同板块的股票
            peer_codes = [
                sc for sc, sc_concepts in concept_index.items()
                if sc != ts_code and any(c["code"] == best_concept["code"] for c in sc_concepts)
            ]
            if peer_codes:
                peers = stock_metrics[stock_metrics["ts_code"].isin(peer_codes[:50])].copy()
                if not peers.empty:
                    peers = peers.sort_values("ret5", ascending=False).head(6)
                    related = [
                        {
                            "tsCode": str(r["ts_code"]),
                            "name": name_map.get(str(r["ts_code"]), str(r["ts_code"])),
                            "ret5": round(float(r.get("ret5", 0)), 1),
                            "pctChg": round(float(r.get("pct_chg", 0)), 2),
                            "concept": best_concept["name"],
                        }
                        for _, r in peers.iterrows()
                    ]

        results[ts_code] = {
            "tsCode": ts_code,
            "stockName": name,
            "concepts": [{"code": c["code"], "name": c["name"], "rps10": c["rps10"]} for c in concepts],
            "capitalType": capital_type,
            "capitalDetail": "；".join(capital_signals) if capital_signals else "暂无数据",
            "relatedStocks": related,
        }

    logger.info(f"个股标签计算完成: {len(results)} 只")
    return results


# ═══════════════════════════════════════════════
#  Step 3: 上涨归因（批量版，复用已有数据）
# ═══════════════════════════════════════════════

def compute_attribution_batch(
    engine: MarketEngine,
    trade_date: str,
    concept_index: dict[str, list[dict]],
    stock_codes: list[str],
) -> dict[str, dict]:
    """批量计算上涨归因。"""
    logger.info(f"批量计算上涨归因: {len(stock_codes)} 只...")
    results: dict[str, dict] = {}
    done = 0
    for ts_code in stock_codes:
        done += 1
        if done % 100 == 0:
            logger.info(f"  归因进度: {done}/{len(stock_codes)}")
        try:
            # 复用 engine 现有方法（已有内存缓存，批量跑时不会重复查同一板块/指标）
            result = engine.stock_rise_attribution(ts_code, trade_date)
            if result.get("attribution"):
                results[ts_code] = result
            else:
                logger.warning(f"归因数据为空: {ts_code}, 可能所有子模块均失败")
        except Exception as exc:
            logger.warning(f"归因计算异常: {ts_code}, {exc}", exc_info=True)

    logger.info(f"上涨归因计算完成: {len(results)} 只")
    return results


# ═══════════════════════════════════════════════
#  保存
# ═══════════════════════════════════════════════

def save_tags(conn: sqlite3.Connection, trade_date: str, tags: dict[str, dict]) -> None:
    ts = now_iso()
    data = [(trade_date, sc, json.dumps(payload, ensure_ascii=False), ts) for sc, payload in tags.items()]
    conn.executemany(
        "INSERT OR REPLACE INTO stock_tags (trade_date, ts_code, payload, updated_at) VALUES (?,?,?,?)",
        data,
    )
    conn.commit()
    logger.info(f"stock_tags 写入 {len(data)} 条")


def save_attribution(conn: sqlite3.Connection, trade_date: str, attr: dict[str, dict]) -> None:
    ts = now_iso()
    data = [(trade_date, sc, json.dumps(payload, ensure_ascii=False), ts) for sc, payload in attr.items()]
    conn.executemany(
        "INSERT OR REPLACE INTO stock_attribution (trade_date, ts_code, payload, updated_at) VALUES (?,?,?,?)",
        data,
    )
    conn.commit()
    logger.info(f"stock_attribution 写入 {len(data)} 条")


# ═══════════════════════════════════════════════
#  查询接口（供 market_engine.py 使用）
# ═══════════════════════════════════════════════

class PrecomputedStore:
    """预计算数据的快速查询接口，所有方法 <10ms。"""

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DB_PATH
        if not self.db_path.exists():
            # 首次运行，创建空库
            conn = sqlite3.connect(self.db_path)
            init_db(conn)
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_stock_tags(self, ts_code: str, trade_date: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM stock_tags WHERE trade_date = ? AND ts_code = ?",
                (trade_date, ts_code),
            ).fetchone()
        if row:
            return json.loads(row["payload"])
        return None

    def get_stock_attribution(self, ts_code: str, trade_date: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM stock_attribution WHERE trade_date = ? AND ts_code = ?",
                (trade_date, ts_code),
            ).fetchone()
        if row:
            return json.loads(row["payload"])
        return None

    def get_stock_concepts(self, ts_code: str, trade_date: str) -> list[dict] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT concepts FROM stock_concepts WHERE trade_date = ? AND ts_code = ?",
                (trade_date, ts_code),
            ).fetchone()
        if row:
            return json.loads(row["concepts"])
        return None

    def has_data(self, trade_date: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM stock_tags WHERE trade_date = ?",
                (trade_date,),
            ).fetchone()
        return row["cnt"] > 0 if row else False

    def get_stock_rs(self, ts_code: str, trade_date: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM stock_rs WHERE trade_date = ? AND ts_code = ?",
                (trade_date, ts_code),
            ).fetchone()
        if row:
            return json.loads(row["payload"])
        return None

    def latest_date(self) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT trade_date FROM stock_tags ORDER BY trade_date DESC LIMIT 1"
            ).fetchone()
        return row["trade_date"] if row else None


# ═══════════════════════════════════════════════
#  主流程
# ═══════════════════════════════════════════════

def run(trade_date: str | None = None):
    init_logging()
    t0 = time.time()
    config = get_config()
    # 延迟导入避免循环依赖 (market_engine -> precompute -> market_engine)
    from market_engine import MarketEngine
    engine = MarketEngine(config)

    if trade_date is None:
        trade_date = engine.latest_data_trade_date()
    logger.info(f"═══ 预计算开始: {trade_date} ═══")

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    # 检查是否已计算过
    existing = conn.execute(
        "SELECT COUNT(*) as cnt FROM stock_tags WHERE trade_date = ?", (trade_date,)
    ).fetchone()
    if existing and existing[0] > 100:
        logger.info(f"交易日 {trade_date} 已有 {existing[0]} 条预计算数据，跳过")
        conn.close()
        return

    # Step 1: 反向索引
    concept_index = build_concept_reverse_index(engine, trade_date)
    save_concept_index(conn, trade_date, concept_index)

    # 确定需要计算的股票列表（有指标数据的活跃股票）
    try:
        metrics = engine.compute_stock_metrics(trade_date)
        active_codes = metrics["ts_code"].tolist() if metrics is not None and not metrics.empty else []
    except Exception:
        active_codes = list(concept_index.keys())

    if not active_codes:
        logger.warning("无活跃股票，跳过标签和归因计算")
        conn.close()
        return

    logger.info(f"活跃股票: {len(active_codes)} 只")

    # Step 2: 个股标签
    tags = compute_stock_tags_batch(engine, trade_date, concept_index, active_codes)
    save_tags(conn, trade_date, tags)

    # Step 3: 上涨归因（只算有标签的股票，约 top 500）
    # 全量归因太慢，优先算 RPS 前 500 + 自选股
    if metrics is not None and not metrics.empty:
        top_codes = metrics.sort_values("ret5", ascending=False).head(500)["ts_code"].tolist()
    else:
        top_codes = active_codes[:500]

    # 加入自选股
    try:
        from watchlist_store import WatchlistStore
        ws = WatchlistStore(Path(__file__).parent / "data" / "watchlist.db")
        watchlist_codes = [item["tsCode"] for item in ws.list_items() if "tsCode" in item]
        top_codes = list(set(top_codes + watchlist_codes))
    except Exception:
        pass

    attr = compute_attribution_batch(engine, trade_date, concept_index, top_codes)
    save_attribution(conn, trade_date, attr)

    # Step 4: RS 相对强度（自选股 + top 股票，需要板块信息）
    logger.info("批量计算 RS 相对强度...")
    rs_count = 0
    rs_codes = list(set(top_codes))  # 包含自选股
    ts = now_iso()
    for code in rs_codes:
        try:
            # 查该股票的板块
            sector_code = None
            concepts = concept_index.get(code, [])
            if concepts:
                sector_code = concepts[0].get("code")
            if not sector_code:
                try:
                    sector_info = engine.stock_sector(code)
                    sector_code = sector_info.get("sectorCode")
                except Exception:
                    pass
            if not sector_code:
                continue

            rs_result = engine.relative_strength(code, sector_code, trade_date)
            if rs_result:
                conn.execute(
                    "INSERT OR REPLACE INTO stock_rs (trade_date, ts_code, sector_code, payload, updated_at) VALUES (?,?,?,?,?)",
                    (trade_date, code, sector_code, json.dumps(rs_result, ensure_ascii=False), ts),
                )
                rs_count += 1
                if rs_count % 50 == 0:
                    conn.commit()
                    logger.info(f"  RS 进度: {rs_count}/{len(rs_codes)}")
        except Exception as exc:
            logger.debug(f"RS 计算失败: {code}, {exc}")
    conn.commit()
    logger.info(f"stock_rs 写入 {rs_count} 条")

    conn.close()
    elapsed = time.time() - t0
    logger.info(f"═══ 预计算完成: {trade_date}, 耗时 {elapsed:.0f}s ═══")


if __name__ == "__main__":
    td = sys.argv[1] if len(sys.argv) > 1 else None
    run(td)
