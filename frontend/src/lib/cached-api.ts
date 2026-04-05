/**
 * 带缓存的API客户端
 * 实现毫秒级数据加载
 */

import { fastCache } from './fast-cache';

const DEFAULT_TTL = 60 * 1000; // 1分钟缓存
const LONG_TTL = 5 * 60 * 1000; // 5分钟缓存
const VERY_LONG_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * 带缓存的API请求
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  // 1. 先从缓存读取（毫秒级）
  const cached = fastCache.get<T>(key);
  if (cached !== null) {
    // 后台更新缓存（不阻塞）
    setTimeout(() => {
      fetcher().then(data => {
        fastCache.set(key, data, ttl);
      }).catch(() => {});
    }, 0);
    return cached;
  }

  // 2. 缓存未命中，发起请求
  const data = await fetcher();
  
  // 3. 存入缓存
  fastCache.set(key, data, ttl);
  
  return data;
}

/**
 * 快速API调用装饰器
 */
export function createCachedAPI<T extends (...args: any[]) => Promise<any>>(
  keyGenerator: (...args: Parameters<T>) => string,
  apiFunction: T,
  ttl: number = DEFAULT_TTL
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args);
    return cachedFetch(key, () => apiFunction(...args), ttl);
  }) as T;
}

/**
 * 预加载数据到缓存
 */
export async function preloadToCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  try {
    const data = await fetcher();
    fastCache.set(key, data, ttl);
  } catch (e) {
    console.error(`预加载失败: ${key}`, e);
  }
}

/**
 * 批量预加载
 */
export async function batchPreload(
  tasks: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>
): Promise<void> {
  await Promise.allSettled(
    tasks.map(task => preloadToCache(task.key, task.fetcher, task.ttl))
  );
}

export { DEFAULT_TTL, LONG_TTL, VERY_LONG_TTL };
