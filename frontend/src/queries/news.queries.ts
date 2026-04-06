import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNewsFeed, getNewsBrief, refreshNewsFeed } from "@/services";

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
      // 刷新后重新加载新闻数据
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["news-feed"] });
        queryClient.invalidateQueries({ queryKey: ["news-brief"] });
      }, 3000); // 给后台采集 3 秒时间
    },
  });
}
