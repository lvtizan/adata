# 前端踩坑记录

修改 frontend/ 下的代码时必读。

### 4. 重写组件时丢失已有功能（2026-03-29）

**现象**：用户要求"3列等分"，我用 `grid-cols-3` 重写了 `DashboardPage`，结果把拖拽分割线、表头排序功能都弄丢了。

**原因**：我用 `Write` 工具整体重写文件时，没有逐行检查原文件的已有功能。"看到用户要X，就只关注X，忽略了文件里已有的Y和Z"。具体丢失的功能：
1. `useResizable` hook 和 `Resizer` 组件（拖拽分割线）
2. `SectorTable` 的 `sortable: true` 和 `sortFn`（表头排序）
3. `StockTable` 的 `pctChange10d` 列（10日涨幅）

**教训（必须遵守的规则）**：
1. **永远不要整体重写文件**。用 `Edit` 工具做局部修改，只改需要改的部分。
2. 如果必须重写，先列出原文件的所有功能点，逐一确认新文件保留了每一个。
3. **新增功能不能以丢失旧功能为代价**。先 Read 完整文件，列出已有功能清单，再动手改。

### 5. 修改代码后必须自验（2026-03-29）

**规则**：每次修改前端代码后，必须执行以下操作之一来确认效果：
1. 如果 Vite 开发服务器在跑 → HMR 会自动热更新，但需要**在浏览器里刷新确认**
2. 如果服务没跑 → 提醒用户 `bash dev.sh` 后刷新
3. 修改后端 Python → 需要重启后端：`bash stop.sh && bash dev.sh`

不能改完代码就说"你试试"，应该主动帮用户确认。

### 6. lightweight-charts v5 中 setMarkers 不存在（2026-03-29）

**现象**：`TypeError: candleSeries.setMarkers is not a function`

**原因**：项目使用 `lightweight-charts ^5.1.0`，v5 移除了 `series.setMarkers()` API。

**修复**：改用 `createSeriesMarkers(series, markers)`（从 `lightweight-charts` 导入）。

**教训**：使用第三方库 API 前，先确认当前安装的版本号，检查该版本的 API 是否存在。v4 → v5 的 breaking change 必须注意。

### 7. 表格列宽不能用固定 width，必须自适应（2026-03-29）

**现象**：板块列表和个股列表中"成交额"等列被挤出视窗外看不见。

**原因**：列定义用了固定 `width: "64px"` 等硬编码值，加上 `tableLayout: "auto"`，名称列会撑满剩余空间，把数值列推到看不见的地方。

**修复**：
1. 数值列（涨停、RPS、5日、10日、成交额）**不设 width**，让浏览器自适应内容宽度
2. 名称列用 `truncate` + `max-w-[120px]` 限制最大宽度
3. 只对序号列 `#` 设最小 width

**教训**：DataTable 列定义时，数值列不要硬编码宽度，利用 `tableLayout: "auto"` 让浏览器根据内容自动分配。名称类文本列要限制 max-width 防止撑开。

### 10. 回撤标记太多导致图表不可读（2026-03-29）

**现象**：K 线图上密密麻麻十几个回撤百分比，数值重叠看不清。

**原因**：回撤检测阈值 3% 太低，且每个 swing high → 下一个 swing low 都生成一个标记。

**修复**：
1. 阈值从 3% 提到 **10%** — 只标注有意义的回撤
2. 5 根 K 线内的多个回撤**合并**，只保留最深的
3. 总数限制 **最多 8 个**

**教训**：图表标记要克制。信息密度太高 = 没有信息。回撤只标注显著的（≥10%），近距离的要合并。

### 11. 切换股票时旧标记未清空（2026-03-29）

**现象**：自选股页点击不同股票，K 线图上残留上一只股票的回撤值和 H 标记。

**原因**：`watchlist-chart.tsx` 的 useEffect 缺少 `tsCode` 依赖；且只在 `allMarkers.length > 0` 时才调用 `createSeriesMarkers`，新股票无标记时旧标记不会被清除。

**修复**：
1. useEffect 依赖数组加 `tsCode`
2. **每次都调用** `createSeriesMarkers(series, markers)`，即使 markers 为空数组

**教训**：切换数据时，必须显式调用 `createSeriesMarkers(series, [])` 清空旧标记。不能靠"没有新标记就不调用"来偷懒。

### 13. 切换股票时旧标记仍残留 — useEffect 清空不够，必须用 key 强制重建（2026-03-29）

**现象**：踩坑 #11 的修复（useEffect 加 tsCode 依赖 + 显式清空标记）在实际使用中仍然无法清除旧标记。

