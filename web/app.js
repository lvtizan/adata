const state = {
  tradeDate: null,
  sortBy: "rps10",
  keyword: "",
  sectors: [],
  stocks: [],
  selectedSector: null,
  selectedStock: null,
  rsLabel: "同步",
  rsData: null,
  stockPoints: [],
  sectorHeaderSort: { key: null, dir: "desc" },
  stockHeaderSort: { key: null, dir: "desc" },
  charts: {},
  miniK: {
    chartWrap: null,
    chart: null,
    candle: null,
    cache: new Map(),
    timer: null,
    activeCode: null,
  },
  watchlist: [],
  watchCardCharts: new Map(),
};

function withTradeDate(path) {
  if (path.startsWith("/api/watchlist")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}tradeDate=${state.tradeDate || ""}`;
}

async function requestJson(path, options = {}) {
  const res = await fetch(withTradeDate(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function api(path) {
  return requestJson(path);
}

function fmtYi(v) {
  if (v == null || v === "") return "-";
  return (Number(v || 0) / 1e8).toFixed(1);
}

function clsNum(v) {
  return Number(v) >= 0 ? "up" : "down";
}

function fmtValue(v, digits = 2) {
  if (v == null || v === "") return "-";
  return Number(v).toFixed(digits);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toChartDate(value) {
  if (!value) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function renderOverview(data) {
  state.tradeDate = data.tradeDate;
  setText("tradeDate", `交易日: ${data.tradeDate}`);
  setText("marketLabel", data.marketState.label);
  setText("openLight", `开仓灯: ${data.marketState.openPermissionLight}`);

  document.getElementById("marketState").innerHTML = `
    <div>状态：<b>${data.marketState.label}</b></div>
    <div>风险：${data.marketState.riskLevel}</div>
    <div>建议：${data.marketState.actionAdvice}</div>
  `;
  document.getElementById("breadth").innerHTML = `
    <div>上涨/下跌：${data.breadth.upCount} / ${data.breadth.downCount}</div>
    <div>涨停/跌停：${data.breadth.limitUpCount} / ${data.breadth.limitDownCount}</div>
    <div>MA20占比：${data.breadth.aboveMa20Ratio}%</div>
    <div>MA60占比：${data.breadth.aboveMa60Ratio}%</div>
  `;
  document.getElementById("emotion").innerHTML = `
    <div>情绪：<b>${data.emotionState.label}</b></div>
    <div>评分：${data.emotionState.score}</div>
    <div>主线：${data.mainline.name}（${data.mainline.status}）</div>
  `;

  const box = document.getElementById("topSectors");
  box.innerHTML = "";
  data.topSectors.forEach((x) => {
    const d = document.createElement("div");
    d.className = "rec-item";
    d.textContent = `#${x.rank} ${x.sectorName} | RPS10 ${x.rps10} | 5日 ${x.pctChange5d}%`;
    d.style.cursor = "pointer";
    d.onclick = () => selectSector(x.sectorCode);
    box.appendChild(d);
  });
}

function getCurrentSector() {
  return state.sectors.find((item) => item.sectorCode === state.selectedSector) || null;
}

function isWatchlisted(tsCode) {
  return state.watchlist.some((item) => item.tsCode === tsCode);
}

function buildWatchPayload(stock) {
  const sector = getCurrentSector();
  const existing = state.watchlist.find((item) => item.tsCode === stock.tsCode);
  return {
    tsCode: stock.tsCode,
    stockName: stock.stockName,
    sectorCode: sector?.sectorCode || existing?.sectorCode || "",
    sectorName: sector?.sectorName || existing?.sectorName || "",
    subgroup: existing?.subgroup || sector?.sectorName || "",
    close: stock.close,
    pctChange1d: stock.pctChange1d,
    pctChange5d: stock.pctChange5d,
    pctChange10d: stock.pctChange10d,
    rps20: stock.rps20,
    amount: stock.amount,
  };
}

function updateWatchlistCount() {
  const btn = document.getElementById("jumpWatchlist");
  if (btn) btn.textContent = `我的自选 (${state.watchlist.length})`;
}

