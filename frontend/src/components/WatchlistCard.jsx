import { useState } from "react";
import WatchlistChart from "./WatchlistChart";
import { removeFromWatchlist, updateWatchlist } from "../lib/api";

function fmtValue(value) {
  if (value == null || value === "") return "-";
  return Number(value).toFixed(2);
}

function tone(value) {
  if (value == null || value === "") return "";
  return Number(value) >= 0 ? "up" : "down";
}

export default function WatchlistCard({ item, onRemove }) {
  const [editingSubgroup, setEditingSubgroup] = useState(false);
  const [subgroupValue, setSubgroupValue] = useState(item.subgroup || "");

  const handleSaveSubgroup = async () => {
    await updateWatchlist(item.tsCode, { subgroup: subgroupValue.trim() });
    item.subgroup = subgroupValue.trim();
    setEditingSubgroup(false);
  };

  const handleRemove = async () => {
    if (confirm(`确定要移除 ${item.stockName} 吗？`)) {
      await removeFromWatchlist(item.tsCode);
      onRemove?.();
    }
  };

  return (
    <article className="watch-card">
      <div className="watch-card-head">
        <div className="watch-card-name">{item.stockName}</div>
        <div className="watch-card-code">{item.tsCode}</div>
      </div>

      <div className="watch-card-subgroup">
        {editingSubgroup ? (
          <div className="subgroup-edit">
            <input
              type="text"
              value={subgroupValue}
              onChange={(e) => setSubgroupValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveSubgroup();
                if (e.key === "Escape") {
                  setSubgroupValue(item.subgroup || "");
                  setEditingSubgroup(false);
                }
              }}
              onBlur={handleSaveSubgroup}
              className="subgroup-input"
              autoFocus
            />
          </div>
        ) : (
          <button
            className="subgroup-btn"
            onClick={() => setEditingSubgroup(true)}
          >
            {item.subgroup || "点击编辑细分"}
          </button>
        )}
      </div>

      <div className="watch-card-sector">{item.sectorName || "未绑定板块"}</div>

      <div className="watch-card-metrics">
        <div className="watch-metric">
          <span className="watch-metric-label">RPS20</span>
          <span className="watch-metric-value">{fmtValue(item.rps20)}</span>
        </div>
        <div className="watch-metric">
          <span className="watch-metric-label">5日</span>
          <span className={`watch-metric-value ${tone(item.pctChange5d)}`}>
            {fmtValue(item.pctChange5d)}%
          </span>
        </div>
        <div className="watch-metric">
          <span className="watch-metric-label">10日</span>
          <span className={`watch-metric-value ${tone(item.pctChange10d)}`}>
            {fmtValue(item.pctChange10d)}%
          </span>
        </div>
      </div>

      <WatchlistChart tsCode={item.tsCode} sectorCode={item.sectorCode} />

      <div className="watch-card-actions">
        <button className="watch-action-btn danger" onClick={handleRemove}>
          移除
        </button>
      </div>
    </article>
  );
}
