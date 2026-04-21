import { Env, json, err } from '../index';

export async function handleMySectors(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const sectorCode = pathParts[2];

  switch (request.method) {
    case 'GET': {
      const rows = await env.DB.prepare(
        'SELECT * FROM my_sectors ORDER BY added_at DESC'
      ).all();
      return json(rows.results);
    }

    case 'POST': {
      const body = await request.json<{ code: string; name: string }>();
      await env.DB.prepare(`
        INSERT INTO my_sectors (code, name) VALUES (?1, ?2)
        ON CONFLICT(code) DO UPDATE SET name=excluded.name
      `).bind(body.code, body.name).run();
      return json({ ok: true });
    }

    case 'DELETE': {
      if (!sectorCode) return err('code required');
      await env.DB.prepare('DELETE FROM my_sectors WHERE code=?').bind(sectorCode).run();
      return json({ ok: true });
    }

    default:
      return err('Method not allowed', 405);
  }
}
