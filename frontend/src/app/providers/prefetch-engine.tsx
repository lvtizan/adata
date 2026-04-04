import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getWatchlist,
  getBullCamp,
  getMarketOverview,
  getSectorRankings,
  getStockChart,
  getSectorChart,
  getStockSector,
  getStockAttribution,
  getStockTags,
  getStockPatterns,
  getRelativeStrength,
} from "@/services";

/**
 * 全站数据预加载引擎
 *
 * 策略：服务器就绪后分 3 波预加载，每波之间留一点间隔避免后端并发过高：
 *  Wave 1 (立即)  → 页面级数据：market overview, sector rankings, watchlist, bullcamp
 *  Wave 2 (1.5s)  → 自选股逐只预加载：chart, sector, tags, attribution, patterns
 *  Wave 3 (跟随)  → 自选股的 RS 对比（依赖 sector 数据）
 *
 * 所有预加载请求都带 staleTime，React Query 会自动去重。
 */
export function PrefetchEngine() {
  const qc = useQueryClient();
  const hasRun = useRef(false);

  // 发送进度事件
  const emitProgress = (progress: number, stage: string) => {
    window.dispatchEvent(new CustomEvent('prefetch-progress', {
      detail: { progress, stage }
    }));
  };

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // ── Wave 1: 页面级数据（并行） ──
    const wave1 = async () => {
      emitProgress(5, "正在加载市场概览...");
      const tasks = [
        qc.prefetchQuery({
          queryKey: ["market", "overview", undefined],
          queryFn: () => getMarketOverview(),
          staleTime: 60_000,
        }),
        qc.prefetchQuery({
          queryKey: ["sectors", "rankings", "rps10", ""],
          queryFn: () => getSectorRankings("rps10", ""),
          staleTime: 60_000,
        }),
        qc.prefetchQuery({
          queryKey: ["watchlist"],
          queryFn: getWatchlist,
          staleTime: 60_000,
        }),
        qc.prefetchQuery({
          queryKey: ["bullcamp"],
          queryFn: getBullCamp,
          staleTime: 60_000,
        }),
      ];
      await Promise.allSettled(tasks);
      emitProgress(20, "市场数据加载完成");
    };

    // ── Wave 2: 自选股逐只预加载 ──
    const wave2 = async () => {
      // 从已缓存的 watchlist 数据中取股票列表
      const watchlistData = qc.getQueryData<{ items: Array<{ tsCode: string; sectorCode?: string }> }>(["watchlist"]);
      if (!watchlistData?.items?.length) {
        emitProgress(40, "无自选股数据");
        return;
      }

      const items = watchlistData.items;
      const total = items.length;
      emitProgress(25, `正在加载 ${total} 只自选股...`);

      // 限制并发：每次最多 4 只同时加载
      const batchSize = 4;
      let completed = 0;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const promises = batch.flatMap((item) => {
          const code = item.tsCode;
          return [
            qc.prefetchQuery({
              queryKey: ["chart", "stock", code, 120, "1d"],
              queryFn: () => getStockChart(code, 120, "1d"),
              staleTime: 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "tags"],
              queryFn: () => getStockTags(code),
              staleTime: 30 * 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "attribution"],
              queryFn: () => getStockAttribution(code),
              staleTime: 10 * 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "patterns"],
              queryFn: () => getStockPatterns(code),
              staleTime: 10 * 60_000,
            }),
            // 如果没有 sectorCode，先查 sector
            ...(!item.sectorCode
              ? [
                  qc.prefetchQuery({
                    queryKey: ["stock", code, "sector"],
                    queryFn: () => getStockSector(code),
                    staleTime: 30 * 60_000,
                  }),
                ]
              : []),
          ];
        });
        await Promise.allSettled(promises);
        completed += batch.length;
        const progress = 25 + (completed / total) * 15; // 25-40%
        emitProgress(progress, `已加载 ${completed}/${total} 只自选股`);
      }
    };

    // ── Wave 3: RS 对比（需要 sector 数据），批量并发 ──
    const wave3 = async () => {
      const watchlistData = qc.getQueryData<{ items: Array<{ tsCode: string; sectorCode?: string }> }>(["watchlist"]);
      if (!watchlistData?.items?.length) return;

      const rsTasks: Array<() => Promise<any>> = [];

      for (const item of watchlistData.items) {
        const code = item.tsCode;
        let sectorCode = item.sectorCode;

        if (!sectorCode) {
          const sectorData = qc.getQueryData<{ sectorCode: string }>(["stock", code, "sector"]);
          sectorCode = sectorData?.sectorCode;
        }

        if (sectorCode) {
          const sc = sectorCode;
          rsTasks.push(() => qc.prefetchQuery({
            queryKey: ["chart", "sector", sc, 120],
            queryFn: () => getSectorChart(sc, 120),
            staleTime: 60_000,
          }));
          rsTasks.push(() => qc.prefetchQuery({
            queryKey: ["relative-strength", code, sc],
            queryFn: () => getRelativeStrength(code, sc),
            staleTime: 60_000,
          }));
        }
      }

      const total = rsTasks.length;
      emitProgress(45, `正在计算相对强度 (${total} 项)...`);

      // 批量 4 个并发
      let completed = 0;
      for (let i = 0; i < rsTasks.length; i += 4) {
        const batch = rsTasks.slice(i, i + 4);
        await Promise.allSettled(batch.map(fn => fn()));
        completed += batch.length;
        const progress = 45 + (completed / total) * 20; // 45-65%
        emitProgress(progress, `相对强度计算中 ${completed}/${total}`);
      }
    };

    // ── Wave 4: 牛股集中营 top 股票预加载（含 RS） ──
    const wave4 = async () => {
      const bullcampData = qc.getQueryData<{ items: Array<{ tsCode: string; sectorCode?: string }> }>(["bullcamp"]);
      if (!bullcampData?.items?.length) {
        emitProgress(100, "预加载完成");
        return;
      }

      const topStocks = bullcampData.items.slice(0, 10);
      const batchSize = 4;

      emitProgress(70, "正在加载牛股集中营数据...");

      // 第一轮：K 线 + tags + patterns + sector 查询
      let completed = 0;
      for (let i = 0; i < topStocks.length; i += batchSize) {
        const batch = topStocks.slice(i, i + batchSize);
        const promises = batch.flatMap((item) => {
          const code = item.tsCode;
          return [
            qc.prefetchQuery({
              queryKey: ["chart", "stock", code, 120, "1d"],
              queryFn: () => getStockChart(code, 120, "1d"),
              staleTime: 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "tags"],
              queryFn: () => getStockTags(code),
              staleTime: 30 * 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "patterns"],
              queryFn: () => getStockPatterns(code),
              staleTime: 10 * 60_000,
            }),
            qc.prefetchQuery({
              queryKey: ["stock", code, "attribution"],
              queryFn: () => getStockAttribution(code),
              staleTime: 10 * 60_000,
            }),
            ...(!item.sectorCode ? [
              qc.prefetchQuery({
                queryKey: ["stock", code, "sector"],
                queryFn: () => getStockSector(code),
                staleTime: 30 * 60_000,
              }),
            ] : []),
          ];
        });
        await Promise.allSettled(promises);
        completed += batch.length;
        const progress = 70 + (completed / topStocks.length) * 15; // 70-85%
        emitProgress(progress, `牛股集中营加载中 ${completed}/${topStocks.length}`);
      }

      // 第二轮：RS 对比
      emitProgress(85, "正在计算牛股相对强度...");
      for (const item of topStocks) {
        const code = item.tsCode;
        let sectorCode = item.sectorCode;
        if (!sectorCode) {
          const sd = qc.getQueryData<{ sectorCode: string }>(["stock", code, "sector"]);
          sectorCode = sd?.sectorCode;
        }
        if (sectorCode) {
          const sc = sectorCode;
          qc.prefetchQuery({
            queryKey: ["relative-strength", code, sc],
            queryFn: () => getRelativeStrength(code, sc),
            staleTime: 60_000,
          });
        }
      }

      emitProgress(100, "预加载完成");
    };

    // 执行
    const run = async () => {
      await wave1();

      // Wave 2+ 等列表数据到位后再开始
      setTimeout(async () => {
        // 等 watchlist 加载完成
        try {
          await qc.ensureQueryData({
            queryKey: ["watchlist"],
            queryFn: getWatchlist,
            staleTime: 60_000,
          });
        } catch {
          /* 跳过 */
        }
        await wave2();
        await wave3();

        // 牛股集中营预加载
        try {
          await qc.ensureQueryData({
            queryKey: ["bullcamp"],
            queryFn: getBullCamp,
            staleTime: 60_000,
          });
        } catch {
          /* 跳过 */
        }
        await wave4();
      }, 1500);
    };

    run();
  }, [qc]);

  // 无渲染组件
  return null;
}
