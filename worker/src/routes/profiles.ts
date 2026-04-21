import { Env, json, err } from '../index';

export async function handleProfiles(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // /api/stock/:code/profile or /api/stock/:code/chain
  const tsCode = pathParts[2];
  const sub = pathParts[3]; // 'profile' or 'chain'

  if (!tsCode) return err('ts_code required');

  if (sub === 'profile') {
    const row = await env.DB.prepare(
      'SELECT * FROM stock_profiles WHERE ts_code = ?'
    ).bind(tsCode).first();
    if (!row) return json(null);
    return json(row);
  }

  if (sub === 'chain') {
    const edges = await env.DB.prepare(`
      SELECT ie.*, sp.stock_name AS target_name
      FROM industry_edges ie
      LEFT JOIN stock_profiles sp ON ie.to_code = sp.ts_code
      WHERE ie.from_code = ?
      UNION ALL
      SELECT ie.*, sp.stock_name AS target_name
      FROM industry_edges ie
      LEFT JOIN stock_profiles sp ON ie.from_code = sp.ts_code
      WHERE ie.to_code = ?
    `).bind(tsCode, tsCode).all();
    return json(edges.results);
  }

  return err('Unknown sub-route', 404);
}
