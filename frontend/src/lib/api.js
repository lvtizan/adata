const API_BASE = "/api";

export async function api(path, options = {}) {
  const url = path.startsWith("/api") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getMarketOverview() {
  return api("/api/market/overview");
}

export async function getWatchlist() {
  return api("/api/watchlist");
}

export async function addToWatchlist(item) {
  return api("/api/watchlist", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function updateWatchlist(tsCode, data) {
  return api(`/api/watchlist/${encodeURIComponent(tsCode)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function removeFromWatchlist(tsCode) {
  return api(`/api/watchlist/${encodeURIComponent(tsCode)}`, {
    method: "DELETE",
  });
}

export async function getSectorRankings(sortBy = "rps10", keyword = "") {
  return api(`/api/sectors/rankings?sortBy=${sortBy}&keyword=${encodeURIComponent(keyword)}`);
}

export async function getSectorStocks(sectorCode, sortBy = "rps10") {
  return api(`/api/sectors/${encodeURIComponent(sectorCode)}/stocks?sortBy=${sortBy}`);
}

export async function getStockChart(tsCode, bars = 120) {
  return api(`/api/charts/stock/${encodeURIComponent(tsCode)}?bars=${bars}`);
}

export async function getSectorChart(sectorCode, bars = 120) {
  return api(`/api/charts/sector/${encodeURIComponent(sectorCode)}?bars=${bars}`);
}

export async function getRelativeStrength(tsCode, sectorCode) {
  return api(`/api/relative-strength?tsCode=${encodeURIComponent(tsCode)}&sectorCode=${encodeURIComponent(sectorCode)}`);
}
