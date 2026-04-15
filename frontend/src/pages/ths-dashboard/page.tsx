import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, RefreshCw, LayoutDashboard, Search, X, Minus, PenLine, MoveUpRight, Square, StickyNote, Eraser } from "lucide-react";
import { getThsKline, searchMarket, type ThsKlineResult, type MarketSearchStockResult } from "@/services";
import { KlineChart } from "@/shared/charts";
import { Resizer, useResizablePx, useResizableRightPx } from "@/shared/layout";
import { cn } from "@/lib/utils";
import type { CandlePoint, ChartDrawingOverlay } from "@/shared/types";

interface WatchItem {
  code: string;
  name: string;
  sectorCode: string;
  sectorName: string;
}

const DEFAULT_ITEMS: WatchItem[] = [
  { code: "600519", name: "贵州茅台", sectorCode: "881273", sectorName: "白酒" },
  { code: "688981", name: "中芯国际", sectorCode: "881121", sectorName: "半导体" },
  { code: "300750", name: "宁德时代", sectorCode: "881281", sectorName: "电池" },
  { code: "002594", name: "比亚迪", sectorCode: "881125", sectorName: "汽车整车" },
  { code: "601318", name: "中国平安", sectorCode: "881156", sectorName: "保险" },
  { code: "600036", name: "招商银行", sectorCode: "881155", sectorName: "银行" },
];

// 常用同花顺板块（881xxx）字典，用于搜索添加
const THS_SECTORS: Array<{ code: string; name: string }> = [
  { code: "881121", name: "半导体" },
  { code: "881125", name: "汽车整车" },
  { code: "881141", name: "中药" },
  { code: "881148", name: "港口航运" },
  { code: "881149", name: "公路铁路运输" },
  { code: "881152", name: "物流" },
  { code: "881153", name: "房地产" },
  { code: "881155", name: "银行" },
  { code: "881156", name: "保险" },
  { code: "881165", name: "综合" },
  { code: "881180", name: "石油加工贸易" },
  { code: "881265", name: "塑料制品" },
  { code: "881272", name: "软件开发" },
  { code: "881273", name: "白酒" },
  { code: "881280", name: "风电设备" },
  { code: "881281", name: "电池" },
  { code: "881101", name: "种植业与林业" },
  { code: "881114", name: "金属新材料" },
];

const STORAGE_KEY = "ths_dashboard_items_v2";
const INDEX_CODE = "000001.SH";

function useThsKline(code: string | undefined, market: "stock" | "sector" | "index", freq: "1d" | "5m") {
  return useQuery({
    queryKey: ["ths-kline", code, market, freq],
    queryFn: () => getThsKline(code!, market, freq, freq === "5m" ? 480 : 240),
    enabled: !!code,
    staleTime: 30_000,
  });
}

function toCandlePoints(r: ThsKlineResult | undefined): CandlePoint[] {
  return (r?.points ?? []).map((p) => ({
    time: p.time,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    amount: p.amount,
  }));
}

