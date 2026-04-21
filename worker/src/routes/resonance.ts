import { Env, json, err } from '../index';

export async function handleResonance(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? 'latest';

  let sql: string;
  if (date === 'latest') {
    sql = `SELECT * FROM sector_resonance
           WHERE trade_date = (SELECT MAX(trade_date) FROM sector_resonance)
           ORDER BY strength DESC`;
  } else {
    sql = `SELECT * FROM sector_resonance WHERE trade_date = ? ORDER BY strength DESC`;
  }

  const rows = date === 'latest'
    ? await env.DB.prepare(sql).all()
    : await env.DB.prepare(sql).bind(date).all();

  return json(rows.results.map(r => ({
    ...r,
    members_up: JSON.parse(r.members_up as string || '[]'),
  })));
}
