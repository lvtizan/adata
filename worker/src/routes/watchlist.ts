import { Env, json, err } from '../index';

export async function handleWatchlist(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 'watchlist', maybe ts_code]
  const tsCode = pathParts[2]; // optional

  switch (request.method) {
    case 'GET': {
      const rows = await env.DB.prepare(
        'SELECT * FROM watchlist ORDER BY sort_order ASC, created_at DESC'
      ).all();
      return json({ items: rows.results });
    }

    case 'POST': {
      const body = await request.json<Record<string, unknown>>();
      const stmt = env.DB.prepare(`
        INSERT INTO watchlist (ts_code, stock_name, sector_code, sector_name, subgroup, close, pct_change_1d, pct_change_5d, pct_change_10d, rps20, amount, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(ts_code) DO UPDATE SET
          stock_name=excluded.stock_name, sector_code=excluded.sector_code,
          sector_name=excluded.sector_name, subgroup=excluded.subgroup,
          close=excluded.close, pct_change_1d=excluded.pct_change_1d,
          pct_change_5d=excluded.pct_change_5d, pct_change_10d=excluded.pct_change_10d,
          rps20=excluded.rps20, amount=excluded.amount, sort_order=excluded.sort_order,
          updated_at=datetime('now')
      `);
      await stmt.bind(
        body.ts_code, body.stock_name, body.sector_code, body.sector_name,
        body.subgroup, body.close, body.pct_change_1d, body.pct_change_5d,
        body.pct_change_10d, body.rps20, body.amount, body.sort_order ?? 0
      ).run();
      return json({ ok: true });
    }

    case 'PUT': {
      if (!tsCode) return err('ts_code required');
      const body = await request.json<Record<string, unknown>>();
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [k, v] of Object.entries(body)) {
        if (k === 'ts_code') continue;
        fields.push(`${k}=?`);
        values.push(v);
      }
      fields.push("updated_at=datetime('now')");
      values.push(tsCode);
      await env.DB.prepare(
        `UPDATE watchlist SET ${fields.join(', ')} WHERE ts_code=?`
      ).bind(...values).run();
      return json({ ok: true });
    }

    case 'DELETE': {
      if (!tsCode) return err('ts_code required');
      await env.DB.prepare('DELETE FROM watchlist WHERE ts_code=?').bind(tsCode).run();
      return json({ ok: true });
    }

    default:
      return err('Method not allowed', 405);
  }
}
