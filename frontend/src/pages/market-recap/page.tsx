import { useState } from "react";
import { useMarketRecap } from "@/queries";
import { DataTable, NumericCell, type Column } from "@/shared/table";
import { fmtPct, fmtAmount } from "@/shared/utils/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { cn } from "@/lib/utils";
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
    const institutionalColumns: Column<InstitutionalItem>[] = [
      { key: "index", label: "序号", width: "50px", render: (_, i) => <span className="text-sm">{i + 1}</span> },
      { key: "tsCode", label: "代码", width: "80px", render: (item) => <span className="text-sm font-mono text-text-secondary">{item.tsCode}</span> },
      { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
      { key: "close", label: "收盘价", width: "70px", align: "right", render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
      { key: "pctChg", label: "涨跌幅", width: "70px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "buyCount", label: "买方机构数", width: "90px", align: "right", render: (item) => <span className="text-sm">{item.buyCount}</span> },
      { key: "sellCount", label: "卖方机构数", width: "90px", align: "right", render: (item) => <span className="text-sm">{item.sellCount}</span> },
      { key: "buyAmount", label: "买入总额", width: "80px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.buyAmount)}</span> },
      { key: "sellAmount", label: "卖出总额", width: "80px", align: "right", render: (item) => <span className="text-sm text-text-secondary">{fmtAmount(item.sellAmount)}</span> },
      { key: "netAmount", label: "净额", width: "80px", align: "right", render: (item) => (
        <span className={cn("text-sm font-mono", item.netAmount > 0 ? "text-state-up" : "text-state-down")}>
          {fmtAmount(item.netAmount)}
        </span>
      ) },
    ];

    return (
      <div className="flex flex-col h-full gap-6 p-4 overflow-auto">
        {/* 当日净买入 / 当日净卖出 */}
        <div className="flex gap-6">
          <div className="flex-1 min-h-0">
            <h3 className="text-sm font-semibold mb-2 text-text-primary">当日净买入</h3>
            <div className="flex-1 overflow-auto border border-border-default rounded">
              <DataTable
                columns={institutionalColumns}
                data={institutional.dailyNetBuy}
                rowKey={(item) => item.tsCode}
                compact
              />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <h3 className="text-sm font-semibold mb-2 text-text-primary">当日净卖出</h3>
            <div className="flex-1 overflow-auto border border-border-default rounded">
              <DataTable
                columns={institutionalColumns}
                data={institutional.dailyNetSell}
                rowKey={(item) => item.tsCode}
                compact
              />
            </div>
          </div>
        </div>

        {/* 三日净买入 / 三日净卖出 */}
        <div className="flex gap-6">
          <div className="flex-1 min-h-0">
            <h3 className="text-sm font-semibold mb-2 text-text-primary">三日净买入</h3>
            <div className="flex-1 overflow-auto border border-border-default rounded">
              <DataTable
                columns={institutionalColumns}
                data={institutional.threeDay.netBuy}
                rowKey={(item) => item.tsCode}
                compact
              />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <h3 className="text-sm font-semibold mb-2 text-text-primary">三日净卖出</h3>
            <div className="flex-1 overflow-auto border border-border-default rounded">
              <DataTable
                columns={institutionalColumns}
                data={institutional.threeDay.netSell}
                rowKey={(item) => item.tsCode}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ════ Tab 3: 游资动向 ════
  const HotMoneyPanel = () => {
    return (
      <div className="flex gap-6 p-4 h-full overflow-auto">
        {/* 游资净买入 */}
        <div className="flex-1 min-h-0 border border-border-default rounded p-3 overflow-auto">
          <h3 className="text-sm font-semibold mb-3 text-text-primary sticky top-0 bg-surface">游资净买入</h3>
          <div className="space-y-3">
            {hotMoney.netBuy.map((deskGroup) => (
              <div key={deskGroup.desk} className="border-l-2 border-red-600 pl-3">
                <h4 className="text-xs font-semibold text-text-primary mb-1.5">{deskGroup.desk}</h4>
                <div className="space-y-1">
                  {deskGroup.stocks.map((stock) => (
                    <div key={stock.tsCode} className="flex justify-between text-xs">
                      <span className="text-text-secondary">{stock.stockName}</span>
                      <span className="text-state-up font-mono">{fmtAmount(stock.netAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 游资净卖出 */}
        <div className="flex-1 min-h-0 border border-border-default rounded p-3 overflow-auto">
          <h3 className="text-sm font-semibold mb-3 text-text-primary sticky top-0 bg-surface">游资净卖出</h3>
          <div className="space-y-3">
            {hotMoney.netSell.map((deskGroup) => (
              <div key={deskGroup.desk} className="border-l-2 border-green-600 pl-3">
                <h4 className="text-xs font-semibold text-text-primary mb-1.5">{deskGroup.desk}</h4>
                <div className="space-y-1">
                  {deskGroup.stocks.map((stock) => (
                    <div key={stock.tsCode} className="flex justify-between text-xs">
                      <span className="text-text-secondary">{stock.stockName}</span>
                      <span className="text-state-down font-mono">{fmtAmount(Math.abs(stock.netAmount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ════ Tab 4: 股价新高 ════
  const NewHighsPanel = () => {
    const newHighsColumns: Column<typeof newHighs.stocks[0]>[] = [
      { key: "index", label: "序号", width: "50px", render: (_, i) => <span className="text-sm">{i + 1}</span> },
      { key: "tsCode", label: "代码", width: "80px", render: (item) => <span className="text-sm font-mono text-text-secondary">{item.tsCode}</span> },
      { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
      { key: "pctChg", label: "涨跌幅", width: "70px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "close", label: "现价", width: "70px", align: "right", render: (item) => <span className="text-sm font-mono">{item.close?.toFixed(2) ?? "-"}</span> },
      { key: "sectorName", label: "所属行业", render: (item) => <span className="text-xs text-text-secondary">{item.sectorName}</span> },
    ];

    const sortedStocks = [...newHighs.stocks].sort((a, b) => b.pctChg - a.pctChg);

    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <div className="text-sm text-text-secondary">
          今日收盘价创新高 <strong className="text-text-primary">{newHighs.count}</strong> 家，
          昨日 <strong className="text-text-primary">{newHighs.trend.yesterday}</strong> 家，
          前日 <strong className="text-text-primary">{newHighs.trend.dayBefore}</strong> 家
        </div>
        <div className="flex-1 overflow-auto border border-border-default rounded">
          <DataTable
            columns={newHighsColumns}
            data={sortedStocks}
            rowKey={(item) => item.tsCode}
            compact
          />
        </div>
      </div>
    );
  };

  // ════ Tab 5: 异动预警 ════
  const AlertsPanel = () => {
    const alertsColumns: Column<typeof alerts.items[0]>[] = [
      { key: "index", label: "序号", width: "50px", render: (_, i) => <span className="text-sm">{i + 1}</span> },
      { key: "tsCode", label: "代码", width: "80px", render: (item) => <span className="text-sm font-mono text-text-secondary">{item.tsCode}</span> },
      { key: "stockName", label: "名称", render: (item) => <span className="text-sm">{item.stockName}</span> },
      { key: "pctChg", label: "预警涨幅", width: "80px", align: "right", render: (item) => <NumericCell value={item.pctChg} format={fmtPct} /> },
      { key: "sectorName", label: "主题/板块", render: (item) => <span className="text-xs text-text-secondary">{item.sectorName}</span> },
      { key: "alertType", label: "类别", width: "80px", render: (item) => <span className="text-xs text-text-secondary">{item.alertType}</span> },
    ];

    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex-1 overflow-auto border border-border-default rounded">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr>
                {alertsColumns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "sticky top-0 z-10 bg-surface px-3 text-xs font-semibold text-text-secondary border-b border-border-default whitespace-nowrap h-9",
                      col.align === "right" ? "text-right" : "text-left"
                    )}
                    style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.items.length === 0 ? (
                <tr>
                  <td colSpan={alertsColumns.length} className="text-center py-8 text-text-tertiary">
                    暂无数据
                  </td>
                </tr>
              ) : (
                alerts.items.map((item, i) => (
                  <tr
                    key={item.tsCode}
                    className={cn(
                      "h-9 border-b border-border-subtle hover:bg-surface-hover transition-colors",
                      item.deviation > 200 && "bg-red-50"
                    )}
                  >
                    {alertsColumns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 whitespace-nowrap",
                          col.align === "right" ? "text-right" : "text-left"
                        )}
                      >
                        {col.render(item, i)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
