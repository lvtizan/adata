# API 端点清单

本文件记录系统所有 API 端点，供开发时查阅命名风格和响应格式。

## 端口 8080 — server.py (HTTPServer, 主力后端)

前端 Vite proxy 指向此端口，所有 `/api/*` 请求默认走这里。

### GET /api/market/overview
市场总览数据。
- 参数: `tradeDate` (可选, string)
- 响应: `engine.market_overview()` 返回值

### GET /api/sectors/rankings
板块排名列表。
- 参数: `sortBy` (可选, 默认 `"rps10"`), `keyword` (可选), `tradeDate` (可选)
- 响应: `{ "items": [...] }`

### GET /api/sectors/{sector_code}/stocks
指定板块内的个股列表。
- 路径参数: `sector_code`
- 参数: `sortBy` (可选, 默认 `"rps10"`), `tradeDate` (可选)
- 响应: `{ "sectorCode": "xxx", "items": [...] }`

### GET /api/charts/stock/{ts_code}
个股 K 线数据。
- 路径参数: `ts_code`
- 参数: `bars` (可选, 默认 `180`), `tradeDate` (可选)
- 响应: `engine.stock_kline()` 返回值 (OHLCV)

### GET /api/charts/sector/{sector_code}
板块 K 线数据。
- 路径参数: `sector_code`
- 参数: `bars` (可选, 默认 `180`), `tradeDate` (可选)
- 响应: `engine.sector_kline()` 返回值

### GET /api/relative-strength
个股相对板块的强度数据。
- 参数: `tsCode` (必填), `sectorCode` (必填), `tradeDate` (可选)
- 响应: `engine.relative_strength()` 返回值

### GET /api/bullcamp
牛股集中营列表。
- 参数: `tradeDate` (可选)
- 响应: `{ "items": [...] }`

### GET /api/stock/{ts_code}/financials
个股财务数据。
- 路径参数: `ts_code`
- 参数: `periods` (可选, 默认 `8`), `tradeDate` (可选)
- 响应: `engine.stock_financials()` 返回值

### GET /api/config/rules
筛选规则配置。
- 响应: `{ "sectorAmountMin": n, "stockAmountMin": n, "stockRpsMin": n, "requireAboveMa20": bool }`

### GET /api/watchlist
获取自选股列表。
- 响应: `{ "items": [...] }`

### POST /api/watchlist
添加自选股。
- 请求体: watchlist item 对象
- 响应: `{ "item": {...}, "code": 201 }`

### PUT /api/watchlist/{ts_code}
更新自选股。
- 路径参数: `ts_code`
- 请求体: 更新字段
- 响应: `{ "item": {...} }`

### DELETE /api/watchlist/{ts_code}
删除自选股。
- 路径参数: `ts_code`
- 响应: `{ "ok": true }` 或 `{ "error": "not found" }` (404)

---

## 端口 8082 — api_app.py (FastAPI)

注意：Vite proxy 不自动转发到 8082，前端直接调用需写完整 URL。

### GET /
API 信息。
- 响应: `{ "name": "板块强度选股系统 API", "version": "2.0.0", "status": "running" }`

### GET /health
健康检查。
- 响应: `{ "status": "ok", "engine_ready": bool }`

### GET /api/camp/bull-stocks
牛股列表（FastAPI 版）。
- 响应: `{ "tradeDate": "...", "items": [...] }`

### GET /api/camp/bull-stocks/history
牛股历史数据（用于连营天数计算）。
- 参数: `days` (可选, 默认 `20`, 范围 1-60)
- 响应: `{ "tradeDate": "...", "days": n, "items": [...] }`

### GET /api/bullcamp
牛股集中营（兼容 8080 的同名端点）。
- 响应: `{ "items": [...] }`

FastAPI 端还有与 8080 相同路径的端点（market/overview, sectors/rankings 等），参数和响应格式基本一致，但 `bars` 默认值为 `120`（8080 为 `180`）。

---

## 命名风格总结

| 维度 | 约定 |
|------|------|
| URL 路径 | kebab-case (`bull-stocks`, `relative-strength`) |
| 查询参数 | camelCase (`tradeDate`, `sortBy`, `tsCode`) |
| 响应字段 | camelCase (`sectorCode`, `tradeDate`) |
| 后端 Python | snake_case (`trade_date`, `sort_by`) |
| 列表包装 | `{ "items": [...] }` |
