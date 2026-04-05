/**
 * 毫秒级数据缓存系统
 * 使用 localStorage + 内存双层缓存
 */

interface CacheData<T> {
  data: T;
  timestamp: number;
  ttl: number; // 缓存有效期（毫秒）
}

class FastCache {
  private memoryCache = new Map<string, any>();
  private readonly PREFIX = 'fast-cache:';

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl: number = 60000): void {
    const cacheData: CacheData<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    // 内存缓存（最快）
    this.memoryCache.set(key, cacheData);

    // localStorage缓存（持久化）
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
    } catch (e) {
      // localStorage已满，清理旧缓存
      this.clearOld();
    }
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    // 先从内存缓存读取（纳秒级）
    const memData = this.memoryCache.get(key);
    if (memData && this.isValid(memData)) {
      return memData.data;
    }

    // 再从localStorage读取（毫秒级）
    try {
      const stored = localStorage.getItem(this.PREFIX + key);
      if (!stored) return null;

      const cacheData: CacheData<T> = JSON.parse(stored);
      if (!this.isValid(cacheData)) {
        this.delete(key);
        return null;
      }

      // 回填内存缓存
      this.memoryCache.set(key, cacheData);
      return cacheData.data;
    } catch (e) {
      return null;
    }
  }

  /**
   * 检查缓存是否有效
   */
  private isValid(cacheData: CacheData<any>): boolean {
    return Date.now() - cacheData.timestamp < cacheData.ttl;
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      localStorage.removeItem(this.PREFIX + key);
    } catch (e) {}
  }

  /**
   * 清理过期缓存
   */
  clearOld(): void {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.PREFIX)) {
        keys.push(key);
      }
    }

    keys.forEach(key => {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const cacheData = JSON.parse(stored);
          if (!this.isValid(cacheData)) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.memoryCache.clear();
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));
  }

  /**
   * 按前缀批量清除缓存（写入操作后失效相关缓存）
   */
  invalidatePrefix(prefix: string): void {
    const fullPrefix = this.PREFIX + prefix;
    // 清内存缓存
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.memoryCache.delete(key);
      }
    }
    // 清 localStorage
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(fullPrefix)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));
  }
}

export const fastCache = new FastCache();
