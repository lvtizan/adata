#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import time

import pandas as pd

from config import init_logging
from market_engine import MarketEngine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="回填过去 N 天的日线快照到本地 SQLite（market_cache.db）"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="回填自然日窗口，默认 365",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default="",
        help="结束日期 YYYYMMDD，默认使用最新交易日",
    )
    parser.add_argument(
        "--no-sector",
        action="store_true",
        help="只回填股票快照，不回填板块快照",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.15,
        help="每个交易日回填后休眠秒数，默认 0.15（降低频率限制风险）",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="全量模式：不依赖交易日历接口，按工作日遍历区间并自动跳过非交易日",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    init_logging()
    engine = MarketEngine()

    end_date = args.end_date or engine.latest_trade_date()
    start_date = (pd.Timestamp(end_date) - pd.Timedelta(days=max(args.days, 1))).strftime("%Y%m%d")

    if args.full:
        bdays = pd.bdate_range(start=pd.Timestamp(start_date), end=pd.Timestamp(end_date))
        target_dates = [d.strftime("%Y%m%d") for d in bdays]
    else:
        need = max(int(args.days * 2.5), 120)
        dates = engine.trade_dates(end_date, need=need)
        target_dates = [d for d in dates if start_date <= d <= end_date]
    if not target_dates:
        print(f"[backfill] 无可回填交易日: start={start_date}, end={end_date}")
        return 1

    print(
        f"[backfill] 开始回填: {len(target_dates)} 个交易日, "
        f"区间 {target_dates[0]} ~ {target_dates[-1]}, "
        f"包含板块={'否' if args.no_sector else '是'}, "
        f"模式={'全量工作日遍历' if args.full else '交易日历'}"
    )

    ok_stock = 0
    ok_sector = 0
    for i, d in enumerate(target_dates, 1):
        s = engine.stock_snapshot(d)
        if s is not None and not s.empty:
            ok_stock += 1

        if not args.no_sector:
            sec = engine.sector_snapshot(d)
            if sec is not None and not sec.empty:
                ok_sector += 1

        if i % 20 == 0 or i == len(target_dates):
            print(
                f"[backfill] {i}/{len(target_dates)} "
                f"stock_ok={ok_stock} "
                f"sector_ok={ok_sector if not args.no_sector else '-'}"
            )
        if args.sleep > 0:
            time.sleep(args.sleep)

    print(
        f"[backfill] 完成: stock={ok_stock}/{len(target_dates)}, "
        f"sector={ok_sector}/{len(target_dates) if not args.no_sector else '-'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
