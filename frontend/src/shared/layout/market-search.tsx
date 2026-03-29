import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { useAddToWatchlist, useMarketSearch } from "@/queries";
import { useDashboardStore } from "@/store";
import { fmtPct } from "@/shared/utils/format";
import { cn } from "@/lib/utils";

export function MarketSearch() {
  const navigate = useNavigate();
  const { setSelectedSectorCode } = useDashboardStore();
  const addToWatchlist = useAddToWatchlist();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 180);
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

  const { data, isFetching } = useMarketSearch(debounced, 8);
  const hasQuery = debounced.length >= 2;
  const hasResults = (data?.stocks.length ?? 0) > 0 || (data?.sectors.length ?? 0) > 0;
  const open = text.trim().length >= 2;

  const rows = useMemo(() => ({
    stocks: data?.stocks ?? [],
    sectors: data?.sectors ?? [],
  }), [data]);

  return (
    <div ref={wrapRef} className="relative w-[360px] max-w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="搜索股票/板块"
          className="h-8 pl-8 text-sm"
        />
      </div>

      {open && (
        <div className="absolute top-[36px] left-0 right-0 z-50 rounded-md border border-border-default bg-canvas shadow-lg overflow-hidden">
          {!hasQuery && (
            <div className="px-3 py-2 text-xs text-text-tertiary">输入至少 2 个字符</div>
          )}

          {hasQuery && isFetching && !hasResults && (
            <div className="px-3 py-2 text-xs text-text-tertiary">搜索中...</div>
          )}

          {hasQuery && !isFetching && !hasResults && (
            <div className="px-3 py-2 text-xs text-text-tertiary">没有找到匹配的股票或板块</div>
          )}

          {rows.sectors.length > 0 && (
            <div className="border-b border-border-subtle">
              <div className="px-3 py-1.5 text-[11px] text-text-tertiary">板块</div>
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
              <div className="px-3 py-1.5 text-[11px] text-text-tertiary">股票</div>
              {rows.stocks.map((item) => (
                <div key={item.tsCode} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover transition-colors">
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => {
                      navigate(`/sector-workbench?sectorCode=${encodeURIComponent(item.sectorCode)}&sectorName=${encodeURIComponent(item.sectorName)}&stockCode=${encodeURIComponent(item.tsCode)}`);
                      setText("");
                      setDebounced("");
                    }}
                  >
                    <div className="text-sm truncate">{item.stockName}</div>
                    <div className="text-[10px] text-text-tertiary font-mono truncate">{item.tsCode} · {item.sectorName || "未识别板块"}</div>
                  </button>
                  <div className="text-right text-[11px] shrink-0">
                    <div className={cn(item.pctChange1d >= 0 ? "text-state-up" : "text-state-down")}>{fmtPct(item.pctChange1d)}</div>
                    <div className="text-text-tertiary">RPS {item.rps20.toFixed(0)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] shrink-0"
                    onClick={() => addToWatchlist.mutate({
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
                    })}
                    title="加入自选"
                  >
                    <Star className="w-3.5 h-3.5 mr-1" />
                    加自选
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
