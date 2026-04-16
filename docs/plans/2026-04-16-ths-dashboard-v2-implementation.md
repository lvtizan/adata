# THS Dashboard v2 + 统一 UI 组件库 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 THS 数据源重建 Dashboard 主工作台，同时建立统一 UI 组件库并迁移 3 个核心页面。

**Architecture:** 分两 Track。Track 1 从设计 tokens 开始，建 8 个业务组件 + 微调 3 个现有组件，然后迁移自选股/早报/星球主线 3 个页面验证。Track 2 扩展 THS 爬虫（板块列表+成分股+RS120），建新 API，前端基于新组件搭 Dashboard v2，最后加上证 5m 画中画。

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui（前端）；Python 3 + HTTPServer + pytest + SQLite（后端）；klinecharts v10（图表）。

**Design Reference:** `docs/plans/2026-04-16-ths-dashboard-v2-design.md`

---

## 验证基线

每次改前端跑：
```bash
cd /Users/kp/Code/A数据 && python3 scripts/validate_project.py
```

每次改后端的 Python 模块，跑对应测试：
```bash
cd /Users/kp/Code/A数据/backend && python3 -m pytest tests/ -v
```

视觉验证用 debug 页面 `/debug`，每个新组件都加一段 demo。

---

# Phase 1: 设计 Tokens 梳理

## Task 1.1: 扩充 globals.css 的 tokens

**Files:**
- Modify: `frontend/src/styles/globals.css`

**Step 1: 补齐间距/字号/圆角 tokens**

在 `@theme { ... }` 块补充：

```css
/* 间距（补齐档位） */
--spacing-5: 20px;

/* 字号（补齐小字号） */
--font-size-2xs: 10px;

/* 圆角（补齐小档位） */
--radius-xs: 4px;

/* 行高 */
--line-height-tight: 1.15;
--line-height-normal: 1.4;
--line-height-relaxed: 1.6;

/* RS 语义色（强度色阶） */
--color-rs-high: #089981;
--color-rs-mid: #94a3b8;
--color-rs-low: #f43f5e;
```

在 `:root` 和 `.dark` 分别加：

```css
/* 浅色 */
--rs-high: #059669;
--rs-mid: #94a3b8;
--rs-low: #ef4444;
--text-quaternary: #b0b6c0;

/* 深色 */
--rs-high: #10b981;
--rs-mid: #6b7280;
--rs-low: #f87171;
--text-quaternary: #4b5263;
```

**Step 2: 视觉验证**

启动前端 `bash dev.sh`，访问 `/debug`，确认无样式崩溃，深色模式切换正常。

**Step 3: 提交**

```bash
git add frontend/src/styles/globals.css
git commit -m "feat(ui): 扩充设计 tokens（RS色阶 / text-quaternary / 补齐字号行高）"
```

---

# Phase 2: 基础组件

## Task 2.1: `<Panel>` 卡片容器

**Files:**
- Create: `frontend/src/shared/ui/panel.tsx`
- Modify: `frontend/src/shared/ui/index.ts`（如果不存在则 create）

**Step 1: 实现**

```tsx
// panel.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean; // 默认 true
  bordered?: boolean; // 默认 true
}

export function Panel({ title, subtitle, actions, padded = true, bordered = true, className, children, ...rest }: PanelProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <div
      className={cn(
        "bg-canvas rounded-md flex flex-col min-h-0",
        bordered && "border border-border-default",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            {title && <div className="text-sm font-semibold text-text-primary truncate">{title}</div>}
            {subtitle && <div className="text-xs text-text-tertiary truncate">{subtitle}</div>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", padded && "p-3")}>{children}</div>
    </div>
  );
}
```

**Step 2: 加到 debug 页面做 demo**

修改 `frontend/src/pages/debug/page.tsx`，加 demo section：

```tsx
<Panel title="Panel Demo" subtitle="卡片容器" actions={<Button size="sm">操作</Button>}>
  内容区域
</Panel>
```

**Step 3: 视觉验证**

访问 `/debug`，确认 Panel 显示正确，hover 无异常。

**Step 4: 提交**

```bash
git add frontend/src/shared/ui/panel.tsx frontend/src/pages/debug/page.tsx
git commit -m "feat(ui): Panel 卡片容器组件"
```

---

