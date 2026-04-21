import { Env, json, err } from '../index';

export async function handleAlerts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const alertId = pathParts[2];

  switch (request.method) {
    case 'GET': {
      const status = url.searchParams.get('status') ?? 'active';
      const rows = await env.DB.prepare(
        'SELECT * FROM price_alerts WHERE status=? ORDER BY created_at DESC'
      ).bind(status).all();
      return json({ items: rows.results });
    }

    case 'POST': {
      const body = await request.json<Record<string, unknown>>();
      const id = body.id ?? crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO price_alerts (id, ts_code, stock_name, entry_price, stop_loss, take_profit, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(
        id, body.ts_code, body.stock_name, body.entry_price,
        body.stop_loss, body.take_profit, body.status ?? 'active'
      ).run();
      return json({ ok: true, id });
    }

    case 'DELETE': {
      if (!alertId) return err('id required');
      await env.DB.prepare('DELETE FROM price_alerts WHERE id=?').bind(alertId).run();
      return json({ ok: true });
    }

    default:
      return err('Method not allowed', 405);
  }
}
