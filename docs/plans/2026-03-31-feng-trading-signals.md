# 冯总交易系统信号标注 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 K 线图上检测并标注冯总极简交易系统的信号（双底、阳阴阳、止跌K线、HH买点、止损/止盈线）。

**Architecture:** 后端在 `pattern_detector.py` 新增 `detect_feng_signals()` 检测函数，返回结构化信号列表。通过现有 `/api/charts/stock/:tsCode` 返回新字段 `fengSignals`。前端在 `kline-chart.tsx` 注册新 overlay 类型渲染信号。

**Tech Stack:** Python (numpy/pandas), React, klinecharts v10 registerOverlay API

---

## Task 1: 后端 — 双底检测

**Files:**
- Modify: `backend/pattern_detector.py` (追加函数)

**Step 1: 实现 `detect_double_bottom()`**

在 `pattern_detector.py` 的 `detect_pocket_pivot()` 函数之后、`detect_all_patterns()` 之前，添加：

```python
def detect_double_bottom(df: pd.DataFrame, tolerance: float = 0.03) -> list[dict[str, Any]]:
    """
    冯总系统：上升趋势回调中的双底/三底形态。
    返回: [{"low1Date", "low1Price", "low2Date", "low2Price", "neckline", "necklineDate"}, ...]
    """
    df = _ensure_sorted(df)
    if len(df) < 30:
        return []

    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    close = df["close"].values.astype(float)
    dates = df["trade_date"].values

    swing_lows = _find_swing_lows(low, window=3)
    results = []

    for i in range(1, len(swing_lows)):
        idx1, price1 = swing_lows[i - 1]
        idx2, price2 = swing_lows[i]

        # 两低点价差在容忍度内
        if abs(price2 - price1) / price1 > tolerance:
            continue
        # 间隔 3-25 根 K 线
        gap = idx2 - idx1
        if gap < 3 or gap > 25:
            continue
        # 两低点之间的最高点（颈线）
        between_highs = high[idx1:idx2 + 1]
        neck_offset = int(np.argmax(between_highs))
        neck_idx = idx1 + neck_offset
        neckline = float(between_highs[neck_offset])
        # 颈线高度至少 3%
        if (neckline - price1) / price1 < 0.03:
            continue
        # 第二低点之后有反弹
        if idx2 + 1 < len(close) and close[idx2 + 1] <= close[idx2]:
            continue

        results.append({
            "type": "doubleBottom",
            "low1Date": str(dates[idx1]),
            "low1Price": round(float(price1), 2),
            "low2Date": str(dates[idx2]),
            "low2Price": round(float(price2), 2),
            "neckline": round(neckline, 2),
            "necklineDate": str(dates[neck_idx]),
        })

    return results
```

**Step 2: 验证**

```bash
cd backend && python3 -c "
from pattern_detector import detect_double_bottom
import pandas as pd
# 构造简单测试数据
df = pd.DataFrame({
    'trade_date': [f'202603{i:02d}' for i in range(1,32)],
    'open': [10]*31, 'high': [11]*31, 'low': [9]*31, 'close': [10.5]*31, 'vol': [1000]*31
})
print('OK:', type(detect_double_bottom(df)))
"
```

---

## Task 2: 后端 — 阳阴阳检测

**Files:**
- Modify: `backend/pattern_detector.py` (追加函数)

**Step 1: 实现 `detect_yang_yin_yang()`**

紧接 `detect_double_bottom()` 之后添加：

