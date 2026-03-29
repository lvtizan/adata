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

### 18. RS 数据加载失败后不会重试，永远卡在"加载中"（2026-03-29）

**现象**：RS 画中画永远显示"RS 数据加载中..."，不会自动恢复。

**原因**：React Query 默认只重试 3 次，且 RS 依赖 `sectorCode`。如果 sectorCode 获取慢或后端超时，3 次重试用完后 query 进入 error 状态，但 RsPip 组件只检查了 `rsData` 有无数据来显示"加载中"文案，没有区分"正在加载"和"已失败"两种状态。

**修复**：
1. `useRelativeStrength` 设 `retry: true`（无限重试）+ 指数退避（2s→4s→8s→...→最长30s）
2. RsPip 组件在无数据时始终显示"RS 数据加载中..."，后台静默持续重试直到成功
3. 不显示"重试"按钮 — 用户体验不好，应该对用户透明

**教训**：辅助数据（如 RS）的加载策略应该是**无限静默重试**，不要让用户操心。用 `retry: true` + 合理的 `retryDelay` 指数退避。核心数据（K线）可以有限重试后报错，但辅助数据应该持续尝试直到成功。

### 19. 浅色模式下 Tailwind 颜色过亮看不清（2026-03-29）

**现象**：概念标签用 `text-yellow-400` + `bg-yellow-500/10`，在白色背景下几乎看不见。

**修复**：使用深浅模式分别的颜色：
```
bg-amber-100 border-amber-300 text-amber-700
dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-400
```

**教训**：Tailwind 的 400 色阶在浅色背景下对比度不足。浅色模式用 600-700 色阶，深色模式用 400 色阶。始终检查两种模式下的可读性。

### 20. 切换主题后K线数据消失（2026-03-29）

**现象**：从亮色切暗色（或反过来），K线图变空白，再切回去仍然空白。

**原因**：`watchlist-chart.tsx` 中两个 useEffect 的依赖不完整：
1. `useLayoutEffect([isDark])` — 主题变化时销毁旧 chart、创建新 chart ✓
2. `useEffect([tsCode, stockData, patternData])` — 填充数据到 chart ✗ 缺少 `isDark`
3. 圆圈重绘 `useEffect([drawResistanceCircles, stockData])` — 也缺少 `isDark`

主题切换时，chart 重建了，但数据填充 effect 不会重跑（因为 tsCode/stockData/patternData 都没变），新 chart 就是空的。

**修复**：在数据填充 effect 和圆圈重绘 effect 的依赖中加上 `isDark`。

**教训（重要模式）**：当 effect A 创建了资源（chart 实例），effect B 使用该资源（往 chart 填数据），**两个 effect 的依赖必须对齐**。如果 A 在 `isDark` 变化时重建了 chart，B 也必须在 `isDark` 变化时重填数据。漏掉依赖 = 数据丢失。

### 21. package.json 写了不存在的第三方库版本，Vite 直接爆 import 解析错误（2026-03-29）

**现象**：浏览器报错：
`[plugin:vite:import-analysis] Failed to resolve import "klinecharts"`

明明 `frontend/package.json` 里已经写了 `klinecharts`。

**原因**：
1. `package.json` 写的是不存在的版本号，例如 `klinecharts@^10.0.0`
2. `npm install` 实际没有把包装进 `node_modules`
3. TypeScript 类型检查不一定能暴露这个问题，但 Vite 在运行时解析 import 会直接失败

**修复**：
1. 先查 npm 上真实存在的版本，不要凭感觉写“稳定版号”
2. 确认 `package-lock.json` 和 `node_modules` 里都真的有这个包
3. 本次修复把 `klinecharts` 改成实际可安装的版本，再重新 `npm install`

**教训**：
1. 切换图表库前，先确认 npm 实际发布版本
2. `tsc` 通过 != 依赖已正确安装
3. 修改依赖后，至少检查三处：
   - `package.json`
   - `package-lock.json`
   - `frontend/node_modules/<pkg>`

### 22. 改完依赖后出现 `504 Outdated Optimize Dep`（2026-03-29）

### 23. `klinecharts` v10 beta 没有 `applyNewData`（2026-03-29）

