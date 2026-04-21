"""
智能同步：自动保证 D1 数据最新。

策略:
1. 查 Tushare 最新交易日
2. 尝试从 Tushare 拉日线
3. 如果 Tushare 还没更新当天数据 → 自动从新浪实时行情补
4. 更新 watchlist 表的价格/涨跌

用法:
  python scripts/smart_sync.py          # 同步自选股
"""

import os
import json
import requests
from datetime import datetime
from pathlib import Path

# ─── 配置 ───────────────────────────────────────────

_env = {}
_env_path = Path(__file__).parent.parent / "backend" / ".env"
if _env_path.exists():
    for line in open(_env_path):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            _env[k] = v

TUSHARE_TOKEN = _env.get("TUSHARE_TOKEN", "")
TUSHARE_URL = _env.get("TUSHARE_HTTP_URL", "https://api.tushare.pro")
WORKER_URL = os.environ.get("WORKER_URL", "https://a-data-api.bbtizan.workers.dev")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")

WH = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "A-Data-SmartSync/1.0",
}


# ─── Tushare API ────────────────────────────────────

def tushare_api(api_name: str, params: dict = None, fields: str = "") -> list[dict]:
    body = {"api_name": api_name, "token": TUSHARE_TOKEN, "params": params or {}, "fields": fields}
    r = requests.post(TUSHARE_URL, json=body, timeout=30)
    data = r.json()
    if data.get("code") != 0:
        raise Exception(f"Tushare: {data.get('msg', 'unknown')}")
    cols = data["data"]["fields"]
    return [dict(zip(cols, row)) for row in data["data"]["items"]]


def get_latest_trade_date() -> str:
    """从 Tushare 获取最新交易日（今天如果是交易日就返回今天）"""
    today = datetime.now().strftime("%Y%m%d")
    rows = tushare_api("trade_cal", {
        "exchange": "SSE", "is_open": "1",
        "start_date": today, "end_date": today,
    }, "cal_date")
    if rows:
        return rows[0]["cal_date"]
    # 今天不是交易日，取最近的交易日
    rows = tushare_api("trade_cal", {
        "exchange": "SSE", "is_open": "1",
        "end_date": today, "limit": 1,
    }, "cal_date")
    return rows[0]["cal_date"] if rows else today


# ─── 新浪实时行情 ──────────────────────────────────

