#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path
import ssl
import urllib.request

import pandas as pd
import requests

from config import init_logging
from market_data_store import MarketDataStore


def _to_ts_code(code: str) -> str:
    code = str(code).strip()
    if len(code) != 6 or not code.isdigit():
        return code
    if code.startswith(("4", "8")):
        return f"{code}.BJ"
    if code.startswith(("5", "6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def _safe_num(v) -> float:
    try:
        if v is None or (isinstance(v, str) and not v.strip()):
            return 0.0
        return float(v)
    except Exception:
        return 0.0


def _normalize_snapshot_df(df: pd.DataFrame, trade_date: str) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    code_col = "代码"
    open_col = "今开"
    high_col = "最高"
    low_col = "最低"
    close_col = "最新价"
    pre_close_col = "昨收"
    change_col = "涨跌额"
    pct_col = "涨跌幅"
    vol_col = "成交量"
    amount_col = "成交额"

    out = pd.DataFrame(
        {
            "ts_code": df[code_col].astype(str).map(_to_ts_code),
            "trade_date": trade_date,
            "open": df[open_col].map(_safe_num),
            "high": df[high_col].map(_safe_num),
            "low": df[low_col].map(_safe_num),
            "close": df[close_col].map(_safe_num),
            "pre_close": df[pre_close_col].map(_safe_num),
            "change": df[change_col].map(_safe_num),
            "pct_chg": df[pct_col].map(_safe_num),
            "vol": df[vol_col].map(_safe_num),
            "amount": df[amount_col].map(_safe_num),
        }
    )

    return out[
        (out["ts_code"].str.len() >= 9)
        & (out["open"] > 0)
        & (out["high"] > 0)
        & (out["low"] > 0)
        & (out["close"] > 0)
    ].reset_index(drop=True)


def fetch_snapshot(trade_date: str) -> pd.DataFrame:
    import akshare as ak

    try:
        return _normalize_snapshot_df(ak.stock_zh_a_spot_em(), trade_date)
    except (requests.RequestException, ConnectionError) as exc:
        print(f"[akshare] 东财源失败，切新浪源: {exc}")
    except Exception as exc:
        print(f"[akshare] 东财源异常，切新浪源: {exc}")

    try:
        return _normalize_snapshot_df(ak.stock_zh_a_spot(), trade_date)
    except Exception as exc:
        print(f"[akshare] 新浪源失败: {exc}")
        return pd.DataFrame()


def _ts_to_sina_code(ts_code: str) -> str:
    pure = ts_code.split(".")[0]
    suffix = ts_code.split(".")[-1] if "." in ts_code else ""
    if suffix == "SH":
        return f"sh{pure}"
    if suffix == "SZ":
        return f"sz{pure}"
    if suffix == "BJ":
        return f"bj{pure}"
    return ""


def _load_universe_from_cache(store: MarketDataStore) -> list[str]:
    keys = store.list_keys("stock_snapshot")
    if not keys:
        return []
    latest = keys[-1]
    df = store.get_frame("stock_snapshot", latest)
    if df is None or df.empty or "ts_code" not in df.columns:
        return []
    return sorted({str(x) for x in df["ts_code"].astype(str).tolist() if "." in str(x)})


def fetch_snapshot_from_sina_hq(trade_date: str, ts_codes: list[str]) -> pd.DataFrame:
    """兜底：直接抓新浪 hq 接口（批量）"""
    if not ts_codes:
        return pd.DataFrame()

    sina_to_ts: dict[str, str] = {}
    sina_codes: list[str] = []
    for tc in ts_codes:
        sc = _ts_to_sina_code(tc)
        if sc:
            sina_codes.append(sc)
            sina_to_ts[sc] = tc

    if not sina_codes:
        return pd.DataFrame()

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    rows: list[dict] = []

    for i in range(0, len(sina_codes), 80):
        batch = sina_codes[i : i + 80]
        url = f"https://hq.sinajs.cn/list={','.join(batch)}"
        req = urllib.request.Request(url, headers={"Referer": "https://finance.sina.com.cn"})
        try:
            resp = opener.open(req, timeout=10)
            data = resp.read().decode("gb2312", errors="replace")
        except Exception:
            continue

        for line in data.strip().split("\n"):
            if "=" not in line or '"' not in line:
                continue
            var_part = line.split("=")[0].strip()  # var hq_str_sh600519
            sina_code = var_part.split("_")[-1]
            fields = line.split('"')[1].split(",")
            if len(fields) < 32:
                continue
            ts_code = sina_to_ts.get(sina_code)
            if not ts_code:
                continue
            try:
                name = fields[0]
                open_p = float(fields[1])
                pre_close = float(fields[2])
                close_p = float(fields[3])
                high_p = float(fields[4])
                low_p = float(fields[5])
                vol = float(fields[8])
                amount = float(fields[9])
                change = close_p - pre_close
                pct = (change / pre_close * 100.0) if pre_close > 0 else 0.0
            except Exception:
                continue
            if open_p <= 0 or close_p <= 0 or high_p <= 0 or low_p <= 0:
                continue
            rows.append(
                {
                    "ts_code": ts_code,
                    "trade_date": trade_date,
                    "name": name,
                    "open": open_p,
                    "high": high_p,
                    "low": low_p,
                    "close": close_p,
                    "pre_close": pre_close,
                    "change": change,
                    "pct_chg": pct,
                    "vol": vol,
                    "amount": amount,
                }
            )

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="用 AKShare 抓取当日 A 股实时快照并落库到 market_cache.db")
    parser.add_argument("--trade-date", default="", help="交易日 YYYYMMDD，默认今天")
    parser.add_argument("--allow-proxy", action="store_true", help="允许使用系统代理（默认禁用）")
    args = parser.parse_args()

    if not args.allow_proxy:
        for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
            os.environ[k] = ""

    init_logging()
    trade_date = args.trade_date or datetime.now().strftime("%Y%m%d")
    store = MarketDataStore(Path(__file__).resolve().parent / "data" / "market_cache.db")

    snap = fetch_snapshot(trade_date)
    if snap.empty:
        universe = _load_universe_from_cache(store)
        if universe:
            print(f"[akshare] 进入新浪hq兜底，股票池={len(universe)}")
            snap = fetch_snapshot_from_sina_hq(trade_date, universe)

    if snap.empty:
        print(f"[akshare] 快照为空: {trade_date}")
        return 1

    store.set_frame("stock_snapshot", trade_date, snap)
    print(f"[akshare] 已写入 stock_snapshot: date={trade_date}, rows={len(snap)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
