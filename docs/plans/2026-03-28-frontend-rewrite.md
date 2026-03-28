# A-Share Terminal Frontend Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the entire frontend from React+JSX+CSS to React+TypeScript+Tailwind+shadcn/ui+Zustand+TanStack Query+React Router, with a TradingView-style professional workstation layout supporting light/dark theme switching.

**Architecture:** Five-zone AppShell (TopBar/LeftRail/MainWorkspace/RightPanel/BottomBar) with feature-based directory structure. Server state via TanStack Query, UI state via Zustand. All styling through Tailwind + design tokens (CSS variables). Pages: dashboard, chart (future), screener (future), review (future), watchlist, bullcamp. Existing 3 views migrated into new shell.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, Lightweight Charts 5, Zustand, TanStack Query v5, React Router v7

**Existing Backend API (16 endpoints, no changes needed):**
- GET /api/market/overview
- GET /api/sectors/rankings?sortBy&keyword
- GET /api/sectors/{code}/stocks?sortBy
- GET /api/charts/stock/{code}?bars
- GET /api/charts/sector/{code}?bars
- GET /api/relative-strength?tsCode&sectorCode
- GET /api/stock/{code}/financials?periods
- GET /api/watchlist (GET/POST)
- PUT/DELETE /api/watchlist/{code}
- GET /api/bullcamp
- GET /api/camp/bull-stocks
- GET /api/camp/bull-stocks/history?days

---

## Phase 1: Project Bootstrap

### Task 1: Initialize TypeScript + Tailwind + shadcn/ui

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/components.json` (shadcn/ui config)
- Modify: `frontend/vite.config.js` -> `frontend/vite.config.ts`
- Delete: `frontend/src/styles.css` (will be replaced)
- Create: `frontend/src/styles/globals.css`

**Step 1: Install dependencies**

```bash
cd frontend
npm install -D typescript @types/react @types/react-dom
npm install -D tailwindcss @tailwindcss/vite
npm install react-router-dom zustand @tanstack/react-query
npm install class-variance-authority clsx tailwind-merge lucide-react
```

**Step 2: Create tsconfig.json**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

**Step 3: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

**Step 4: Update vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
      },
    },
  },
});
```

**Step 5: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: TypeScript, Default style, Neutral base color, CSS variables, `@/shared/ui` as components path, `@/lib/utils` as utils path.

If interactive prompts are not available, create `components.json` manually:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/lib/utils",
    "ui": "@/shared/ui",
    "lib": "@/lib",
    "hooks": "@/shared/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 6: Create globals.css with Tailwind + design tokens**

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  /* Spacing (8pt grid) */
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --spacing-8: 32px;

  /* Font sizes */
  --font-size-xs: 11px;
  --font-size-sm: 12px;
  --font-size-base: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;

  /* Colors - semantic tokens mapped from CSS vars below */
  --color-canvas: var(--bg-canvas);
  --color-surface: var(--bg-surface);
  --color-surface-hover: var(--bg-surface-hover);
  --color-surface-active: var(--bg-surface-active);
  --color-border-subtle: var(--border-subtle);
  --color-border-default: var(--border-default);
  --color-border-strong: var(--border-strong);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-accent: var(--accent-primary);
  --color-accent-soft: var(--accent-soft);
  --color-state-up: var(--state-up);
  --color-state-down: var(--state-down);
  --color-state-warning: var(--state-warning);
  --color-state-info: var(--state-info);
  --color-state-success: var(--state-success);
}

/* Light theme (default) */
:root {
  --bg-canvas: #ffffff;
  --bg-surface: #f8f9fa;
  --bg-surface-hover: #f1f3f5;
  --bg-surface-active: #e9ecef;
  --border-subtle: #e8eaee;
  --border-default: #d7dce4;
  --border-strong: #c1c8d4;
  --text-primary: #131722;
  --text-secondary: #6b7280;
  --text-tertiary: #9aa1ad;
  --accent-primary: #2962ff;
  --accent-soft: #e8eeff;
  --state-up: #f23645;
  --state-down: #089981;
  --state-warning: #b54708;
  --state-info: #2962ff;
  --state-success: #089981;
}

/* Dark theme */
.dark {
  --bg-canvas: #0f1116;
  --bg-surface: #1a1d27;
  --bg-surface-hover: #22252f;
  --bg-surface-active: #2a2e3a;
  --border-subtle: #2a2e3a;
  --border-default: #363b4a;
  --border-strong: #4a5068;
  --text-primary: #d1d4dc;
  --text-secondary: #787b86;
  --text-tertiary: #555963;
  --accent-primary: #2962ff;
  --accent-soft: #1a2744;
  --state-up: #f23645;
  --state-down: #089981;
  --state-warning: #f59e0b;
  --state-info: #2962ff;
  --state-success: #089981;
}

/* Base styles */
* { box-sizing: border-box; }

html, body, #root {
  min-height: 100vh;
  margin: 0;
}

body {
  font-family: "IBM Plex Sans", "Segoe UI", "PingFang SC", sans-serif;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
}

button, input, select { font: inherit; }
```

**Step 7: Create lib/utils.ts**

```ts
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 8: Verify the build works**

Rename `src/main.jsx` to `src/main.tsx` with minimal content:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="min-h-screen bg-canvas text-text-primary p-6">
      <h1 className="text-xl font-semibold">A-Share Terminal</h1>
      <p className="text-text-secondary">Rewrite in progress...</p>
    </div>
  </StrictMode>,
);
```

Update `index.html` to reference `/src/main.tsx`.

Run: `cd frontend && npm run dev`
Expected: App loads at localhost:5173 with white background, styled text.

**Step 9: Commit**

```bash
git add -A frontend/
git commit -m "feat: bootstrap TypeScript + Tailwind v4 + shadcn/ui project"
```

---

### Task 2: Install shadcn/ui base components

**Step 1: Add components**

```bash
cd frontend
npx shadcn@latest add button input tabs tooltip dropdown-menu dialog scroll-area separator badge command drawer
```

This creates files in `src/shared/ui/`. If `components.json` aliases are correct, they'll land there. Otherwise move them manually.

**Step 2: Verify import works**

Add a quick test in main.tsx:
```tsx
import { Button } from "@/shared/ui/button";
// render <Button>Test</Button>
```

Run: `npm run dev`
Expected: Button renders with default shadcn styling.

**Step 3: Commit**

```bash
git add -A frontend/src/shared/
git commit -m "feat: add shadcn/ui base components"
```

---

### Task 3: Create directory structure

**Step 1: Create all directories**

```bash
cd "frontend/src"
mkdir -p app/{router,providers,layouts,theme}
mkdir -p pages/{dashboard,watchlist,bullcamp}
mkdir -p features/{market,chart,sectors,stocks,watchlist,bullcamp}/{components,hooks}
mkdir -p shared/{charts,layout,table,hooks,utils,constants,types}
mkdir -p store
mkdir -p services
mkdir -p queries
```

**Step 2: Commit**

```bash
git add -A frontend/src/
git commit -m "chore: create feature-based directory structure"
```

---

## Phase 2: Foundation Layer (Types, Services, Queries, Stores)

### Task 4: Define TypeScript types

**Files:**
- Create: `src/shared/types/stock.ts`
- Create: `src/shared/types/sector.ts`
- Create: `src/shared/types/market.ts`
- Create: `src/shared/types/chart.ts`
- Create: `src/shared/types/common.ts`
- Create: `src/shared/types/index.ts`

**Step 1: Create type definitions**

```ts
// src/shared/types/common.ts
export interface ListResponse<T> {
  items: T[];
}