## Task 2.2: `<PageHeader>` 页面顶栏

**Files:**
- Create: `frontend/src/shared/ui/page-header.tsx`

**Step 1: 实现**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("px-4 py-2.5 border-b border-border-default flex items-center gap-3 shrink-0", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold text-text-primary leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-text-tertiary truncate mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

**Step 2: debug 页面 demo**

**Step 3: 验证 + 提交**

```bash
git commit -m "feat(ui): PageHeader 页面顶栏组件"
```

---

## Task 2.3: `<StatStrip>` 指标条

**Files:**
- Create: `frontend/src/shared/ui/stat-strip.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down" | "neutral";
}

interface StatStripProps {
  stats: Stat[];
  density?: "compact" | "normal";
  className?: string;
}

export function StatStrip({ stats, density = "normal", className }: StatStripProps) {
  const pad = density === "compact" ? "px-2 py-1" : "px-3 py-1.5";
  const minW = density === "compact" ? "min-w-[56px]" : "min-w-[72px]";
  return (
    <div className={cn("inline-flex border border-border-default rounded-md overflow-hidden", className)}>
      {stats.map((s, i) => (
        <div key={i} className={cn(pad, minW, "border-r border-border-default last:border-r-0")}>
          <span className="block text-[10px] text-text-tertiary leading-none">{s.label}</span>
          <strong className={cn(
            "text-xs font-semibold font-mono leading-tight mt-0.5 block",
            s.tone === "up" && "text-state-up",
            s.tone === "down" && "text-state-down",
          )}>
            {s.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: debug demo + 提交**

```bash
git commit -m "feat(ui): StatStrip 行内指标条"
```

---

## Task 2.4: `<StockTag>` 股票标签

**Files:**
- Create: `frontend/src/shared/ui/stock-tag.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";
import { fmtPct } from "@/shared/utils/format";

interface StockTagProps {
  code: string;
  name: string;
  pctChange?: number | null;
  rs?: number | null;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function StockTag({ code, name, pctChange, rs, onClick, size = "md", className }: StockTagProps) {
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  const fontSize = size === "sm" ? "text-[11px]" : "text-xs";
  return (
    <button
      onClick={onClick}
      className={cn(
        padding, fontSize,
        "inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-surface hover:bg-surface-hover transition-colors font-medium text-text-primary",
        className,
      )}
      title={`${name} ${code}`}
    >
      <span>{name}</span>
      {pctChange != null && (
        <span className={cn(
          "font-mono text-[10px]",
          pctChange >= 0 ? "text-state-up" : "text-state-down",
        )}>
          {fmtPct(pctChange)}
        </span>
      )}
      {rs != null && (
        <span className={cn(
          "font-mono text-[10px] px-1 rounded-sm",
          rs >= 87 ? "bg-rs-high/10 text-rs-high" : rs >= 60 ? "text-text-secondary" : "text-rs-low",
        )}>
          RS{Math.round(rs)}
        </span>
      )}
    </button>
  );
}
```

**Step 2: debug demo（展示各种状态）+ 提交**

```bash
git commit -m "feat(ui): StockTag 股票标签（带涨幅+RS）"
```

---

# Phase 3: 控件组件

## Task 3.1: `<FilterChip>` + `<FilterBar>`

**Files:**
- Create: `frontend/src/shared/ui/filter-chip.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface FilterChipProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClear?: () => void;
  className?: string;
}

export function FilterChip({ label, value, active, onClick, onClear, className }: FilterChipProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs cursor-pointer transition-colors",
        active
          ? "bg-accent-soft text-accent border border-accent/30"
          : "bg-surface hover:bg-surface-hover text-text-secondary border border-border-default",
        className,
      )}
    >
      <span>{label}</span>
      {value != null && <span className="font-mono font-medium">{value}</span>}
      {onClear && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-surface-active"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return <div className={cn("flex items-center gap-2 flex-wrap", className)}>{children}</div>;
}
```

**Step 2: debug demo + 提交**

```bash
git commit -m "feat(ui): FilterChip + FilterBar"
```

---

## Task 3.2: `<SegmentedControl>`

**Files:**
- Create: `frontend/src/shared/ui/segmented-control.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";

interface Option<V extends string> {
  value: V;
  label: React.ReactNode;
}

