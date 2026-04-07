import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNewsFeed, getNewsBrief, refreshNewsFeed, getZsxqTopics, getZsxqStockStats, refreshZsxq, searchZsxqTopics, getZsxqStockDetail } from "@/services";

export function useNewsFeed(params?: { source?: string; category?: string; limit?: number }) {
  return useQuery({
    queryKey: ["news-feed", params],
    queryFn: () => getNewsFeed(params),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useNewsBrief(date?: string) {
  return useQuery({
    queryKey: ["news-brief", date],
    queryFn: () => getNewsBrief(date),
    staleTime: 60_000,
  });
}

export function useRefreshNewsFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshNewsFeed,
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["news-feed"] });
        queryClient.invalidateQueries({ queryKey: ["news-brief"] });
      }, 3000);
    },
  });
}

// ── 知识星球 ──

export function useZsxqTopics(limit = 50) {
  return useQuery({
    queryKey: ["zsxq-topics", limit],
    queryFn: () => getZsxqTopics(limit),
    staleTime: 30_000,
    select: (data) => data.items,
  });
}

export function useZsxqStockStats() {
  return useQuery({
    queryKey: ["zsxq-stock-stats"],
    queryFn: () => getZsxqStockStats(),
    staleTime: 30_000,
    select: (data) => data.items,
  });
}

export function useZsxqSearch(keyword: string) {
  return useQuery({
    queryKey: ["zsxq-search", keyword],
    queryFn: () => searchZsxqTopics(keyword),
    enabled: !!keyword && keyword.length >= 1,
    staleTime: 30_000,
    select: (data) => data.items,
  });
}

export function useZsxqStockDetail(name: string | null) {
  return useQuery({
    queryKey: ["zsxq-stock-detail", name],
    queryFn: () => getZsxqStockDetail(name!),
    enabled: !!name,
    staleTime: 30_000,
  });
}

export function useRefreshZsxq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshZsxq,
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["zsxq-topics"] });
        queryClient.invalidateQueries({ queryKey: ["zsxq-stock-stats"] });
      }, 5000);
    },
  });
}
