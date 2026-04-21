import { Env, json, err } from '../index';

export async function handleRealtime(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const codes = url.searchParams.get('codes');
  if (!codes) return err('codes required, e.g. sh600000,sz300476');

  // Check KV cache first (< 3 seconds old)
  const cacheKey = `quotes:${codes}`;
  if (env.KV) {
    const cached = await env.KV.get(cacheKey, 'json') as { data: unknown; ts: number } | null;
    if (cached && Date.now() - cached.ts < 3000) {
      return json(cached.data);
    }
  }

  // Fetch from Sina Finance API
  const sinaUrl = `https://hq.sinajs.cn/list=${codes}`;
  const resp = await fetch(sinaUrl, {
    headers: { 'Referer': 'https://finance.sina.com.cn' },
  });
  const text = await resp.text();
  const parsed = parseSinaQuotes(text);

  // Cache in KV (TTL 10 seconds)
  if (env.KV) {
    await env.KV.put(cacheKey, JSON.stringify({ data: parsed, ts: Date.now() }), {
      expirationTtl: 10,
    });
  }

  return json(parsed);
}

interface Quote {
  code: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  preClose: number;
  vol: number;
  amount: number;
  pctChg: number;
  time: string;
}

function parseSinaQuotes(text: string): Quote[] {
  const lines = text.split('\n').filter(l => l.includes('="'));
  return lines.map(line => {
    // var hq_str_sh600000="浦发银行,10.50,10.48,...";
    const codeMatch = line.match(/hq_str_(\w+)=/);
    const dataMatch = line.match(/"(.+)"/);
    if (!codeMatch || !dataMatch) return null;

    const code = codeMatch[1];
    const parts = dataMatch[1].split(',');
    if (parts.length < 32) return null;

    const open = parseFloat(parts[1]);
    const preClose = parseFloat(parts[2]);
    const close = parseFloat(parts[3]);
    const high = parseFloat(parts[4]);
    const low = parseFloat(parts[5]);
    const vol = parseFloat(parts[8]);
    const amount = parseFloat(parts[9]);
    const pctChg = preClose > 0 ? ((close - preClose) / preClose) * 100 : 0;

    return {
      code,
      name: parts[0],
      open, high, low, close, preClose,
      vol, amount,
      pctChg: Math.round(pctChg * 100) / 100,
      time: `${parts[30]} ${parts[31]}`,
    };
  }).filter(Boolean) as Quote[];
}
