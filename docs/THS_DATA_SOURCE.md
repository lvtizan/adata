# 同花顺数据源接入记录

## 背景

项目原有数据源：Tushare、AkShare、新浪（ashare 库）。
新接入：**同花顺网页端公开 K 线接口**，用作独立数据源。

## 方法

### 1. 抓包发现接口

F12 打开同花顺网页（如 `http://stockpage.10jqka.com.cn/600519/`），Network 面板过滤 `10jqka`，看到 K 线数据请求形如：

```
http://d.10jqka.com.cn/v6/line/hs_600519/01/last.js
```

### 2. 接口规律

```
http://d.10jqka.com.cn/v6/line/{prefix}_{code}/{type}/last.js
```

- **prefix**
  - `hs` → 个股 / 指数
  - `bk` → 板块（881xxx 同花顺自定义行业/概念）
- **type**
  - `01` → 日K（前复权）
  - `11` → 周K
  - `21` → 月K
  - `41` → 5 分钟
- **code**
  - 个股：纯数字 `600519`
  - 板块：`881273`（白酒）、`881121`（半导体）…
  - 指数特殊：上证指数 = `1A0001`（不是 `sh000001`！）

### 3. 绕过 403 的关键

同花顺接口校验 Referer。直接 curl 会 403 或返回空：

```python
headers = {
    "Referer": "http://stockpage.10jqka.com.cn/",
    "User-Agent": "Mozilla/5.0 ...",
}
```

### 4. 响应格式（JSONP）

```js
quotebridge_v6_line_hs_600519_01_last({
  "name": "贵州茅台",
  "num": 140,
  "total": "5900",
  "start": "20010827",
  "year": {...},
  "data": "20260413,1444.0,1446.5,1433.0,1443.31,2521364,3629675500.0;20260414,...;..."
});
```

后端要做 3 件事：
1. 正则剥 JSONP 外壳 `^[^(]+\((.*)\);?$`
2. JSON.parse
3. `data` 字段按 `;` split 行，再按 `,` split 字段
   - 日K：`时间,开,高,低,收,量,额`
   - 5分钟：`时间(YYYYMMDDHHMM),开,高,低,收,量,额,涨跌幅,...`

## 已实现代码

### 后端

- **`backend/ths_proxy.py`**
  - `fetch_ths_kline(code, market, freq, bars)` — 统一入口
  - market: `stock` / `sector` / `index`
  - freq: `1d` / `5m` / `1w` / `1M`
  - 内置 `_INDEX_CODE_MAP`：通用代码 → 同花顺代码（`000001.SH` → `1A0001`）
  - 返回格式：`{code, name, market, freq, points: [{time,open,high,low,close,volume,amount}], source: "ths"}`

- **`backend/server.py`** 新增路由
  - `GET /api/ths/kline?code=&market=&freq=&bars=`

### 前端

- **`frontend/src/services/ths.service.ts`**
  - `getThsKline(code, market, freq, bars)`

- **`frontend/src/pages/ths-dashboard/page.tsx`** — 新看板页
  - 左列：自选股列表（localStorage 持久化，默认 6 只带板块对照）
  - 中列：上=板块日K，下=个股日K
  - 右列：上=上证指数 5m，下=当前组合信息
  - 列之间用 `Resizer` 可拖拽调宽（`useResizablePx` / `useResizableRightPx`）
  - 画线功能：每张图独立画线状态，按 `drawingKey` 存 localStorage
  - 添加股票：模态框带 **中文搜索自动补全**（接现有 `/api/search`）+ 板块选择器（常用 881xxx 列表 + 手动输入）

- **路由**：`/ths-dashboard`
- **导航**：交易分组，图标 `LayoutDashboard`

## 验证 - 已通过的测试

```bash
# 个股
curl -s "http://127.0.0.1:8088/api/ths/kline?code=600519&market=stock&freq=1d&bars=3"
# → {"code":"600519","name":"贵州茅台","points":[...3根...]}

# 板块
curl -s "http://127.0.0.1:8088/api/ths/kline?code=881273&market=sector&freq=1d&bars=3"
# → {"name":"白酒","points":[...3根...]}

# 大盘 5m
curl -s "http://127.0.0.1:8088/api/ths/kline?code=000001.SH&market=index&freq=5m&bars=3"
# → {"name":"上证指数","points":[{"time":"202604151500",...}]}
```

## 已知常用板块代码对照

| 板块 | 代码 | 板块 | 代码 |
|---|---|---|---|
| 白酒 | 881273 | 半导体 | 881121 |
| 电池 | 881281 | 汽车整车 | 881125 |
| 保险 | 881156 | 银行 | 881155 |
| 软件开发 | 881272 | 风电设备 | 881280 |
| 石油加工贸易 | 881180 | 中药 | 881141 |
| 港口航运 | 881148 | 公路铁路运输 | 881149 |
| 物流 | 881152 | 房地产 | 881153 |
| 塑料制品 | 881265 | 金属新材料 | 881114 |
| 种植业与林业 | 881101 | 综合 | 881165 |

查询完整列表：https://q.10jqka.com.cn/thshy/

## 下一步（明天公司继续）

1. **替换其他页面数据源**
   - 盘中观察 `/intraday`：5m 大盘可改走 THS（当前走 ashare + 腾讯兜底）
   - 个股 K 线：`/charts/stock/:code` 可加入 THS 分支作为第三备选
   - 板块 K 线：`/charts/sector/:code` 可支持 THS 881xxx 代码

2. **扩充板块字典**
   - 抓 `q.10jqka.com.cn/thshy/` 全量 881xxx（约 100 个），落库
   - 提供 `/api/ths/sectors` 返回全量；搜索添加面板自动联动

3. **个股自动映射板块**
   - 现在用户要手动选板块。可以抓同花顺个股首页的"所属行业"自动填 881xxx
   - URL 参考：`http://stockpage.10jqka.com.cn/{code}/` 页面里有 `data-component="board"` 之类的锚点

4. **缓存层**
   - `ths_proxy.py` 加本地 SQLite/memcache：日K 缓存 1h，5m 缓存 1min，减少对 同花顺的压力 + 规避频控

5. **错误处理**
   - 接口返回空时提示"同花顺限频"并自动回退到 ashare

## 合规备注

- 仅本地桌面端自用
- 同花顺接口完全公开（网页前端直接调用）
- 不做分发/商业化/公网部署