```python
def detect_yang_yin_yang(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    冯总系统：阳阴阳建仓形态检测（含评分）。
    第一阳涨幅>=5%, 阴线实体<=首阳1/2, 第三阳HH。
    返回: [{"date", "k1Date", "k2Date", "k3Date", "score", "maxScore", "variant"}, ...]
    """
    df = _ensure_sorted(df)
    if len(df) < 5:
        return []

    open_arr = df["open"].values.astype(float)
    high_arr = df["high"].values.astype(float)
    low_arr = df["low"].values.astype(float)
    close_arr = df["close"].values.astype(float)
    vol_arr = df["vol"].values.astype(float) if "vol" in df.columns else None
    amount_arr = df["amount"].values.astype(float) if "amount" in df.columns else None
    dates = df["trade_date"].values
    results = []

    for i in range(3, len(df)):
        # K1 = 大阳线 (i-2), K2 = 阴线 (i-1), K3 = 阳线 (i)
        k1_open, k1_high, k1_close = open_arr[i-2], high_arr[i-2], close_arr[i-2]
        k2_open, k2_high, k2_low, k2_close = open_arr[i-1], high_arr[i-1], low_arr[i-1], close_arr[i-1]
        k3_open, k3_high, k3_close = open_arr[i], high_arr[i], close_arr[i]

        # K1 必须是大阳 (涨幅 >= 5%)
        prev_close = close_arr[i-3] if i >= 3 else k1_open
        k1_pct = (k1_close - prev_close) / prev_close if prev_close > 0 else 0
        if k1_pct < 0.05:
            continue

        k1_body = k1_close - k1_open
        if k1_body <= 0:
            continue  # K1 必须阳线

        # K2 实体
        k2_body = abs(k2_close - k2_open)
        is_variant = False

        if k2_body > k1_body / 2:
            continue  # 阴线实体太大
        if k2_body > k1_body / 3:
            is_variant = True

        # K3 必须阳线且 HH
        if k3_close <= k3_open:
            continue
        if k3_high <= k2_high:
            continue

        # 评分
        score = 0
        if k1_pct >= 0.095:
            score += 2  # 涨停
        else:
            score += 1
        if k2_body <= k1_body / 3:
            score += 1
        if k2_close > k2_open:
            score += 1  # 真阳线
        k2_upper = k2_high - max(k2_open, k2_close)
        k2_lower = min(k2_open, k2_close) - k2_low
        if k2_upper < k2_body and k2_lower < k2_body:
            score += 1
        if vol_arr is not None and vol_arr[i-1] > vol_arr[i-2]:
            score += 1
        if amount_arr is not None and amount_arr[i-1] > 8e8:
            score += 1

        results.append({
            "type": "yangYinYang",
            "date": str(dates[i]),
            "k1Date": str(dates[i-2]),
            "k2Date": str(dates[i-1]),
            "k3Date": str(dates[i]),
            "price": round(float(close_arr[i]), 2),
            "score": score,
            "maxScore": 7,
            "variant": is_variant,
        })

    return results
```

---

## Task 3: 后端 — 止跌K线评分

**Files:**
- Modify: `backend/pattern_detector.py` (追加函数)

**Step 1: 实现 `score_stop_decline_k()`**

```python
def score_stop_decline_k(df: pd.DataFrame, support_prices: list[float] | None = None) -> list[dict[str, Any]]:
    """
    冯总系统：对每根K线进行止跌评分（满分10分，>=6分标注）。
    评分项: 阳K线、长下影、小实体、大涨幅、实体靠上、支撑位附近、整数位附近。
    """
    df = _ensure_sorted(df)
    if len(df) < 15:
        return []

    open_arr = df["open"].values.astype(float)
    high_arr = df["high"].values.astype(float)
    low_arr = df["low"].values.astype(float)
    close_arr = df["close"].values.astype(float)
    dates = df["trade_date"].values
    supports = support_prices or []
    results = []

    # 近10天平均实体
    for idx in range(10, len(df)):
        o, h, lo, c = open_arr[idx], high_arr[idx], low_arr[idx], close_arr[idx]
        body = abs(c - o)
        full_range = h - lo
        if full_range < 0.01:
            continue

        is_yang = c > o
        is_fake_yin = (c < o) and (c > close_arr[idx - 1])
        if not (is_yang or is_fake_yin):
            continue  # 前置条件：阳K线或假阴线

        score = 0
        # 1. 阳K线
        score += 1 if is_yang else 0.5
        # 2. 长下影
        lower_shadow = min(o, c) - lo
        if lower_shadow > body * 1.5 and lower_shadow > full_range * 0.4:
            score += 1
        # 3. 小实体
        avg_body = float(np.mean([abs(close_arr[j] - open_arr[j]) for j in range(idx - 10, idx)]))
        if avg_body > 0 and body < avg_body * 0.5:
            score += 1
        # 4. 大涨幅
        pct = (c - close_arr[idx - 1]) / close_arr[idx - 1] if close_arr[idx - 1] > 0 else 0
        if pct > 0.03:
            score += 1
        # 5. 实体靠上
        body_bottom = min(o, c)
        body_pos = (body_bottom - lo) / full_range
        if body_pos > 0.6:
            score += 1
        # 6. 支撑位附近
        for sp in supports:
            if sp > 0 and abs(lo - sp) / sp < 0.02:
                score += 1
                break
        # 7. 整数位附近（10的倍数）
        round_base = 10 if lo > 20 else 5
        nearest_round = round(lo / round_base) * round_base
        if nearest_round > 0 and abs(lo - nearest_round) / nearest_round < 0.01:
            score += 1

        if score >= 5:
            results.append({
                "type": "stopDecline",
                "date": str(dates[idx]),
                "price": round(float(lo), 2),
                "score": round(score, 1),
                "maxScore": 10,
            })

    return results
```

