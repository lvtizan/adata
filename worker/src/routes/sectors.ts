import { Env, json, err } from '../index';

export async function handleSectors(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // /api/sectors/rankings or /api/sectors/:code/stocks
  const sub = pathParts[2];

  if (sub === 'rankings') {
    const date = url.searchParams.get('date') ?? 'latest';
    let sql: string;
    if (date === 'latest') {
      sql = `SELECT * FROM sector_rankings
             WHERE trade_date = (SELECT MAX(trade_date) FROM sector_rankings)
             ORDER BY rank ASC`;
    } else {
      sql = `SELECT * FROM sector_rankings WHERE trade_date = '${date}' ORDER BY rank ASC`;
    }
    const rows = await env.DB.prepare(sql).all();
    return json(rows.results);
  }

  // /api/sectors/:code/stocks
  const sectorCode = sub;
  if (!sectorCode) return err('sector_code required');

  const date = url.searchParams.get('date') ?? 'latest';
  let dateFilter: string;
  if (date === 'latest') {
    dateFilter = `(SELECT MAX(trade_date) FROM stock_daily)`;
  } else {
    dateFilter = `'${date}'`;
  }

  const rows = await env.DB.prepare(`
    SELECT sd.ts_code, sp.stock_name, sd.close, sd.pct_chg,
           sd.vol, sd.amount, rm.rps20, rm.rps250
    FROM stock_daily sd
    LEFT JOIN stock_profiles sp ON sd.ts_code = sp.ts_code
    LEFT JOIN rps_master rm ON sd.ts_code = rm.ts_code AND sd.trade_date = rm.trade_date
    WHERE sp.sector_code = ? AND sd.trade_date = ${dateFilter}
    ORDER BY rm.rps250 DESC NULLS LAST
  `).bind(sectorCode).all();

  return json(rows.results);
}
