import { useQuery } from "@tanstack/react-query";
import { getDoubleBottomScan } from "@/services/hh-scan.service";

export function useDoubleBottomScan() {
  return useQuery({
    queryKey: ["double-bottom-scan"],
    queryFn: getDoubleBottomScan,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
