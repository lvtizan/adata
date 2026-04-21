import { Env, json, err } from '../index';

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return json({ stocks: [], sectors: [] });

  const like = `%${q}%`;

  const [stocks, sectors] = await Promise.all([
    env.DB.prepare(`
      SELECT ts_code, stock_name, one_liner, sector_code
      FROM stock_profiles
      WHERE ts_code LIKE ? OR stock_name LIKE ?
      LIMIT 20
    `).bind(like, like).all(),
    env.DB.prepare(`
      SELECT sector_code, sector_name
      FROM sector_cards
      WHERE sector_code LIKE ? OR sector_name LIKE ?
      LIMIT 10
    `).bind(like, like).all(),
  ]);

  return json({
    stocks: stocks.results,
    sectors: sectors.results,
  });
}
