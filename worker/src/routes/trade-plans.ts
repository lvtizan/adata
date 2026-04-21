import { Env, json, err } from '../index';

export async function handleTradePlans(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const planId = pathParts[2];

  switch (request.method) {
    case 'GET': {
      const status = url.searchParams.get('status');
      const sql = status
        ? 'SELECT * FROM trade_plans WHERE status=? ORDER BY created_at DESC'
        : 'SELECT * FROM trade_plans ORDER BY created_at DESC';
      const rows = status
        ? await env.DB.prepare(sql).bind(status).all()
        : await env.DB.prepare(sql).all();
      return json(rows.results);
    }

    case 'POST': {
      const body = await request.json<Record<string, unknown>>();
      const id = body.id ?? crypto.randomUUID();
      const riskR = (body.entry_price as number) - (body.stop_loss as number);
      const tp1 = (body.entry_price as number) + riskR * 2;
      const tp2 = (body.entry_price as number) + riskR * 3;
      await env.DB.prepare(`
        INSERT INTO trade_plans (id, ts_code, stock_name, entry_price, stop_loss, take_profit_1, take_profit_2, risk_r, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      `).bind(
        id, body.ts_code, body.stock_name, body.entry_price,
        body.stop_loss, tp1, tp2, riskR, body.status ?? 'planned'
      ).run();
      return json({ ok: true, id, take_profit_1: tp1, take_profit_2: tp2, risk_r: riskR });
    }

    case 'PUT': {
      if (!planId) return err('id required');
      const body = await request.json<Record<string, unknown>>();
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [k, v] of Object.entries(body)) {
        if (k === 'id') continue;
        fields.push(`${k}=?`);
        values.push(v);
      }
      values.push(planId);
      await env.DB.prepare(
        `UPDATE trade_plans SET ${fields.join(', ')} WHERE id=?`
      ).bind(...values).run();
      return json({ ok: true });
    }

    default:
      return err('Method not allowed', 405);
  }
}
