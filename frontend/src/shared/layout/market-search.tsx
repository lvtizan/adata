import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useAddToWatchlist, useMarketSearch, useTradePlans, useWatchlist } from "@/queries";
import { useDashboardStore } from "@/store";
import { fmtPct } from "@/shared/utils/format";
import { cn } from "@/lib/utils";
import { useUII18n } from "@/i18n/ui";

export function MarketSearch() {
  const { t } = useUII18n();
  const [open, setOpen] = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 px-3 rounded-md border border-border-default bg-canvas text-text-tertiary hover:text-text-secondary hover:border-text-quaternary transition-colors text-sm"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{t("search.placeholder")}</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-2 px-1.5 py-0.5 rounded bg-surface-secondary text-[10px] font-mono text-text-quaternary border border-border-default">
          ⌘K
        </kbd>
      </button>

      {/* Spotlight overlay */}
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useUII18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { setSelectedSectorCode } = useDashboardStore();
  const addToWatchlist = useAddToWatchlist();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const currentPath = location.pathname;
  const isWatchlistPage = currentPath === "/watchlist";
  const isTradePlanPage = currentPath === "/trade-plan";
  const isLocalOnlyMode = isWatchlistPage || isTradePlanPage;

  const { data: watchlist = [] } = useWatchlist();
  const { data: tradePlans = [] } = useTradePlans();

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 100);
    return () => window.clearTimeout(timer);
  }, [text]);

  const { data, isFetching } = useMarketSearch(isLocalOnlyMode ? "" : debounced, 10);
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

  const rows = useMemo(() => ({
    stocks: isLocalOnlyMode ? localStocks : (data?.stocks ?? []),
    sectors: isLocalOnlyMode ? [] : (data?.sectors ?? []),
  }), [data, isLocalOnlyMode, localStocks]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const items: Array<{ type: "sector" | "stock"; data: any }> = [];
    for (const s of rows.sectors) items.push({ type: "sector", data: s });
    for (const s of rows.stocks) items.push({ type: "stock", data: s });
    return items;
  }, [rows]);

  const hasResults = flatItems.length > 0;

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length]);

  const watchlistSet = useMemo(() => new Set(watchlist.map((w) => w.tsCode)), [watchlist]);

  const selectItem = useCallback((item: { type: "sector" | "stock"; data: any }) => {
    if (item.type === "sector") {
      setSelectedSectorCode(item.data.sectorCode);
      navigate(`/sector-workbench?sectorCode=${encodeURIComponent(item.data.sectorCode)}&sectorName=${encodeURIComponent(item.data.sectorName)}`);
    } else {
      if (isWatchlistPage) {
        navigate(`/watchlist?stockCode=${encodeURIComponent(item.data.tsCode)}`);
      } else if (isTradePlanPage) {
        navigate(`/trade-plan?tsCode=${encodeURIComponent(item.data.tsCode)}`);
      } else {
        navigate(
          `/sector-workbench?sectorCode=${encodeURIComponent(item.data.sectorCode)}&sectorName=${encodeURIComponent(item.data.sectorName)}&stockCode=${encodeURIComponent(item.data.tsCode)}&stockName=${encodeURIComponent(item.data.stockName)}`,
        );
      }
    }
    onClose();
  }, [navigate, onClose, setSelectedSectorCode, isWatchlistPage, isTradePlanPage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[activeIndex]) {
      e.preventDefault();
      selectItem(flatItems[activeIndex]);
    }
  };

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-[520px] rounded-xl border border-border-default bg-canvas shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border-default">
          <Search className="w-4 h-4 text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-quaternary outline-none"
          />
          {text && (
            <button
              type="button"
              onClick={() => { setText(""); setDebounced(""); inputRef.current?.focus(); }}
              className="text-[10px] text-text-quaternary hover:text-text-secondary px-1.5 py-0.5 rounded bg-surface-secondary"
            >
              ESC
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-auto">
          {hasQuery && isFetching && !hasResults && !isLocalOnlyMode && (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">{t("search.loading")}</div>
          )}

          {hasQuery && !isFetching && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">{t("search.noResult")}</div>
          )}

          {!hasQuery && (
            <div className="px-4 py-6 text-center text-sm text-text-quaternary">
              {t("search.minChars")}
            </div>
          )}

          {rows.sectors.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[11px] text-text-quaternary font-medium sticky top-0 bg-canvas">{t("search.sectors")}</div>
              {rows.sectors.map((item, idx) => {
                const flatIdx = idx;
                return (
                  <button
                    key={item.sectorCode}
                    className={cn(
                      "w-full px-4 py-2.5 text-left transition-colors flex items-center justify-between gap-3",
                      flatIdx === activeIndex ? "bg-accent/10" : "hover:bg-surface-hover",
                    )}
                    onClick={() => selectItem({ type: "sector", data: item })}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.sectorName}</div>
                      <div className="text-[10px] text-text-tertiary font-mono">{item.sectorCode}</div>
                    </div>
                    <div className="text-right text-xs shrink-0">
                      {item.rps10 != null && <div className="text-text-secondary">RPS10 {item.rps10.toFixed(1)}</div>}
                      {item.pctChange5d != null && <div className={cn(item.pctChange5d >= 0 ? "text-state-up" : "text-state-down")}>{fmtPct(item.pctChange5d)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {rows.stocks.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[11px] text-text-quaternary font-medium sticky top-0 bg-canvas">{t("search.stocks")}</div>
              {rows.stocks.map((item, idx) => {
                const flatIdx = rows.sectors.length + idx;
                return (
                  <div
                    key={item.tsCode}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 transition-colors",
                      flatIdx === activeIndex ? "bg-accent/10" : "hover:bg-surface-hover",
                    )}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                  >
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => selectItem({ type: "stock", data: item })}
                    >
                      <div className="text-sm font-medium truncate">{item.stockName}</div>
                      <div className="text-[10px] text-text-tertiary font-mono truncate">
                        {item.tsCode} · {item.sectorName || t("search.unknownSector")}
                      </div>
                    </button>
                    <div className="text-right text-[11px] shrink-0 min-w-[56px]">
                      <div className={cn("font-mono", item.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>{fmtPct(item.pctChange1d)}</div>
                      <div className="text-text-tertiary font-mono">RPS {item.rps20.toFixed(0)}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 w-7 p-0 shrink-0",
                        watchlistSet.has(item.tsCode) && "text-amber-500 hover:text-amber-500",
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
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {hasResults && (
          <div className="px-4 py-2 border-t border-border-default flex items-center gap-4 text-[10px] text-text-quaternary">
            <span><kbd className="px-1 py-0.5 rounded bg-surface-secondary border border-border-default font-mono">↑↓</kbd> 导航</span>
            <span><kbd className="px-1 py-0.5 rounded bg-surface-secondary border border-border-default font-mono">↵</kbd> 选择</span>
            <span><kbd className="px-1 py-0.5 rounded bg-surface-secondary border border-border-default font-mono">esc</kbd> 关闭</span>
          </div>
        )}
      </div>
    </div>
  );
}
