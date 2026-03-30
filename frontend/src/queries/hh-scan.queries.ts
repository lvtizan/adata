import { useQuery } from "@tanstack/react-query";
import { getHHScan } from "@/services/hh-scan.service";

export function useHHScan() {
  return useQuery({
    queryKey: ["hh-scan"],
    queryFn: getHHScan,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
