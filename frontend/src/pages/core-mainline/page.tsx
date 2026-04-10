import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, Database, Globe2, HardDrive, Layers3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/lib/utils";
import { fmtPct } from "@/shared/utils/format";
import { WatchlistChart } from "@/features/watchlist/components/watchlist-chart";
import { useBullCamp, useRealtimeQuotes, useStockSector, useWatchlist } from "@/queries";

type ThemeId = "storage_chain" | "storage_extension" | "global_anchor";

interface ThemeStock {
  tsCode: string;
  stockName: string;
  tier: "第一梯队" | "第二梯队" | "补充";
  role: string;
  highlights: string[];
}

interface MainlineTheme {
  id: ThemeId;
  label: string;
  subtitle: string;
  stocks: ThemeStock[];
  notes: string[];
}

const THEMES: MainlineTheme[] = [
  {
    id: "storage_chain",
    label: "存储链核心",
    subtitle: "优先盯盘的主线池（A股）",
    stocks: [
      {
        tsCode: "301308.SZ",
        stockName: "江波龙",
        tier: "第一梯队",
        role: "平台型存储公司（品牌 + 模组 + 部分主控/固件 + 封测能力）",
        highlights: [
          "覆盖 FORESEE / Lexar / Zilia，渠道与品牌协同能力强",
          "嵌入式存储、SSD、内存条产品矩阵完整",
          "高端封测与企业级 SSD 测试能力是中长期壁垒",
        ],
      },
      {
        tsCode: "603986.SH",
        stockName: "兆易创新",
        tier: "第一梯队",
        role: "上游存储设计核心资产（NOR / SLC NAND / 利基 DRAM）",
        highlights: [
          "NOR Flash 与 SLC NAND 在中国内地保持领先位置",
          "存储设计能力可作为行业景气度先行指标",
          "上游产品结构决定其在涨价周期弹性",
        ],
      },
      {
        tsCode: "688525.SH",
        stockName: "佰维存储",
        tier: "第一梯队",
        role: "高弹性模组与企业级存储",
        highlights: [
          "企业级存储覆盖 SATA SSD / PCIe SSD / CXL / RDIMM",
          "受益数据中心、AI 服务器、云计算场景扩张",
          "产品重心向高附加值企业级转移",
        ],
      },
      {
        tsCode: "300223.SZ",
        stockName: "北京君正",
        tier: "第二梯队",
        role: "车规/工业/高可靠存储",
        highlights: [
          "车规 DRAM / SRAM 具备全球竞争力",
          "覆盖 DDR3/DDR4/LPDDR4 与 NOR/NAND/eMMC/UFS",
          "汽车与工业场景韧性更强",
        ],
      },
      {
        tsCode: "001309.SZ",
        stockName: "德明利",
        tier: "第二梯队",
        role: "主控 + 模组进攻型标的",
        highlights: [
          "推进 PCIe SSD 控制芯片与模组一体化",
          "嵌入式控制芯片与模组并进，产品覆盖 SSD/eMMC/UFS",
          "行业景气上行期弹性高，但波动也更大",
        ],
      },
    ],
    notes: [
      "盯盘顺序建议：江波龙 → 兆易创新 → 佰维存储 → 德明利/北京君正。",
      "卡片中的 RS 统一按 RPS20 口径展示；缺失时显示 --。",
      "点击股票名会在右侧联动 K 线，支持画线与预警流程。",
    ],
  },
  {
    id: "storage_extension",
    label: "扩展观察",
    subtitle: "主线外延与口径边界",
    stocks: [
      {
        tsCode: "688766.SH",
        stockName: "普冉股份",
        tier: "补充",
        role: "细分非易失存储补充（EEPROM/NOR）",
        highlights: [
          "更偏细分赛道补充，不是主线第一优先",
          "适合作为主线温度变化时的边际观察标的",
          "关注库存与 ASP 变化对弹性的影响",
        ],
      },
    ],
    notes: [
      "你现在关注的是“存储芯片/模组产业链”，不是典型半导体设备股口径。",
      "若切到“设备”口径，应另建主线（光刻/刻蚀/薄膜沉积/测试封装设备）。",
    ],
  },
  {
    id: "global_anchor",
    label: "全球锚点",
    subtitle: "景气度外部映射（非A股交易标的）",
    stocks: [],
    notes: [
      "全球锚点：Samsung / SK hynix / Micron。",
      "本轮景气驱动来自 AI 基础设施对高端存储需求的拉动与供给偏紧。",
      "本页仅作产业锚点记录，不提供其本地 K 线联动。",
    ],
  },
];