interface SegmentedControlProps<V extends string> {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl<V extends string>({ options, value, onChange, size = "md", className }: SegmentedControlProps<V>) {
  const height = size === "sm" ? "h-7" : "h-8";
  const fontSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className={cn("inline-flex bg-surface rounded-full p-0.5 border border-border-default", height, className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 rounded-full transition-colors font-medium",
              fontSize,
              active
                ? "bg-canvas text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: debug demo + 提交**

```bash
git commit -m "feat(ui): SegmentedControl 胶囊切换"
```

---

## Task 3.3: `<ThresholdInput>`

**Files:**
- Create: `frontend/src/shared/ui/threshold-input.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";

interface ThresholdInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}

export function ThresholdInput({ label, value, onChange, min, max, step = 1, suffix, className }: ThresholdInputProps) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className="text-text-tertiary">{label}</span>
      <div className="inline-flex items-center gap-0.5 h-7 px-2 rounded-md border border-border-default bg-canvas focus-within:border-accent">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="w-14 bg-transparent text-xs font-mono font-semibold text-text-primary focus:outline-none"
        />
        {suffix && <span className="text-[10px] text-text-tertiary">{suffix}</span>}
      </div>
    </label>
  );
}
```

**Step 2: debug demo + 提交**

```bash
git commit -m "feat(ui): ThresholdInput 阈值输入"
```

---

## Task 3.4: `<EmptyState>`

**Files:**
- Create: `frontend/src/shared/ui/empty-state.tsx`

**Step 1: 实现**

```tsx
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({ icon, title, description, action, size = "md", className }: EmptyStateProps) {
  const padY = size === "sm" ? "py-6" : "py-12";
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", padY, className)}>
      {icon && <div className="mb-3 text-text-tertiary">{icon}</div>}
      <div className="text-sm font-medium text-text-secondary">{title}</div>
      {description && <div className="mt-1 text-xs text-text-tertiary max-w-xs">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

**Step 2: debug demo + 提交**

```bash
git commit -m "feat(ui): EmptyState 空状态"
```

---

# Phase 4: 微调现有组件

## Task 4.1: LeftRail 支持折叠

**Files:**
- Modify: `frontend/src/shared/layout/left-rail.tsx`
- Modify: `frontend/src/store/app-store.ts`（加 `leftRailCollapsed`）

**Step 1: app-store 加状态**

```tsx
// store/app-store.ts 里加
leftRailCollapsed: boolean;
toggleLeftRailCollapsed: () => void;
```

**Step 2: LeftRail 支持两种宽度**

- `collapsed=false`：现有样式，204px
- `collapsed=true`：仅图标，48px，hover 时可展开预览

关键改动：加一个 collapsed 分支，按钮只显示 icon，宽度变 48px。section 标题隐藏。加一个折叠/展开按钮。

**Step 3: 接到 RootLayout**

```tsx
const collapsed = useAppStore((s) => s.leftRailCollapsed);
<LeftRail collapsed={collapsed} ...>
```

**Step 4: 视觉验证 + 提交**

```bash
git commit -m "feat(ui): LeftRail 支持折叠态（48px icon-only）"
```

---

## Task 4.2: Tabs 加 minimal variant

**Files:**
- Modify: `frontend/src/shared/ui/tabs.tsx`

**Step 1: 加 variant 参数**

在 TabsList 和 TabsTrigger 加 `variant?: "default" | "minimal"`。minimal 模式：
- TabsList：无背景，只有底部边框
- TabsTrigger：active 时底部 2px accent 色线

**Step 2: debug demo 两种 variant + 提交**

```bash
git commit -m "feat(ui): Tabs 增加 minimal variant"
```

---

## Task 4.3: DataTable density token

**Files:**
- Modify: `frontend/src/shared/table/data-table.tsx`

**Step 1: 统一行高**

加 `density?: "compact" | "normal" | "relaxed"` prop：
- compact: 行高 28px，`py-1` padding
- normal: 32px（默认），`py-1.5`
- relaxed: 40px，`py-2`

**Step 2: 验证现有使用 + 提交**

确保原 `compact` 布尔 prop 仍兼容（compact=true → density="compact"）。

```bash
git commit -m "feat(ui): DataTable density token 三档"
```

---

# Phase 5: 组件 demo 页强化

## Task 5.1: 重建 debug 页作为组件库展示

**Files:**
- Modify: `frontend/src/pages/debug/page.tsx`

**Step 1: 按分类组织**

按 tokens / 基础组件 / 控件 / 微调 分 4 个区，每个区展示组件的各种状态、size、variant 组合。

**Step 2: 验证 + 提交**

```bash
git commit -m "feat(ui): debug 页作为组件库展示"
```

---

# Phase 6: 老页面迁移（样板）

## Task 6.1: 迁移自选股 `/watchlist`

**Files:**
- Modify: `frontend/src/pages/watchlist/page.tsx`

**Step 1: 替换关键位置**

- 页面顶部 → `<PageHeader>`
- 股票卡片 → `<Panel>`
- 股票名渲染 → `<StockTag>`
- 指标区 → `<StatStrip>`
- 空状态 → `<EmptyState>`

**Step 2: 视觉回归对比**

截图对比迁移前后，确保信息密度不降。

**Step 3: 提交**

```bash
git commit -m "refactor(watchlist): 迁移到统一组件库"
```

---

## Task 6.2: 迁移早报 `/morning-brief`

**Files:**
- Modify: `frontend/src/pages/morning-brief/page.tsx`

同样方式迁移。重点是新闻里的股票提及，替换为 `<StockTag>` 点击触发（stub onClick，后续接入速览）。

```bash
git commit -m "refactor(morning-brief): 迁移到统一组件库"
```

---

## Task 6.3: 迁移星球主线 `/zsxq-mainlines`

**Files:**
- Modify: `frontend/src/pages/zsxq-mainlines/page.tsx`

重点：筛选条用 `<FilterChip>`，时间窗口用 `<SegmentedControl>`，股票列表用 `<StockTag>`。

```bash
git commit -m "refactor(zsxq-mainlines): 迁移到统一组件库"
```

---

# Phase 7: 后端 THS 爬虫扩展

## Task 7.1: THS 板块列表爬虫

**Files:**
- Modify: `backend/ths_proxy.py`
- Create: `backend/tests/test_ths_proxy.py`

**Step 1: 写失败测试**

```python
# tests/test_ths_proxy.py
from ths_proxy import fetch_ths_sector_list

def test_fetch_ths_sector_list_returns_881_sectors():
    result = fetch_ths_sector_list()
    assert isinstance(result, list)
    assert len(result) >= 50  # 同花顺一级行业至少 50 个
    first = result[0]
    assert "code" in first and first["code"].startswith("881")
    assert "name" in first
```

**Step 2: 跑测试确认失败**

```bash
cd backend && python3 -m pytest tests/test_ths_proxy.py::test_fetch_ths_sector_list_returns_881_sectors -v
```
期望：FAIL（函数不存在）

**Step 3: 实现**

```python
# ths_proxy.py 末尾加
def fetch_ths_sector_list() -> list[dict[str, Any]]:
    """从 q.10jqka.com.cn/thshy/ 爬取全量 881xxx 板块列表。

    返回: [{"code": "881121", "name": "半导体"}, ...]
    """
    url = "http://q.10jqka.com.cn/thshy/"
    try:
        resp = requests.get(url, headers=_THS_HEADERS, timeout=8)
        resp.encoding = "gbk"  # THS 网页是 GBK 编码
        html = resp.text
    except Exception as exc:
        logger.warning(f"THS sector list fetch failed: {exc}")
        return []

    # 用正则提取 href 中的板块代码和名称
    # 同花顺行业列表 HTML 结构: <a href="/thshy/detail/code/881XXX/">板块名</a>
    pattern = r'href="/thshy/detail/code/(881\d{3})/"[^>]*>([^<]+)</a>'
    matches = re.findall(pattern, html)
    seen = set()
    result = []
    for code, name in matches:
        if code in seen:
            continue
        seen.add(code)
        result.append({"code": code, "name": name.strip()})
    return result
```

**Step 4: 跑测试确认通过**

期望：PASS。如果网页结构不同则调整正则。

**Step 5: 提交**

```bash
git add backend/ths_proxy.py backend/tests/test_ths_proxy.py
git commit -m "feat(ths): 板块列表爬虫 fetch_ths_sector_list"
```

---

## Task 7.2: THS 板块成分股爬虫

**Files:**
- Modify: `backend/ths_proxy.py`
- Modify: `backend/tests/test_ths_proxy.py`

**Step 1: 写测试**

```python
def test_fetch_ths_sector_members_for_baijiu():
    result = fetch_ths_sector_members("881273")  # 白酒
    assert isinstance(result, list)
    assert len(result) >= 10
    # 茅台应该在白酒板块
    codes = [x["code"] for x in result]
    assert "600519" in codes
```

**Step 2: 实现**

```python
def fetch_ths_sector_members(sector_code: str) -> list[dict[str, Any]]:
    """爬取板块成分股列表。

    返回: [{"code": "600519", "name": "贵州茅台", "price": 1688.0, "pctChange": 1.2, "amount": 1.2e9}, ...]
    """
    # 同花顺板块详情页: http://q.10jqka.com.cn/thshy/detail/field/199112/order/desc/page/1/ajax/1/code/881XXX/
    url = f"http://q.10jqka.com.cn/thshy/detail/field/199112/order/desc/page/1/ajax/1/code/{sector_code}/"
    try:
        resp = requests.get(url, headers=_THS_HEADERS, timeout=8)
        resp.encoding = "gbk"
        html = resp.text
    except Exception as exc:
        logger.warning(f"THS members fetch failed for {sector_code}: {exc}")
        return []

    # 解析 HTML 表格，提取每行的代码、名称、最新价、涨跌幅、成交额
    # 列结构: 代码 | 名称 | 最新价 | 涨跌幅(%) | ... | 成交额 | ...
    # 用 BeautifulSoup 会更稳，但项目可能没依赖；先用正则。
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)
    result = []
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 8:
            continue
        code_match = re.search(r">(\d{6})<", cells[1])
        name_match = re.search(r">([^<]+)</a>", cells[2])
        if not code_match or not name_match:
            continue
        code = code_match.group(1)
        name = name_match.group(1).strip()
        try:
            price = float(re.sub(r"<[^>]+>", "", cells[3]).strip() or 0)
            pct_text = re.sub(r"<[^>]+>", "", cells[4]).strip().rstrip("%")
            pct = float(pct_text) if pct_text not in ("--", "") else 0.0
            # 成交额列（通常第 7 列），格式"1.23亿"
            amount_text = re.sub(r"<[^>]+>", "", cells[7]).strip()
            amount = _parse_amount(amount_text)
        except (ValueError, IndexError):
            continue
        result.append({
            "code": code,
            "name": name,
            "price": price,
            "pctChange": pct,
            "amount": amount,
        })
    return result


def _parse_amount(text: str) -> float:
    """'1.23亿' → 123000000.0"""
    text = text.replace(",", "").strip()
    if text in ("--", ""):
        return 0.0
    if text.endswith("亿"):
        return float(text[:-1]) * 1e8
    if text.endswith("万"):
        return float(text[:-1]) * 1e4
    try:
        return float(text)
    except ValueError:
        return 0.0
```

**Step 3: 跑测试**

网络依赖测试，真跑一次确认格式。如果 HTML 结构和假设不同，调整正则。

**Step 4: 加缓存（1 小时 TTL）**

参照 K 线缓存，为板块成分股加同样缓存机制。

**Step 5: 提交**

```bash
git commit -m "feat(ths): 板块成分股爬虫 fetch_ths_sector_members（含缓存）"
```

---

## Task 7.3: RS120 计算

**Files:**
- Create: `backend/ths_sector_strength.py`
- Create: `backend/tests/test_ths_sector_strength.py`

**Step 1: 写测试**

```python
from ths_sector_strength import compute_sector_rs120

def test_compute_sector_rs120_returns_dict():
    # 空输入
    assert compute_sector_rs120({}) == {}

    # 两个板块：A 涨 50%，B 涨 10%
    sector_closes = {
        "881A": [100, 150],  # 120 天前 100，今天 150
        "881B": [100, 110],  # 120 天前 100，今天 110
    }
    result = compute_sector_rs120(sector_closes)
    assert result["881A"] == 100  # 第一名 → 100
    assert result["881B"] == 0   # 最后一名 → 0
```

**Step 2: 实现**

```python
# ths_sector_strength.py
"""基于 120 天 K 线计算板块 RS 百分位。"""

def compute_sector_rs120(sector_closes: dict[str, list[float]]) -> dict[str, int]:
    """
    Args:
        sector_closes: {sector_code: [close_t-120, ..., close_t0]}
    Returns:
        {sector_code: rs120_percentile (0-100)}
    """
    if not sector_closes:
        return {}
    perf = {}
    for code, closes in sector_closes.items():
        if len(closes) < 2 or closes[0] <= 0:
            continue
        perf[code] = (closes[-1] / closes[0]) - 1
    if not perf:
        return {}
    sorted_codes = sorted(perf.keys(), key=lambda c: perf[c])
    n = len(sorted_codes)
    result = {}
    for rank, code in enumerate(sorted_codes):
        result[code] = int(round(rank / max(n - 1, 1) * 100))
    return result
```

**Step 3: 测试通过**

**Step 4: 缓存层**

加 `ThsSectorCache`（SQLite 或简单 JSON 文件）存每日结果。

**Step 5: 调度逻辑**

加一个 `refresh_sector_rs120()` 函数，触发：
1. 调用 `fetch_ths_sector_list()` 拿全量板块
2. 对每个板块调 `fetch_ths_kline(code, market="sector", freq="1d", bars=130)`
3. 提取 close，喂给 `compute_sector_rs120()`
4. 写缓存

先不接调度，手动调用即可。

**Step 6: 提交**

```bash
git commit -m "feat(ths): RS120 板块强度计算 + 缓存"
```

---

# Phase 8: 后端 API 路由

## Task 8.1: Dashboard v2 所需 4 个 API

**Files:**
- Modify: `backend/server.py`
- Create: `backend/my_sectors_store.py`

**Step 1: my_sectors_store 参照 watchlist_store**

```python
# my_sectors_store.py
"""用户'我的主流板块'池 SQLite 存储。"""
import sqlite3
from pathlib import Path

class MySectorsStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init()

    def _init(self):
        with sqlite3.connect(self.db_path) as con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS my_sectors (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def list(self) -> list[dict]:
        with sqlite3.connect(self.db_path) as con:
            rows = con.execute("SELECT code, name FROM my_sectors ORDER BY added_at").fetchall()
        return [{"code": r[0], "name": r[1]} for r in rows]

    def add(self, code: str, name: str) -> None:
        with sqlite3.connect(self.db_path) as con:
            con.execute("INSERT OR IGNORE INTO my_sectors (code, name) VALUES (?, ?)", (code, name))

    def remove(self, code: str) -> None:
        with sqlite3.connect(self.db_path) as con:
            con.execute("DELETE FROM my_sectors WHERE code = ?", (code,))
```

**Step 2: server.py 路由**

```python
# GET /api/ths/sectors - 按 RS120 降序的板块列表
if path == "/api/ths/sectors":
    sectors = fetch_ths_sector_list()
    rs_map = load_cached_rs120()  # 读缓存
    # 合并：[{code, name, rs120, pctChange, amount}]
    # 按 rs120 降序排
    ...
    return json_response(self, {"items": sorted_sectors})

# GET /api/ths/sectors/{code}/members
if path.startswith("/api/ths/sectors/") and path.endswith("/members"):
    sector_code = path.split("/")[4]
    members = fetch_ths_sector_members(sector_code)
    # 给每只股票补 rs120（板块内排序）
    ...
    return json_response(self, {"items": members})

# GET /api/ths/my-sectors
if path == "/api/ths/my-sectors":
    return json_response(self, {"items": my_sectors_store.list()})

# POST /api/ths/my-sectors
if path == "/api/ths/my-sectors" and method == "POST":
    action = body.get("action")  # "add" | "remove"
    code = body.get("code")
    name = body.get("name", "")
    if action == "add":
        my_sectors_store.add(code, name)
    elif action == "remove":
        my_sectors_store.remove(code)
    return json_response(self, {"ok": True})
```

**Step 3: 测试接口**

手动 curl 四个路由确认工作正常。

**Step 4: 提交**

```bash
git commit -m "feat(ths): Dashboard v2 后端 API（sectors / members / my-sectors）"
```

---

# Phase 9: 前端 THS service + queries

## Task 9.1: ths.service.ts 扩展 + ths.queries.ts

**Files:**
- Modify: `frontend/src/services/ths.service.ts`
- Create: `frontend/src/queries/ths.queries.ts`
- Modify: `frontend/src/queries/index.ts`
- Modify: `frontend/src/shared/types/index.ts`（加类型）

**Step 1: types**

```ts
// shared/types/ths.ts
export interface ThsSector {
  code: string;
  name: string;
  rs120: number;
  pctChange: number;
  amount: number;
}

export interface ThsSectorMember {
  code: string;
  name: string;
  price: number;
  pctChange: number;
  amount: number;
  rs120?: number;  // 板块内 RS
}
```

**Step 2: service 函数**

```ts
export function getThsSectors() {
  return api<{ items: ThsSector[] }>("/ths/sectors", { cacheTTL: 300_000 });
}

export function getThsSectorMembers(code: string) {
  return api<{ items: ThsSectorMember[] }>(`/ths/sectors/${code}/members`, { cacheTTL: 60_000 });
}

export function getMySectors() {
  return api<{ items: Array<{ code: string; name: string }> }>("/ths/my-sectors");
}

export function addMySector(code: string, name: string) {
  return api("/ths/my-sectors", { method: "POST", body: { action: "add", code, name } });
}

export function removeMySector(code: string) {
  return api("/ths/my-sectors", { method: "POST", body: { action: "remove", code } });
}
```

**Step 3: queries hooks**

```ts
export function useThsSectors() {
  return useQuery({ queryKey: ["ths-sectors"], queryFn: getThsSectors, staleTime: 300_000 });
}

export function useThsSectorMembers(code: string | undefined) {
  return useQuery({
    queryKey: ["ths-sector-members", code],
    queryFn: () => getThsSectorMembers(code!),
    enabled: !!code,
    staleTime: 60_000,
  });
}

export function useMySectors() {
  return useQuery({ queryKey: ["my-sectors"], queryFn: getMySectors });
}
```

**Step 4: 导出更新 + 提交**

```bash
git commit -m "feat(ths): 前端 service + queries（sectors/members/my-sectors）"
```

---

# Phase 10: Dashboard v2 前端

## Task 10.1: Dashboard 页重写 - 第一列（板块列表）

**Files:**
- Create: `frontend/src/features/sectors/components/sector-list-panel.tsx`
- Create: `frontend/src/features/sectors/components/my-sectors-dialog.tsx`
- Modify: `frontend/src/pages/dashboard/page.tsx`

**Step 1: sector-list-panel.tsx**

```tsx
// 包含 SegmentedControl 在顶部切换"推荐/我的主流"
// 列表用 <Panel> 包裹，每一行显示：板块名 + RS120 badge
// 点击切换 selectedSectorCode（Zustand store）
// "我的主流"选中 + 板块列表右侧有管理按钮打开 dialog
```

**Step 2: my-sectors-dialog.tsx**

```tsx
// 搜索框 + 已选列表（带删除） + 从推荐列表拖/点击加入
// 用现有 <Dialog> 组件
```

**Step 3: 页面集成**

替换 dashboard/page.tsx 第一列。

**Step 4: 验证 + 提交**

```bash
git commit -m "feat(dashboard-v2): 板块列表 - 推荐/我的主流切换"
```

---

## Task 10.2: Dashboard 页 - 第二列（成分股筛选）

**Files:**
- Create: `frontend/src/features/stocks/components/sector-members-panel.tsx`
- Create: `frontend/src/features/stocks/components/stock-filter-bar.tsx`

**Step 1: filter-bar**

用 `<FilterBar>` + `<ThresholdInput>` 组成：
- 成交额阈值（默认 8，单位亿）
- RS120 阈值（默认 87）
- 状态放 Zustand dashboard-store

**Step 2: members-panel**

```tsx
// useThsSectorMembers(selectedSectorCode)
// 前端按 filter 过滤
// 表格用 <DataTable density="compact">
// 列：名称（StockTag）| 涨幅 | 成交额（亿） | RS120
```

**Step 3: 集成到 dashboard 第二列 + 提交**

```bash
git commit -m "feat(dashboard-v2): 成分股筛选列（成交额+RS120 阈值）"
```

---

## Task 10.3: Dashboard 页 - 第三列（板块K + 个股K）

**Files:**
- Modify: `frontend/src/pages/dashboard/page.tsx`
- Create: `frontend/src/features/chart/components/dashboard-chart-column.tsx`

**Step 1: 上半板块 K 线**

```tsx
// 用 useThsKline(selectedSector.code, "sector", "1d")
// 外层 <Panel>，内层 <KlineChart>
// enableDrawing={true}
```

**Step 2: 下半个股 K 线**

```tsx
// 保持现有个股 K 线数据源（不切 THS）
// 同样用 <KlineChart> 控件
```

**Step 3: 验证画线功能正常 + 提交**

```bash
git commit -m "feat(dashboard-v2): 图表列 - 板块日K + 个股日K（统一 KlineChart）"
```

---

## Task 10.4: 上证 5m 画中画

**Files:**
- Create: `frontend/src/features/chart/components/index-pip.tsx`

**Step 1: PiP 组件**

```tsx
interface IndexPipProps {
  defaultPosition?: { top: number; right: number };
}

export function IndexPip({ defaultPosition = { top: 12, right: 12 } }: IndexPipProps) {
  const [pos, setPos] = useState(defaultPosition);
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);

  const { data } = useThsKline("000001.SH", "index", "5m", 60);
  const points = toCandlePoints(data);

  // 拖拽实现: mousedown → mousemove 更新 pos
  // minimized 时只显示一个小图标按钮

  return (
    <div
      className="absolute bg-canvas/95 backdrop-blur border border-border-default rounded-md shadow-lg z-10"
      style={{ top: pos.top, right: pos.right, width: minimized ? 48 : 240, height: minimized ? 32 : 140 }}
    >
      {/* 标题栏（拖拽把手）+ 最小化按钮 + KlineChart */}
    </div>
  );
}
```

**Step 2: 挂到第三列板块 K 线区域**

在板块 K 线 Panel 内加 `relative` 定位，PiP 绝对定位在右上角。

**Step 3: 每分钟自动刷新**

React Query `refetchInterval: 60_000`。

**Step 4: 提交**

```bash
git commit -m "feat(dashboard-v2): 上证5m 画中画浮窗"
```

---

## Task 10.5: Dashboard 整合验收

**Files:**
- 无新增，整体走查

**Step 1: 跑完整流程**

1. 打开 `/dashboard`
2. 板块列表加载，切到"我的主流"
3. 添加一个板块，确认持久化
4. 切板块 → 成分股加载
5. 调整筛选阈值 → 列表实时更新
6. 选个股 → K 线显示
7. PiP 拖拽 + 最小化 + 刷新
8. 画线功能可用

**Step 2: 性能核对**

Chrome DevTools Network 面板看请求延迟，切板块、切个股的响应时间。

**Step 3: 提交（如有小修）**

```bash
git commit -m "chore(dashboard-v2): 整合验收微调"
```

---

# Phase 11: 最终验证

## Task 11.1: 项目验证脚本 + Python 测试 + 前端构建

**Step 1: 跑项目验证**

```bash
cd /Users/kp/Code/A数据 && python3 scripts/validate_project.py
```
期望：0 错误。

**Step 2: 后端测试**

```bash
cd backend && python3 -m pytest tests/ -v
```
期望：全绿。

**Step 3: 前端类型检查**

```bash
cd frontend && npm run check
```
期望：0 错误。

**Step 4: 整体回归**

访问每个页面确认未回归：`/intraday`、`/dashboard`、`/index-radar`、`/watchlist`、`/bullcamp`、`/hh-scan`、`/market-recap`、`/morning-brief`、`/stock-compare`、`/core-mainline`、`/zsxq-mainlines`、`/trade-plan`、`/settings`。

**Step 5: 最终提交（如有修复）**

```bash
git commit -m "chore: Dashboard v2 + 组件库 整体验证"
```

---

# 总进度清单

- [ ] Phase 1: 设计 Tokens
- [ ] Phase 2: 基础组件（4 个）
- [ ] Phase 3: 控件组件（4 个）
- [ ] Phase 4: 微调现有（3 个）
- [ ] Phase 5: debug 页展示
- [ ] Phase 6: 3 个页面迁移
- [ ] Phase 7: THS 后端爬虫（3 个）
- [ ] Phase 8: 后端 API 路由
- [ ] Phase 9: 前端 service + queries
- [ ] Phase 10: Dashboard v2 前端（5 个子任务）
- [ ] Phase 11: 最终验证

**预计任务数**：约 22 个 task。每个 task 2-15 分钟，总计约 4-6 小时纯开发工时。
