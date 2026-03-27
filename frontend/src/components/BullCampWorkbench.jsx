import { useEffect, useMemo, useState } from "react";
import WatchlistChart from "./WatchlistChart";

const COLUMNS = [
  { key: "tsCode", label: "代码" },
  { key: "stockName", label: "名称" },
  { key: "sectorName", label: "板块" },
  { key: "close", label: "现价", numeric: true },
  { key: "pctChange5d", label: "5日", numeric: true },
  { key: "sectorPctChange5d", label: "板块5日", numeric: true },
  { key: "rps20", label: "RPS20", numeric: true },
  { key: "sectorRps10", label: "板块RPS10", numeric: true },
  { key: "relativeStrengthLatest", label: "相对强弱", numeric: true },
  { key: "amount", label: "成交额", numeric: true },
  { key: "campScore", label: "综合分", numeric: true },
];

function fmtPct(value) {
  if (value == null || value === "") return "-";
  return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

function fmtValue(value) {
  if (value == null || value === "") return "-";
  return Number(value).toFixed(2);
}

function fmtAmount(value) {
  if (value == null || value === "") return "-";
  const amount = Number(value);
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(1)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(1)}万`;
  return amount.toFixed(0);
}

function tone(value) {
  if (value == null || value === "") return "";
  return Number(value) >= 0 ? "up" : "down";
}

function compareValues(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "zh-Hans-CN");
}

export default function BullCampWorkbench({ items }) {
  const [selectedCode, setSelectedCode] = useState(items[0]?.tsCode || "");
  const [sortState, setSortState] = useState({ key: "campScore", direction: "desc" });
  const [sidebarWidth, setSidebarWidth] = useState(560);

  useEffect(() => {
    setSelectedCode((current) => (current && items.some((item) => item.tsCode === current) ? current : items[0]?.tsCode || ""));
  }, [items]);

  const sortedItems = useMemo(() => {
    const nextItems = [...items];
    nextItems.sort((a, b) => {
      const result = compareValues(a[sortState.key], b[sortState.key]);
      return sortState.direction === "asc" ? result : -result;
    });
    return nextItems;
  }, [items, sortState]);

  const selectedItem = useMemo(
    () => sortedItems.find((item) => item.tsCode === selectedCode) || sortedItems[0] || null,
    [sortedItems, selectedCode],
  );

  if (!items.length) {
    return <div className="empty-box">当前没有满足牛股集中营条件的股票。</div>;
  }

  return (
    <section className="watchlist-terminal bull-camp-terminal" style={{ gridTemplateColumns: `${sidebarWidth}px 10px minmax(760px, 1fr)` }}>
      <aside className="watchlist-sidebar bull-camp-sidebar">
        <div className="terminal-section-head">
          <div>
            <h2>牛股集中营</h2>
            <p>{sortedItems.length} 只符合强势条件的股票</p>
          </div>
        </div>
        <div className="watchlist-table-wrap">
          <table className="market-table watchlist-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`sortable-th ${sortState.key === column.key ? "active" : ""}`}
                    onClick={() =>
                      setSortState((current) => ({
                        key: column.key,
                        direction: current.key === column.key && current.direction === "desc" ? "asc" : "desc",
                      }))
                    }
                  >
                    <span>{column.label}</span>
                    <em>{sortState.key === column.key ? (sortState.direction === "desc" ? "↓" : "↑") : "↕"}</em>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.tsCode}
                  className={item.tsCode === selectedItem?.tsCode ? "active" : ""}
                  onClick={() => setSelectedCode(item.tsCode)}
                >
                  <td className="mono">{item.tsCode}</td>
                  <td>{item.stockName}</td>
                  <td>{item.sectorName}</td>
                  <td>{fmtValue(item.close)}</td>
                  <td className={tone(item.pctChange5d)}>{fmtPct(item.pctChange5d)}</td>
                  <td className={tone(item.sectorPctChange5d)}>{fmtPct(item.sectorPctChange5d)}</td>
                  <td>{fmtValue(item.rps20)}</td>
                  <td>{fmtValue(item.sectorRps10)}</td>
                  <td className={tone(item.relativeStrengthLatest)}>{fmtValue(item.relativeStrengthLatest)}</td>
                  <td>{fmtAmount(item.amount)}</td>
                  <td>{fmtValue(item.campScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>

      <div
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = sidebarWidth;
          const handleMove = (moveEvent) => {
            const nextWidth = Math.min(760, Math.max(420, startWidth + moveEvent.clientX - startX));
            setSidebarWidth(nextWidth);
          };
          const handleUp = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
          };
          window.addEventListener("mousemove", handleMove);
          window.addEventListener("mouseup", handleUp);
        }}
      />

      <section className="watchlist-main bull-camp-main">
        <div className="watchlist-main-head">
          <div>
            <div className="eyebrow">Bull Camp</div>
            <h2>{selectedItem?.stockName || "--"}</h2>
            <p>{selectedItem?.tsCode || "--"} · {selectedItem?.sectorName || "--"}</p>
          </div>
          <div className="watchlist-quick-metrics">
            <div className="terminal-metric">
              <span>RPS20</span>
              <strong>{fmtValue(selectedItem?.rps20)}</strong>
            </div>
            <div className="terminal-metric">
              <span>相对强弱</span>
              <strong className={tone(selectedItem?.relativeStrengthLatest)}>{fmtValue(selectedItem?.relativeStrengthLatest)}</strong>
            </div>
            <div className="terminal-metric">
              <span>综合分</span>
              <strong>{fmtValue(selectedItem?.campScore)}</strong>
            </div>
          </div>
        </div>

        <div className="watchlist-toolbar bull-camp-toolbar">
          <div className="watchlist-subgroup">
            <span>5日强度</span>
            <strong className={tone((selectedItem?.pctChange5d ?? 0) - (selectedItem?.sectorPctChange5d ?? 0))}>
              {fmtPct(selectedItem?.pctChange5d)} / {fmtPct(selectedItem?.sectorPctChange5d)}
            </strong>
          </div>
          <div className="watchlist-subgroup">
            <span>成交额</span>
            <strong>{fmtAmount(selectedItem?.amount)}</strong>
          </div>
          <div className="watchlist-subgroup">
            <span>板块 RPS10</span>
            <strong>{fmtValue(selectedItem?.sectorRps10)}</strong>
          </div>
        </div>

        <WatchlistChart
          key={`${selectedItem?.tsCode || ""}:${selectedItem?.sectorCode || ""}`}
          tsCode={selectedItem?.tsCode || ""}
          sectorCode={selectedItem?.sectorCode || ""}
          stockName={selectedItem?.stockName || ""}
          showTools={false}
        />
      </section>
    </section>
  );
}
