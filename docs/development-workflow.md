# 开发工作流文档

## 项目缓存策略（核心方法论）

本项目采用三层缓存架构来保证高性能。任何涉及数据查询的开发，都需要先理解这套缓存体系。

---

### 三层缓存架构

#### 1. 预计算层 (precompute.py → SQLite precomputed.db)

**原理**：收盘后批量计算，结果存入 SQLite，盘内直接查询。

**包含内容**：
- 搜索快照（全市场 5400+ 股票的指标 + 板块映射）
- 股票标签
- 上涨归因
- 概念板块反向索引

**特点**：
- 所有预计算数据查询时间 <10ms
- 在 `market_engine` 启动时，后台线程自动触发预计算

**触发时机**：`MarketEngine` 启动 → 后台线程 → 调用 `precompute.py` 中的函数 → 写入 `precomputed.db`

---

#### 2. 内存缓存层 (MarketEngine._cache dict)

**原理**：进程内 Python dict，带 TTL（存活时间），过期自动失效重新计算。

| 缓存键 | TTL | 说明 |
|--------|-----|------|
| `stock_metrics` | 300s | 个股指标数据 |
| `sector_metrics` | 300s | 板块指标数据 |
| `ths_member` 映射 | 24h | 同花顺板块成员，同时写一份到 SQLite |
| `trade_dates` | 3600s | 交易日历 |
| `stock→sector` 反向映射 | 3600s | 由 ths_member 反转构建，避免逐个调 API |

**注意**：`ths_member` 的 24h TTL 是因为板块成员关系一天内基本不变，写一份到 SQLite 作为冷备。

---

#### 3. 前端缓存层 (React Query + cached-api)

**原理**：浏览器端缓存，减少重复请求。

| 机制 | 配置 | 说明 |
|------|------|------|
| React Query staleTime | 搜索 120s，快照 60s | 数据在此时间内不会重新请求 |
| `cached-api.ts` | localStorage 持久缓存 | 跨页面刷新保留数据 |
| `placeholderData` | `keepPreviousData` | 切换页面时保留旧数据，避免空白闪烁 |

---

### 关键规则

#### 搜索接口

搜索接口的查询优先级：

```
1. 先查 precomputed SQLite（搜索快照）
   ↓ 未命中
2. 降级到实时计算
```

搜索快照包含全市场 5400+ 股票的指标 + 板块映射，是搜索性能的核心保障。

#### 板块匹配

搜索时的板块匹配使用 `_ensure_ths_member_cache` 的名称映射做简单匹配，**不调 `sector_rankings` 的重计算**。这是因为搜索场景下快速匹配比精确排名更重要。

#### stock → sector 映射

构建方式：反转 `ths_member` 缓存，生成 `{ts_code: {sectorCode, sectorName}}` 的反向索引。

好处：避免对每只股票逐个调 API 查询所属板块，一次反转即可获得全部映射。

#### null 安全

前端所有 `.toFixed()` 调用必须用 `?? 0` 保护：

```typescript
// 正确
(value ?? 0).toFixed(2)

// 错误 - 当 value 为 null/undefined 时会报错
value.toFixed(2)
```

---

### 性能基准

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 搜索 API | 2.5s | 22-26ms |
| 盘前纪要 | 路径不匹配，报错 | 正常返回数据 |
| 预计算快照 | - | 5424 只股票 + 14317 个板块映射 |

---

### 开发流程

新增功能或修改数据查询时，请按以下顺序思考和操作：

1. **先看 `precompute.py`** — 是否已有相关的预计算？如果有，直接查 SQLite，不要重复实现。
2. **新增重计算功能时** — 考虑是否应该加入预计算。判断标准：计算耗时 >100ms 且数据日内不变或低频变化。
3. **API 接口优先查预计算数据** — 新写的接口默认走预计算路径。
4. **降级路径保留但不作为默认** — 实时计算作为 fallback 保留，确保预计算失败时系统仍可用，但不要默认走实时路径。

---

### 常见场景参考

| 场景 | 推荐做法 |
|------|----------|
| 新增搜索维度 | 先在 precompute.py 加预计算字段，搜索接口查快照 |
| 新增板块相关查询 | 用 ths_member 缓存的名称映射，不要调 sector_rankings |
| 新增个股指标 | 判断是否需要加入 stock_metrics 缓存，设合适 TTL |
| 前端展示数值 | 所有 toFixed / toLocaleString 前 must 加 `?? 0` |
| 跨页面数据共享 | 用 cached-api.ts 的 localStorage 缓存 |