**现象**：页面直接报错：
`TypeError: chart.applyNewData is not a function`

**原因**：
1. 当前项目安装的是 `klinecharts 10.0.0-beta1`
2. 旧版本示例里常见的 `applyNewData` 在这个版本里并不存在
3. 这个版本的数据装载走的是 `setSymbol()` + `setPeriod()` + `setDataLoader()`

**修复**：
```ts
chart.setSymbol({ ticker: tsCode, pricePrecision: 2, volumePrecision: 0 })
chart.setPeriod({ type: "day", span: 1 })
chart.setDataLoader({
  getBars: ({ callback }) => callback(klineData, false),
})
```

**教训**：
1. `klinecharts` 不能照着旧文章直接写，先看当前安装包的 `index.d.ts`
2. 看到 `... is not a function`，先核对实际 npm 版本和类型定义，不要凭记忆补 API

### 24. `klinecharts` 不会自动跟随容器尺寸变化（2026-03-29）

**现象**：自选股页拖动左右栏宽度后，K 线图宽高不跟着变化，像是“不会自适应”。

**原因**：
1. 从 `lightweight-charts` 切到 `klinecharts` 后，容器尺寸变化不会自动重排
2. 如果不主动监听容器尺寸变化并调用 `chart.resize()`，图表会维持初始化时的尺寸

**修复**：
```ts
const observer = new ResizeObserver(() => {
  chart.resize()
})
observer.observe(containerEl)
```

并在 cleanup 里 `observer.disconnect()`。

**教训**：
1. 图表库迁移时，除了数据 API，还要核对尺寸、自适应、销毁这些生命周期行为
2. 任何放在可拖拽分栏里的图表，都应该默认接 `ResizeObserver`

### 25. 新增页面时，`route / nav / page file` 必须同一轮落地（2026-03-29）

**现象**：Vite 直接报：
`Failed to resolve import "@/pages/index-radar/page"`

**原因**：先改了路由和导航，但页面文件还没创建，导致 import 指向不存在的模块。

**教训**：
1. 新增页面必须把 `page file`、`routes.tsx`、导航入口当成一个原子改动
2. 这类改动做完后必须立刻跑一次前端编译检查

### 26. 改 import 时不要把 React hooks 漏掉（2026-03-29）

**现象**：运行时报：
`ReferenceError: useState is not defined`

**原因**：修改 `dashboard/page.tsx` 的 import 时，只保留了 `useEffect / useRef / useCallback`，把 `useState` 漏掉了，但文件里的 `useResizablePct` 还在使用它。

**教训**：
1. 改 import 语句时，先扫一遍文件里实际用到的 hooks
2. 新增路由/页面改动后，不只看新增文件，还要检查被顺手改到的旧页面有没有漏依赖

### 27. 图表迁移时不能只迁线，必须保留“算法标签语义”（2026-03-29）

**现象**：支撑/压力线还在，但像 `支撑 x2` 这种“被测试次数”的标签没了，用户会以为算法被删了。

**原因**：后端 `pattern_detector.py` 仍然返回了 `supports[].count / resistances[].count`，但前端迁移到 `KLineCharts` 时只把横线画出来，没有把原来一起展示的语义标签补回。

**教训**：
1. 迁移图表时，不能只看“图形像不像”，还要检查“交易语义有没有保留”
2. 凡是后端已经返回的关键信号字段，例如 `count / touches / buySignal`，迁移后都要对照原 UI 一项项复原

**现象**：浏览器控制台或页面里报：
`Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)`

**原因**：
1. 刚改了依赖版本或重新安装依赖
2. Vite 还在使用旧的预构建缓存（optimize deps）
3. 运行态缓存和当前 `node_modules` 不一致

**修复**：
1. 重启前端 dev server
2. 用 `vite --force` 强制重建依赖预构建
3. 确认 `frontend/node_modules/.vite` 对应的是当前安装状态

**教训**：
1. 依赖改动后，不要只看 `npm install` 成功，还要考虑 Vite 的 optimize 缓存
2. 遇到 `Outdated Optimize Dep`，优先想到缓存重建，不要先怀疑业务代码
3. 服务启动前，应该执行“依赖存在 + 端口监听 + Vite 缓存状态”检查
