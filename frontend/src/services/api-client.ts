const BASE = "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
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
