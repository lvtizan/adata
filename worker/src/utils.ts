/** snake_case → camelCase 转换 */
export function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** 递归将对象所有 key 从 snake_case 转为 camelCase */
export function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[toCamel(k)] = camelizeKeys(v);
    }
    return result;
  }
  return obj;
}