function renderSectorTable() {
  const tbody = document.querySelector("#sectorTable tbody");
  tbody.innerHTML = "";
  let rows = [...state.sectors];
  if (state.sectorHeaderSort.key) {
    const { key, dir } = state.sectorHeaderSort;
    rows.sort((a, b) => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      return dir === "asc" ? av - bv : bv - av;
    });
  }
  rows.forEach((x, i) => {
    const tr = document.createElement("tr");
    tr.dataset.code = x.sectorCode;
    if (state.selectedSector === x.sectorCode) tr.classList.add("active");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${x.sectorName}</td>
      <td>${x.limitUpCount ?? 0}</td>
      <td>${x.rps10}</td>
      <td class="${clsNum(x.pctChange5d)}">${x.pctChange5d}</td>
      <td class="${clsNum(x.pctChange10d)}">${x.pctChange10d}</td>
      <td>${fmtYi(x.amount)}</td>
    `;
    tr.onclick = () => selectSector(x.sectorCode);
    tbody.appendChild(tr);
  });
}

function renderStockTable() {
  const tbody = document.querySelector("#stockTable tbody");
  const notice = document.getElementById("stockTableNotice");
  tbody.innerHTML = "";
  const fallbackMode = state.stocks.some((item) => item.dataMode === "fallback");
  if (notice) {
    notice.style.display = fallbackMode ? "block" : "none";
    notice.textContent = fallbackMode
      ? "当前为降级模式：历史日线指标受限流影响，先展示板块当日成分股，RPS/5日/10日暂不可用。"
      : "";
  }
  const sec = getCurrentSector();
  const sec10 = sec ? Number(sec.pctChange10d || 0) : null;
  let rows = [...state.stocks];
  if (state.stockHeaderSort.key) {
    const { key, dir } = state.stockHeaderSort;
    rows.sort((a, b) => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      return dir === "asc" ? av - bv : bv - av;
    });
  }
  rows.forEach((x) => {
    const tr = document.createElement("tr");
    tr.dataset.code = x.tsCode;
    if (state.selectedStock === x.tsCode) tr.classList.add("active");
    const strongerThanSector = sec10 != null ? Number(x.pctChange10d || 0) > sec10 : false;
    const upAndStronger = strongerThanSector && Number(x.pctChange1d || 0) > 0;
    const nameCls = upAndStronger ? "name-strong-up" : strongerThanSector ? "name-strong" : "";
    const pct5 = fmtValue(x.pctChange5d);
    const pct10 = fmtValue(x.pctChange10d);
    const rps20 = fmtValue(x.rps20);
    tr.innerHTML = `
      <td class="${nameCls}">${x.stockName}</td>
      <td>${rps20}</td>
      <td class="${pct5 === "-" ? "" : clsNum(x.pctChange5d)}">${pct5}</td>
      <td class="${pct10 === "-" ? "" : clsNum(x.pctChange10d)}">${pct10}</td>
      <td>${fmtYi(x.amount)}</td>
      <td></td>
    `;
    const actionCell = tr.lastElementChild;
    const btn = document.createElement("button");
    btn.className = `fav-btn${isWatchlisted(x.tsCode) ? " active" : ""}`;
    btn.textContent = isWatchlisted(x.tsCode) ? "已收藏" : "收藏";
    btn.onclick = async (e) => {
      e.stopPropagation();
      await toggleWatchlist(x);
    };
    actionCell.appendChild(btn);

    tr.onclick = () => selectStock(x.tsCode);
    tr.onmouseenter = (e) => scheduleMiniK(x.tsCode, x.stockName, e);
    tr.onmousemove = (e) => positionMiniK(e);
    tr.onmouseleave = () => hideMiniK();
    tbody.appendChild(tr);
  });
}

function initMiniK() {
  const wrap = document.getElementById("miniKTooltip");
  const box = document.getElementById("miniKChart");
  state.miniK.chartWrap = wrap;
  const chart = LightweightCharts.createChart(box, {
    layout: { background: { color: "#ffffff" }, textColor: "#475569" },
    grid: { vertLines: { color: "#eef2ff" }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: "#e2e8f0" },
    timeScale: { borderColor: "#e2e8f0" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, horzLine: { visible: false } },
  });
  const candle = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#e11d48",
    downColor: "#0e9f6e",
    borderVisible: false,
    wickUpColor: "#e11d48",
    wickDownColor: "#0e9f6e",
    priceLineVisible: false,
    lastValueVisible: false,
  });
  state.miniK.chart = chart;
  state.miniK.candle = candle;
}

function bindHeaderSort() {
  document.querySelectorAll("#sectorTable thead th[data-sort-col]").forEach((th) => {
    th.onclick = () => {
      const key = th.getAttribute("data-sort-col");
      if (!key) return;
      if (state.sectorHeaderSort.key === key) {
        state.sectorHeaderSort.dir = state.sectorHeaderSort.dir === "desc" ? "asc" : "desc";
      } else {
        state.sectorHeaderSort = { key, dir: "desc" };
      }
      renderSectorTable();
    };
  });
  document.querySelectorAll("#stockTable thead th[data-sort-col]").forEach((th) => {
    th.onclick = () => {
      const key = th.getAttribute("data-sort-col");
      if (!key) return;
      if (state.stockHeaderSort.key === key) {
        state.stockHeaderSort.dir = state.stockHeaderSort.dir === "desc" ? "asc" : "desc";
      } else {
        state.stockHeaderSort = { key, dir: "desc" };
      }
      renderStockTable();
    };
  });
}

function positionMiniK(e) {
  const wrap = state.miniK.chartWrap;
  if (!wrap || wrap.style.display !== "block") return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = 280;
  const h = 180;
  let x = e.clientX + 14;
  let y = e.clientY + 14;
  if (x + w > vw - 8) x = e.clientX - w - 10;
  if (y + h > vh - 8) y = e.clientY - h - 10;
  wrap.style.left = `${Math.max(8, x)}px`;
  wrap.style.top = `${Math.max(8, y)}px`;
}

async function scheduleMiniK(tsCode, stockName, e) {
  if (state.miniK.timer) clearTimeout(state.miniK.timer);
  state.miniK.timer = setTimeout(async () => {
    try {
      state.miniK.activeCode = tsCode;
      document.getElementById("miniKTitle").textContent = `${stockName} (${tsCode})`;
      let data = state.miniK.cache.get(tsCode);
      if (!data) {
        const d = await api(`/api/charts/stock/${tsCode}?bars=60`);
        data = (d.points || []).map((p) => ({
          time: toChartDate(p.time),
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        state.miniK.cache.set(tsCode, data);
      }
      if (state.miniK.activeCode !== tsCode) return;
      state.miniK.candle.setData(data);
      state.miniK.chart.timeScale().fitContent();
      state.miniK.chartWrap.style.display = "block";
      positionMiniK(e);
    } catch (_) {}
  }, 200);
}

function hideMiniK() {
  if (state.miniK.timer) clearTimeout(state.miniK.timer);
  state.miniK.timer = null;
  state.miniK.activeCode = null;
  if (state.miniK.chartWrap) state.miniK.chartWrap.style.display = "none";
}

function createKChart(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#fbfdff" }, textColor: "#334155" },
    grid: { vertLines: { color: "#ecf2ff" }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: "#d6e3ff" },
    timeScale: { borderColor: "#d6e3ff" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, horzLine: { visible: false } },
  });
  const candle = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#0e9f6e",
    downColor: "#e11d48",
    borderVisible: false,
    wickUpColor: "#0e9f6e",
    wickDownColor: "#e11d48",
    priceLineVisible: false,
    lastValueVisible: false,
  });
  const ma10 = chart.addSeries(LightweightCharts.LineSeries, {
    color: "#9ca3af",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  const drawSeries = [];
  const drawState = { tool: "cursor", first: null };
  chart.subscribeClick((param) => {
    if (drawState.tool !== "line" || !param || !param.time || param.point == null) return;
    const price = candle.coordinateToPrice(param.point.y);
    if (price == null) return;
    if (!drawState.first) {
      drawState.first = { time: param.time, value: price };
      return;
    }
    const line = chart.addSeries(LightweightCharts.LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    line.setData([drawState.first, { time: param.time, value: price }]);
    drawSeries.push(line);
    drawState.first = null;
  });
  return { chart, candle, ma10, drawSeries, drawState };
}

function createLineChart(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#fbfdff" }, textColor: "#334155" },
    grid: { vertLines: { color: "#ecf2ff" }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: "#d6e3ff" },
    timeScale: { borderColor: "#d6e3ff" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, horzLine: { visible: false } },
  });
  const s1 = chart.addSeries(LightweightCharts.LineSeries, {
    color: "#1f6feb",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  const s2 = chart.addSeries(LightweightCharts.LineSeries, {
    color: "#ef4444",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  return { chart, s1, s2 };
}

function createHistogramChart(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#fcfdff" }, textColor: "#64748b" },
    grid: { vertLines: { color: "#eef4ff" }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: "#d8e6ff" },
    timeScale: { borderColor: "#d8e6ff" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, horzLine: { visible: false } },
  });
  const hist = chart.addSeries(LightweightCharts.HistogramSeries, {
    priceFormat: { type: "volume" },
    priceLineVisible: false,
    lastValueVisible: false,
    base: 0,
  });
  return { chart, hist };
}

function createBareCandleChart(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#fcfdff" }, textColor: "#334155" },
    grid: { vertLines: { color: "#eef4ff" }, horzLines: { visible: false } },
    rightPriceScale: { borderColor: "#d8e6ff" },
    timeScale: { borderColor: "#d8e6ff" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, horzLine: { visible: false } },
  });
  const candle = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#e11d48",
    downColor: "#0e9f6e",
    borderVisible: false,
    wickUpColor: "#e11d48",
    wickDownColor: "#0e9f6e",
    priceLineVisible: false,
    lastValueVisible: false,
  });
  return { chart, candle };
}

function createWatchlistCharts(priceId, amountId, rsId) {
  const price = createBareCandleChart(priceId);
  const amount = createHistogramChart(amountId);
  const rs = createLineChart(rsId);
  syncChartsByRange([price.chart, amount.chart, rs.chart]);
  return { price, amount, rs };
}

function chartDomId(prefix, tsCode) {
  return `${prefix}-${tsCode.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

function syncChartsByRange(charts) {
  let lock = false;
  charts.forEach((chart) => {
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (lock || !range) return;
      lock = true;
      charts.forEach((other) => {
        if (other !== chart) other.timeScale().setVisibleLogicalRange(range);
      });
      lock = false;
    });
  });
}

function setKData(target, points) {
  const candles = points.map((p) => ({
    time: toChartDate(p.time),
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));
  target.candle.setData(candles);
  target.ma10.setData(
    points.filter((x) => x.ma10 != null).map((p) => ({ time: toChartDate(p.time), value: p.ma10 }))
  );
  target.chart.timeScale().fitContent();
}

function estimatePressurePrice(points) {
  if (!points || points.length < 20) return null;
  const highs = points.map((p) => p.high).filter((x) => Number.isFinite(x));
  if (!highs.length) return null;
  const slice = points.slice(Math.max(0, points.length - 90), Math.max(0, points.length - 3));
  const localHighs = slice.map((p) => p.high).filter((x) => Number.isFinite(x));
  if (!localHighs.length) return Math.max(...highs);
  return Math.max(...localHighs);
}

function ensurePressureMarker() {
  const root = document.getElementById("stockChart");
  let marker = root.querySelector(".pressure-marker");
  if (!marker) {
    marker = document.createElement("div");
    marker.className = "pressure-marker";
    marker.innerHTML = `<span class="pressure-badge">压</span><span class="pressure-line"></span>`;
    root.appendChild(marker);
  }
  return marker;
}

function renderPressureMarker() {
  if (!state.charts.stock || !state.stockPoints.length) return;
  const marker = ensurePressureMarker();
  const price = estimatePressurePrice(state.stockPoints);
  if (price == null) {
    marker.style.display = "none";
    return;
  }
  const y = state.charts.stock.candle.priceToCoordinate(price);
  if (y == null || Number.isNaN(y)) {
    marker.style.display = "none";
    return;
  }
  marker.style.display = "flex";
  marker.style.top = `${y}px`;
}

function ensureRsBubbles() {
  const root = document.getElementById("rsChart");
  let stock = root.querySelector(".rs-bubble-stock");
  let sector = root.querySelector(".rs-bubble-sector");
  if (!stock) {
    stock = document.createElement("div");
    stock.className = "rs-bubble rs-bubble-stock";
    stock.textContent = "个";
    root.appendChild(stock);
  }
  if (!sector) {
    sector = document.createElement("div");
    sector.className = "rs-bubble rs-bubble-sector";
    sector.textContent = "板";
    root.appendChild(sector);
  }
  return { stock, sector };
}

function renderRsBubbles() {
  if (!state.charts.rs || !state.rsData?.stock?.length || !state.rsData?.sector?.length) return;
  const { chart, s1, s2 } = state.charts.rs;
  const { stock, sector } = ensureRsBubbles();
  const a = state.rsData.stock[state.rsData.stock.length - 1];
  const b = state.rsData.sector[state.rsData.sector.length - 1];
  const x1 = chart.timeScale().timeToCoordinate(a.time);
  const y1 = s1.priceToCoordinate(a.value);
  const x2 = chart.timeScale().timeToCoordinate(b.time);
  const y2 = s2.priceToCoordinate(b.value);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return;
  stock.style.left = `${x1}px`;
  stock.style.top = `${y1}px`;
  sector.style.left = `${x2}px`;
  sector.style.top = `${Math.abs(y2 - y1) < 16 ? y2 + 18 : y2}px`;
}

async function loadSectorTable() {
  const kw = encodeURIComponent(state.keyword || "");
  const data = await api(`/api/sectors/rankings?sortBy=${state.sortBy}&keyword=${kw}`);
  state.sectors = data.items || [];
  renderSectorTable();
  if (!state.selectedSector && state.sectors.length) {
    for (const it of state.sectors.slice(0, 12)) {
      const ok = await selectSector(it.sectorCode, true);
      if (ok) break;
    }
  }
}

async function selectSector(code, silent = false) {
  state.selectedSector = code;
  renderSectorTable();
  const data = await api(`/api/sectors/${code}/stocks?sortBy=rps10`);
  state.stocks = data.items || [];
  renderStockTable();
  await loadSectorChart(code);
  if (state.stocks.length) {
    await selectStock(state.stocks[0].tsCode);
    return true;
  }
  document.getElementById("stockChartTitle").textContent = "个股K线";
  if (!silent) document.getElementById("rsSummary").textContent = "当前板块无满足硬过滤规则的个股";
  return false;
}

async function selectStock(tsCode) {
  state.selectedStock = tsCode;
  state.rsLabel = "同步";
  renderStockTable();
  await Promise.all([loadStockChart(tsCode), loadRS(tsCode, state.selectedSector)]);
  await syncSelectedStockToWatchlist();
}

async function loadSectorChart(sectorCode) {
  const d = await api(`/api/charts/sector/${sectorCode}?bars=180`);
  document.getElementById("sectorChartTitle").textContent = `细分板块K线 - ${d.name}`;
  if (!state.charts.sector) state.charts.sector = createKChart("sectorChart");
  setKData(state.charts.sector, d.points || []);
}

async function loadStockChart(tsCode) {
  const d = await api(`/api/charts/stock/${tsCode}?bars=180`);
  const red = state.rsLabel === "领先" ? "name-leading" : "";
  document.getElementById("stockChartTitle").innerHTML = `个股K线 - <span class="${red}">${d.name}</span>`;
  if (!state.charts.stock) state.charts.stock = createKChart("stockChart");
  const points = d.points || [];
  setKData(state.charts.stock, points);
  state.stockPoints = points;
  setTimeout(renderPressureMarker, 0);
}

function clearMainRs(text = "当前无可展示的板块相对强弱数据") {
  document.getElementById("rsSummary").textContent = text;
  state.rsLabel = "同步";
  state.rsData = { stock: [], sector: [] };
  if (!state.charts.rs) state.charts.rs = createLineChart("rsChart");
  state.charts.rs.s1.setData([]);
  state.charts.rs.s2.setData([]);
}

async function loadRS(tsCode, sectorCode) {
  if (!sectorCode) {
    clearMainRs("当前股票未绑定板块，无法计算板块相对强弱");
    renderStockTable();
    return;
  }
  const d = await api(`/api/relative-strength?tsCode=${tsCode}&sectorCode=${sectorCode}`);
  const s = d.summary;
  document.getElementById("rsSummary").innerHTML = `
    <span><i class="dot dot-stock"></i>个股（蓝线）</span>
    <span><i class="dot dot-sector"></i>板块（红线）</span>
    <span>5日相对强弱: <b class="${clsNum(s.relativeStrength5d)}">${s.relativeStrength5d}%</b></span>
    <span>10日相对强弱: <b class="${clsNum(s.relativeStrength10d)}">${s.relativeStrength10d}%</b></span>
    <span>状态: <b>${s.label}</b></span>
  `;
  state.rsLabel = s.label;
  renderStockTable();
  const selected = state.stocks.find((item) => item.tsCode === state.selectedStock);
  if (selected) {
    const red = state.rsLabel === "领先" ? "name-leading" : "";
    document.getElementById("stockChartTitle").innerHTML = `个股K线 - <span class="${red}">${selected.stockName}</span>`;
  }
  if (!state.charts.rs) state.charts.rs = createLineChart("rsChart");
  const stockSeries = d.stock.rpsSeries.map((x) => ({ time: toChartDate(x.time), value: x.value }));
  const sectorSeries = d.sector.rpsSeries.map((x) => ({ time: toChartDate(x.time), value: x.value }));
  state.charts.rs.s1.setData(stockSeries);
  state.charts.rs.s2.setData(sectorSeries);
  state.charts.rs.chart.timeScale().fitContent();
  state.rsData = { stock: stockSeries, sector: sectorSeries };
  setTimeout(renderRsBubbles, 0);
}

async function loadWatchlist() {
  const data = await requestJson("/api/watchlist");
  state.watchlist = data.items || [];
  updateWatchlistCount();
  renderWatchlist();
  await hydrateWatchlistCards();
}

function renderWatchlist() {
  const grid = document.getElementById("watchlistGrid");
  const summary = document.getElementById("watchlistSummary");
  grid.innerHTML = "";
  summary.textContent = state.watchlist.length
    ? `已收藏 ${state.watchlist.length} 只股票。每张卡片内直接展示裸K、成交额和个股/板块强弱。`
    : "从板块内强股里添加收藏后，会显示在这里。";
  state.watchCardCharts.clear();

  if (!state.watchlist.length) {
    const empty = document.createElement("div");
    empty.className = "watch-card-empty";
    empty.textContent = "还没有自选股";
    grid.appendChild(empty);
    return;
  }

  state.watchlist.forEach((item) => {
    const card = document.createElement("article");
    card.className = "watch-card";
    card.onclick = () => openWatchlistItem(item);

    const head = document.createElement("div");
    head.className = "watch-card-head";

    const name = document.createElement("div");
    name.className = "watch-card-name";
    name.textContent = item.stockName;

    const code = document.createElement("div");
    code.className = "watch-card-code";
    code.textContent = item.tsCode;

    const subgroupWrap = document.createElement("div");
    subgroupWrap.className = "watch-card-subgroup";
    subgroupWrap.dataset.code = item.tsCode;
    subgroupWrap.appendChild(createSubgroupEditorButton(item));

    head.appendChild(name);
    head.appendChild(code);
    head.appendChild(subgroupWrap);

    const sector = document.createElement("div");
    sector.className = "watch-card-sector";
    sector.textContent = item.sectorName || "未绑定细分板块";

    const metrics = document.createElement("div");
    metrics.className = "watch-card-metrics";
    metrics.appendChild(createMetric("RPS20", item.rps20 == null ? "-" : Number(item.rps20).toFixed(2), ""));
    metrics.appendChild(createMetric("5日", item.pctChange5d == null ? "-" : Number(item.pctChange5d).toFixed(2), "%"));
    metrics.appendChild(createMetric("10日", item.pctChange10d == null ? "-" : Number(item.pctChange10d).toFixed(2), "%"));

    const actions = document.createElement("div");
    actions.className = "watch-card-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "watch-action-btn";
    viewBtn.textContent = "联动主区";
    viewBtn.onclick = async (e) => {
      e.stopPropagation();
      await openWatchlistItem(item);
    };

    const delBtn = document.createElement("button");
    delBtn.className = "watch-action-btn danger";
    delBtn.textContent = "移除";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await removeWatchlist(item.tsCode);
    };

    actions.appendChild(viewBtn);
    actions.appendChild(delBtn);

    const chartStack = document.createElement("div");
    chartStack.className = "watch-card-chart-composite";
    chartStack.innerHTML = `
      <div class="watch-card-chart-head">
        <span>裸K线</span>
        <span>成交额</span>
        <span>个股 / 板块强弱</span>
      </div>
      <div class="watch-card-chart-stack">
        <div class="watch-chart-pane">
          <div id="${chartDomId("watch-price", item.tsCode)}" class="watch-chart watch-chart-loading">加载中...</div>
        </div>
        <div class="watch-chart-pane">
          <div id="${chartDomId("watch-amount", item.tsCode)}" class="watch-chart watch-chart-loading">加载中...</div>
        </div>
        <div class="watch-chart-pane">
          <div id="${chartDomId("watch-rs", item.tsCode)}" class="watch-chart watch-chart-loading">加载中...</div>
        </div>
      </div>
    `;

    card.appendChild(head);
    card.appendChild(sector);
    card.appendChild(metrics);
    card.appendChild(actions);
    card.appendChild(chartStack);
    grid.appendChild(card);
  });
}

function createMetric(label, value, suffix) {
  const box = document.createElement("div");
  box.className = "watch-metric";
  const labelEl = document.createElement("span");
  labelEl.className = "watch-metric-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  const tone = suffix === "%" && value !== "-" ? ` ${clsNum(value)}` : "";
  valueEl.className = `watch-metric-value${tone}`;
  valueEl.textContent = value === "-" ? value : `${value}${suffix}`;
  box.appendChild(labelEl);
  box.appendChild(valueEl);
  return box;
}

function createSubgroupEditorButton(item) {
  const btn = document.createElement("button");
  btn.className = "watch-subgroup-btn";
  btn.textContent = item.subgroup ? `细分: ${item.subgroup}` : "细分: 点击编辑";
  btn.onclick = (e) => {
    e.stopPropagation();
    startEditSubgroup(item);
  };
  return btn;
}

function startEditSubgroup(item) {
  const wrap = document.querySelector(`.watch-card-subgroup[data-code="${CSS.escape(item.tsCode)}"]`);
  if (!wrap) return;
  wrap.innerHTML = "";
  const input = document.createElement("input");
  input.className = "watch-subgroup-input";
  input.value = item.subgroup || "";
  input.placeholder = "输入细分名称";
  input.onclick = (e) => e.stopPropagation();
  const commit = async () => {
    if (input.dataset.saving === "1") return;
    input.dataset.saving = "1";
    await saveSubgroup(item.tsCode, input.value);
  };
  input.onkeydown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await commit();
    }
    if (e.key === "Escape") renderWatchlist();
  };
  input.onblur = async () => {
    await commit();
  };
  wrap.appendChild(input);
  input.focus();
  input.select();
}

