import { fastCache } from "@/lib/fast-cache";

const BASE = "/api";

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * 带本地缓存的 API 请求
 * - GET 请求：内存 + localStorage 双层缓存，后台静默刷新
 * - 写入请求：自动清除相关缓存前缀
 */
export async function api<T>(path: string, options?: RequestInit & { cacheTTL?: number }): Promise<T> {
  const ttl = options?.cacheTTL ?? 0;
  const method = (options?.method ?? "GET").toUpperCase();
  const isWrite = WRITE_METHODS.has(method);
  const cacheKey = `api:${path}`;

  // 写入操作：清除相关缓存后直接请求
  if (isWrite) {
    invalidateCache(path);
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // GET 请求：有 TTL 时先查缓存
  if (ttl > 0) {
    const cached = fastCache.get<T>(cacheKey);
    if (cached !== null) {
      // 后台静默刷新，不阻塞当前返回
      setTimeout(() => {
        fetch(`${BASE}${path}`, {
          headers: { "Content-Type": "application/json" },
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data) fastCache.set(cacheKey, data as T, ttl);
        }).catch(() => {});
      }, 0);
      return cached;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data: T = await res.json();

  if (ttl > 0) {
    fastCache.set(cacheKey, data, ttl);
  }

  return data;
}

/**
 * 写入操作后清除相关缓存
 * e.g. POST /watchlist → 清除所有 /watchlist 开头的缓存
 */
function invalidateCache(path: string): void {
  const prefix = path.split("/").slice(0, 2).join("/"); // e.g. "/watchlist"
  fastCache.invalidatePrefix(`api:${prefix}`);
}

export interface ServerStatus {
  ready: boolean;
  message: string;
}

export async function getServerStatus(): Promise<ServerStatus> {
  try {
    return await api<ServerStatus>("/status");
  } catch {
    return { ready: false, message: "等待服务器启动..." };
  }
}
