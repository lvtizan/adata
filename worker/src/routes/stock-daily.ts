import { Env, json, err } from '../index';

export async function handleStockDaily(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // /api/stock/:code/daily
  const tsCode = pathParts[2];
  if (!tsCode) return err('ts_code required');

  const days = parseInt(url.searchParams.get('days') ?? '250');

  const rows = await env.DB.prepare(`
    SELECT * FROM stock_daily
    WHERE ts_code = ?
    ORDER BY trade_date DESC
    LIMIT ?
  `).bind(tsCode, days).all();

  return json(rows.results);
}
