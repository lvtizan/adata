import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getThsSectors,
  getThsSectorMembers,
  getMySectors,
  addMySector,
  removeMySector,
  refreshThsRs120,
} from "@/services/ths.service";

export function useThsSectors() {
  return useQuery({
    queryKey: ["ths-sectors"],
    queryFn: getThsSectors,
    staleTime: 300_000, // 5 分钟
  });
}

export function useThsSectorMembers(sectorCode: string | undefined) {
  return useQuery({
    queryKey: ["ths-sector-members", sectorCode],
    queryFn: () => getThsSectorMembers(sectorCode!),
    enabled: !!sectorCode,
    staleTime: 60_000, // 1 分钟
  });
}

export function useMySectors() {
  return useQuery({
    queryKey: ["my-sectors"],
    queryFn: getMySectors,
    staleTime: 30_000,
  });
}

export function useAddMySector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) => addMySector(code, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-sectors"] });
    },
  });
}

export function useRemoveMySector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => removeMySector(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-sectors"] });
    },
  });
}

export function useRefreshThsRs120() {
  return useMutation({
    mutationFn: () => refreshThsRs120(),
  });
}
