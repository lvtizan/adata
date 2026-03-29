import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ThemeProvider } from "@/app/theme/theme-provider";
import { ServerReadyGate } from "@/app/providers/server-ready-gate";
import { PrefetchEngine } from "@/app/providers/prefetch-engine";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <ServerReadyGate>
            {/* 服务器就绪后立即启动全站数据预加载 */}
            <PrefetchEngine />
            {children}
          </ServerReadyGate>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
