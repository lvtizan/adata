import { useCallback, useRef, useState } from "react";

/**
 * 基于百分比的弹性列宽 hook。
 * pct: 0-1 (列宽占容器百分比)，拖拽改变百分比而非像素。
 * 这样窗口缩放时列会等比例缩放。
 */
export function useResizablePct(
  initialPct: number,
  minPct: number,
  maxPct: number,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [pct, setPct] = useState(initialPct);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startPct = pct;
      const containerWidth = containerRef.current?.clientWidth || 1200;

      function onMove(ev: MouseEvent) {
        if (!dragging.current) return;
        const dx = ev.clientX - startX;
        const dPct = dx / containerWidth;
        setPct(Math.min(maxPct, Math.max(minPct, startPct + dPct)));
      }
      function onUp() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [pct, minPct, maxPct, containerRef],
  );

  return { pct, onMouseDown };
}

/**
 * 基于像素的列宽 hook。
 */
export function useResizablePx(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;

      function onMove(ev: MouseEvent) {
        if (!dragging.current) return;
        setWidth(Math.min(maxWidth, Math.max(minWidth, startW + ev.clientX - startX)));
      }
      function onUp() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width, minWidth, maxWidth],
  );

  return { width, onMouseDown };
}

/**
 * 基于像素的右侧列宽 hook（拖拽方向相反）。
 */
export function useResizableRightPx(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;

      function onMove(ev: MouseEvent) {
        if (!dragging.current) return;
        setWidth(Math.min(maxWidth, Math.max(minWidth, startW - (ev.clientX - startX))));
      }
      function onUp() {
        dragging.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width, minWidth, maxWidth],
  );

  return { width, onMouseDown };
}

export function Resizer({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-[8px] cursor-col-resize relative shrink-0 group flex items-center justify-center"
      onMouseDown={onMouseDown}
    >
      <div className="w-[4px] h-8 rounded-full bg-border-default/60 group-hover:bg-text-tertiary group-hover:h-12 transition-all" />
    </div>
  );
}
