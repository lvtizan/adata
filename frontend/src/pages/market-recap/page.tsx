import { useState } from "react";
import { useMarketRecap } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { cn } from "@/lib/utils";
import { CandlestickPanel } from "@/features/chart/components/candlestick-panel";
import type { InstitutionalItem, HotMoneyStock } from "@/services";

export default function MarketRecapPage() {
  const { data, isLoading, error } = useMarketRecap();
  const [institutionalSort, setInstitutionalSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [newHighsSort, setNewHighsSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "pctChg", dir: "desc" });

  if (isLoading) return <div className="flex items-center justify-center h-full text-text-tertiary">加载中...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-state-up">{error.message}</div>;
  if (!data) return <div className="flex items-center justify-center h-full text-text-tertiary">暂无数据</div>;

  const { tradeDate, limitUpHotspots, institutional, hotMoney, newHighs, alerts } = data;

  // ════ Tab 1: 涨停热点 ════
  const LimitUpPanel = () => {
    const boardOrder = ["首板", "2连板", "3连板", "4连板"];
    const sortedByBoard = [...limitUpHotspots.byBoard].sort(
      (a, b) => boardOrder.indexOf(a.board) - boardOrder.indexOf(b.board)
    );

    const boardColors: Record<string, string> = {
      "4连板": "bg-red-900",
      "3连板": "bg-orange-600",
      "2连板": "bg-yellow-600",
      "首板": "bg-blue-600",
    };

    return (
      <div className="flex flex-col h-full gap-6 p-4">
        {/* 按连板分组 */}
        <div className="flex-1 overflow-auto">
          <h3 className="text-sm font-semibold mb-3 text-text-primary">按连板分类</h3>
          <div className="space-y-2">
            {sortedByBoard.map((boardGroup) => (
              <div key={boardGroup.board} className="flex items-center gap-3 p-2 border border-border-subtle rounded">
                <div className="shrink-0 w-16">
                  <span className={cn(
                    "inline-block px-2 py-1 text-xs font-semibold text-white rounded",
                    boardColors[boardGroup.board] || "bg-gray-600"
                  )}>
                    {boardGroup.board}
                  </span>
                </div>
                <span className="text-xs text-text-secondary shrink-0">({boardGroup.count})</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {boardGroup.stocks.map((stock) => (
                    <span
                      key={stock.tsCode}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded whitespace-nowrap",
                        stock.pctChg > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      )}
                    >
                      {stock.stockName}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 按板块分组 */}
        <div className="flex-1 overflow-auto border-t border-border-default pt-4">
          <h3 className="text-sm font-semibold mb-3 text-text-primary">按板块分类</h3>
          <div className="space-y-2">
            {limitUpHotspots.bySector
              .sort((a, b) => b.count - a.count)
              .map((sectorGroup) => (
                <div key={sectorGroup.sectorName} className="flex items-center gap-3 p-2 border border-border-subtle rounded">
                  <div className="shrink-0 w-24">
                    <span className="text-xs font-semibold text-text-primary">{sectorGroup.sectorName}</span>
                  </div>
                  <span className="text-xs text-text-secondary shrink-0">({sectorGroup.count})</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {sectorGroup.stocks.map((stock) => (
                      <span key={stock.tsCode} className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800 whitespace-nowrap">
                        {stock.stockName}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  // ════ Tab 2: 机构买卖 ════
  const InstitutionalPanel = () => {
    const [instTab, setInstTab] = useState<"dailyBuy" | "dailySell" | "3dBuy" | "3dSell">("dailyBuy");

    const tabData: Record<string, InstitutionalItem[]> = {
      dailyBuy: institutional.dailyNetBuy,
      dailySell: institutional.dailyNetSell,
      "3dBuy": institutional.threeDay.netBuy,
      "3dSell": institutional.threeDay.netSell,
    };
    const currentList = tabData[instTab] || [];
    const defaultItem = currentList[0];

    const [selectedStock, setSelectedStock] = useState<{ tsCode: string; name: string } | null>(
      defaultItem ? { tsCode: defaultItem.tsCode, name: defaultItem.stockName } : null
    );

    // 切换 tab 时自动选中第一个
    const handleTabChange = (tab: typeof instTab) => {
      setInstTab(tab);
      const list = tabData[tab] || [];
      if (list[0]) setSelectedStock({ tsCode: list[0].tsCode, name: list[0].stockName });
    };

    const institutionalColumns: Column<InstitutionalItem>[] = [
      { key: "index", label: "#", width: "36px", render: (_, i) => <span className="text-xs text-text-tertiary">{i + 1}</span> },
      { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
      { key: "pctChg", label: "涨跌", width: "65px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "netAmount", label: "净额", width: "80px", align: "right", render: (item) => (
        <span className={cn("text-xs font-mono", item.netAmount > 0 ? "text-state-up" : "text-state-down")}>
          {fmtAmount(item.netAmount)}
        </span>
      ) },
    ];

    return (
      <div className="flex h-full">
        <div className="w-[360px] shrink-0 flex flex-col border-r border-border-default">
          <div className="flex items-center gap-0 border-b border-border-subtle bg-surface px-2">
            {([
              { id: "dailyBuy" as const, label: "当日买入" },
              { id: "dailySell" as const, label: "当日卖出" },
              { id: "3dBuy" as const, label: "三日买入" },
              { id: "3dSell" as const, label: "三日卖出" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={cn(
                  "px-3 py-2 text-xs border-b-2 transition-colors",
                  instTab === t.id
                    ? "border-accent text-text-primary font-medium"
                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            <DataTable
              columns={institutionalColumns}
              data={currentList}
              rowKey={(item) => item.tsCode}
              onRowClick={(item) => setSelectedStock({ tsCode: item.tsCode, name: item.stockName })}
              compact
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {selectedStock ? (
            <CandlestickPanel kind="stock" code={selectedStock.tsCode} label={selectedStock.tsCode} title={selectedStock.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">暂无数据</div>
          )}
        </div>
      </div>
    );
  };

  // ════ Tab 3: 游资动向 ════
  const HotMoneyPanel = () => {
    const [hmTab, setHmTab] = useState<"buy" | "sell">("buy");
    const desks = hmTab === "buy" ? hotMoney.netBuy : hotMoney.netSell;
    const borderColor = hmTab === "buy" ? "border-red-600" : "border-green-600";

    // 默认选中第一个股票
    const firstStock = desks[0]?.stocks[0];
    const [hmSelected, setHmSelected] = useState<{ tsCode: string; name: string } | null>(
      firstStock ? { tsCode: firstStock.tsCode, name: firstStock.stockName } : null
    );

    const handleHmTab = (tab: "buy" | "sell") => {
      setHmTab(tab);
      const list = tab === "buy" ? hotMoney.netBuy : hotMoney.netSell;
      const first = list[0]?.stocks[0];
      if (first) setHmSelected({ tsCode: first.tsCode, name: first.stockName });
    };

    return (
      <div className="flex h-full">
        <div className="w-[340px] shrink-0 flex flex-col border-r border-border-default">
          <div className="flex items-center gap-0 border-b border-border-subtle bg-surface px-2">
            <button onClick={() => handleHmTab("buy")} className={cn("px-3 py-2 text-xs border-b-2 transition-colors", hmTab === "buy" ? "border-accent text-text-primary font-medium" : "border-transparent text-text-tertiary")}>净买入</button>
            <button onClick={() => handleHmTab("sell")} className={cn("px-3 py-2 text-xs border-b-2 transition-colors", hmTab === "sell" ? "border-accent text-text-primary font-medium" : "border-transparent text-text-tertiary")}>净卖出</button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {desks.map((deskGroup) => (
              <div key={deskGroup.desk} className={cn("border-l-2 pl-3", borderColor)}>
                <h4 className="text-[11px] font-semibold text-text-secondary mb-1.5 truncate" title={deskGroup.desk}>{deskGroup.desk}</h4>
                <div className="space-y-0.5">
                  {deskGroup.stocks.map((stock) => (
                    <button
                      key={stock.tsCode}
                      onClick={() => setHmSelected({ tsCode: stock.tsCode, name: stock.stockName })}
                      className={cn("w-full flex justify-between items-center text-xs py-1.5 px-2 rounded transition-colors",
                        hmSelected?.tsCode === stock.tsCode ? "bg-accent/10 text-accent" : "hover:bg-surface-hover"
                      )}
                    >
                      <span className="truncate mr-2">{stock.stockName}</span>
                      <span className={cn("font-mono shrink-0", stock.netAmount > 0 ? "text-state-up" : "text-state-down")}>{fmtAmount(Math.abs(stock.netAmount))}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {hmSelected ? (
            <CandlestickPanel kind="stock" code={hmSelected.tsCode} label={hmSelected.tsCode} title={hmSelected.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">暂无数据</div>
          )}
        </div>
      </div>
    );
  };

  // ════ Tab 4: 股价新高 ════
  const NewHighsPanel = () => {
    const sortedStocks = [...newHighs.stocks].sort((a, b) => b.pctChg - a.pctChg);
    const first = sortedStocks[0];
    const [nhSelected, setNhSelected] = useState<{ tsCode: string; name: string } | null>(
      first ? { tsCode: first.tsCode, name: first.stockName } : null
    );
    const nhColumns: Column<typeof newHighs.stocks[0]>[] = [
      { key: "index", label: "#", width: "36px", render: (_, i) => <span className="text-xs text-text-tertiary">{i + 1}</span> },
      { key: "stockName", label: "名称", width: "80px", render: (item) => <span className="text-sm truncate block">{item.stockName}</span> },
      { key: "pctChg", label: "涨跌", width: "65px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "sectorName", label: "板块", width: "80px", render: (item) => <span className="text-[11px] text-text-tertiary truncate block">{item.sectorName}</span> },
    ];

    return (
      <div className="flex h-full">
        <div className="w-[360px] shrink-0 flex flex-col border-r border-border-default">
          <div className="px-3 py-2 border-b border-border-subtle text-xs text-text-secondary bg-surface">
            今日新高 <strong className="text-text-primary">{newHighs.count}</strong> 家
            {" / "}昨日 {newHighs.trend.yesterday}
            {" / "}前日 {newHighs.trend.dayBefore}
          </div>
          <div className="flex-1 overflow-auto">
            <DataTable columns={nhColumns} data={sortedStocks} rowKey={(item) => item.tsCode} onRowClick={(item) => setNhSelected({ tsCode: item.tsCode, name: item.stockName })} compact />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {nhSelected ? (
            <CandlestickPanel kind="stock" code={nhSelected.tsCode} label={nhSelected.tsCode} title={nhSelected.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">暂无数据</div>
          )}
        </div>
      </div>
    );
  };

  // ════ Tab 5: 异动预警 ════
  const AlertsPanel = () => {
    const firstAlert = alerts.items[0];
    const [alertSelected, setAlertSelected] = useState<{ tsCode: string; name: string } | null>(
      firstAlert ? { tsCode: firstAlert.tsCode, name: firstAlert.stockName } : null
    );
    const alertColumns: Column<typeof alerts.items[0]>[] = [
      { key: "index", label: "#", width: "36px", render: (_, i) => <span className="text-xs text-text-tertiary">{i + 1}</span> },
      { key: "stockName", label: "名称", width: "80px", render: (item) => <span className="text-sm truncate block">{item.stockName}</span> },
      { key: "pctChg", label: "涨幅", width: "65px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "alertType", label: "类别", width: "110px", render: (item) => <span className="text-[11px] text-text-tertiary truncate block">{item.alertType}</span> },
    ];

    return (
      <div className="flex h-full">
        <div className="w-[380px] shrink-0 flex flex-col border-r border-border-default">
          <div className="flex-1 overflow-auto">
            <DataTable columns={alertColumns} data={alerts.items} rowKey={(item) => item.tsCode} onRowClick={(item) => setAlertSelected({ tsCode: item.tsCode, name: item.stockName })} compact />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {alertSelected ? (
            <CandlestickPanel kind="stock" code={alertSelected.tsCode} label={alertSelected.tsCode} title={alertSelected.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">暂无数据</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default">
        <h1 className="text-xl font-semibold text-text-primary">盘前纪要</h1>
        <p className="text-sm text-text-secondary mt-1">{tradeDate}</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="limit-up" className="flex-1 flex flex-col min-h-0">
        <TabsList className="px-4 border-b border-border-default bg-surface rounded-none h-auto justify-start gap-0">
          <TabsTrigger value="limit-up" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">
            涨停热点
          </TabsTrigger>
          <TabsTrigger value="institutional" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">
            机构买卖
          </TabsTrigger>
          <TabsTrigger value="hot-money" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">
            游资动向
          </TabsTrigger>
          <TabsTrigger value="new-highs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">
            股价新高
          </TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none px-4 py-2 text-sm">
            异动预警
          </TabsTrigger>
        </TabsList>

        <TabsContent value="limit-up" className="flex-1 min-h-0 overflow-auto mt-0">
          <LimitUpPanel />
        </TabsContent>

        <TabsContent value="institutional" className="flex-1 min-h-0 overflow-auto mt-0">
          <InstitutionalPanel />
        </TabsContent>

        <TabsContent value="hot-money" className="flex-1 min-h-0 overflow-auto mt-0">
          <HotMoneyPanel />
        </TabsContent>

        <TabsContent value="new-highs" className="flex-1 min-h-0 overflow-auto mt-0">
          <NewHighsPanel />
        </TabsContent>

        <TabsContent value="alerts" className="flex-1 min-h-0 overflow-auto mt-0">
          <AlertsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
