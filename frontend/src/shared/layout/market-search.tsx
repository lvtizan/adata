import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { useAddToWatchlist, useMarketSearch, useTradePlans, useWatchlist } from "@/queries";
import { useDashboardStore } from "@/store";
import { fmtPct } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import { useUII18n } from "@/i18n/ui";

export function MarketSearch() {
  const { t } = useUII18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { setSelectedSectorCode } = useDashboardStore();
  const addToWatchlist = useAddToWatchlist();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentPath = location.pathname;
  const isWatchlistPage = currentPath === "/watchlist";
  const isTradePlanPage = currentPath === "/trade-plan";
  const isLocalOnlyMode = isWatchlistPage || isTradePlanPage;

  const { data: watchlist = [] } = useWatchlist();
  const { data: tradePlans = [] } = useTradePlans();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 100);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setText((prev) => prev);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const { data, isFetching } = useMarketSearch(isLocalOnlyMode ? "" : debounced, 8);
  const hasQuery = debounced.length >= 2;
  const localStocks = useMemo(() => {
    if (!hasQuery) return [];
    const q = debounced.toLowerCase();
    if (isWatchlistPage) {
      return watchlist
        .filter((item) => item.tsCode.toLowerCase().includes(q) || item.stockName.toLowerCase().includes(q))
        .slice(0, 12)
        .map((item) => ({
          type: "stock" as const,
          tsCode: item.tsCode,
          stockName: item.stockName,
          sectorCode: item.sectorCode,
          sectorName: item.sectorName,
          close: item.close,
          pctChange1d: item.pctChange1d,
          pctChange5d: item.pctChange5d,
          pctChange10d: item.pctChange10d,
          rps20: item.rps20,
          amount: item.amount,
        }));
    }
    if (isTradePlanPage) {
      const unique = new Map<string, {
        type: "stock";
        tsCode: string;
        stockName: string;
        sectorCode: string;
        sectorName: string;
        close: number;
        pctChange1d: number;
        pctChange5d: number;
        pctChange10d: number;
        rps20: number;
        amount: number;
      }>();
      for (const item of tradePlans) {
        if (!item.tsCode) continue;
        if (unique.has(item.tsCode)) continue;
        unique.set(item.tsCode, {
          type: "stock",
          tsCode: item.tsCode,
          stockName: item.stockName || item.tsCode,
          sectorCode: item.sectorCode || "",
          sectorName: item.sectorName || "",
          close: item.entryPrice ?? 0,
          pctChange1d: 0,
          pctChange5d: 0,
          pctChange10d: 0,
          rps20: item.riskReward ?? 0,
          amount: 0,
        });
      }
      return Array.from(unique.values())
        .filter((item) => item.tsCode.toLowerCase().includes(q) || item.stockName.toLowerCase().includes(q))
        .slice(0, 12);
    }
    return [];
  }, [hasQuery, debounced, isWatchlistPage, isTradePlanPage, watchlist, tradePlans]);

  const hasResults = isLocalOnlyMode
    ? localStocks.length > 0
    : (data?.stocks.length ?? 0) > 0 || (data?.sectors.length ?? 0) > 0;
  const open = text.trim().length >= 2;

  const rows = useMemo(() => ({
    stocks: isLocalOnlyMode ? localStocks : (data?.stocks ?? []),
    sectors: isLocalOnlyMode ? [] : (data?.sectors ?? []),
  }), [data, isLocalOnlyMode, localStocks]);

  const watchlistSet = useMemo(() => new Set(watchlist.map((w) => w.tsCode)), [watchlist]);

  return (
    <div ref={wrapRef} className="relative w-[360px] max-w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-8 pl-8 text-sm"
        />
      </div>

      {open && (
        <div className="absolute top-[36px] left-0 right-0 z-50 rounded-md border border-border-default bg-canvas shadow-lg overflow-hidden">
          {!hasQuery && (
            <div className="px-3 py-2 text-xs text-text-tertiary">{t("search.minChars")}</div>
          )}

          {hasQuery && isFetching && !hasResults && !isLocalOnlyMode && (
            <div className="px-3 py-2 text-xs text-text-tertiary">{t("search.loading")}</div>
          )}

          {hasQuery && !isFetching && !hasResults && (
            <div className="px-3 py-2 text-xs text-text-tertiary">{t("search.noResult")}</div>
          )}

          {rows.sectors.length > 0 && (
            <div className="border-b border-border-subtle">
              <div className="px-3 py-1.5 text-[11px] text-text-tertiary">{t("search.sectors")}</div>
              {rows.sectors.map((item) => (
                <button
                  key={item.sectorCode}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors"
                  onClick={() => {
                    setSelectedSectorCode(item.sectorCode);
                    navigate(`/sector-workbench?sectorCode=${encodeURIComponent(item.sectorCode)}&sectorName=${encodeURIComponent(item.sectorName)}`);
                    setText("");
                    setDebounced("");
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm">{item.sectorName}</div>
                      <div className="text-[10px] text-text-tertiary font-mono">{item.sectorCode}</div>
                    </div>
                    <div className="text-right text-xs">
                      {item.rps10 != null && <div className="text-text-secondary">RPS10 {item.rps10.toFixed(1)}</div>}
                      {item.pctChange5d != null && <div className={cn(item.pctChange5d >= 0 ? "text-state-up" : "text-state-down")}>{fmtPct(item.pctChange5d)}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {rows.stocks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] text-text-tertiary">{t("search.stocks")}</div>
              {rows.stocks.map((item) => (
                <div key={item.tsCode} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors">
                  <button
                    className="flex-1 text-left min-w-0"
                  onClick={() => {
                      if (isWatchlistPage) {
                        navigate(`/watchlist?stockCode=${encodeURIComponent(item.tsCode)}`);
                      } else if (isTradePlanPage) {
                        navigate(`/trade-plan?tsCode=${encodeURIComponent(item.tsCode)}`);
                      } else {
                        navigate(
                          `/sector-workbench?sectorCode=${encodeURIComponent(item.sectorCode)}&sectorName=${encodeURIComponent(item.sectorName)}&stockCode=${encodeURIComponent(item.tsCode)}&stockName=${encodeURIComponent(item.stockName)}`,
                        );
                      }
                      setText("");
                      setDebounced("");
                    }}
                  >
                    <div className="text-sm truncate">{item.stockName}</div>
                    <div className="text-[10px] text-text-tertiary font-mono truncate">{item.tsCode} · {item.sectorName || t("search.unknownSector")}</div>
                  </button>
                  <div className="text-right text-[11px] shrink-0">
                    <div className={cn(item.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>{fmtPct(item.pctChange1d)}</div>
                    <div className="text-text-tertiary">RPS {item.rps20.toFixed(0)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 shrink-0",
                      watchlistSet.has(item.tsCode) && "text-amber-500 hover:text-amber-500"
                    )}
                    disabled={watchlistSet.has(item.tsCode) || addToWatchlist.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      addToWatchlist.mutate({
                      tsCode: item.tsCode,
                      stockName: item.stockName,
                      sectorCode: item.sectorCode,
                      sectorName: item.sectorName,
                      close: item.close,
                      pctChange1d: item.pctChange1d,
                      pctChange5d: item.pctChange5d,
                      pctChange10d: item.pctChange10d,
                      rps20: item.rps20,
                      amount: item.amount,
                      });
                    }}
                    title={watchlistSet.has(item.tsCode) ? t("search.inWatchlist") : t("search.addToWatchlist")}
                    aria-label={watchlistSet.has(item.tsCode) ? t("search.inWatchlist") : t("search.addToWatchlist")}
                  >
                    <Star className={cn("w-3.5 h-3.5", watchlistSet.has(item.tsCode) && "fill-current")} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