def fetch_sina_realtime(ts_codes: list[str]) -> dict[str, dict]:
    """批量获取新浪实时行情，返回 {ts_code: quote}"""
    sina_map = {}
    sina_codes = []
    for tc in ts_codes:
        code = tc.split(".")[0]
        prefix = "sh" if tc.endswith(".SH") else "sz"
        sc = f"{prefix}{code}"
        sina_codes.append(sc)
        sina_map[sc] = tc

    codes_str = ",".join(sina_codes)
    try:
        r = requests.get(
            f"{WORKER_URL}/api/realtime/quotes?codes={codes_str}",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        quotes = r.json()
    except Exception as e:
        print(f"  新浪实时获取失败: {e}")
        return {}

    result = {}
    for q in quotes:
        tc = sina_map.get(q.get("code", ""), "")
        if tc and q.get("close", 0) > 0:
            result[tc] = q
    return result


# ─── D1 操作 ────────────────────────────────────────

def get_watchlist() -> list[dict]:
    r = requests.get(f"{WORKER_URL}/api/watchlist", headers=WH, timeout=10)
    data = r.json()
    return data.get("items", data) if isinstance(data, dict) else data


def get_d1_latest_date(ts_code: str) -> str:
    r = requests.get(f"{WORKER_URL}/api/stock/{ts_code}/daily?days=1", headers=WH, timeout=10)
    data = r.json()
    if isinstance(data, list) and data:
        return data[0].get("tradeDate", data[0].get("trade_date", ""))
    return ""


def push_daily_rows(rows: list[dict]):
    requests.post(f"{WORKER_URL}/api/push/stock_daily", headers=WH, json={"rows": rows}, timeout=15)


def update_watchlist_price(ts_code: str, close: float, pct_1d: float, pct_5d: float = 0, pct_10d: float = 0):
    requests.put(f"{WORKER_URL}/api/watchlist/{ts_code}", headers=WH, json={
        "close": close,
        "pct_change_1d": round(pct_1d, 2),
        "pct_change_5d": round(pct_5d, 2),
        "pct_change_10d": round(pct_10d, 2),
    }, timeout=10)


# ─── 主逻辑 ─────────────────────────────────────────

def main():
    now = datetime.now()
    print(f"Smart Sync — {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"Tushare: {TUSHARE_URL}")

    # 1. 获取最新交易日
    try:
        latest_td = get_latest_trade_date()
    except Exception as e:
        print(f"获取交易日历失败: {e}")
        latest_td = now.strftime("%Y%m%d")
    print(f"最新交易日: {latest_td}")

    is_today_trade = latest_td == now.strftime("%Y%m%d")
    print(f"今天是交易日: {'是' if is_today_trade else '否'}")

    # 2. 获取自选股
    watchlist = get_watchlist()
    ts_codes = [item.get("tsCode") or item.get("ts_code", "") for item in watchlist]
    ts_codes = [c for c in ts_codes if c]
    print(f"自选股: {len(ts_codes)} 只\n")

    # 3. 尝试从 Tushare 拉日线
    tushare_ok = {}  # {ts_code: [rows]}
    tushare_failed = []

    for tc in ts_codes:
        try:
            rows = tushare_api("daily", {"ts_code": tc, "limit": 10})
            if rows and rows[0]["trade_date"] == latest_td:
                tushare_ok[tc] = rows
            else:
                tushare_failed.append(tc)
                if rows:
                    # Tushare 有数据但不是最新的，先存进去
                    tushare_ok[tc] = rows
        except Exception as e:
            tushare_failed.append(tc)
            print(f"  {tc}: Tushare 错误 {e}")

    tushare_latest_date = ""
    if tushare_ok:
        first_rows = next(iter(tushare_ok.values()))
        tushare_latest_date = first_rows[0]["trade_date"]

    print(f"Tushare 最新日期: {tushare_latest_date or '无数据'}")
    print(f"Tushare 成功: {len(tushare_ok)}, 需要实时补充: {len(tushare_failed)}")

    # 4. Push Tushare 日线到 D1
    for tc, rows in tushare_ok.items():
        d1_rows = [{
            "ts_code": r["ts_code"], "trade_date": r["trade_date"],
            "open": r["open"], "high": r["high"], "low": r["low"],
            "close": r["close"], "vol": r["vol"], "amount": r["amount"],
            "pct_chg": r["pct_chg"],
        } for r in rows]
        push_daily_rows(d1_rows)

        # 更新 watchlist 价格
        latest = rows[0]
        close = latest["close"]
        pct_1d = latest["pct_chg"]
        pct_5d = round((close / rows[5]["close"] - 1) * 100, 2) if len(rows) >= 6 else 0
        pct_10d = round((close / rows[9]["close"] - 1) * 100, 2) if len(rows) >= 10 else 0
        update_watchlist_price(tc, close, pct_1d, pct_5d, pct_10d)

    # 5. Tushare 没有当天数据 → 新浪实时补充
    need_realtime = is_today_trade and tushare_latest_date != latest_td
    if need_realtime:
        print(f"\nTushare 尚未更新 {latest_td} 数据，从新浪实时补充...")
        rt_quotes = fetch_sina_realtime(ts_codes)
        for tc, q in rt_quotes.items():
            update_watchlist_price(tc, q["close"], q["pctChg"])
            name = q.get("name", tc)
            print(f"  {tc} {name}: ¥{q['close']} ({q['pctChg']:+.2f}%) [实时]")
        print(f"  实时补充: {len(rt_quotes)} 只")
    elif tushare_latest_date == latest_td:
        print(f"\nTushare 已是最新 ({latest_td})，无需实时补充")
    else:
        print(f"\n今天非交易日，无需实时补充")

    # 6. 汇总
    print(f"\n{'='*40}")
    for item in watchlist:
        tc = item.get("tsCode") or item.get("ts_code", "")
        name = item.get("stockName") or item.get("stock_name", "")
        rows = tushare_ok.get(tc, [])
        if rows:
            r = rows[0]
            src = "Tushare" if r["trade_date"] == latest_td else "Tushare(旧)+实时"
            print(f"  {name:8s} {tc}  ¥{r['close']:>8.2f}  {r['pct_chg']:+6.2f}%  [{src}]")
        else:
            print(f"  {name:8s} {tc}  [无数据]")
    print(f"{'='*40}")


if __name__ == "__main__":
    main()
