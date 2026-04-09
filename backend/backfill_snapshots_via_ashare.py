#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import pandas as pd

from config import init_logging
from market_data_store import MarketDataStore
from ashare import get_price


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="用 Ashare（新浪/腾讯）按股票回补历史日线快照到 market_cache.db（补缺失交易日）"
    )
    p.add_argument("--days", type=int, default=365, help="回补自然日窗口，默认 365")
    p.add_argument("--end-date", type=str, default="", help="结束日期 YYYYMMDD，默认今天")
    p.add_argument("--workers", type=int, default=3, help="并发数，默认 3（过高易触发限流）")
    p.add_argument("--retry", type=int, default=2, help="单股票失败重试次数，默认 2")
    p.add_argument("--limit-stocks", type=int, default=0, help="仅处理前N只（调试用）")
    p.add_argument("--sleep-min", type=float, default=0.02, help="每次请求后最小休眠秒数")
    p.add_argument("--sleep-max", type=float, default=0.08, help="每次请求后最大休眠秒数")
    return p.parse_args()


def _to_ashare_code(ts_code: str) -> str:
    pure = ts_code.split(".")[0]
    suffix = ts_code.split(".")[-1] if "." in ts_code else ""
    if suffix == "SH":
        return f"sh{pure}"
    if suffix == "SZ":
        return f"sz{pure}"
    # BJ 先跳过（Ashare 对北交所稳定性较差）
    return ""


def _load_universe(store: MarketDataStore) -> list[str]:
    keys = store.list_keys("stock_snapshot")
    if not keys:
        return []
    latest_key = keys[-1]
    df = store.get_frame("stock_snapshot", latest_key)
    if df is None or df.empty or "ts_code" not in df.columns:
        return []
    universe = sorted({str(x) for x in df["ts_code"].astype(str).tolist() if "." in str(x)})
    return universe


def _calc_target_dates(end_date: str, days: int) -> list[str]:
    end_ts = pd.Timestamp(end_date)
    start_ts = end_ts - pd.Timedelta(days=max(days, 1))
    bdays = pd.bdate_range(start=start_ts, end=end_ts)
    return [d.strftime("%Y%m%d") for d in bdays]


def _fetch_one_stock(
    ts_code: str,
    end_date_fmt: str,
    max_count: int,
    target_dates: set[str],
    retry: int,
    sleep_min: float,
    sleep_max: float,
) -> list[tuple[str, dict[str, Any]]]:
    ashare_code = _to_ashare_code(ts_code)
    if not ashare_code:
        return []

    last_err: Exception | None = None
    for _ in range(max(1, retry + 1)):
        try:
            df = get_price(ashare_code, end_date=end_date_fmt, count=max_count, frequency="1d")
            if df is None or df.empty:
                return []
            df = df.sort_index().copy()
            if "close" not in df.columns:
                return []
            for c in ("open", "high", "low", "close", "volume"):
                if c not in df.columns:
                    return []

            df["pre_close"] = df["close"].shift(1)
            df["change"] = df["close"] - df["pre_close"]
            df["pct_chg"] = (df["change"] / df["pre_close"]) * 100.0

            out: list[tuple[str, dict[str, Any]]] = []
            for idx, r in df.iterrows():
                d = pd.Timestamp(idx).strftime("%Y%m%d")
                if d not in target_dates:
                    continue
                o = float(r["open"])
                h = float(r["high"])
                l = float(r["low"])
                c = float(r["close"])
                if o <= 0 or h <= 0 or l <= 0 or c <= 0:
                    continue
                pre_close = float(r["pre_close"]) if pd.notna(r["pre_close"]) else c
                change = float(r["change"]) if pd.notna(r["change"]) else 0.0
                pct = float(r["pct_chg"]) if pd.notna(r["pct_chg"]) else 0.0
                vol = float(r["volume"]) if pd.notna(r["volume"]) else 0.0
                out.append(
                    (
                        d,
                        {
                            "ts_code": ts_code,
                            "trade_date": d,
                            "open": o,
                            "high": h,
                            "low": l,
                            "close": c,
                            "pre_close": pre_close,
                            "change": change,
                            "pct_chg": pct,
                            "vol": vol,
                            "amount": 0.0,
                        },
                    )
                )

            time.sleep(random.uniform(max(0.0, sleep_min), max(sleep_min, sleep_max)))
            return out
        except Exception as exc:
            last_err = exc
            time.sleep(random.uniform(0.05, 0.2))

    if last_err is not None:
        return []
    return []


def main() -> int:
    args = parse_args()
    init_logging()

    # 强制去代理，避免 127.0.0.1:1082 拦截
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
        os.environ[k] = ""
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"

    backend = Path(__file__).resolve().parent
    store = MarketDataStore(backend / "data" / "market_cache.db")

    end_date = args.end_date or pd.Timestamp.now().strftime("%Y%m%d")
    target_dates = _calc_target_dates(end_date, args.days)
    existing_dates = set(store.list_keys("stock_snapshot"))
    missing_dates = [d for d in target_dates if d not in existing_dates]
    if not missing_dates:
        print(f"[ashare-backfill] 无缺失日期，已覆盖: {target_dates[0]} ~ {target_dates[-1]}")
        return 0

    universe = _load_universe(store)
    if args.limit_stocks and args.limit_stocks > 0:
        universe = universe[: args.limit_stocks]
    if not universe:
        print("[ashare-backfill] 股票池为空，无法回补")
        return 1

    print(
        f"[ashare-backfill] 开始: 股票池={len(universe)}, 缺失日期={len(missing_dates)} "
        f"({missing_dates[0]} ~ {missing_dates[-1]}), workers={args.workers}"
    )

    max_count = max(int(args.days * 1.8), 420)
    end_date_fmt = pd.Timestamp(end_date).strftime("%Y-%m-%d")
    target_date_set = set(missing_dates)

    rows_by_date: dict[str, list[dict[str, Any]]] = {d: [] for d in missing_dates}
    lock = threading.Lock()

    done = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        fut_map = {
            ex.submit(
                _fetch_one_stock,
                tc,
                end_date_fmt,
                max_count,
                target_date_set,
                args.retry,
                args.sleep_min,
                args.sleep_max,
            ): tc
            for tc in universe
        }
        for fut in as_completed(fut_map):
            rows = fut.result()
            if rows:
                with lock:
                    for d, item in rows:
                        if d in rows_by_date:
                            rows_by_date[d].append(item)
            done += 1
            if done % 200 == 0 or done == len(universe):
                print(f"[ashare-backfill] 股票进度: {done}/{len(universe)}")

    wrote = 0
    for d in missing_dates:
        rows = rows_by_date.get(d) or []
        if not rows:
            continue
        df = pd.DataFrame(rows)
        if df.empty:
            continue
        # 每个交易日去重（同 ts_code 保留最后一条）
        df = df.drop_duplicates(subset=["ts_code"], keep="last").reset_index(drop=True)
        store.set_frame("stock_snapshot", d, df)
        wrote += 1
        if wrote % 20 == 0 or wrote == len(missing_dates):
            print(f"[ashare-backfill] 已写入日期: {wrote}/{len(missing_dates)}")

    total_after = len(store.list_keys("stock_snapshot"))
    print(
        f"[ashare-backfill] 完成: 写入 {wrote}/{len(missing_dates)} 个缺失日期, "
        f"当前 stock_snapshot 日期总数={total_after}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