**原因**：lightweight-charts 的 chart 实例和 series 引用在 React state 变化时可能不会按预期刷新。useEffect 的依赖虽然包含 tsCode，但 series ref 可能仍指向旧实例，或 lightweight-charts 内部缓存了旧标记数据。

**修复**：在父组件调用处加 `key={tsCode}`：
```tsx
<WatchlistChart
  key={selected.tsCode}   // ← 关键：tsCode 变化时销毁旧实例、创建新实例
  tsCode={selected.tsCode}
  sectorCode={effectiveSectorCode}
  stockName={selected.stockName}
/>
```

**教训（重要模式）**：
1. **当 useEffect 清理不彻底时，用 `key` prop 强制重建组件**。这是 React 中处理"有状态第三方库实例"最可靠的方式。
2. **heavyweight-charts / ECharts / D3 等命令式库**，其内部状态不受 React 管控。与其费力在 useEffect 里同步清理，不如用 `key` 让 React 帮你销毁重建。
3. 代价是切换时有短暂的重建开销，但对于数据量不大的 K 线图（几百根），这个开销可以忽略。

### 14. 上涨归因面板 — 催化剂维度（2026-03-29）

**功能**：`AttributionPanel` 组件显示个股上涨的多维度归因分析，包括：
- sector（板块强度）、revenue（营收增长）、profit（利润增长）
- roe、margin（毛利率）、momentum（RPS 动量）、volume（成交量）
- catalyst（催化剂 — 近期公告/新闻）

**API**：`GET /api/stock/{tsCode}/attribution` → `{ tsCode, stockName, attribution: AttributionItem[] }`

**注意**：用户特别强调"催化剂"维度。如果后续需要增强催化剂信息（如链接到具体新闻），在 `market_engine.py` 的 `stock_rise_attribution()` 中修改 catalyst 部分。

### 15. lightweight-charts v5 订阅返回值变更（2026-03-29）

**现象**：`TypeError: sub is not a function`，在 watchlist-chart.tsx 的 useEffect cleanup 中。

**原因**：v4 中 `chart.timeScale().subscribeVisibleLogicalRangeChange(handler)` 返回一个 unsubscribe 函数；v5 **不再返回值**（返回 undefined），取消订阅需要用配对的 `unsubscribeXxx(handler)` 方法。

**修复**：
```typescript
// ❌ 错误 (v4 写法)
const sub = chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
return () => sub(); // TypeError: sub is not a function

// ✅ 正确 (v5 写法)
const handler = () => { /* ... */ };
chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
return () => {
  try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); }
  catch { /* chart may be disposed */ }
};
```

**完整 v5 API 变更清单**（必须遵守）：

| v4 写法 | v5 写法 |
|---------|---------|
| `chart.addCandlestickSeries(opts)` | `chart.addSeries(CandlestickSeries, opts)` |
| `series.setMarkers(markers)` | `createSeriesMarkers(series, markers)` |
| `const unsub = xxx.subscribeYyy(fn); unsub()` | `xxx.subscribeYyy(fn); xxx.unsubscribeYyy(fn)` |

订阅/取消订阅配对：
- `subscribeVisibleLogicalRangeChange` ↔ `unsubscribeVisibleLogicalRangeChange`
- `subscribeVisibleTimeRangeChange` ↔ `unsubscribeVisibleTimeRangeChange`
- `subscribeCrosshairMove` ↔ `unsubscribeCrosshairMove`
- `subscribeClick` ↔ `unsubscribeClick`

**教训**：使用任何第三方库 API 前，先查 `package.json` 确认版本号。如果是大版本升级（v4→v5），必须逐一核对 breaking changes，不能凭记忆。

### 16. RS 数据不应阻塞 K 线图渲染（2026-03-29）

**现象**：切换股票后 K 线图完全空白好几秒，显示"RS 数据加载中..."，直到 RS 接口返回才显示 K 线。

**原因**：`watchlist-chart.tsx` 中 `loading = stockLoading || (!!sectorCode && rsFetching)`，把 RS 加载状态也纳入了整体 loading，导致 K 线要等 RS 一起到位才渲染。

**修复**：`loading = stockLoading`，RS 小窗内部已经有 "RS 数据加载中..." 的 fallback UI，不需要阻塞整个图表。

**教训**：组件 loading 状态要区分"核心数据"和"辅助数据"。K 线是核心，RS 是辅助。辅助数据应该异步填充，不能阻塞核心数据的渲染。每个独立区域应该有自己的 loading 状态。