---

## Task 4: 后端 — 综合信号函数 + 止损止盈

**Files:**
- Modify: `backend/pattern_detector.py` (追加综合函数)

**Step 1: 实现 `detect_feng_signals()`**

```python
def detect_feng_signals(df: pd.DataFrame) -> dict[str, Any]:
    """
    冯总极简交易系统：综合检测所有信号。
    返回 {
      "doubleBottoms": [...],
      "yangYinYangs": [...],
      "stopDeclines": [...],
      "buySignals": [{"date", "price", "pattern", "stopLoss", "takeProfit", "riskReward"}]
    }
    """
    if df is None or df.empty or len(df) < 30:
        return {"doubleBottoms": [], "yangYinYangs": [], "stopDeclines": [], "buySignals": []}

    df = _ensure_sorted(df)
    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    dates = df["trade_date"].values

    # 支撑位（用于止跌评分）
    swing_lows = _find_swing_lows(low, window=3)
    support_prices = [p for _, p in swing_lows[-5:]] if swing_lows else []

    double_bottoms = detect_double_bottom(df)
    yang_yin_yangs = detect_yang_yin_yang(df)
    stop_declines = score_stop_decline_k(df, support_prices)

    # 为每个形态生成买入信号（含止损/止盈）
    buy_signals = []

    for db in double_bottoms:
        # 止损 = 双底最低价
        sl = min(db["low1Price"], db["low2Price"])
        # 入场 = 颈线突破价
        entry = db["neckline"]
        risk = entry - sl
        if risk <= 0:
            continue
        tp = round(entry + risk * 2, 2)
        buy_signals.append({
            "type": "buy",
            "date": db["low2Date"],
            "price": entry,
            "pattern": "doubleBottom",
            "patternLabel": "双底",
            "stopLoss": round(sl, 2),
            "takeProfit": tp,
            "riskReward": 2.0,
        })

    for yyy in yang_yin_yangs:
        if yyy["score"] < 4:
            continue  # 评分太低不出信号
        entry = yyy["price"]
        # 止损 = K1 的最低价（取 K1 那天的 low）
        k1_idx = df.index[df["trade_date"] == yyy["k1Date"]]
        if len(k1_idx) == 0:
            continue
        sl = float(low[k1_idx[0]])
        risk = entry - sl
        if risk <= 0:
            continue
        tp = round(entry + risk * 2, 2)
        buy_signals.append({
            "type": "buy",
            "date": yyy["date"],
            "price": entry,
            "pattern": "yangYinYang",
            "patternLabel": f"阳阴阳({yyy['score']}/{yyy['maxScore']})",
            "stopLoss": round(sl, 2),
            "takeProfit": tp,
            "riskReward": 2.0,
        })

    return {
        "doubleBottoms": double_bottoms,
        "yangYinYangs": yang_yin_yangs,
        "stopDeclines": stop_declines,
        "buySignals": buy_signals,
    }
```

**Step 2: 验证**

```bash
cd backend && python3 -c "from pattern_detector import detect_feng_signals; print('OK')"
```

---

## Task 5: 后端 — API 接入

**Files:**
- Modify: `backend/market_engine.py:1636-1674` (`stock_kline` 方法)

**Step 1: 在 `stock_kline()` 返回值中追加 `fengSignals`**

在 `stock_kline()` 方法的 `return` 语句前，添加冯总信号检测：

```python
        # ... 现有代码 points 构建完成后 ...

        # 冯总交易信号检测
        feng_signals = {}
        try:
            from pattern_detector import detect_feng_signals
            feng_signals = detect_feng_signals(df)
        except Exception as exc:
            logger.debug(f"冯总信号检测异常: {exc}")

        return {"code": ts_code, "name": name, "points": points, "fengSignals": feng_signals}
```

**Step 2: 验证 API**

