import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getThsKline } from "@/services/ths.service";
import { useThsSectorMembers } from "@/queries";
import { KlineChart } from "@/shared/charts";
import { EmptyState } from "@/shared/ui/empty-state";
import { StockKlineWorkbench } from "@/shared/charts/stock-kline-workbench";
import { BarChart3, Minus, PenLine, MoveUpRight, Square, StickyNote, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandlePoint, ChartDrawingOverlay } from "@/shared/types";
import { IndexPip } from "./index-pip";

interface DashboardChartColumnProps {
  sectorCode?: string;
  stockCode?: string; // bare code e.g. "600519"
}

/** Convert bare code to Tushare tsCode: 6xxxxx -> .SH, others -> .SZ */
function toTsCode(code: string): string {
  if (!code) return "";
  if (code.includes(".")) return code; // already suffixed
  if (code.startsWith("6") || code.startsWith("9") || code.startsWith("5")) {
    return `${code}.SH`;
  }
  return `${code}.SZ`;
}

function useSectorKline(code: string | undefined) {
  return useQuery({
    queryKey: ["ths-kline", code, "sector", "1d"],
    queryFn: () => getThsKline(code!, "sector", "1d", 240),
    enabled: !!code,
    staleTime: 60_000,
  });
}

const DRAWING_TOOLS = [
  { name: "horizontalStraightLine", label: "水平线", icon: Minus },
  { name: "segment", label: "线段", icon: PenLine },
  { name: "rayLine", label: "射线", icon: MoveUpRight },
  { name: "rect", label: "箱体", icon: Square },
  { name: "simpleAnnotation", label: "标注", icon: StickyNote },
];

function SectorKlinePane({ sectorCode }: { sectorCode?: string }) {
  const sectorQuery = useSectorKline(sectorCode);

  const sectorPoints: CandlePoint[] = useMemo(
    () =>
      (sectorQuery.data?.points ?? []).map((p) => ({
        time: p.time,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
        amount: p.amount,
      })),
    [sectorQuery.data],
  );

  const sectorName = sectorQuery.data?.name ?? "";
  const drawingKey = sectorCode ? `sector_${sectorCode}_1d` : undefined;

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<ChartDrawingOverlay[]>(() => {
    if (!drawingKey) return [];
    try {
      const raw = localStorage.getItem(`dash_draw_${drawingKey}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  // Persist drawings
  useMemo(() => {
    if (!drawingKey) return;
    try {
      localStorage.setItem(`dash_draw_${drawingKey}`, JSON.stringify(drawings));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingKey, drawings]);

  return (
    <div className="flex-1 min-h-0 border-b border-border-default flex flex-col">
      <div className="px-3 py-1 border-b border-border-subtle flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-semibold text-text-primary">
          {sectorName || sectorCode || "板块"} 日K
        </span>
        {sectorCode && (
          <span className="text-[10px] text-text-tertiary font-mono">{sectorCode}</span>
        )}
        {sectorPoints.length > 0 && (
          <span className="text-[10px] text-text-tertiary font-mono">
            {sectorPoints.length}根 · {sectorPoints[sectorPoints.length - 1]?.close}
          </span>
        )}
        {drawingKey && sectorPoints.length > 0 && (
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
                    "w-6 h-6 flex items-center justify-center rounded transition-colors",
                    active
                      ? "bg-sky-100 text-sky-700"
                      : "text-text-tertiary hover:bg-surface-hover hover:text-slate-700",
                  )}
                >
                  <Icon className="w-3 h-3" />
                </button>
              );
            })}
            {drawings.length > 0 && (
              <button
                onClick={() => setDrawings([])}
                title="清空画线"
                className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:bg-red-50 hover:text-red-500"
              >
                <Eraser className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 p-1 relative">
        {!sectorCode ? (
          <EmptyState size="sm" icon={<BarChart3 className="w-7 h-7" />} title="请选择板块" />
        ) : sectorQuery.isLoading ? (
          <div className="h-full flex items-center justify-center text-[11px] text-text-tertiary">加载中...</div>
        ) : sectorQuery.error ? (
          <div className="h-full flex items-center justify-center text-[11px] text-state-down">
            加载失败：{(sectorQuery.error as Error).message}
          </div>
        ) : sectorPoints.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<BarChart3 className="w-7 h-7" />}
            title="暂无 K 线数据"
          />
        ) : (
          <KlineChart
            points={sectorPoints}
            frequency="1d"
            showVolume
            enableDrawing={!!drawingKey}
            activeTool={activeTool}
            drawingColor="#6366f1"
            initialDrawings={drawings}
            onDrawingsChange={setDrawings}
          />
        )}
        {/* 上证 5m 画中画 */}
        <IndexPip />
      </div>
    </div>
  );
}

function StockKlinePane({
  sectorCode,
  stockCode,
}: {
  sectorCode?: string;
  stockCode?: string;
}) {
  const { data: membersResp } = useThsSectorMembers(sectorCode);
  const stockItem = membersResp?.items.find((m) => m.code === stockCode);
  const stockName = stockItem?.name ?? "";
  const tsCode = stockCode ? toTsCode(stockCode) : "";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-1 border-b border-border-subtle flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-semibold text-text-primary">
          {stockName || stockCode || "个股"} 日K
        </span>
        {tsCode && (
          <span className="text-[10px] text-text-tertiary font-mono">{tsCode}</span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {!stockCode ? (
          <EmptyState size="sm" icon={<BarChart3 className="w-7 h-7" />} title="请选择个股" />
        ) : (
          <StockKlineWorkbench
            tsCode={tsCode}
            sectorCode=""
            stockName={stockName}
            showDrawingsPanel={false}
          />
        )}
      </div>
    </div>
  );
}

export function DashboardChartColumn({ sectorCode, stockCode }: DashboardChartColumnProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <SectorKlinePane sectorCode={sectorCode} />
      <StockKlinePane sectorCode={sectorCode} stockCode={stockCode} />
    </div>
  );
}