async function saveSubgroup(tsCode, subgroup) {
  await requestJson(`/api/watchlist/${encodeURIComponent(tsCode)}`, {
    method: "PUT",
    body: JSON.stringify({ subgroup: (subgroup || "").trim() }),
  });
  await loadWatchlist();
}

async function toggleWatchlist(stock) {
  if (isWatchlisted(stock.tsCode)) {
    await removeWatchlist(stock.tsCode);
    renderStockTable();
    return;
  }
  await requestJson("/api/watchlist", {
    method: "POST",
    body: JSON.stringify(buildWatchPayload(stock)),
  });
  await loadWatchlist();
  renderStockTable();
}

async function removeWatchlist(tsCode) {
  await requestJson(`/api/watchlist/${encodeURIComponent(tsCode)}`, { method: "DELETE" });
  await loadWatchlist();
  renderStockTable();
}

async function syncSelectedStockToWatchlist() {
  const stock = state.stocks.find((item) => item.tsCode === state.selectedStock);
  if (!stock || !isWatchlisted(stock.tsCode)) return;
  await requestJson("/api/watchlist", {
    method: "POST",
    body: JSON.stringify(buildWatchPayload(stock)),
  });
  await loadWatchlist();
}

async function openWatchlistItem(item) {
  if (item.sectorCode) {
    try {
      await selectSector(item.sectorCode, true);
    } catch (_) {}
  }
  state.selectedStock = item.tsCode;
  renderStockTable();
  await loadStockChart(item.tsCode);
  if (item.sectorCode) {
    await loadRS(item.tsCode, item.sectorCode);
  } else {
    clearMainRs("当前股票未绑定板块，无法计算板块相对强弱");
  }
}