```bash
python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://127.0.0.1:8088/api/charts/stock/300750.SZ?bars=120')
d = json.loads(resp.read())
fs = d.get('fengSignals', {})
print('doubleBottoms:', len(fs.get('doubleBottoms', [])))
print('yangYinYangs:', len(fs.get('yangYinYangs', [])))
print('stopDeclines:', len(fs.get('stopDeclines', [])))
print('buySignals:', len(fs.get('buySignals', [])))
"
```

---

## Task 6: 前端 — 类型定义

**Files:**
- Modify: `frontend/src/shared/types/chart.ts`

**Step 1: 追加 FengSignals 类型**

在 `ChartData` 接口之后添加：

```typescript
export interface FengDoubleBottom {
  type: "doubleBottom";
  low1Date: string;
  low1Price: number;
  low2Date: string;
  low2Price: number;
  neckline: number;
  necklineDate: string;
}

export interface FengYangYinYang {
  type: "yangYinYang";
  date: string;
  k1Date: string;
  k2Date: string;
  k3Date: string;
  price: number;
  score: number;
  maxScore: number;
  variant: boolean;
}

export interface FengStopDecline {
  type: "stopDecline";
  date: string;
  price: number;
  score: number;
  maxScore: number;
}

export interface FengBuySignal {
  type: "buy";
  date: string;
  price: number;
  pattern: string;
  patternLabel: string;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

export interface FengSignals {
  doubleBottoms: FengDoubleBottom[];
  yangYinYangs: FengYangYinYang[];
  stopDeclines: FengStopDecline[];
  buySignals: FengBuySignal[];
}
```

**Step 2: 扩展 ChartData 接口**

```typescript
export interface ChartData {
  code: string;
  name: string;
  points: CandlePoint[];
  fengSignals?: FengSignals;  // 新增
}
```

---

## Task 7: 前端 — kline-chart 注册冯总 overlay 并渲染

**Files:**
- Modify: `frontend/src/shared/charts/kline-chart.tsx`

**Step 1: 在 `ensureCustomOverlays()` 中注册新 overlay**

在 `drawdownMarker` 注册之后添加 3 个新 overlay：

```typescript
  // 冯总系统: 双底 ▲ 标记（橙色三角 + W 文字）
  registerOverlay({
    name: "fengDoubleBottom",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      return [
        {
          type: "polygon",
          attrs: {
            coordinates: [
              { x: point.x, y: point.y + 8 },
              { x: point.x - 6, y: point.y + 18 },
              { x: point.x + 6, y: point.y + 18 },
            ],
          },
          styles: { style: "stroke_fill", color: "#FF9800", borderColor: "#FF9800", borderSize: 1 },
          ignoreEvent: true,
        },
        {
          type: "text",
          attrs: { x: point.x, y: point.y + 22, text: "W", align: "center", baseline: "top" },
          styles: { color: "#FF9800", size: 10, weight: 700 },
          ignoreEvent: true,
        },
      ];
    },
  });

  // 冯总系统: 阳阴阳框（蓝色文字标注）
  registerOverlay({
    name: "fengYYY",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "YYY";
      return [{
        type: "text",
        attrs: { x: point.x, y: point.y + 14, text, align: "center", baseline: "top" },
        styles: { color: "#2196F3", size: 9, weight: 700 },
        ignoreEvent: true,
      }];
    },
  });

  // 冯总系统: 止跌K线星标（金色）
  registerOverlay({
    name: "fengStopDecline",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const text = typeof overlay.extendData === "string" ? overlay.extendData : "";
      return [{
        type: "text",
        attrs: { x: point.x, y: point.y + 12, text, align: "center", baseline: "top" },
        styles: { color: "#FFC107", size: 10, weight: 700 },
        ignoreEvent: true,
      }];
    },
  });

  // 冯总系统: 买入信号 B 标记（绿色）
  registerOverlay({
    name: "fengBuy",
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates }) => {
      const point = coordinates[0];
      if (!point) return [];
      const label = typeof overlay.extendData === "string" ? overlay.extendData : "B";
      return [
        {
          type: "text",
          attrs: { x: point.x, y: point.y + 16, text: label, align: "center", baseline: "top" },
          styles: { color: "#4CAF50", size: 12, weight: 800 },
          ignoreEvent: true,
        },
      ];
    },
  });
```

**Step 2: 扩展 KlineChartProps 接口**

```typescript
import type { FengSignals } from "@/shared/types";

interface KlineChartProps {
  // ... 现有 props ...
  fengSignals?: FengSignals;
}
```

**Step 3: 在 useEffect 中渲染冯总信号**

