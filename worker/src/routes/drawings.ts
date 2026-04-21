import { Env, json, err } from '../index';

export async function handleDrawings(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const symbol = pathParts[2];
  if (!symbol) return err('symbol required');

  const timeframe = url.searchParams.get('timeframe') ?? 'D';

  switch (request.method) {
    case 'GET': {
      const row = await env.DB.prepare(
        'SELECT * FROM chart_drawings WHERE symbol=? AND timeframe=?'
      ).bind(symbol, timeframe).first();
      if (!row) return json({ symbol, timeframe, drawings: [] });
      return json({ ...row, drawings: JSON.parse(row.drawings as string || '[]') });
    }

    case 'PUT': {
      const body = await request.json<{ drawings: unknown[] }>();
      await env.DB.prepare(`
        INSERT INTO chart_drawings (symbol, timeframe, drawings)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(symbol, timeframe) DO UPDATE SET
          drawings=excluded.drawings, updated_at=datetime('now')
      `).bind(symbol, timeframe, JSON.stringify(body.drawings)).run();
      return json({ ok: true });
    }

    case 'DELETE': {
      await env.DB.prepare(
        'DELETE FROM chart_drawings WHERE symbol=? AND timeframe=?'
      ).bind(symbol, timeframe).run();
      return json({ ok: true });
    }

    default:
      return err('Method not allowed', 405);
  }
}
