import { Env, json, err } from '../index';

/**
 * Bulk push endpoint for Python data pump.
 * POST /api/push/:table
 * Body: { rows: [...] }
 *
 * Supports batch upsert for:
 * - stock_daily, rps_master, sector_rankings, sector_resonance
 * - stock_scores, pattern_hits
 * - stock_profiles, industry_edges, sector_cards
 */
export async function handleBulkPush(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const table = pathParts[2]; // /api/push/:table

  if (!table) return err('table name required');

  const body = await request.json<{ rows: Record<string, unknown>[] }>();
  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return err('rows array required');
  }

  const upsertMap: Record<string, { cols: string[]; pk: string[] }> = {
    stock_daily: {
      cols: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol', 'amount', 'pct_chg'],
      pk: ['ts_code', 'trade_date'],
    },
    rps_master: {
      cols: ['ts_code', 'trade_date', 'rps5', 'rps10', 'rps20', 'rps50', 'rps250'],
      pk: ['ts_code', 'trade_date'],
    },
    sector_rankings: {
      cols: ['trade_date', 'sector_code', 'sector_name', 'rank', 'pct_1d', 'pct_5d', 'pct_10d', 'rps10', 'amount', 'limit_up_count'],
      pk: ['trade_date', 'sector_code'],
    },
    sector_resonance: {
      cols: ['trade_date', 'sector_code', 'total_count', 'up_count', 'strength', 'resonant', 'members_up'],
      pk: ['trade_date', 'sector_code'],
    },
    stock_scores: {
      cols: ['ts_code', 'trade_date', 'score', 'verdict', 'reasons', 'rps250', 'rps50', 'vol_shrink_ratio', 'pattern', 'distance_to_high'],
      pk: ['ts_code', 'trade_date'],
    },
    pattern_hits: {
      cols: ['ts_code', 'trade_date', 'patterns'],
      pk: ['ts_code', 'trade_date'],
    },
    stock_profiles: {
      cols: ['ts_code', 'stock_name', 'one_liner', 'core_clients', 'industry_position', 'sector_code'],
      pk: ['ts_code'],
    },
    sector_cards: {
      cols: ['sector_code', 'sector_name', 'summary', 'drivers', 'trading_sequence', 'risks', 'chain_map', 'updated_at'],
      pk: ['sector_code'],
    },
  };

  const spec = upsertMap[table];
  if (!spec) return err(`Unknown table: ${table}. Supported: ${Object.keys(upsertMap).join(', ')}`);

  const updateCols = spec.cols.filter(c => !spec.pk.includes(c));
  const placeholders = spec.cols.map((_, i) => `?${i + 1}`).join(', ');
  const onConflict = updateCols.length > 0
    ? `ON CONFLICT(${spec.pk.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c}=excluded.${c}`).join(', ')}`
    : `ON CONFLICT(${spec.pk.join(', ')}) DO NOTHING`;

  const sql = `INSERT INTO ${table} (${spec.cols.join(', ')}) VALUES (${placeholders}) ${onConflict}`;

  // D1 batch: max 100 statements per batch
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < body.rows.length; i += batchSize) {
    const batch = body.rows.slice(i, i + batchSize);
    const stmts = batch.map(row => {
      const values = spec.cols.map(c => {
        const v = row[c];
        // Auto-serialize objects/arrays to JSON
        if (v !== null && typeof v === 'object') return JSON.stringify(v);
        return v ?? null;
      });
      return env.DB.prepare(sql).bind(...values);
    });
    await env.DB.batch(stmts);
    inserted += batch.length;
  }

  return json({ ok: true, table, inserted });
}
