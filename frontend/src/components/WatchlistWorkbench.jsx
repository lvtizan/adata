import { useEffect, useMemo, useState } from "react";
import WatchlistChart from "./WatchlistChart";
import { removeFromWatchlist, updateWatchlist } from "../lib/api";

function fmtPct(value) {
  if (value == null || value === "") return "-";
  return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

function fmtValue(value) {
  if (value == null || value === "") return "-";
  return Number(value).toFixed(2);
}

function tone(value) {
  if (value == null || value === "") return "";
  return Number(value) >= 0 ? "up" : "down";
}

export default function WatchlistWorkbench({ items, onRefresh }) {
  const [selectedCode, setSelectedCode] = useState(items[0]?.tsCode || "");
  const [editingSubgroup, setEditingSubgroup] = useState(false);
  const [subgroupValue, setSubgroupValue] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(360);

  useEffect(() => {
    setSelectedCode((current) => (current && items.some((item) => item.tsCode === current) ? current : items[0]?.tsCode || ""));
  }, [items]);

  const selectedItem = useMemo(
    () => items.find((item) => item.tsCode === selectedCode) || null,
    [items, selectedCode],
  );

  useEffect(() => {
    setSubgroupValue(selectedItem?.subgroup || "");
    setEditingSubgroup(false);
  }, [selectedItem]);

  const handleSaveSubgroup = async () => {
    if (!selectedItem) return;
    await updateWatchlist(selectedItem.tsCode, { subgroup: subgroupValue.trim() });
    setEditingSubgroup(false);
    onRefresh?.();
  };

  const handleRemove = async () => {
    if (!selectedItem) return;
    if (confirm(`确定要移除 ${selectedItem.stockName} 吗？`)) {
      await removeFromWatchlist(selectedItem.tsCode);
      onRefresh?.();
    }
  };

  if (!items.length) {
    return <div className="empty-box">先在板块分析里挑选股票，再加入自选。</div>;
  }

  return (
    <section className="watchlist-terminal" style={{ gridTemplateColumns: `${sidebarWidth}px 10px minmax(760px, 1fr)` }}>
      <aside className="watchlist-sidebar">
        <div className="terminal-section-head">
          <div>
            <h2>自选列表</h2>
            <p>{items.length} 只重点跟踪标的</p>
          </div>
        </div>
        <div className="watchlist-table-wrap">
          <table className="market-table watchlist-table">
            <thead>
              <tr>
                <th>代码</th>
                <th>名称</th>
                <th>RPS20</th>
                <th>5日</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.tsCode}
                  className={item.tsCode === selectedCode ? "active" : ""}
                  onClick={() => setSelectedCode(item.tsCode)}
                >
                  <td className="mono">{item.tsCode}</td>
                  <td>
                    <div className="symbol-cell">
                      <strong>{item.stockName}</strong>
                      <span>{item.sectorName || "未绑定板块"}</span>
                    </div>
                  </td>
                  <td>{fmtValue(item.rps20)}</td>
                  <td className={tone(item.pctChange5d)}>{fmtPct(item.pctChange5d)}</td>
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
            const nextWidth = Math.min(520, Math.max(280, startWidth + moveEvent.clientX - startX));
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

      <section className="watchlist-main">
        <div className="watchlist-main-head">
          <div>
            <div className="eyebrow">Watchlist Terminal</div>
            <h2>{selectedItem?.stockName || "--"}</h2>
            <p>{selectedItem?.tsCode || "--"} · {selectedItem?.sectorName || "未绑定板块"}</p>
          </div>
          <div className="watchlist-quick-metrics">
            <div className="terminal-metric">
              <span>RPS20</span>
              <strong>{fmtValue(selectedItem?.rps20)}</strong>
            </div>
            <div className="terminal-metric">
              <span>5日</span>
              <strong className={tone(selectedItem?.pctChange5d)}>{fmtPct(selectedItem?.pctChange5d)}</strong>
            </div>
            <div className="terminal-metric">
              <span>10日</span>
              <strong className={tone(selectedItem?.pctChange10d)}>{fmtPct(selectedItem?.pctChange10d)}</strong>
            </div>
          </div>
        </div>

        <div className="watchlist-toolbar">
          <div className="watchlist-subgroup">
            <span>细分标签</span>
            {editingSubgroup ? (
              <input
                type="text"
                value={subgroupValue}
                onChange={(event) => setSubgroupValue(event.target.value)}
                onBlur={handleSaveSubgroup}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSaveSubgroup();
                  if (event.key === "Escape") {
                    setSubgroupValue(selectedItem?.subgroup || "");
                    setEditingSubgroup(false);
                  }
                }}
                className="terminal-input"
                autoFocus
              />
            ) : (
              <button className="terminal-chip" onClick={() => setEditingSubgroup(true)}>
                {selectedItem?.subgroup || "点击编辑细分"}
              </button>
            )}
          </div>
          <button className="terminal-danger-btn" onClick={handleRemove}>移除自选</button>
        </div>

        <WatchlistChart
          key={`${selectedItem?.tsCode || ""}:${selectedItem?.sectorCode || ""}`}
          tsCode={selectedItem?.tsCode || ""}
          sectorCode={selectedItem?.sectorCode || ""}
          stockName={selectedItem?.stockName || ""}
        />
      </section>
    </section>
  );
}
