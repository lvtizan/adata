# 工作计划

## 待完成

### 1. 每日快照自动拉取（收盘后自动缓存当天全市场日线）
- 在 `daily_scheduler.py` 的 15:10 收盘更新步骤中，调用 `engine.stock_snapshot(trade_date)` 主动拉取并写入当天全市场快照
- 这样每天收盘后本地就有最新数据，不依赖"首次访问触发缓存"

### 2. 牛股集中营 — 入营天数 + 迷你价格走势图（从 A数据 移植）
- 后端 `api_server.py`（A项目）已加 `bullcamp_history` 表 + `daysInCamp` / `closeHistory` 字段
- 前端 `BullcampPage.tsx`（A项目）还未更新：
  - 更新 `BullItem` 接口加 `daysInCamp`, `closeHistory`, `scoreHistory`
  - 名字旁边显示"入营Xd"徽章
  - 新增 `PriceSparkline` 迷你 SVG 走势图列

### 3. 板块叠加线测试验证
- 确认 `SECTOR_OVERLAY` 灰色叠加线在 K 线图上正常显示
- 检查等权指数 `/api/charts/sector/{code}/equal-weight` 接口响应速度
