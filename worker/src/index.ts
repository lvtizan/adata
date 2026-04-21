export interface Env {
  DB: D1Database;
  KV?: KVNamespace; // optional until KV namespace is created
  ACCESS_TOKEN: string;
}

import { handleWatchlist } from './routes/watchlist';
import { handleDrawings } from './routes/drawings';
import { handleAlerts } from './routes/alerts';
import { handleTradePlans } from './routes/trade-plans';
import { handleMySectors } from './routes/my-sectors';
import { handleStockDaily } from './routes/stock-daily';
import { handleRps } from './routes/rps';
import { handleSectors } from './routes/sectors';
import { handleResonance } from './routes/resonance';
import { handleWatchpool } from './routes/watchpool';
import { handleProfiles } from './routes/profiles';
import { handleRealtime } from './routes/realtime';
import { handleSearch } from './routes/search';
import { handleBulkPush } from './routes/bulk-push';
import { camelizeKeys } from './utils';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(camelizeKeys(data)), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export { json, err };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Auth check (skip for realtime quotes — public read)
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check — no auth required
    if (path === '/api/status') {
      return json({ ready: true, message: 'ok' });
    }

    if (!path.startsWith('/api/realtime')) {
      const auth = request.headers.get('Authorization');
      const token = auth?.replace('Bearer ', '');
      if (token !== env.ACCESS_TOKEN) {
        return err('Unauthorized', 401);
      }
    }

    try {
      // Personal data CRUD
      if (path.startsWith('/api/watchlist')) return handleWatchlist(request, env);
      if (path.startsWith('/api/drawings')) return handleDrawings(request, env);
      if (path.startsWith('/api/alerts')) return handleAlerts(request, env);
      if (path.startsWith('/api/trade-plans')) return handleTradePlans(request, env);
      if (path.startsWith('/api/my-sectors')) return handleMySectors(request, env);

      // Market data
      if (path.startsWith('/api/stock') && path.includes('/daily')) return handleStockDaily(request, env);
      if (path.startsWith('/api/stock') && path.includes('/rps')) return handleRps(request, env);
      if (path.startsWith('/api/stock') && path.includes('/profile')) return handleProfiles(request, env);
      if (path.startsWith('/api/stock') && path.includes('/chain')) return handleProfiles(request, env);
      if (path.startsWith('/api/sectors')) return handleSectors(request, env);
      if (path.startsWith('/api/resonance')) return handleResonance(request, env);
      if (path.startsWith('/api/search')) return handleSearch(request, env);

      // Scoring
      if (path.startsWith('/api/watchpool')) return handleWatchpool(request, env);

      // Realtime
      if (path.startsWith('/api/realtime')) return handleRealtime(request, env);

      // Bulk push (Python data pump)
      if (path.startsWith('/api/push')) return handleBulkPush(request, env);

      // Stub routes — 前端调用但 Worker 尚未实现的接口，返回空数据避免 404
      if (path.includes('/patterns')) return json({ tsCode: '', patterns: [], signals: [], drawdowns: [], supports: [], resistances: [], maAlignment: null, latestHH: null, hasBuySignal: false });
      if (path.includes('/tags')) return json({ tsCode: '', stockName: '', concepts: [], capitalType: '未知', capitalDetail: '', relatedStocks: [] });
      if (path.includes('/attribution')) return json({ tsCode: '', stockName: '', attribution: [] });
      if (path.includes('/financials')) return json({ tsCode: '', periods: [] });
      if (path.includes('/news')) return json({ tsCode: '', items: [] });
      if (path.includes('/sector') && !path.startsWith('/api/sectors')) return json({ sectorCode: '', sectorName: '' });
      if (path.includes('/hh-stats')) return json({ tsCode: '', stats: [] });
      if (path.startsWith('/api/bullcamp')) return json({ items: [] });
      if (path.startsWith('/api/double-bottom-scan')) return json({ items: [] });
      if (path.startsWith('/api/price-alerts')) return handleAlerts(request, env);
      if (path.startsWith('/api/settings')) return json({ configured: false });
      if (path.startsWith('/api/market')) return json({});
      if (path.startsWith('/api/charts')) return json({ data: [] });
      if (path.startsWith('/api/ths')) return json({ items: [] });
      if (path.startsWith('/api/camp')) return json({ items: [] });
      if (path.startsWith('/api/intraday')) return json({});
      if (path.startsWith('/api/zsxq')) return json({ items: [] });
      if (path.startsWith('/api/briefs')) return json({ items: [] });

      // 兜底：未知路由返回空对象而非 404，防止前端崩溃
      return json({});
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Internal error';
      return err(message, 500);
    }
  },
};
