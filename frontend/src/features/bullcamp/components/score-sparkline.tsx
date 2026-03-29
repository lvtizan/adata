/**
 * 迷你趋势折线图 — 纯 SVG，用于表格单元格内展示 campScore 最近 N 天变化
 */

interface ScoreSparklineProps {
  /** campScore 历史数据（从旧到新），null 表示当天不在营 */
  data: (number | null)[];
  width?: number;
  height?: number;
}

export function ScoreSparkline({ data, width = 48, height = 18 }: ScoreSparklineProps) {
  // 过滤掉 null
  const points = data.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null);
  if (points.length < 2) return <span className="text-text-tertiary text-[10px]">—</span>;

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const maxIdx = data.length - 1;

  const coords = points.map((p) => ({
    x: pad + (maxIdx > 0 ? (p.i / maxIdx) * innerW : innerW / 2),
    y: pad + innerH - ((p.v - min) / range) * innerH,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  // 趋势判断：最后一个 vs 第一个
  const first = points[0].v;
  const last = points[points.length - 1].v;
  const color = last > first ? "var(--color-state-up)" : last < first ? "var(--color-state-down)" : "var(--color-text-tertiary)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle">
      <polyline
        points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 终点圆点 */}
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={1.5} fill={color} />
    </svg>
  );
}
