import { useEffect, useMemo, useState } from "react";
import { BullCampWorkbench, MarketRiskGauge, WatchlistWorkbench } from "./components";
import CandlestickPanel from "./components/CandlestickPanel";
import RelativeStrengthPanel from "./components/RelativeStrengthPanel";
import { getBullCamp, getMarketOverview, getSectorRankings, getSectorStocks, getWatchlist, preloadBullCampAssets } from "./lib/api";

function fmtPct(value) {
  if (value == null || value === "") return "-";
  return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
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

function safeItems(result) {
  return Array.isArray(result?.items) ? result.items : [];
}

function topSectorNames(overview) {
  return Array.isArray(overview?.topSectors)
    ? overview.topSectors.slice(0, 3).map((item) => item.sectorName).join(" / ")
    : "";
}

export default function App() {
  const [activeView, setActiveView] = useState("analysis");
  const [overview, setOverview] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [bullCamp, setBullCamp] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [sectorStocks, setSectorStocks] = useState([]);
  const [selectedSectorCode, setSelectedSectorCode] = useState("");
  const [selectedStockCode, setSelectedStockCode] = useState("");
  const [loading, setLoading] = useState({ shell: true, stocks: false, bullCamp: false });
  const [errors, setErrors] = useState({ shell: "", stocks: "", bullCamp: "" });

  const selectedSector = useMemo(
    () => rankings.find((item) => item.sectorCode === selectedSectorCode) || null,
    [rankings, selectedSectorCode],
  );
  const selectedStock = useMemo(
    () => sectorStocks.find((item) => item.tsCode === selectedStockCode) || null,
    [sectorStocks, selectedStockCode],
  );

  async function loadShell() {
    setLoading((prev) => ({ ...prev, shell: true }));
    setErrors((prev) => ({ ...prev, shell: "" }));

    const [overviewResult, watchlistResult, rankingsResult] = await Promise.allSettled([
      getMarketOverview(),
      getWatchlist(),
      getSectorRankings("rps10"),
    ]);

    if (overviewResult.status === "fulfilled") {
      setOverview(overviewResult.value);
    }

    if (watchlistResult.status === "fulfilled") {
      setWatchlist(safeItems(watchlistResult.value));
    }

    if (rankingsResult.status === "fulfilled") {
      const items = safeItems(rankingsResult.value);
      setRankings(items);
      setSelectedSectorCode((current) => (current && items.some((item) => item.sectorCode === current) ? current : items[0]?.sectorCode || ""));
    }

    const failedMessages = [overviewResult, watchlistResult, rankingsResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "加载失败");

    setErrors((prev) => ({ ...prev, shell: failedMessages[0] || "" }));
    setLoading((prev) => ({ ...prev, shell: false }));
  }

  useEffect(() => {
    loadShell();
  }, []);

  useEffect(() => {
    if (loading.shell) return;
    let cancelled = false;

    async function preloadBullCamp() {
      try {
        const result = await getBullCamp();
        const items = safeItems(result);
        if (!cancelled) {
          setBullCamp((current) => (current.length ? current : items));
        }
        if (items[0]) preloadBullCampAssets(items[0]).catch(() => {});
      } catch {
        // Ignore preload failures; the dedicated page handles its own error state.
      }
    }

    preloadBullCamp();
    return () => {
      cancelled = true;
    };
  }, [loading.shell]);

  useEffect(() => {
    let active = true;

    async function loadStocks() {
      if (!selectedSectorCode) {
        setSectorStocks([]);
        setSelectedStockCode("");
        return;
      }

      setLoading((prev) => ({ ...prev, stocks: true }));
      setErrors((prev) => ({ ...prev, stocks: "" }));

      try {
        const result = await getSectorStocks(selectedSectorCode, "rps10");
        if (!active) return;
        const items = safeItems(result);
        setSectorStocks(items);
        setSelectedStockCode((current) => (current && items.some((item) => item.tsCode === current) ? current : items[0]?.tsCode || ""));
      } catch (error) {
        if (!active) return;
        setSectorStocks([]);
        setSelectedStockCode("");
        setErrors((prev) => ({ ...prev, stocks: error.message || "成分股加载失败" }));
      } finally {
        if (active) setLoading((prev) => ({ ...prev, stocks: false }));
      }
    }

    loadStocks();
    return () => {
      active = false;
    };
  }, [selectedSectorCode]);

  useEffect(() => {
    let active = true;

    async function loadBullCamp() {
      if (activeView !== "bullcamp") return;
      if (bullCamp.length) return;
      setLoading((prev) => ({ ...prev, bullCamp: true }));
      setErrors((prev) => ({ ...prev, bullCamp: "" }));
      try {
        const result = await getBullCamp();
        if (!active) return;
        const items = safeItems(result);
        setBullCamp(items);
        if (items[0]) preloadBullCampAssets(items[0]).catch(() => {});
      } catch (error) {
        if (!active) return;
        setBullCamp([]);
        setErrors((prev) => ({ ...prev, bullCamp: error.message || "牛股集中营加载失败" }));
      } finally {
        if (active) setLoading((prev) => ({ ...prev, bullCamp: false }));
      }
    }

    loadBullCamp();
    return () => {
      active = false;
    };
  }, [activeView, bullCamp.length]);

  return (
    <div className="terminal-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AS</div>
          <div>
            <div className="brand-name">A-Share Terminal</div>
            <div className="brand-sub">Trading Desk Workstation</div>
          </div>
        </div>
        <nav className="topnav">
          <button className={activeView === "analysis" ? "active" : ""} onClick={() => setActiveView("analysis")}>板块分析</button>
          <button className={activeView === "watchlist" ? "active" : ""} onClick={() => setActiveView("watchlist")}>自选股</button>
          <button className={activeView === "bullcamp" ? "active" : ""} onClick={() => setActiveView("bullcamp")}>牛股集中营</button>
        </nav>
        <div className="topbar-meta">
          <span>{overview?.tradeDate || "--"}</span>
          <span className={`market-badge ${overview?.marketState?.openPermissionLight || ""}`}>{overview?.marketState?.label || "市场状态"}</span>
        </div>
      </header>

      {activeView !== "bullcamp" && (
        <section className="dashboard-head">
          <div>
            <h1>{activeView === "analysis" ? "板块强度终端" : "自选股终端"}</h1>
            <p>{activeView === "analysis" ? "板块结构、个股联动和图表确认放在同一工作台里。" : "主图优先，副图追踪量能与强弱变化。"} </p>
          </div>
          <div className="summary-strip">
            <div className="summary-pill">
              <span>主线</span>
              <strong>{overview?.mainline?.name || "--"}</strong>
            </div>
            <div className="summary-pill">
              <span>涨停 / 跌停</span>
              <strong>{overview?.breadth?.limitUpCount ?? "--"} / {overview?.breadth?.limitDownCount ?? "--"}</strong>
            </div>
            <div className="summary-pill">
              <span>情绪</span>
              <strong>{overview?.emotionState?.label || "--"}</strong>
            </div>
            <div className="summary-pill">
              <span>聚焦板块</span>
              <strong>{topSectorNames(overview) || "--"}</strong>
            </div>
            <MarketRiskGauge risk={overview?.marketRisk} />
          </div>
        </section>
      )}

      {errors.shell && <section className="notice error">{errors.shell}</section>}
      {loading.shell && <section className="notice">主面板加载中...</section>}

      {!loading.shell && activeView === "analysis" && (
        <section className="workspace-grid">
          <section className="panel table-panel">
            <div className="panel-head">
              <div>
                <h2>板块列表</h2>
                <p>{rankings.length} 个候选板块</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>板块</th>
                    <th>涨停</th>
                    <th>RPS10</th>
                    <th>5日</th>
                    <th>10日</th>
                    <th>成交额</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((item, index) => (
                    <tr
                      key={item.sectorCode}
                      className={item.sectorCode === selectedSectorCode ? "active" : ""}
                      onClick={() => setSelectedSectorCode(item.sectorCode)}
                    >
                      <td>{index + 1}</td>
                      <td>
                        <div className="symbol-cell">
                          <strong>{item.sectorName}</strong>
                          <span>{item.sectorCode}</span>
                        </div>
                      </td>
                      <td>{item.limitUpCount ?? 0}</td>
                      <td>{item.rps10 ?? "-"}</td>
                      <td className={tone(item.pctChange5d)}>{fmtPct(item.pctChange5d)}</td>
                      <td className={tone(item.pctChange10d)}>{fmtPct(item.pctChange10d)}</td>
                      <td>{fmtAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel table-panel">
            <div className="panel-head">
              <div>
                <h2>板块内个股</h2>
                <p>{selectedSector ? `${selectedSector.sectorName} · ${sectorStocks.length} 只` : "选择板块后加载"}</p>
              </div>
            </div>
            {errors.stocks && <div className="panel-inline-error">{errors.stocks}</div>}
            {loading.stocks && <div className="panel-inline-state">成分股加载中...</div>}
            {!loading.stocks && !sectorStocks.length && !errors.stocks && <div className="panel-inline-state">当前板块暂无可展示个股</div>}
            {!!sectorStocks.length && (
              <div className="table-wrap">
                <table className="market-table">
                  <thead>
                    <tr>
                      <th>代码</th>
                      <th>名称</th>
                      <th>现价</th>
                      <th>1日</th>
                      <th>5日</th>
                      <th>RPS20</th>
                      <th>成交额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectorStocks.map((item) => (
                      <tr
                        key={item.tsCode}
                        className={item.tsCode === selectedStockCode ? "active" : ""}
                        onClick={() => setSelectedStockCode(item.tsCode)}
                      >
                        <td className="mono">{item.tsCode}</td>
                        <td>{item.stockName}</td>
                        <td>{item.close?.toFixed?.(2) ?? item.close ?? "-"}</td>
                        <td className={tone(item.pctChange1d)}>{fmtPct(item.pctChange1d)}</td>
                        <td className={tone(item.pctChange5d)}>{fmtPct(item.pctChange5d)}</td>
                        <td>{item.rps20 ?? "-"}</td>
                        <td>{fmtAmount(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="analysis-column">
            <CandlestickPanel
              kind="sector"
              code={selectedSector?.sectorCode || ""}
              label={selectedSector?.sectorName || ""}
              title="细分板块 K 线"
              emptyText="选择板块后显示细分板块图"
            />
            <CandlestickPanel
              kind="stock"
              code={selectedStock?.tsCode || ""}
              label={selectedStock?.stockName || ""}
              title="选中个股 K 线"
              emptyText="选择个股后显示股票图"
            />
            <RelativeStrengthPanel
              tsCode={selectedStock?.tsCode || ""}
              sectorCode={selectedSector?.sectorCode || ""}
              stockName={selectedStock?.stockName}
              sectorName={selectedSector?.sectorName}
            />
          </section>
        </section>
      )}

      {!loading.shell && activeView === "watchlist" && (
        <section className="watchlist-view">
          <WatchlistWorkbench items={watchlist} onRefresh={loadShell} />
        </section>
      )}

      {!loading.shell && activeView === "bullcamp" && (
        <section className="watchlist-view">
          {errors.bullCamp && <section className="notice error">{errors.bullCamp}</section>}
          {loading.bullCamp ? <section className="notice">牛股集中营加载中...</section> : <BullCampWorkbench items={bullCamp} />}
        </section>
      )}
    </div>
  );
}