// src/shared/types/market.ts
export interface MarketState {
  label: string;
  riskLevel: string;
  actionAdvice: string;
  openPermissionLight: "green" | "yellow" | "red";
  score: number;
}

export interface EmotionState {
  label: string;
  score: number;
  warnings: string[];
}

export interface MarketBreadth {
  upCount: number;
  downCount: number;
  limitUpCount: number;
  limitDownCount: number;
  brokenBoardRate: number;
  newHighCount: number;
  newLowCount: number;
  aboveMa20Ratio: number;
  aboveMa60Ratio: number;
}

export interface Mainline {
  name: string;
  status: string;
  reason: string;
}

export interface RiskFactor {
  key: string;
  label: string;
  value: number | string;
}

export interface MarketRisk {
  score: number;
  label: string;
  shortLabel: string;
  tone: "positive" | "neutral" | "warning" | "danger";
  summary: string;
  pointerValue: number;
  emotion: string;
  factors: RiskFactor[];
}

export interface MarketOverview {
  tradeDate: string;
  marketState: MarketState;
  emotionState: EmotionState;
  breadth: MarketBreadth;
  mainline: Mainline;
  marketRisk: MarketRisk;
  topSectors: SectorRanking[];
}

// Re-export to avoid circular
import type { SectorRanking } from "./sector";

// src/shared/types/sector.ts
export interface SectorRanking {
  rank: number;
  rankChange: number | null;
  prevRank: number | null;
  sectorCode: string;
  sectorName: string;
  pctChange5d: number;
  pctChange10d: number;
  rps10: number;
  amount: number;
  limitUpCount: number;
}

export interface SectorStock {
  tsCode: string;
  stockName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  rps5: number;
  rps10: number;
  rps20: number;
  amount: number;
  ma20: number;
  dataMode: "full" | "fallback";
}

// src/shared/types/stock.ts
export interface WatchlistItem {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  subgroup: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  rps20: number;
  amount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BullCampItem {
  tsCode: string;
  stockName: string;
  sectorCode: string;
  sectorName: string;
  close: number;
  pctChange1d: number;
  pctChange5d: number;
  pctChange10d: number;
  sectorPctChange5d: number;
  sectorPctChange10d: number;
  rps10: number;
  rps20: number;
  sectorRps10: number;
  amount: number;
  ma20: number;
  relativeStrengthLatest: number;
  relativeStrength5d: number;
  relativeStrength10d: number;
  relativeStrength20d: number;
  campScore: number;
  daysInCamp: number;
  isNew: boolean;
  hasRecentAnnouncement: boolean;
}

// src/shared/types/chart.ts
export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
}

export interface ChartData {
  code: string;
  name: string;
  points: CandlePoint[];
}

export interface RpsSeries {
  time: string;
  value: number;
}

export interface RelativeStrengthSide {
  tsCode?: string;
  sectorCode?: string;
  name: string;
  pctChange5d: number;
  pctChange10d: number;
  pctChange20d: number;
  rpsSeries: RpsSeries[];
}

export interface RelativeStrengthData {
  stock: RelativeStrengthSide;
  sector: RelativeStrengthSide;
  spreadSeries: RpsSeries[];
  summary: {
    relativeStrength5d: number;
    relativeStrength10d: number;
    relativeStrength20d: number;
    label: string;
  };
}

export interface FinancialPeriod {
  endDate: string;
  annDate: string;
  revenue: number | null;
  operateProfit: number | null;
  netIncome: number | null;
  basicEps: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  debtToAssets: number | null;
  revenueYoY: number | null;
  netIncomeYoY: number | null;
}

export interface FinancialsData {
  code: string;
  name: string;
  periods: FinancialPeriod[];
}

// src/shared/types/index.ts
export * from "./common";
export * from "./market";
export * from "./sector";
export * from "./stock";
export * from "./chart";
```

Note: Fix the circular import in `market.ts` by inlining `SectorRanking` reference or using `import type`.

**Step 2: Commit**

```bash
git add frontend/src/shared/types/
git commit -m "feat: add TypeScript type definitions for all API entities"
```

---

### Task 5: Create API service layer

**Files:**
- Create: `src/services/api-client.ts`
- Create: `src/services/market.service.ts`
- Create: `src/services/sector.service.ts`
- Create: `src/services/stock.service.ts`
- Create: `src/services/chart.service.ts`
- Create: `src/services/index.ts`

**Step 1: Create api-client.ts**

```ts
// src/services/api-client.ts
const BASE = "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
```

**Step 2: Create service files**

```ts
// src/services/market.service.ts
import { api } from "./api-client";
import type { MarketOverview } from "@/shared/types";

export function getMarketOverview(tradeDate?: string) {
  const qs = tradeDate ? `?tradeDate=${tradeDate}` : "";
  return api<MarketOverview>(`/market/overview${qs}`);
}

// src/services/sector.service.ts
import { api } from "./api-client";
import type { SectorRanking, SectorStock, ListResponse } from "@/shared/types";

export function getSectorRankings(sortBy = "rps10", keyword = "") {
  const params = new URLSearchParams({ sortBy, keyword });
  return api<ListResponse<SectorRanking>>(`/sectors/rankings?${params}`);
}

export function getSectorStocks(sectorCode: string, sortBy = "rps10") {
  return api<ListResponse<SectorStock>>(`/sectors/${sectorCode}/stocks?sortBy=${sortBy}`);
}

// src/services/stock.service.ts
import { api } from "./api-client";
import type { WatchlistItem, BullCampItem, FinancialsData, ListResponse } from "@/shared/types";

export function getWatchlist() {
  return api<ListResponse<WatchlistItem>>("/watchlist");
}