export default function ThsDashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width: leftWidth, onMouseDown: onLeftDrag } = useResizablePx(260, 200, 420);
  const { width: rightWidth, onMouseDown: onRightDrag } = useResizableRightPx(460, 320, 720);

  const [items, setItems] = useState<WatchItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return DEFAULT_ITEMS;
  });
  const [selected, setSelected] = useState<WatchItem | null>(() => items[0] ?? null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [items]);

  const sectorQuery = useThsKline(selected?.sectorCode, "sector", "1d");
  const stockQuery = useThsKline(selected?.code, "stock", "1d");
  const indexQuery = useThsKline(INDEX_CODE, "index", "5m");

  const sectorPoints = useMemo(() => toCandlePoints(sectorQuery.data), [sectorQuery.data]);
  const stockPoints = useMemo(() => toCandlePoints(stockQuery.data), [stockQuery.data]);
  const indexPoints = useMemo(() => toCandlePoints(indexQuery.data), [indexQuery.data]);

  const handleRemove = (code: string) => {
    setItems((prev) => prev.filter((x) => x.code !== code));
    if (selected?.code === code) setSelected(items.find((x) => x.code !== code) ?? null);
  };

  const handleAdded = (item: WatchItem) => {
    setItems((prev) => {
      if (prev.some((x) => x.code === item.code)) return prev;
      return [...prev, item];
    });
    setSelected(item);
    setAddOpen(false);
  };

  const refreshAll = () => {
    sectorQuery.refetch();
    stockQuery.refetch();
    indexQuery.refetch();
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      {/* 左列：自选列表 */}
      <aside
        style={{ width: leftWidth }}
        className="shrink-0 border-r border-border-default bg-surface-secondary/20 flex flex-col min-h-0"
      >
        <div className="px-4 py-3 border-b border-border-default bg-gradient-to-r from-slate-50 via-white to-blue-50">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-semibold">同花顺看板</h2>
          </div>
          <p className="text-xs text-text-tertiary mt-1">自选股 · 板块日K · 个股日K · 大盘5分钟</p>
        </div>

        <div className="px-3 pt-3 pb-2 flex items-center gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700"
          >
            <Plus className="w-3.5 h-3.5" /> 添加股票
          </button>
          <button
            onClick={refreshAll}
            className="p-1.5 rounded-lg border border-border-default hover:bg-surface-hover/40"
            title="刷新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
          {items.map((it) => {
            const active = selected?.code === it.code;
            return (
              <div
                key={it.code}
                onClick={() => setSelected(it)}
                className={cn(
                  "rounded-xl border mb-2 p-3 transition-all cursor-pointer group",
                  active
                    ? "border-sky-300 bg-sky-50/60"
                    : "border-border-default bg-canvas hover:bg-surface-hover/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{it.name}</div>
                    <div className="text-[10px] text-text-tertiary font-mono mt-0.5">{it.code}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(it.code); }}
                    className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-text-secondary">
                  板块：<span className="font-semibold">{it.sectorName}</span>
                  <span className="text-text-tertiary font-mono ml-1">({it.sectorCode})</span>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="mt-8 text-center text-xs text-text-tertiary">点击上方"添加股票"</div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border-default text-[10px] text-text-tertiary">
          数据：同花顺 d.10jqka.com.cn
        </div>
      </aside>

      <Resizer onMouseDown={onLeftDrag} />

      {/* 中列：板块日K + 个股日K */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        <ChartPane
          title={selected ? `${selected.sectorName}（${selected.sectorCode}）· 日K` : "请选择股票"}
          subtitle="细分板块指数"
          data={sectorPoints}
          isLoading={sectorQuery.isLoading}
          error={sectorQuery.error as Error | null}
          frequency="1d"
          accent="indigo"
          drawingKey={selected ? `sector_${selected.sectorCode}_1d` : undefined}
        />
        <div className="border-t border-border-default" />
        <ChartPane
          title={selected ? `${selected.name}（${selected.code}）· 日K` : ""}
          subtitle="个股"
          data={stockPoints}
          isLoading={stockQuery.isLoading}
          error={stockQuery.error as Error | null}
          frequency="1d"
          accent="sky"
          drawingKey={selected ? `stock_${selected.code}_1d` : undefined}
        />
      </main>

      <Resizer onMouseDown={onRightDrag} />

      {/* 右列：大盘5m */}
      <aside
        style={{ width: rightWidth }}
        className="shrink-0 border-l border-border-default bg-surface-secondary/20 flex flex-col min-h-0"
      >
        <ChartPane
          title="上证指数 · 5分钟"
          subtitle={`${INDEX_CODE}`}
          data={indexPoints}
          isLoading={indexQuery.isLoading}
          error={indexQuery.error as Error | null}
          frequency="5m"
          showVolume={false}
          accent="amber"
          drawingKey="index_sh_5m"
        />
        <div className="p-3 border-t border-border-default bg-canvas">
          <div className="text-xs font-semibold mb-2 text-slate-700">当前组合</div>
          {selected ? (
            <ul className="space-y-1 text-[11px] text-text-secondary">
              <li>个股：<span className="font-semibold">{selected.name}</span> <span className="text-text-tertiary font-mono">{selected.code}</span></li>
              <li>板块：<span className="font-semibold">{selected.sectorName}</span> <span className="text-text-tertiary font-mono">{selected.sectorCode}</span></li>
              <li>大盘：上证指数 5分钟</li>
            </ul>
          ) : (
            <div className="text-[11px] text-text-tertiary">未选择</div>
          )}
          <div className="mt-3 pt-2 border-t border-border-default text-[10px] text-text-tertiary">
            提示：鼠标滚轮可缩放 K 线，拖拽图表可平移历史
          </div>
        </div>
      </aside>

      {addOpen && <AddStockModal onClose={() => setAddOpen(false)} onAdded={handleAdded} />}
    </div>
  );
}

// ───────────────────────── ChartPane ─────────────────────────
const DRAWING_TOOLS = [
  { name: "horizontalStraightLine", label: "水平线", icon: Minus },
  { name: "segment", label: "线段", icon: PenLine },
  { name: "rayLine", label: "射线", icon: MoveUpRight },
  { name: "rect", label: "箱体", icon: Square },
  { name: "simpleAnnotation", label: "标注", icon: StickyNote },
];

function ChartPane({
  title, subtitle, data, isLoading, error, frequency, showVolume = true, accent = "sky", drawingKey,
}: {
  title: string;
  subtitle?: string;
  data: CandlePoint[];
  isLoading: boolean;
  error: Error | null;
  frequency: "1d" | "5m";
  showVolume?: boolean;
  accent?: "sky" | "indigo" | "amber";
  drawingKey?: string; // localStorage 画线持久化的 key
}) {
  const accentBg = {
    sky: "from-slate-50 via-white to-sky-50",
    indigo: "from-slate-50 via-white to-indigo-50",
    amber: "from-slate-50 via-white to-amber-50",
  }[accent];

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<ChartDrawingOverlay[]>(() => {
    if (!drawingKey) return [];
    try {
      const raw = localStorage.getItem(`ths_draw_${drawingKey}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!drawingKey) return;
    try {
      localStorage.setItem(`ths_draw_${drawingKey}`, JSON.stringify(drawings));
    } catch { /* ignore */ }
  }, [drawingKey, drawings]);

  // drawingKey 变更（切股票/板块）时，重新从 localStorage 载入
  useEffect(() => {
    if (!drawingKey) { setDrawings([]); return; }
    try {
      const raw = localStorage.getItem(`ths_draw_${drawingKey}`);
      setDrawings(raw ? JSON.parse(raw) : []);
    } catch { setDrawings([]); }
  }, [drawingKey]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`px-4 py-1.5 border-b border-border-default bg-gradient-to-r ${accentBg} flex items-center gap-2`}>
        <span className="text-sm font-semibold">{title}</span>
        {subtitle && <span className="text-[11px] text-text-tertiary">{subtitle}</span>}
        {data.length > 0 && (
          <span className="text-[11px] text-text-tertiary font-mono">· {data.length}根 · {data[data.length - 1]?.close}</span>
        )}
        {drawingKey && data.length > 0 && (
          <div className="ml-auto flex items-center gap-0.5">
            {DRAWING_TOOLS.map((t) => {
              const Icon = t.icon;
              const active = activeTool === t.name;
              return (
                <button
                  key={t.name}
                  onClick={() => setActiveTool(active ? null : t.name)}
                  title={t.label}
                  className={cn(
                    "w-7 h-7 flex items-center justify-center rounded transition-colors",
                    active ? "bg-sky-100 text-sky-700" : "text-text-tertiary hover:bg-surface-hover hover:text-slate-700",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
            {drawings.length > 0 && (
              <button
                onClick={() => setDrawings([])}
                title="清空画线"
                className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:bg-red-50 hover:text-red-500"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 p-2">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-text-tertiary">加载中...</div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-red-500">加载失败：{error.message}</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-text-tertiary">无数据</div>
        ) : (
          <KlineChart
            points={data}
            frequency={frequency}
            showVolume={showVolume}
            enableDrawing={!!drawingKey}
            activeTool={activeTool}
            drawingColor="#0ea5e9"
            initialDrawings={drawings}
            onDrawingsChange={setDrawings}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── AddStockModal ─────────────────────────
function AddStockModal({ onClose, onAdded }: { onClose: () => void; onAdded: (item: WatchItem) => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<MarketSearchStockResult | null>(null);
  const [sectorQuery, setSectorQuery] = useState("");
  const [sectorCode, setSectorCode] = useState("");
  const [sectorName, setSectorName] = useState("");

  const { data: searchResult } = useQuery({
    queryKey: ["ths-add-search", query],
    queryFn: () => searchMarket(query, 10),
    enabled: query.trim().length >= 1,
    staleTime: 60_000,
  });

  const stocks = searchResult?.stocks ?? [];

  const matchedSectors = useMemo(() => {
    const q = sectorQuery.trim();
    if (!q) return THS_SECTORS.slice(0, 12);
    return THS_SECTORS.filter((s) => s.name.includes(q) || s.code.includes(q));
  }, [sectorQuery]);

  const canSubmit = !!picked && !!sectorCode.match(/^\d{6}$/) && !!sectorName;

  const submit = () => {
    if (!canSubmit || !picked) return;
    onAdded({
      code: picked.tsCode.split(".")[0],
      name: picked.stockName,
      sectorCode,
      sectorName,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[520px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border-default bg-gradient-to-r from-slate-50 to-sky-50 flex items-center">
          <h3 className="text-sm font-semibold text-slate-800">添加股票</h3>
          <button onClick={onClose} className="ml-auto text-text-tertiary hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          {/* Step 1: 搜股票 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">1. 搜索股票（中文/代码）</div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                placeholder="例如：茅台 或 600519"
                className="w-full pl-8 pr-3 py-2 text-sm border border-border-default rounded-lg focus:border-sky-400 focus:outline-none"
              />
            </div>
            {stocks.length > 0 && !picked && (
              <div className="mt-2 max-h-40 overflow-auto border border-border-default rounded-lg">
                {stocks.map((s) => (
                  <button
                    key={s.tsCode}
                    onClick={() => setPicked(s)}
                    className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b border-border-default/50 last:border-b-0"
                  >
                    <div className="text-sm font-semibold">{s.stockName}</div>
                    <div className="text-[10px] text-text-tertiary font-mono">{s.tsCode} · {s.sectorName}</div>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="mt-2 px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{picked.stockName}</div>
                  <div className="text-[10px] text-text-tertiary font-mono">{picked.tsCode}</div>
                </div>
                <button onClick={() => setPicked(null)} className="text-[11px] text-sky-700 hover:underline">
                  重选
                </button>
              </div>
            )}
          </div>

          {/* Step 2: 选板块 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
              2. 选细分板块（同花顺 881xxx）
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-tertiary" />
              <input
                value={sectorQuery}
                onChange={(e) => setSectorQuery(e.target.value)}
                placeholder="搜常用板块名 或 直接输入 881xxx"
                className="w-full pl-8 pr-3 py-2 text-sm border border-border-default rounded-lg focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-40 overflow-auto border border-border-default rounded-lg">
              {matchedSectors.map((s) => {
                const active = sectorCode === s.code;
                return (
                  <button
                    key={s.code}
                    onClick={() => { setSectorCode(s.code); setSectorName(s.name); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 border-b border-border-default/50 last:border-b-0 hover:bg-sky-50",
                      active && "bg-sky-100",
                    )}
                  >
                    <span className="text-sm font-semibold">{s.name}</span>
                    <span className="text-[10px] text-text-tertiary font-mono ml-2">{s.code}</span>
                  </button>
                );
              })}
              {matchedSectors.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-text-tertiary">无匹配，请手动填代码和名称</div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={sectorCode}
                onChange={(e) => setSectorCode(e.target.value.trim())}
                placeholder="881xxx"
                maxLength={6}
                className="w-24 px-2 py-1.5 text-sm border border-border-default rounded-lg font-mono focus:border-sky-400 focus:outline-none"
              />
              <input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                placeholder="板块名称"
                className="flex-1 px-2 py-1.5 text-sm border border-border-default rounded-lg focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div className="mt-1 text-[10px] text-text-tertiary">
              板块代码查询：同花顺 q.10jqka.com.cn/thshy/
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border-default bg-surface-secondary/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-border-default rounded-lg hover:bg-surface-hover/40">
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              "px-4 py-1.5 text-xs rounded-lg",
              canSubmit ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            添加到自选
          </button>
        </div>
      </div>
    </div>
  );
}
