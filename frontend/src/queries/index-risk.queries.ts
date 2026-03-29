import { useQuery } from "@tanstack/react-query";
import { getIndexRisk } from "@/services";

export function useIndexRisk() {
  return useQuery({
    queryKey: ["index-risk"],
    queryFn: getIndexRisk,
    staleTime: 5 * 60_000, // 5 分钟缓存，指数分析不需要太频繁刷新
  });
}