export function addToWatchlist(item: Partial<WatchlistItem>) {
  return api<{ success: boolean; item: WatchlistItem }>("/watchlist", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateWatchlist(tsCode: string, data: Partial<WatchlistItem>) {
  return api<{ success: boolean; item: WatchlistItem }>(`/watchlist/${tsCode}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function removeFromWatchlist(tsCode: string) {
  return api<{ success: boolean }>(`/watchlist/${tsCode}`, { method: "DELETE" });
}

export function getBullCamp() {
  return api<ListResponse<BullCampItem>>("/bullcamp");
}

export function getStockFinancials(tsCode: string, periods = 8) {
  return api<FinancialsData>(`/stock/${tsCode}/financials?periods=${periods}`);
}

// src/services/chart.service.ts
import { api } from "./api-client";
import type { ChartData, RelativeStrengthData } from "@/shared/types";

export function getStockChart(tsCode: string, bars = 120) {
  return api<ChartData>(`/charts/stock/${tsCode}?bars=${bars}`);
}

export function getSectorChart(sectorCode: string, bars = 120) {
  return api<ChartData>(`/charts/sector/${sectorCode}?bars=${bars}`);
}

export function getRelativeStrength(tsCode: string, sectorCode: string) {
  return api<RelativeStrengthData>(`/relative-strength?tsCode=${tsCode}&sectorCode=${sectorCode}`);
}

// src/services/index.ts
export * from "./market.service";
export * from "./sector.service";
export * from "./stock.service";
export * from "./chart.service";
```

**Step 3: Commit**

```bash
git add frontend/src/services/
git commit -m "feat: add typed API service layer"
```

---

### Task 6: Create TanStack Query hooks

**Files:**
- Create: `src/queries/market.queries.ts`
- Create: `src/queries/sector.queries.ts`
- Create: `src/queries/stock.queries.ts`
- Create: `src/queries/chart.queries.ts`
- Create: `src/queries/index.ts`

**Step 1: Create query hooks**

```ts
// src/queries/market.queries.ts
import { useQuery } from "@tanstack/react-query";
import { getMarketOverview } from "@/services";

export function useMarketOverview(tradeDate?: string) {
  return useQuery({
    queryKey: ["market", "overview", tradeDate],
    queryFn: () => getMarketOverview(tradeDate),
    staleTime: 60_000,
  });
}

// src/queries/sector.queries.ts
import { useQuery } from "@tanstack/react-query";
import { getSectorRankings, getSectorStocks } from "@/services";

export function useSectorRankings(sortBy = "rps10", keyword = "") {
  return useQuery({
    queryKey: ["sectors", "rankings", sortBy, keyword],
    queryFn: () => getSectorRankings(sortBy, keyword),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useSectorStocks(sectorCode: string, sortBy = "rps10") {
  return useQuery({
    queryKey: ["sectors", sectorCode, "stocks", sortBy],
    queryFn: () => getSectorStocks(sectorCode, sortBy),
    enabled: !!sectorCode,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

// src/queries/stock.queries.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWatchlist, addToWatchlist, updateWatchlist, removeFromWatchlist, getBullCamp, getStockFinancials } from "@/services";

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addToWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useUpdateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tsCode, data }: { tsCode: string; data: Record<string, unknown> }) =>
      updateWatchlist(tsCode, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useBullCamp() {
  return useQuery({
    queryKey: ["bullcamp"],
    queryFn: getBullCamp,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useStockFinancials(tsCode: string) {
  return useQuery({
    queryKey: ["stock", tsCode, "financials"],
    queryFn: () => getStockFinancials(tsCode),
    enabled: !!tsCode,
    staleTime: 5 * 60_000,
  });
}

// src/queries/chart.queries.ts
import { useQuery } from "@tanstack/react-query";
import { getStockChart, getSectorChart, getRelativeStrength } from "@/services";

export function useStockChart(tsCode: string, bars = 120) {
  return useQuery({
    queryKey: ["chart", "stock", tsCode, bars],
    queryFn: () => getStockChart(tsCode, bars),
    enabled: !!tsCode,
    staleTime: 60_000,
  });
}

export function useSectorChart(sectorCode: string, bars = 120) {
  return useQuery({
    queryKey: ["chart", "sector", sectorCode, bars],
    queryFn: () => getSectorChart(sectorCode, bars),
    enabled: !!sectorCode,
    staleTime: 60_000,
  });
}

export function useRelativeStrength(tsCode: string, sectorCode: string) {
  return useQuery({
    queryKey: ["relative-strength", tsCode, sectorCode],
    queryFn: () => getRelativeStrength(tsCode, sectorCode),
    enabled: !!tsCode && !!sectorCode,
    staleTime: 60_000,
  });
}

// src/queries/index.ts
export * from "./market.queries";
export * from "./sector.queries";
export * from "./stock.queries";
export * from "./chart.queries";
```

**Step 2: Commit**

```bash
git add frontend/src/queries/
git commit -m "feat: add TanStack Query hooks for all API endpoints"
```

---

### Task 7: Create Zustand stores

**Files:**
- Create: `src/store/app-store.ts`
- Create: `src/store/dashboard-store.ts`
- Create: `src/store/index.ts`

**Step 1: Create stores**

```ts
// src/store/app-store.ts
import { create } from "zustand";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  rightPanelOpen: boolean;
  leftRailCollapsed: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleRightPanel: () => void;
  setLeftRailCollapsed: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: (localStorage.getItem("theme") as Theme) || "light",
  rightPanelOpen: true,
  leftRailCollapsed: false,
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),
  setTheme: (t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    set({ theme: t });
  },
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftRailCollapsed: (v) => set({ leftRailCollapsed: v }),
}));

// src/store/dashboard-store.ts
import { create } from "zustand";

interface DashboardState {
  selectedSectorCode: string;
  selectedStockCode: string;
  setSelectedSectorCode: (code: string) => void;
  setSelectedStockCode: (code: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedSectorCode: "",
  selectedStockCode: "",
  setSelectedSectorCode: (code) => set({ selectedSectorCode: code, selectedStockCode: "" }),
  setSelectedStockCode: (code) => set({ selectedStockCode: code }),
}));

// src/store/index.ts
export { useAppStore } from "./app-store";
export { useDashboardStore } from "./dashboard-store";
```

**Step 2: Commit**

```bash
git add frontend/src/store/
git commit -m "feat: add Zustand stores for app and dashboard state"
```

---

## Phase 3: AppShell + Theme + Router

### Task 8: Create theme provider and AppShell layout

**Files:**
- Create: `src/app/theme/theme-provider.tsx`
- Create: `src/app/theme/chart-theme.ts`
- Create: `src/shared/layout/app-shell.tsx`
- Create: `src/shared/layout/top-bar.tsx`
- Create: `src/shared/layout/left-rail.tsx`
- Create: `src/shared/layout/right-panel.tsx`
- Create: `src/shared/layout/bottom-bar.tsx`
- Create: `src/shared/layout/index.ts`

**Step 1: Create theme provider**

```tsx
// src/app/theme/theme-provider.tsx
import { useEffect } from "react";
import { useAppStore } from "@/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return <>{children}</>;
}
```

**Step 2: Create chart theme**

```ts
// src/app/theme/chart-theme.ts
export function getChartTheme(isDark: boolean) {
  return {
    layout: {
      background: { color: isDark ? "#1a1d27" : "#ffffff" },
      textColor: isDark ? "#787b86" : "#6b7280",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: isDark ? "#2a2e3a" : "#f0f0f0" },
      horzLines: { color: isDark ? "#2a2e3a" : "#f0f0f0" },
    },
    crosshair: {
      vertLine: { color: isDark ? "#555963" : "#9aa1ad", width: 1 as const, style: 2 as const },
      horzLine: { color: isDark ? "#555963" : "#9aa1ad", width: 1 as const, style: 2 as const },
    },
    rightPriceScale: {
      borderColor: isDark ? "#2a2e3a" : "#e8eaee",
    },
    timeScale: {
      borderColor: isDark ? "#2a2e3a" : "#e8eaee",
    },
  };
}

export const candleColors = {
  up: "#f23645",
  down: "#089981",
  upWick: "#f23645",
  downWick: "#089981",
};
```

**Step 3: Create AppShell layout components**

```tsx
// src/shared/layout/top-bar.tsx
import { useAppStore } from "@/store";
import { Moon, Sun, PanelRight } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface TopBarProps {
  title?: string;
  children?: React.ReactNode;
}

export function TopBar({ title, children }: TopBarProps) {
  const { theme, toggleTheme, toggleRightPanel } = useAppStore();

  return (
    <header className="h-12 flex items-center gap-3 px-4 border-b border-border-default bg-canvas shrink-0">
      <div className="flex items-center gap-2.5 min-w-[180px]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-text-primary to-accent flex items-center justify-center text-white text-xs font-bold">
          AS
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">A-Share Terminal</div>
        </div>
      </div>

      <nav className="flex gap-1">
        {children}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {title && <span className="text-text-secondary text-sm">{title}</span>}
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleRightPanel}>
          <PanelRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}

// src/shared/layout/left-rail.tsx
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface LeftRailItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface LeftRailProps {
  items?: LeftRailItem[];
  children?: React.ReactNode;
}

export function LeftRail({ items = [], children }: LeftRailProps) {
  return (
    <aside className="w-[52px] border-r border-border-default bg-canvas flex flex-col items-center py-2 gap-1 shrink-0">
      {items.map((item, i) => (
        <Tooltip key={i} delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={item.onClick}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors",
                item.active && "text-text-primary bg-surface-active"
              )}
            >
              {item.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
        </Tooltip>
      ))}
      {children}
    </aside>
  );
}

// src/shared/layout/right-panel.tsx
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";

interface RightPanelProps {
  children?: React.ReactNode;
}

export function RightPanel({ children }: RightPanelProps) {
  const open = useAppStore((s) => s.rightPanelOpen);

  if (!open) return null;

  return (
    <aside className={cn("w-[320px] min-w-[280px] max-w-[360px] border-l border-border-default bg-canvas shrink-0 overflow-y-auto")}>
      {children}
    </aside>
  );
}

// src/shared/layout/bottom-bar.tsx
interface BottomBarProps {
  children?: React.ReactNode;
}

export function BottomBar({ children }: BottomBarProps) {
  if (!children) return null;
  return (
    <footer className="h-9 flex items-center px-3 border-t border-border-default bg-canvas text-text-tertiary text-xs shrink-0">
      {children}
    </footer>
  );
}

// src/shared/layout/app-shell.tsx
import { TopBar } from "./top-bar";
import { LeftRail } from "./left-rail";
import { RightPanel } from "./right-panel";
import { BottomBar } from "./bottom-bar";

interface AppShellProps {
  topBar?: React.ReactNode;
  leftRail?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomBar?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ topBar, leftRail, rightPanel, bottomBar, children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {topBar}
      <div className="flex flex-1 min-h-0">
        {leftRail}
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
        {rightPanel}
      </div>
      {bottomBar}
    </div>
  );
}

// src/shared/layout/index.ts
export { AppShell } from "./app-shell";
export { TopBar } from "./top-bar";
export { LeftRail } from "./left-rail";
export { RightPanel } from "./right-panel";
export { BottomBar } from "./bottom-bar";
```

**Step 4: Commit**

```bash
git add frontend/src/app/theme/ frontend/src/shared/layout/
git commit -m "feat: add AppShell five-zone layout with theme support"
```

---

### Task 9: Create router and app providers

**Files:**
- Create: `src/app/router/routes.tsx`
- Create: `src/app/providers/app-providers.tsx`
- Create: `src/pages/dashboard/page.tsx` (placeholder)
- Create: `src/pages/watchlist/page.tsx` (placeholder)
- Create: `src/pages/bullcamp/page.tsx` (placeholder)
- Modify: `src/main.tsx`

**Step 1: Create route config**

```tsx
// src/app/router/routes.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/root-layout";
import DashboardPage from "@/pages/dashboard/page";
import WatchlistPage from "@/pages/watchlist/page";
import BullcampPage from "@/pages/bullcamp/page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "bullcamp", element: <BullcampPage /> },
    ],
  },
]);
```

**Step 2: Create root layout (AppShell integration)**

```tsx
// src/app/layouts/root-layout.tsx
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppShell, TopBar, LeftRail, RightPanel, BottomBar } from "@/shared/layout";
import { useMarketOverview } from "@/queries";
import { BarChart3, Eye, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";

const navItems = [
  { path: "/dashboard", label: "板块分析", icon: BarChart3 },
  { path: "/watchlist", label: "自选股", icon: Eye },
  { path: "/bullcamp", label: "牛股集中营", icon: Flame },
];

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: overview } = useMarketOverview();

  return (
    <AppShell
      topBar={
        <TopBar title={overview?.tradeDate || ""}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 text-sm text-text-secondary",
                location.pathname === item.path && "bg-surface-active text-text-primary font-medium"
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="w-4 h-4 mr-1.5" />
              {item.label}
            </Button>
          ))}
        </TopBar>
      }
      rightPanel={<RightPanel>{/* Will be filled by pages */}</RightPanel>}
      bottomBar={
        <BottomBar>
          <span>{overview?.tradeDate || "--"}</span>
          <span className="ml-3">{overview?.marketState?.label || "市场状态"}</span>
        </BottomBar>
      }
    >
      <Outlet />
    </AppShell>
  );
}
```

**Step 3: Create placeholder pages**

```tsx
// src/pages/dashboard/page.tsx
export default function DashboardPage() {
  return <div className="p-4 text-text-secondary">板块分析 - 建设中</div>;
}

// src/pages/watchlist/page.tsx
export default function WatchlistPage() {
  return <div className="p-4 text-text-secondary">自选股 - 建设中</div>;
}

// src/pages/bullcamp/page.tsx
export default function BullcampPage() {
  return <div className="p-4 text-text-secondary">牛股集中营 - 建设中</div>;
}
```

**Step 4: Create app providers**

```tsx
// src/app/providers/app-providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ThemeProvider } from "@/app/theme/theme-provider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

**Step 5: Update main.tsx**

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/providers/app-providers";
import { router } from "@/app/router/routes";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
```

**Step 6: Verify**

Run: `cd frontend && npm run dev`
Expected: App loads with TopBar, nav buttons route between pages, dark/light toggle works, bottom bar shows.

**Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add React Router, providers, and root layout with AppShell"
```

---

## Phase 4: Shared Components

### Task 10: Create shared utility components

**Files:**
- Create: `src/shared/utils/format.ts`
- Create: `src/shared/table/data-table.tsx`
- Create: `src/shared/table/numeric-cell.tsx`
- Create: `src/shared/table/index.ts`

**Step 1: Create formatters (migrated from App.jsx)**

```ts
// src/shared/utils/format.ts
export function fmtPct(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function fmtAmount(value: number | null | undefined): string {
  if (value == null) return "-";
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return value.toFixed(0);
}

export function tone(value: number | null | undefined): "up" | "down" | "" {
  if (value == null) return "";
  return value >= 0 ? "up" : "down";
}

export function fmtYi(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${(value / 1e8).toFixed(1)}亿`;
}

export function fmtQuarter(dateStr: string): string {
  if (!dateStr || dateStr.length < 6) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(4, 6), 10);
  const q = Math.ceil(m / 3);
  return `${y}Q${q}`;
}

export function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
```

**Step 2: Create reusable data table**

```tsx
// src/shared/table/data-table.tsx
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  sortable?: boolean;
  render: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (item: T) => string;
  selectedKey?: string;
  onRowClick?: (item: T) => void;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  sortFn?: (a: T, b: T, key: string, dir: "asc" | "desc") => number;
  className?: string;
  compact?: boolean;
  emptyText?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectedKey,
  onRowClick,
  defaultSort,
  sortFn,
  className,
  compact = false,
  emptyText = "暂无数据",
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort || { key: "", dir: "desc" as const });

  const sorted = useMemo(() => {
    if (!sort.key || !sortFn) return data;
    return [...data].sort((a, b) => sortFn(a, b, sort.key, sort.dir));
  }, [data, sort, sortFn]);

  function toggleSort(key: string) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  const rowHeight = compact ? "h-9" : "h-10";

  return (
    <div className={cn("overflow-auto", className)}>
      <table className="w-full border-collapse text-base">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "sticky top-0 z-10 bg-surface px-3 text-xs font-semibold text-text-secondary border-b border-border-default whitespace-nowrap",
                  rowHeight,
                  col.align === "right" ? "text-right" : "text-left",
                  col.sortable && "cursor-pointer select-none hover:text-text-primary"
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && sort.key === col.key && (
                  <span className="ml-1 text-accent">{sort.dir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-text-tertiary">
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((item, i) => {
            const key = rowKey(item);
            return (
              <tr
                key={key}
                className={cn(
                  rowHeight,
                  "cursor-pointer border-b border-border-subtle hover:bg-surface-hover transition-colors",
                  key === selectedKey && "bg-surface-active"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 whitespace-nowrap",
                      col.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    {col.render(item, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// src/shared/table/numeric-cell.tsx
import { cn } from "@/lib/utils";

export function NumericCell({ value, format }: { value: number | null | undefined; format: (v: number | null | undefined) => string }) {
  const text = format(value);
  const color = value == null ? "" : value > 0 ? "text-state-up" : value < 0 ? "text-state-down" : "";
  return <span className={cn("font-mono text-sm", color)}>{text}</span>;
}

// src/shared/table/index.ts
export { DataTable, type Column } from "./data-table";
export { NumericCell } from "./numeric-cell";
```

**Step 3: Commit**

```bash
git add frontend/src/shared/utils/ frontend/src/shared/table/
git commit -m "feat: add shared formatters and DataTable component"
```

---

## Phase 5: Chart Components

### Task 11: Create shared chart components

**Files:**
- Create: `src/shared/charts/chart-shell.tsx`
- Create: `src/shared/charts/kline-chart.tsx`
- Create: `src/shared/charts/index.ts`

**Step 1: Create chart shell**

```tsx
// src/shared/charts/chart-shell.tsx
import { cn } from "@/lib/utils";

interface ChartShellProps {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  empty?: string;
  className?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function ChartShell({ title, subtitle, loading, error, empty, className, children, actions }: ChartShellProps) {
  return (
    <div className={cn("flex flex-col border-b border-border-subtle", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
          <div>
            {title && <h3 className="text-sm font-medium">{title}</h3>}
            {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="relative flex-1 min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            加载中...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-state-up text-sm z-10 bg-canvas/80">
            {error}
          </div>
        )}
        {empty && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            {empty}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Create KlineChart (wraps Lightweight Charts)**

```tsx
// src/shared/charts/kline-chart.tsx
import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useAppStore } from "@/store";
import { getChartTheme, candleColors } from "@/app/theme/chart-theme";
import type { CandlePoint } from "@/shared/types";
import { formatDate } from "@/shared/utils/format";

interface KlineChartProps {
  points: CandlePoint[];
  height?: number;
  showVolume?: boolean;
}

export function KlineChart({ points, height = 300, showVolume = true }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(theme === "dark"),
      width: containerRef.current.clientWidth,
      height,
      autoSize: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: candleColors.up,
      downColor: candleColors.down,
      wickUpColor: candleColors.upWick,
      wickDownColor: candleColors.downWick,
      borderVisible: false,
    });

    const validPoints = points.filter(
      (p) => p.open > 0 && p.high > 0 && p.low > 0 && p.close > 0 && isFinite(p.open)
    );

    candleSeries.setData(
      validPoints.map((p) => ({
        time: formatDate(p.time),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      }))
    );

    if (showVolume && validPoints.some((p) => p.volume > 0)) {
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(
        validPoints.map((p) => ({
          time: formatDate(p.time),
          value: p.volume,
          color: p.close >= p.open ? `${candleColors.up}80` : `${candleColors.down}80`,
        }))
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, height, showVolume, theme]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

// src/shared/charts/index.ts
export { ChartShell } from "./chart-shell";
export { KlineChart } from "./kline-chart";
```

**Step 3: Commit**

```bash
git add frontend/src/shared/charts/
git commit -m "feat: add shared chart components (ChartShell, KlineChart)"
```

---

## Phase 6: Migrate Dashboard Page (板块分析)

### Task 12: Build dashboard page with sector table, stock table, and charts

**Files:**
- Create: `src/features/sectors/components/sector-table.tsx`
- Create: `src/features/stocks/components/stock-table.tsx`
- Create: `src/features/market/components/market-summary.tsx`
- Create: `src/features/market/components/risk-gauge.tsx`
- Create: `src/features/chart/components/candlestick-panel.tsx`
- Create: `src/features/chart/components/rs-panel.tsx`
- Modify: `src/pages/dashboard/page.tsx`

**Step 1: Create SectorTable**

```tsx
// src/features/sectors/components/sector-table.tsx
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorRanking } from "@/shared/types";
import { cn } from "@/lib/utils";

interface SectorTableProps {
  data: SectorRanking[];
  selectedCode: string;
  onSelect: (code: string) => void;
}

export function SectorTable({ data, selectedCode, onSelect }: SectorTableProps) {
  const columns: Column<SectorRanking>[] = [
    {
      key: "rank",
      label: "#",
      width: "48px",
      render: (item) => (
        <span className="text-sm">
          {item.rank}
          {item.rankChange != null && item.rankChange !== 0 && (
            <span className={cn("ml-1 text-xs font-semibold", item.rankChange > 0 ? "text-state-up" : "text-state-down")}>
              {item.rankChange > 0 ? `↑${item.rankChange}` : `↓${Math.abs(item.rankChange)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "sectorName",
      label: "板块",
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{item.sectorName}</span>
          <span className="text-xs text-text-tertiary font-mono">{item.sectorCode}</span>
        </div>
      ),
    },
    { key: "limitUpCount", label: "涨停", width: "48px", align: "right", render: (item) => <span className="text-sm">{item.limitUpCount ?? 0}</span> },
    { key: "rps10", label: "RPS10", width: "56px", align: "right", render: (item) => <span className="text-sm font-mono">{item.rps10 ?? "-"}</span> },
    { key: "pctChange5d", label: "5日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "pctChange10d", label: "10日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange10d} format={fmtPct} /> },
    { key: "amount", label: "成交额", width: "72px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.sectorCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.sectorCode)}
      compact
      className="max-h-[calc(100vh-180px)]"
    />
  );
}
```

**Step 2: Create StockTable (similar pattern)**

```tsx
// src/features/stocks/components/stock-table.tsx
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import type { SectorStock } from "@/shared/types";

interface StockTableProps {
  data: SectorStock[];
  selectedCode: string;
  onSelect: (code: string) => void;
  loading?: boolean;
}

export function StockTable({ data, selectedCode, onSelect, loading }: StockTableProps) {
  const columns: Column<SectorStock>[] = [
    { key: "tsCode", label: "代码", width: "80px", render: (item) => <span className="font-mono text-sm text-text-secondary">{item.tsCode}</span> },
    { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
    { key: "close", label: "现价", width: "64px", align: "right", render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
    { key: "pctChange1d", label: "1日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange1d} format={fmtPct} /> },
    { key: "pctChange5d", label: "5日", width: "64px", align: "right", render: (item) => <NumericCell value={item.pctChange5d} format={fmtPct} /> },
    { key: "rps20", label: "RPS20", width: "56px", align: "right", render: (item) => <span className="text-sm font-mono">{item.rps20 ?? "-"}</span> },
    { key: "amount", label: "成交额", width: "72px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.amount)}</span> },
  ];

  if (loading) return <div className="flex items-center justify-center h-32 text-text-tertiary text-sm">成分股加载中...</div>;

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKey={(item) => item.tsCode}
      selectedKey={selectedCode}
      onRowClick={(item) => onSelect(item.tsCode)}
      compact
      emptyText="选择板块后加载"
      className="max-h-[calc(100vh-180px)]"
    />
  );
}
```

**Step 3: Create MarketSummary**

```tsx
// src/features/market/components/market-summary.tsx
import type { MarketOverview } from "@/shared/types";

export function MarketSummary({ overview }: { overview: MarketOverview | undefined }) {
  if (!overview) return null;

  const pills = [
    { label: "主线", value: overview.mainline?.name || "--" },
    { label: "涨停/跌停", value: `${overview.breadth?.limitUpCount ?? "--"} / ${overview.breadth?.limitDownCount ?? "--"}` },
    { label: "情绪", value: overview.emotionState?.label || "--" },
    {
      label: "聚焦板块",
      value: overview.topSectors?.slice(0, 3).map((s) => s.sectorName).join(" / ") || "--",
    },
  ];

  return (
    <div className="flex items-stretch border border-border-default">
      {pills.map((pill) => (
        <div key={pill.label} className="min-w-[140px] px-3 py-2.5 border-r border-border-default last:border-r-0">
          <span className="block text-xs text-text-tertiary mb-1">{pill.label}</span>
          <strong className="block text-sm font-semibold leading-snug">{pill.value}</strong>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Create RiskGauge**

Migrate the existing `MarketRiskGauge.jsx` logic into:

```tsx
// src/features/market/components/risk-gauge.tsx
import type { MarketRisk } from "@/shared/types";
import { cn } from "@/lib/utils";

export function RiskGauge({ risk }: { risk: MarketRisk | undefined }) {
  if (!risk) return null;

  const score = risk.pointerValue ?? risk.score ?? 50;
  const angle = -90 + (score / 100) * 180;
  const toneClass = { positive: "text-state-down", warning: "text-state-warning", danger: "text-state-up", neutral: "text-text-secondary" }[risk.tone] || "";

  const factors = risk.factors || [];
  const limitsFactor = factors.find((f) => f.key === "limits");
  const ma20Factor = factors.find((f) => f.key === "ma20");
  const breadthFactor = factors.find((f) => f.key === "breadth");

  return (
    <div className="min-w-[300px] px-3 py-2.5">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs text-text-tertiary">市场风险</span>
        <strong className={cn("text-sm font-semibold", toneClass)}>{risk.label}</strong>
      </div>
      {/* Gauge needle - simplified CSS version */}
      <div className="relative w-full max-w-[240px] mx-auto h-[100px]">
        <div className="absolute inset-0 rounded-t-full bg-gradient-to-r from-state-down via-surface to-state-up opacity-20" />
        <div
          className="absolute bottom-0 left-1/2 w-0.5 h-[55%] bg-text-primary origin-bottom rounded-full"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        />
        <div className="absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-text-primary" />
      </div>
      <div className="text-center text-lg font-bold mt-1">{score}</div>
      {/* Factor stats */}
      <div className="grid grid-cols-3 border-t border-border-subtle pt-2 mt-2">
        {[
          { label: "卖出", value: limitsFactor?.value },
          { label: "中性", value: ma20Factor?.value },
          { label: "买入", value: breadthFactor?.value },
        ].map((f) => (
          <div key={f.label} className="text-center">
            <span className="block text-xs text-text-tertiary mb-1">{f.label}</span>
            <strong className="text-lg font-medium">{f.value ?? "--"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 5: Create CandlestickPanel (feature wrapper)**

```tsx
// src/features/chart/components/candlestick-panel.tsx
import { ChartShell, KlineChart } from "@/shared/charts";
import { useStockChart, useSectorChart } from "@/queries";

interface CandlestickPanelProps {
  kind: "sector" | "stock";
  code: string;
  label: string;
  title: string;
  emptyText?: string;
}

export function CandlestickPanel({ kind, code, label, title, emptyText = "请选择" }: CandlestickPanelProps) {
  const stockQuery = useStockChart(kind === "stock" ? code : "", 120);
  const sectorQuery = useSectorChart(kind === "sector" ? code : "", 120);
  const query = kind === "stock" ? stockQuery : sectorQuery;

  return (
    <ChartShell
      title={title}
      subtitle={label}
      loading={query.isLoading}
      error={query.error?.message}
      empty={!code ? emptyText : undefined}
    >
      {query.data?.points && <KlineChart points={query.data.points} height={220} />}
    </ChartShell>
  );
}
```

**Step 6: Create RS Panel**

```tsx
// src/features/chart/components/rs-panel.tsx
import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";
import { ChartShell } from "@/shared/charts";
import { useRelativeStrength } from "@/queries";
import { useAppStore } from "@/store";
import { getChartTheme } from "@/app/theme/chart-theme";
import { formatDate } from "@/shared/utils/format";
import { cn } from "@/lib/utils";

interface RsPanelProps {
  tsCode: string;
  sectorCode: string;
  stockName?: string;
  sectorName?: string;
}

export function RsPanel({ tsCode, sectorCode, stockName, sectorName }: RsPanelProps) {
  const { data, isLoading, error } = useRelativeStrength(tsCode, sectorCode);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const chart = createChart(containerRef.current, {
      ...getChartTheme(theme === "dark"),
      width: containerRef.current.clientWidth,
      height: 200,
      autoSize: true,
    });

    const stockLine = chart.addLineSeries({ color: "#f23645", lineWidth: 2, priceScaleId: "right" });
    const sectorLine = chart.addLineSeries({ color: "#2962ff", lineWidth: 2, priceScaleId: "right" });

    stockLine.setData(data.stock.rpsSeries.map((p) => ({ time: formatDate(p.time), value: p.value })));
    sectorLine.setData(data.sector.rpsSeries.map((p) => ({ time: formatDate(p.time), value: p.value })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, theme]);

  const summary = data?.summary;

  return (
    <ChartShell
      title="相对强弱"
      subtitle={stockName && sectorName ? `${stockName} vs ${sectorName}` : undefined}
      loading={isLoading}
      error={error?.message}
      empty={!tsCode || !sectorCode ? "选择个股后显示" : undefined}
      actions={
        summary && (
          <div className="flex gap-1.5">
            {[
              { label: "5日", value: summary.relativeStrength5d },
              { label: "10日", value: summary.relativeStrength10d },
              { label: summary.label, emphasis: true },
            ].map((b) => (
              <span
                key={b.label}
                className={cn(
                  "px-2 py-1 text-xs border border-border-default",
                  b.emphasis && "text-accent border-accent/30 bg-accent-soft"
                )}
              >
                {b.label}{b.value != null ? ` ${b.value}` : ""}
              </span>
            ))}
          </div>
        )
      }
    >
      <div ref={containerRef} className="w-full" style={{ height: 200 }} />
      {data && (
        <div className="flex gap-3 px-3 pb-2 text-xs text-text-secondary">
          <span><span className="inline-block w-2 h-2 rounded-full bg-state-up mr-1" />{stockName || "个股"} RPS</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-accent mr-1" />{sectorName || "板块"} RPS</span>
        </div>
      )}
    </ChartShell>
  );
}
```

**Step 7: Assemble dashboard page**

```tsx
// src/pages/dashboard/page.tsx
import { useEffect } from "react";
import { useMarketOverview, useSectorRankings, useSectorStocks } from "@/queries";
import { useDashboardStore } from "@/store";
import { MarketSummary } from "@/features/market/components/market-summary";
import { RiskGauge } from "@/features/market/components/risk-gauge";
import { SectorTable } from "@/features/sectors/components/sector-table";
import { StockTable } from "@/features/stocks/components/stock-table";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import { RsPanel } from "@/features/chart/components/rs-panel";

export default function DashboardPage() {
  const { data: overview } = useMarketOverview();
  const { data: rankings = [] } = useSectorRankings();
  const { selectedSectorCode, selectedStockCode, setSelectedSectorCode, setSelectedStockCode } = useDashboardStore();
  const { data: stocks = [], isLoading: stocksLoading } = useSectorStocks(selectedSectorCode);

  // Auto-select first sector
  useEffect(() => {
    if (!selectedSectorCode && rankings.length > 0) {
      setSelectedSectorCode(rankings[0].sectorCode);
    }
  }, [rankings, selectedSectorCode, setSelectedSectorCode]);

  // Auto-select first stock
  useEffect(() => {
    if (!selectedStockCode && stocks.length > 0) {
      setSelectedStockCode(stocks[0].tsCode);
    }
  }, [stocks, selectedStockCode, setSelectedStockCode]);

  const selectedSector = rankings.find((s) => s.sectorCode === selectedSectorCode);
  const selectedStock = stocks.find((s) => s.tsCode === selectedStockCode);

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-default">
        <div>
          <h1 className="text-xl font-semibold">板块强度终端</h1>
          <p className="text-xs text-text-secondary">板块结构、个股联动和图表确认放在同一工作台里。</p>
        </div>
        <div className="flex items-stretch">
          <MarketSummary overview={overview} />
          <RiskGauge risk={overview?.marketRisk} />
        </div>
      </div>

      {/* Main 3-column grid */}
      <div className="flex-1 grid grid-cols-[minmax(300px,1.2fr)_minmax(340px,1.35fr)_minmax(380px,1.1fr)] min-h-0 border-t border-border-default">
        {/* Column 1: Sector rankings */}
        <div className="border-r border-border-default flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border-default">
            <h2 className="text-sm font-medium">板块列表</h2>
            <p className="text-xs text-text-tertiary">{rankings.length} 个候选板块</p>
          </div>
          <SectorTable data={rankings} selectedCode={selectedSectorCode} onSelect={setSelectedSectorCode} />
        </div>

        {/* Column 2: Sector stocks */}
        <div className="border-r border-border-default flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border-default">
            <h2 className="text-sm font-medium">板块内个股</h2>
            <p className="text-xs text-text-tertiary">
              {selectedSector ? `${selectedSector.sectorName} · ${stocks.length} 只` : "选择板块后加载"}
            </p>
          </div>
          <StockTable data={stocks} selectedCode={selectedStockCode} onSelect={setSelectedStockCode} loading={stocksLoading} />
        </div>

        {/* Column 3: Charts */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <CandlestickPanel kind="sector" code={selectedSector?.sectorCode || ""} label={selectedSector?.sectorName || ""} title="细分板块 K 线" emptyText="选择板块后显示" />
          <CandlestickPanel kind="stock" code={selectedStock?.tsCode || ""} label={selectedStock?.stockName || ""} title="选中个股 K 线" emptyText="选择个股后显示" />
          <RsPanel tsCode={selectedStock?.tsCode || ""} sectorCode={selectedSector?.sectorCode || ""} stockName={selectedStock?.stockName} sectorName={selectedSector?.sectorName} />
        </div>
      </div>
    </div>
  );
}
```

**Step 8: Verify dashboard**

Run: `cd frontend && npm run dev`
Navigate to `/dashboard`.
Expected: Three-column layout with sector table, stock table, and charts. Clicking sectors loads stocks. Clicking stocks loads charts. Dark/light toggle works.

**Step 9: Commit**

```bash
git add frontend/src/features/ frontend/src/pages/dashboard/
git commit -m "feat: migrate dashboard page (板块分析) to new architecture"
```

---

## Phase 7: Migrate Watchlist Page

### Task 13: Build watchlist page

**Files:**
- Create: `src/features/watchlist/components/watchlist-sidebar.tsx`
- Create: `src/features/watchlist/components/watchlist-chart-panel.tsx`
- Modify: `src/pages/watchlist/page.tsx`

**Step 1: Create watchlist sidebar**

Migrate the table from `WatchlistWorkbench.jsx`. Use `DataTable` component with columns: code, name, RPS20, 5日. Show selected item with metrics header and subgroup editor in the main area.

Key behaviors to preserve:
- Resizable sidebar (280-520px drag)
- Subgroup editing with PUT API
- Remove from watchlist with DELETE API
- Quick metrics: RPS20, 5日, 10日

Use `useWatchlist()`, `useUpdateWatchlist()`, `useRemoveFromWatchlist()` query hooks instead of direct fetch calls.

**Step 2: Create WatchlistChartPanel**

Migrate `WatchlistChart.jsx` logic: 3-pane synchronized chart (price + volume/RS spread + RPS comparison). Use `useStockChart()` and `useRelativeStrength()` hooks.

Key behaviors:
- CandlestickSeries for price
- HistogramSeries for volume + LineSeries for RS spread in lower pane
- Two LineSeries for stock/sector RPS in RPS pane
- Time range sync via `subscribeVisibleLogicalRangeChange`
- Chart theme from `getChartTheme()`

**Step 3: Assemble watchlist page**

```tsx
// src/pages/watchlist/page.tsx
// Layout: resizable sidebar (watchlist table) | main (stock info + chart)
// Use same grid pattern as old WatchlistWorkbench but with Tailwind classes
// Use Zustand for selected stock (can add watchlist-store if needed, or use local state)
```

**Step 4: Verify and commit**

```bash
git commit -m "feat: migrate watchlist page (自选股) to new architecture"
```

---

## Phase 8: Migrate Bull Camp Page

### Task 14: Build bull camp page

**Files:**
- Create: `src/features/bullcamp/components/bullcamp-table.tsx`
- Create: `src/features/bullcamp/components/camp-tag.tsx`
- Create: `src/features/bullcamp/components/financials-panel.tsx`
- Modify: `src/pages/bullcamp/page.tsx`

**Step 1: Create BullcampTable**

Migrate from `BullCampWorkbench.jsx`. 10 sortable columns using `DataTable` with `sortFn`. Include `CampTag` badges (新/XD/财).

**Step 2: Create FinancialsPanel**

Migrate from `FinancialsPanel.jsx`. Use `useStockFinancials()` hook. KPI row + quarterly table.

**Step 3: Assemble page**

Layout: resizable sidebar (bull camp table) | main area with tab bar (图表/财务/新闻). Use Tabs from shadcn/ui for tab switching.

**Step 4: Verify and commit**

```bash
git commit -m "feat: migrate bull camp page (牛股集中营) to new architecture"
```

---

## Phase 9: Cleanup and Polish

### Task 15: Remove old files and finalize

**Step 1: Delete old JSX files**

```bash
rm frontend/src/App.jsx
rm frontend/src/components/*.jsx
rm frontend/src/components/index.js
rm frontend/src/lib/api.js
rm frontend/src/styles.css
```

**Step 2: Verify full app works**

Run: `cd frontend && npm run dev`
Test:
- Navigate between all 3 pages
- Dark/light theme toggle
- Sector selection -> stock loading -> chart display
- Watchlist operations (subgroup edit, remove)
- Bull camp table sorting, tab switching
- Responsive at 1280px and 1440px+

**Step 3: Build check**

Run: `cd frontend && npm run build`
Expected: No TypeScript errors, clean build.

**Step 4: Commit**

```bash
git add -A frontend/
git commit -m "chore: remove legacy JSX/CSS files, complete migration"
```

---

### Task 16: Responsive and polish pass

**Step 1: Add responsive breakpoints**

In `root-layout.tsx` and page components, add responsive handling:
- Below 1440px: Dashboard columns stack to 1fr
- Below 1280px: Right panel auto-collapses
- Below 960px: TopBar stacks vertically

**Step 2: Verify scrollbar behavior**

Tables should have hidden scrollbars that appear on hover (match current CSS behavior with Tailwind `scrollbar-*` utilities or `ScrollArea` from shadcn/ui).

**Step 3: Final commit**

```bash
git commit -m "feat: add responsive breakpoints and scroll polish"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 1-3 | TS + Tailwind + shadcn/ui + directory structure |
| 2 | 4-7 | Types, services, queries, stores |
| 3 | 8-9 | AppShell, theme, router |
| 4 | 10 | Shared DataTable, formatters |
| 5 | 11 | Chart components |
| 6 | 12 | Dashboard page (板块分析) |
| 7 | 13 | Watchlist page (自选股) |
| 8 | 14 | Bull camp page (牛股集中营) |
| 9 | 15-16 | Cleanup, responsive, polish |

Total: 16 tasks, ~12 commits.