async function hydrateWatchlistCards() {
  await Promise.all(state.watchlist.map((item) => renderWatchlistCardCharts(item)));
}

async function renderWatchlistCardCharts(item) {
  const priceId = chartDomId("watch-price", item.tsCode);
  const amountId = chartDomId("watch-amount", item.tsCode);
  const rsId = chartDomId("watch-rs", item.tsCode);
  const priceEl = document.getElementById(priceId);
  const amountEl = document.getElementById(amountId);
  const rsEl = document.getElementById(rsId);
  if (!priceEl || !amountEl || !rsEl) return;

  const charts = createWatchlistCharts(priceId, amountId, rsId);
  state.watchCardCharts.set(item.tsCode, charts);

  try {
    const stockData = await api(`/api/charts/stock/${item.tsCode}?bars=120`);
    let rsData = null;
    if (item.sectorCode) {
      try {
        rsData = await api(`/api/relative-strength?tsCode=${item.tsCode}&sectorCode=${item.sectorCode}`);
      } catch (_) {
        rsData = null;
      }
    }

    const points = stockData.points || [];
    const candles = points.map((p) => ({
      time: toChartDate(p.time),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const amount = points.map((p) => ({
      time: toChartDate(p.time),
      value: Number.isFinite(p.amount) ? p.amount : p.volume,
      color: p.close >= p.open ? "#e11d48" : "#0e9f6e",
    }));
    const rsStockSeries = rsData ? rsData.stock.rpsSeries.map((x) => ({ time: toChartDate(x.time), value: x.value })) : [];
    const rsSectorSeries = rsData ? rsData.sector.rpsSeries.map((x) => ({ time: toChartDate(x.time), value: x.value })) : [];

    charts.price.candle.setData(candles);
    charts.amount.hist.setData(amount);
    charts.rs.s1.setData(rsStockSeries);
    charts.rs.s2.setData(rsSectorSeries);
    charts.price.chart.timeScale().fitContent();
    charts.amount.chart.timeScale().fitContent();
    charts.rs.chart.timeScale().fitContent();
  } catch (_) {
    priceEl.textContent = "加载失败";
    amountEl.textContent = "加载失败";
    rsEl.textContent = "加载失败";
  }
}

function initColumnResize() {
  const grid = document.querySelector(".main-grid");
  const leftResizer = document.getElementById("resizerLeft");
  const rightResizer = document.getElementById("resizerRight");
  const hint = document.getElementById("layoutHint");
  if (!grid || !leftResizer || !rightResizer) return;

  const key = "sector-layout-cols-pct";
  const saved = localStorage.getItem(key);
  const defaultProfile = [25, 30, 45];
  const minLeftPct = 15;
  const minMidPct = 18;
  const minRightPct = 22;

  function totalWidth() {
    return grid.getBoundingClientRect().width;
  }

  function getCurrentPct() {
    const p1 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--col1-pct")) || 25;
    const p2 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--col2-pct")) || 30;
    return { p1, p2, p3: 100 - p1 - p2 };
  }

  function placeResizers() {
    const { p1, p2 } = getCurrentPct();
    leftResizer.style.left = `calc(${p1}% + 5px)`;
    rightResizer.style.left = `calc(${p1}% + ${p2}% + 15px)`;
  }

  function applyPct(p1, p2) {
    const maxLeftRight = 100 - minMidPct;
    if (p1 + p2 > maxLeftRight) p2 = Math.max(minMidPct, maxLeftRight - p1);
    p1 = Math.max(minLeftPct, Math.min(p1, 100 - minMidPct - minRightPct));
    p2 = Math.max(minMidPct, Math.min(p2, 100 - minLeftPct - minRightPct));
    document.documentElement.style.setProperty("--col1-pct", `${p1}%`);
    document.documentElement.style.setProperty("--col2-pct", `${p2}%`);
    localStorage.setItem(key, JSON.stringify([p1, p2]));
    placeResizers();
    resizeAllCharts();
  }

  function bindDrag(target, mode) {
    target.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = totalWidth();
      const base = getCurrentPct();
      if (hint) hint.style.display = "block";

      function onMove(ev) {
        const dxPct = ((ev.clientX - startX) / startWidth) * 100;
        let p1 = base.p1;
        let p2 = base.p2;
        if (mode === "left") {
          const sum12 = base.p1 + base.p2;
          p1 = Math.max(minLeftPct, Math.min(sum12 - minMidPct, base.p1 + dxPct));
          p2 = sum12 - p1;
        } else {
          const maxP2 = 100 - base.p1 - minRightPct;
          p2 = Math.max(minMidPct, Math.min(maxP2, base.p2 + dxPct));
        }
        applyPct(p1, p2);
        if (hint) {
          const p3 = 100 - p1 - p2;
          hint.textContent = `左 ${Math.round(p1)}% | 中 ${Math.round(p2)}% | 右 ${Math.round(p3)}%`;
          hint.style.left = `${ev.clientX + 12}px`;
          hint.style.top = `${ev.clientY + 12}px`;
        }
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (hint) hint.style.display = "none";
        setTimeout(resizeAllCharts, 50);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  bindDrag(leftResizer, "left");
  bindDrag(rightResizer, "right");

  if (saved) {
    try {
      const [p1, p2] = JSON.parse(saved);
      applyPct(p1, p2);
    } catch (_) {
      applyPct(defaultProfile[0], defaultProfile[1]);
    }
  } else {
    applyPct(defaultProfile[0], defaultProfile[1]);
  }

  window.addEventListener("resize", () => {
    placeResizers();
  });

  const resetBtn = document.getElementById("resetLayout");
  if (resetBtn) {
    resetBtn.onclick = () => {
      localStorage.removeItem(key);
      applyPct(defaultProfile[0], defaultProfile[1]);
      placeResizers();
      setTimeout(resizeAllCharts, 50);
    };
  }
}

function resizeAllCharts() {
  const resizeOne = (chartObj, elId) => {
    if (!chartObj?.chart) return;
    const el = document.getElementById(elId);
    if (!el) return;
    chartObj.chart.resize(Math.max(80, el.clientWidth), Math.max(80, el.clientHeight));
  };
  resizeOne(state.charts.sector, "sectorChart");
  resizeOne(state.charts.stock, "stockChart");
  resizeOne(state.charts.rs, "rsChart");
  if (state.miniK.chart) {
    const el = document.getElementById("miniKChart");
    if (el) state.miniK.chart.resize(Math.max(80, el.clientWidth), Math.max(80, el.clientHeight));
  }
  state.watchCardCharts.forEach((charts, tsCode) => {
    resizeOne(charts.price, chartDomId("watch-price", tsCode));
    resizeOne(charts.amount, chartDomId("watch-amount", tsCode));
    resizeOne(charts.rs, chartDomId("watch-rs", tsCode));
  });
}

function bindToolbar() {
  document.querySelectorAll(".tabs [data-sort]").forEach((btn) => {
    btn.onclick = async () => {
      document.querySelectorAll(".tabs [data-sort]").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
      state.sortBy = btn.dataset.sort;
      state.selectedSector = null;
      state.selectedStock = null;
      await loadSectorTable();
    };
  });

  const kwInput = document.getElementById("sectorKeyword");
  kwInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    state.keyword = (kwInput.value || "").trim();
    state.selectedSector = null;
    state.selectedStock = null;
    await loadSectorTable();
  });

  const jumpBtn = document.getElementById("jumpWatchlist");
  if (jumpBtn) {
    jumpBtn.onclick = () => {
      document.getElementById("watchlistSection").scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

function bindDrawTools() {
  document.getElementById("stockToolCursor").onclick = () => {
    if (!state.charts.stock) return;
    state.charts.stock.drawState.tool = "cursor";
    state.charts.stock.drawState.first = null;
    document.getElementById("stockToolCursor").classList.add("active");
    document.getElementById("stockToolLine").classList.remove("active");
  };
  document.getElementById("stockToolLine").onclick = () => {
    if (!state.charts.stock) return;
    state.charts.stock.drawState.tool = "line";
    document.getElementById("stockToolLine").classList.add("active");
    document.getElementById("stockToolCursor").classList.remove("active");
  };
  document.getElementById("stockDrawClear").onclick = () => {
    if (!state.charts.stock) return;
    state.charts.stock.drawSeries.forEach((series) => state.charts.stock.chart.removeSeries(series));
    state.charts.stock.drawSeries.length = 0;
    state.charts.stock.drawState.first = null;
  };
  document.getElementById("sectorToolCursor").onclick = () => {
    if (!state.charts.sector) return;
    state.charts.sector.drawState.tool = "cursor";
    state.charts.sector.drawState.first = null;
    document.getElementById("sectorToolCursor").classList.add("active");
    document.getElementById("sectorToolLine").classList.remove("active");
  };
  document.getElementById("sectorToolLine").onclick = () => {
    if (!state.charts.sector) return;
    state.charts.sector.drawState.tool = "line";
    document.getElementById("sectorToolLine").classList.add("active");
    document.getElementById("sectorToolCursor").classList.remove("active");
  };
  document.getElementById("sectorDrawClear").onclick = () => {
    if (!state.charts.sector) return;
    state.charts.sector.drawSeries.forEach((series) => state.charts.sector.chart.removeSeries(series));
    state.charts.sector.drawSeries.length = 0;
    state.charts.sector.drawState.first = null;
  };
}

async function boot() {
  const ov = await requestJson("/api/market/overview");
  renderOverview(ov);
  state.tradeDate = ov.tradeDate;

  initColumnResize();
  initMiniK();
  bindHeaderSort();
  bindToolbar();
  bindDrawTools();

  window.addEventListener("resize", () => {
    resizeAllCharts();
    setTimeout(renderRsBubbles, 60);
    setTimeout(renderPressureMarker, 60);
  });

  await Promise.all([loadSectorTable(), loadWatchlist()]);
}

boot().catch((err) => {
  console.error(err);
  alert(`加载失败: ${err.message}`);
});