function tierClass(tier: ThemeStock["tier"]) {
  if (tier === "第一梯队") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (tier === "第二梯队") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

export default function CoreMainlinePage() {
  const [searchParams] = useSearchParams();
  const [activeTheme, setActiveTheme] = useState<ThemeId>("storage_chain");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const allStocks = useMemo(() => THEMES.flatMap((t) => t.stocks), []);
  const allCodes = useMemo(() => Array.from(new Set(allStocks.map((s) => s.tsCode))), [allStocks]);

  const { data: quoteMap } = useRealtimeQuotes(allCodes);
  const { data: bullCamp = [] } = useBullCamp();
  const { data: watchlist = [] } = useWatchlist();

  const stockMap = useMemo(() => new Map(allStocks.map((s) => [s.tsCode, s])), [allStocks]);
  const rsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of bullCamp) {
      if (item.rps20 != null) map.set(item.tsCode, Number(item.rps20));
    }
    for (const item of watchlist) {
      if (!map.has(item.tsCode) && item.rps20 != null) map.set(item.tsCode, Number(item.rps20));
    }
    return map;
  }, [bullCamp, watchlist]);

  const currentTheme = useMemo(
    () => THEMES.find((t) => t.id === activeTheme) ?? THEMES[0],
    [activeTheme],
  );
  const selectedStock = selectedCode ? stockMap.get(selectedCode) : undefined;
  const { data: sectorLookup } = useStockSector(selectedStock?.tsCode ?? "");
  const sectorCode = sectorLookup?.sectorCode ?? "";

  useEffect(() => {
    const tsCode = searchParams.get("tsCode");
    if (tsCode && stockMap.has(tsCode)) {
      setSelectedCode(tsCode);
      const matchTheme = THEMES.find((t) => t.stocks.some((s) => s.tsCode === tsCode));
      if (matchTheme) setActiveTheme(matchTheme.id);
      return;
    }
    if (!selectedCode && currentTheme.stocks[0]) {
      setSelectedCode(currentTheme.stocks[0].tsCode);
    }
  }, [searchParams, stockMap, selectedCode, currentTheme]);

  useEffect(() => {
    if (!currentTheme.stocks.some((s) => s.tsCode === selectedCode)) {
      setSelectedCode(currentTheme.stocks[0]?.tsCode ?? "");
    }
  }, [activeTheme, currentTheme, selectedCode]);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[560px] min-w-[500px] border-r border-border-default bg-surface-secondary/20 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border-default bg-gradient-to-r from-slate-50 via-white to-blue-50">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-semibold">核心主线</h2>
          </div>
          <p className="text-xs text-text-tertiary mt-1">按主线沉淀核心标的知识卡，点击股票名联动右侧K线。</p>
        </div>

        <Tabs value={activeTheme} onValueChange={(v) => setActiveTheme(v as ThemeId)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 pt-3">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="storage_chain" className="text-xs">
                <HardDrive className="w-3.5 h-3.5 mr-1" /> 存储链
              </TabsTrigger>
              <TabsTrigger value="storage_extension" className="text-xs">
                <Layers3 className="w-3.5 h-3.5 mr-1" /> 扩展
              </TabsTrigger>
              <TabsTrigger value="global_anchor" className="text-xs">
                <Globe2 className="w-3.5 h-3.5 mr-1" /> 全球锚点
              </TabsTrigger>
            </TabsList>
          </div>

          {THEMES.map((theme) => (
            <TabsContent key={theme.id} value={theme.id} className="flex-1 min-h-0 mt-0 px-3 pb-3 overflow-auto">
              <div className="text-xs text-text-tertiary px-1 pt-2 pb-3">{theme.subtitle}</div>
              {theme.stocks.map((stock) => {
                const pct = quoteMap?.get(stock.tsCode);
                const rs = rsMap.get(stock.tsCode);
                const selected = stock.tsCode === selectedCode;
                return (
                  <div
                    key={stock.tsCode}
                    className={cn(
                      "rounded-xl border mb-3 p-3 transition-all",
                      selected ? "border-sky-300 bg-sky-50/60" : "border-border-default bg-canvas hover:bg-surface-hover/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="text-left group"
                        onClick={() => setSelectedCode(stock.tsCode)}
                        title="点击查看右侧K线"
                      >
                        <div className="text-sm font-semibold flex items-center gap-1.5">
                          {stock.stockName}
                          <ArrowUpRight className="w-3.5 h-3.5 text-sky-600 opacity-80 group-hover:opacity-100" />
                        </div>
                        <div className="text-[10px] text-text-tertiary font-mono mt-0.5">{stock.tsCode}</div>
                      </button>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", tierClass(stock.tier))}>{stock.tier}</span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3 text-xs">
                      <span className={cn("font-mono", (pct ?? 0) >= 0 ? "text-state-up" : "text-state-down")}>
                        涨跌幅: {pct == null ? "--" : fmtPct(pct)}
                      </span>
                      <span className="font-mono text-text-secondary">RS: {rs == null ? "--" : rs.toFixed(0)}</span>
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">{stock.role}</div>
                    <ul className="mt-2 space-y-1 text-[11px] text-text-tertiary">
                      {stock.highlights.map((h) => (
                        <li key={h}>• {h}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {theme.notes.length > 0 && (
                <div className="rounded-xl border border-border-default bg-canvas p-3">
                  <div className="text-xs font-semibold mb-2">主线备注</div>
                  <div className="space-y-1.5 text-[11px] text-text-tertiary">
                    {theme.notes.map((n) => (
                      <p key={n}>• {n}</p>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {selectedStock ? (
          <>
            <div className="px-4 py-3 border-b border-border-default bg-canvas">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-base font-semibold">{selectedStock.stockName}</div>
                  <div className="text-[11px] text-text-tertiary font-mono">
                    {selectedStock.tsCode} · {selectedStock.role}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <span className={cn("font-mono", (quoteMap?.get(selectedStock.tsCode) ?? 0) >= 0 ? "text-state-up" : "text-state-down")}>
                    当日: {quoteMap?.get(selectedStock.tsCode) == null ? "--" : fmtPct(quoteMap.get(selectedStock.tsCode) as number)}
                  </span>
                  <span className="font-mono text-text-secondary">RS: {rsMap.get(selectedStock.tsCode)?.toFixed(0) ?? "--"}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <WatchlistChart
                key={selectedStock.tsCode}
                tsCode={selectedStock.tsCode}
                stockName={selectedStock.stockName}
                sectorCode={sectorCode}
                frequency="1d"
              />
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-text-tertiary">请选择左侧股票查看K线。</div>
        )}
      </div>
    </div>
  );
}