在现有 drawdowns 渲染之后、return cleanup 之前添加：

```typescript
    // ── 冯总交易信号标注 ──
    if (fengSignals) {
      // 双底标记
      for (const db of fengSignals.doubleBottoms) {
        for (const d of [{ date: db.low1Date, price: db.low1Price }, { date: db.low2Date, price: db.low2Price }]) {
          const ts = toTs(d.date);
          if (!ts) continue;
          chart.createOverlay({ name: "fengDoubleBottom", points: [{ timestamp: ts, value: d.price }], lock: true });
        }
        // 颈线
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: db.neckline }],
          styles: { line: { color: "#FF9800", size: 1, style: "dashed" as const } },
          lock: true,
        });
      }

      // 阳阴阳标记
      for (const yyy of fengSignals.yangYinYangs) {
        const ts = toTs(yyy.k2Date);
        if (!ts) continue;
        chart.createOverlay({
          name: "fengYYY",
          points: [{ timestamp: ts, value: yyy.price }],
          extendData: `阳阴阳 ${yyy.score}/${yyy.maxScore}`,
          lock: true,
        });
      }

      // 止跌K线
      for (const sd of fengSignals.stopDeclines) {
        const ts = toTs(sd.date);
        if (!ts) continue;
        chart.createOverlay({
          name: "fengStopDecline",
          points: [{ timestamp: ts, value: sd.price }],
          extendData: `★${sd.score}/${sd.maxScore}`,
          lock: true,
        });
      }

      // 买入信号 + 止损/止盈线
      for (const buy of fengSignals.buySignals) {
        const ts = toTs(buy.date);
        if (!ts) continue;
        chart.createOverlay({
          name: "fengBuy",
          points: [{ timestamp: ts, value: buy.price }],
          extendData: `B ${buy.patternLabel}`,
          lock: true,
        });
        // 止损线
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: buy.stopLoss }],
          styles: { line: { color: "#F44336", size: 1, style: "dashed" as const } },
          lock: true,
        });
        chart.createOverlay({
          name: "levelTag",
          points: [{ value: buy.stopLoss }],
          extendData: { text: `SL ${buy.stopLoss}`, color: "#dc2626", backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" },
          lock: true,
        });
        // 止盈线
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: buy.takeProfit }],
          styles: { line: { color: "#4CAF50", size: 1, style: "dashed" as const } },
          lock: true,
        });
        chart.createOverlay({
          name: "levelTag",
          points: [{ value: buy.takeProfit }],
          extendData: { text: `TP ${buy.takeProfit} (2R)`, color: "#16a34a", backgroundColor: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.3)" },
          lock: true,
        });
      }
    }
```

**Step 4: 在 useEffect 依赖中添加 `fengSignals`**

```typescript
  }, [points, height, showVolume, isDark, signals, drawdowns, supports, resistances, fengSignals]);
```

---

## Task 8: 前端 — 数据传递

**Files:**
- Modify: `frontend/src/features/watchlist/components/watchlist-chart.tsx`
- Modify: 其他使用 `<KlineChart>` 的地方

**Step 1: 在 watchlist-chart 中传递 fengSignals**

找到 `<KlineChart>` 调用处，从 chart data 中取出 `fengSignals` 并传入：

```typescript
<KlineChart
  points={chartData.points}
  signals={patternData?.signals}
  drawdowns={patternData?.drawdowns}
  supports={patternData?.supports}
  resistances={patternData?.resistances}
  fengSignals={chartData.fengSignals}  // 新增
/>
```

---

## Task 9: 验证与提交

**Step 1: 重启后端**

```bash
cd /Users/kp/Code/A数据 && bash stop.sh && bash dev.sh
```

**Step 2: 验证 API 返回 fengSignals**

```bash
python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://127.0.0.1:8088/api/charts/stock/300750.SZ?bars=120')
d = json.loads(resp.read())
fs = d.get('fengSignals', {})
for k, v in fs.items():
    print(f'{k}: {len(v)} items')
"
```

**Step 3: 浏览器验证**

打开 http://127.0.0.1:5173 → 自选股 → 选一只股票 → K线图上应看到橙色 W 双底、蓝色阳阴阳标注、金色止跌星标、绿色 B 买入信号、红/绿止损止盈线。

**Step 4: 提交**

```bash
git add -A && git commit -m "feat: 冯总交易系统信号标注 — 双底/阳阴阳/止跌K线/买入信号"
```
