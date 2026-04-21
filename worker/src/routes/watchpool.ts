import { Env, json, err } from '../index';

export async function handleWatchpool(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const minScore = parseInt(url.searchParams.get('min_score') ?? '0');
  const date = url.searchParams.get('date') ?? 'latest';

  let dateFilter: string;
  if (date === 'latest') {
    dateFilter = `(SELECT MAX(trade_date) FROM stock_scores)`;
  } else {
    dateFilter = `'${date}'`;
  }

  const rows = await env.DB.prepare(`
    SELECT ss.*,
           sp.stock_name, sp.one_liner, sp.core_clients,
           ph.patterns,
           sr.resonant AS sector_resonant, sr.strength AS sector_strength
    FROM stock_scores ss
    LEFT JOIN stock_profiles sp ON ss.ts_code = sp.ts_code
    LEFT JOIN pattern_hits ph ON ss.ts_code = ph.ts_code AND ss.trade_date = ph.trade_date
    LEFT JOIN rps_master rm ON ss.ts_code = rm.ts_code AND ss.trade_date = rm.trade_date
    LEFT JOIN stock_profiles sp2 ON ss.ts_code = sp2.ts_code
    LEFT JOIN sector_resonance sr ON sr.sector_code = sp2.sector_code
      AND sr.trade_date = ss.trade_date
    WHERE ss.trade_date = ${dateFilter}
      AND ss.score >= ?
    ORDER BY ss.score DESC
  `).bind(minScore).all();

  return json(rows.results.map(r => ({
    ...r,
    reasons: JSON.parse(r.reasons as string || '[]'),
    patterns: JSON.parse(r.patterns as string || '{}'),
  })));
}
