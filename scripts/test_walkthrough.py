"""
A数据 云端部署走查测试

验证 Cloudflare Worker API + Pages 前端全链路可用性。
"""

import os
import sys
import json
import requests

WORKER_URL = os.environ.get("WORKER_URL", "https://a-data-api.bbtizan.workers.dev")
PAGES_URL = os.environ.get("PAGES_URL", "https://a-data-web.pages.dev")
TOKEN = os.environ.get("ACCESS_TOKEN", "")
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
}

passed = 0
failed = 0
errors = []


def test(name: str, fn):
    global passed, failed
    try:
        result = fn()
        if result:
            print(f"  PASS  {name}")
            passed += 1
        else:
            print(f"  FAIL  {name}")
            failed += 1
            errors.append(name)
    except Exception as e:
        print(f"  FAIL  {name} — {e}")
        failed += 1
        errors.append(f"{name}: {e}")


def get(path, auth=True):
    h = HEADERS if auth else {"User-Agent": "Mozilla/5.0"}
    r = requests.get(f"{WORKER_URL}{path}", headers=h, timeout=10)
    return r


def post(path, data):
    return requests.post(f"{WORKER_URL}{path}", headers=HEADERS, json=data, timeout=10)


# ─── 1. Pages 前端 ─────────────────────────────────────

print("\n[1] Pages 前端")

test("主页 200", lambda: requests.get(PAGES_URL, headers={"User-Agent": "Mozilla/5.0"}).status_code == 200)
test("主页包含 HTML", lambda: "<!doctype html>" in requests.get(PAGES_URL, headers={"User-Agent": "Mozilla/5.0"}).text.lower())
test("JS 资源可加载", lambda: requests.get(f"{PAGES_URL}/assets/index-BTisuRHo.js", headers={"User-Agent": "Mozilla/5.0"}).status_code == 200)
test("CSS 资源可加载", lambda: requests.get(f"{PAGES_URL}/assets/index-CHh4VQX3.css", headers={"User-Agent": "Mozilla/5.0"}).status_code == 200)
test("SPA 路由 fallback", lambda: "<!doctype html>" in requests.get(f"{PAGES_URL}/watchlist", headers={"User-Agent": "Mozilla/5.0"}).text.lower())

# ─── 2. Worker API 基础 ────────────────────────────────

print("\n[2] Worker API 基础")

test("/api/status 无需认证", lambda: get("/api/status", auth=False).status_code == 200)
test("/api/status 返回 ready", lambda: get("/api/status").json().get("ready") == True)
test("无 token 返回 401", lambda: requests.get(f"{WORKER_URL}/api/watchlist", headers={"User-Agent": "Mozilla/5.0"}).status_code == 401)
test("CORS preflight", lambda: requests.options(f"{WORKER_URL}/api/watchlist", headers={"User-Agent": "Mozilla/5.0", "Origin": PAGES_URL}).status_code == 204)

# ─── 3. 自选股 CRUD ────────────────────────────────────

print("\n[3] 自选股")

test("GET /api/watchlist 200", lambda: get("/api/watchlist").status_code == 200)
r = get("/api/watchlist")
watchlist = r.json() if r.status_code == 200 else []
test(f"自选股数量 = 14", lambda: len(watchlist) == 14)
test("自选股有 stock_name", lambda: all(w.get("stock_name") for w in watchlist))
test("自选股有 ts_code", lambda: all(w.get("ts_code") for w in watchlist))

# ─── 4. 画线数据 ───────────────────────────────────────

print("\n[4] 画线")

test("GET /api/drawings/300476.SZ 200", lambda: get("/api/drawings/300476.SZ").status_code == 200)
r = get("/api/drawings/300476.SZ")
test("画线返回 drawings 字段", lambda: "drawings" in r.json())

# ─── 5. 价格预警 ───────────────────────────────────────

print("\n[5] 预警")

test("GET /api/alerts 200", lambda: get("/api/alerts").status_code == 200)
alerts = get("/api/alerts").json()
test(f"预警数量 = 66", lambda: len(alerts) == 66)

# ─── 6. 交易计划 ───────────────────────────────────────

print("\n[6] 交易计划")

test("GET /api/trade-plans 200", lambda: get("/api/trade-plans").status_code == 200)
plans = get("/api/trade-plans").json()
test(f"交易计划数量 = 2", lambda: len(plans) == 2)

# ─── 7. 行情数据 ───────────────────────────────────────

print("\n[7] 行情数据")

test("GET /api/stock/301292.SZ/daily 200", lambda: get("/api/stock/301292.SZ/daily?days=5").status_code == 200)
daily = get("/api/stock/301292.SZ/daily?days=5").json()
test("日线有 5 条", lambda: len(daily) == 5)
test("日线包含 OHLC", lambda: all(k in daily[0] for k in ["open", "high", "low", "close"]))

# ─── 8. 知识数据 ───────────────────────────────────────

print("\n[8] 知识数据")

test("GET /api/stock/300476.SZ/profile 200", lambda: get("/api/stock/300476.SZ/profile").status_code == 200)
profile = get("/api/stock/300476.SZ/profile").json()
test("one_liner 不为空", lambda: bool(profile.get("one_liner")))
test("core_clients 不为空", lambda: bool(profile.get("core_clients")))

test("GET /api/search?q=PCB 200", lambda: get("/api/search?q=PCB").status_code == 200)
search = get("/api/search?q=PCB").json()
test("搜索到板块", lambda: len(search.get("sectors", [])) > 0)

# ─── 9. 实时行情代理 ──────────────────────────────────

print("\n[9] 实时行情")

test("GET /api/realtime/quotes 200", lambda: get("/api/realtime/quotes?codes=sh000001", auth=False).status_code == 200)
rt = get("/api/realtime/quotes?codes=sh000001", auth=False)
if rt.status_code == 200:
    quotes = rt.json()
    test("返回行情数组", lambda: isinstance(quotes, list))
    if quotes:
        test("包含 name 字段", lambda: "name" in quotes[0])
        test("包含 close 字段", lambda: "close" in quotes[0])

# ─── 10. 跨域测试（模拟浏览器请求）─────────────────────

print("\n[10] CORS 跨域")

cors_headers = {
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://a-data-web.pages.dev",
    "Authorization": f"Bearer {TOKEN}",
}
r = requests.get(f"{WORKER_URL}/api/watchlist", headers=cors_headers)
test("带 Origin 请求 200", lambda: r.status_code == 200)
test("响应包含 ACAO header", lambda: r.headers.get("Access-Control-Allow-Origin") == "*")

# ─── 结果汇总 ──────────────────────────────────────────

print(f"\n{'='*50}")
print(f"  PASSED: {passed}  |  FAILED: {failed}")
if errors:
    print(f"\n  失败项:")
    for e in errors:
        print(f"    - {e}")
print(f"{'='*50}")

sys.exit(1 if failed else 0)
