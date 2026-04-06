import { api } from "./api-client";

export interface NewsItem {
  id: number;
  source: string;
  title: string;
  summary: string;
  url: string;
  category: string;
  published: string;
  fetched_at: string;
}

export interface NewsBriefSection {
  category: string;
  label: string;
  count: number;
  items: Array<{
    title: string;
    summary: string;
    source: string;
    url: string;
  }>;
}

export interface NewsBriefResult {
  date: string;
  totalItems: number;
  sourceStats: Record<string, number>;
  sections: NewsBriefSection[];
}

export function getNewsFeed(params?: { source?: string; category?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.source) qs.set("source", params.source);
  if (params?.category) qs.set("category", params.category);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return api<{ items: NewsItem[] }>(`/news-feed${query ? `?${query}` : ""}`, { cacheTTL: 60_000 });
}

export function getNewsBrief(date?: string) {
  const qs = date ? `?date=${date}` : "";
  return api<NewsBriefResult>(`/news-brief${qs}`, { cacheTTL: 60_000 });
}

export function refreshNewsFeed() {
  return api<{ ok: boolean; message: string }>("/news-feed/refresh", { method: "POST" });
}

// ── 知识星球 ──

export interface ZsxqTopic {
  topic_id: string;
  author: string;
  content: string;
  images: string[];
  likes_count: number;
  comments_count: number;
  published: string;
  stock_mentions: string[];
}

export interface ZsxqStockStat {
  stock_name: string;
  mention_count: number;
  last_mentioned: string;
}

export function getZsxqTopics(limit = 50, offset = 0) {
  return api<{ items: ZsxqTopic[] }>(`/zsxq/topics?limit=${limit}&offset=${offset}`, { cacheTTL: 30_000 });
}

export function getZsxqStockStats(limit = 50) {
  return api<{ items: ZsxqStockStat[] }>(`/zsxq/stock-stats?limit=${limit}`, { cacheTTL: 30_000 });
}

export function refreshZsxq() {
  return api<{ ok: boolean; message: string }>("/zsxq/refresh", { method: "POST" });
}
