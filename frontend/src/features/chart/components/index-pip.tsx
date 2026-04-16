import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getThsKline } from "@/services/ths.service";
import { KlineChart } from "@/shared/charts";
import { Minimize2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandlePoint } from "@/shared/types";

const INDEX_CODE = "000001.SH";
const DEFAULT_SIZE = { width: 240, height: 140 };
const MINIMIZED_SIZE = { width: 48, height: 32 };

interface IndexPipProps {
  defaultPosition?: { top: number; right: number };
  className?: string;
}

function useIndexKline() {
  return useQuery({
    queryKey: ["ths-kline", INDEX_CODE, "index", "5m"],
    queryFn: () => getThsKline(INDEX_CODE, "index", "5m", 120),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function IndexPip({ defaultPosition = { top: 12, right: 12 }, className }: IndexPipProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initTop: number; initRight: number } | null>(null);

  const { data, isLoading } = useIndexKline();
  const points: CandlePoint[] = useMemo(() => {
    return (data?.points ?? []).map((p: any) => ({
      time: p.time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume ?? 0,
      amount: p.amount ?? 0,
    }));
  }, [data]);

  const lastClose = points[points.length - 1]?.close;

  // Drag logic
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { mouseX, mouseY, initTop, initRight } = dragStartRef.current;
      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;
      setPosition({
        top: Math.max(0, initTop + dy),
        right: Math.max(0, initRight - dx),
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const startDrag = (e: React.MouseEvent) => {
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initTop: position.top,
      initRight: position.right,
    };
    setDragging(true);
  };

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className={cn(
          "absolute z-20 bg-canvas/95 backdrop-blur border border-border-default rounded-md shadow-sm hover:bg-surface-hover transition-colors flex items-center justify-center",
          className,
        )}
        style={{
          top: position.top,
          right: position.right,
          width: MINIMIZED_SIZE.width,
          height: MINIMIZED_SIZE.height,
        }}
        title="展开上证5m"
      >
        <TrendingUp className="w-3.5 h-3.5 text-accent" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "absolute z-20 bg-canvas/95 backdrop-blur border border-border-default rounded-md overflow-hidden flex flex-col",
        dragging && "cursor-grabbing select-none",
        className,
      )}
      style={{
        top: position.top,
        right: position.right,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
      }}
    >
      {/* 标题栏（拖拽把手）*/}
      <div
        onMouseDown={startDrag}
        className="px-2 py-1 border-b border-border-subtle flex items-center gap-1.5 shrink-0 cursor-grab active:cursor-grabbing bg-surface"
      >
        <TrendingUp className="w-3 h-3 text-accent shrink-0" />
        <span className="text-[10px] font-semibold text-text-primary truncate">
          上证5m
        </span>
        {lastClose != null && (
          <span className="text-[10px] font-mono tabular-nums text-text-secondary ml-auto shrink-0">
            {lastClose.toFixed(2)}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(true);
          }}
          className="w-3.5 h-3.5 flex items-center justify-center rounded-sm hover:bg-surface-hover text-text-tertiary shrink-0"
          title="最小化"
        >
          <Minimize2 className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* K 线区 */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-[10px] text-text-tertiary">
            加载中...
          </div>
        ) : points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-text-tertiary">
            无数据
          </div>
        ) : (
          <KlineChart points={points} frequency="5m" showVolume={false} />
        )}
      </div>
    </div>
  );
}
