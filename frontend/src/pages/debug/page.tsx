import * as React from "react";
import { Inbox, Search, AlertCircle } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { FilterChip, FilterBar } from "@/shared/ui/filter-chip";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { ThresholdInput } from "@/shared/ui/threshold-input";
import { Panel } from "@/shared/ui/panel";
import { PageHeader } from "@/shared/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { StatStrip } from "@/shared/ui/stat-strip";
import { StockTag } from "@/shared/ui/stock-tag";

export default function DebugPage() {
  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">PageHeader</h2>
        <div className="space-y-3">
          <div className="border border-border-default rounded-md overflow-hidden">
            <PageHeader title="板块分析" />
            <div className="p-3 text-[11px] text-text-tertiary">（页面内容区）</div>
          </div>

          <div className="border border-border-default rounded-md overflow-hidden">
            <PageHeader title="板块分析" subtitle="共 92 个候选板块" />
            <div className="p-3 text-[11px] text-text-tertiary">（带副标题）</div>
          </div>

          <div className="border border-border-default rounded-md overflow-hidden">
            <PageHeader
              title="板块分析"
              subtitle="同花顺数据源"
              actions={
                <>
                  <button className="h-7 px-3 text-[11px] border border-border-default rounded hover:bg-surface-hover">
                    刷新
                  </button>
                  <button className="h-7 px-3 text-[11px] bg-accent text-white rounded hover:opacity-90">
                    操作
                  </button>
                </>
              }
            />
            <div className="p-3 text-[11px] text-text-tertiary">（带操作按钮）</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">StatStrip</h2>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-text-tertiary mb-1">normal（默认）</div>
            <StatStrip
              stats={[
                { label: "RS120", value: 92 },
                { label: "5日", value: "+2.35%", tone: "up" },
                { label: "10日", value: "-1.20%", tone: "down" },
                { label: "成交额", value: "12.3亿" },
              ]}
            />
          </div>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1">compact</div>
            <StatStrip
              density="compact"
              stats={[
                { label: "开", value: "1688.00" },
                { label: "高", value: "1692.50", tone: "up" },
                { label: "低", value: "1680.30", tone: "down" },
                { label: "收", value: "1685.00" },
              ]}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">StockTag</h2>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-text-tertiary mb-1">md（默认）· 可点击</div>
            <div className="flex flex-wrap gap-1.5">
              <StockTag code="600519" name="贵州茅台" pctChange={2.35} rs={92} onClick={() => alert("点击 茅台")} />
              <StockTag code="000858" name="五粮液" pctChange={-1.8} rs={78} onClick={() => {}} />
              <StockTag code="688981" name="中芯国际" pctChange={4.3} rs={95} onClick={() => {}} />
              <StockTag code="300750" name="宁德时代" pctChange={-3.2} rs={45} onClick={() => {}} />
              <StockTag code="002594" name="比亚迪" rs={87} onClick={() => {}} />
              <StockTag code="601318" name="中国平安" pctChange={0.7} onClick={() => {}} />
              <StockTag code="600036" name="招商银行" onClick={() => {}} />
            </div>
          </div>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1">sm · 纯展示（无 onClick）</div>
            <div className="flex flex-wrap gap-1">
              <StockTag size="sm" code="600519" name="贵州茅台" pctChange={2.35} rs={92} />
              <StockTag size="sm" code="000858" name="五粮液" pctChange={-1.8} rs={78} />
              <StockTag size="sm" code="688981" name="中芯国际" pctChange={4.3} rs={95} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">FilterChip / FilterBar</h2>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-text-tertiary mb-1.5">基础筛选（时间窗口）</div>
            <FilterBar>
              <FilterChip label="3日" />
              <FilterChip label="7日" active />
              <FilterChip label="15日" />
              <FilterChip label="30日" />
            </FilterBar>
          </div>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1.5">带计数（阶段筛选）</div>
            <FilterBar>
              <FilterChip label="全部" value="42" active />
              <FilterChip label="萌芽" value="8" />
              <FilterChip label="发酵" value="15" />
              <FilterChip label="共识" value="12" />
              <FilterChip label="退潮" value="7" />
            </FilterBar>
          </div>
          <div>
            <div className="text-[11px] text-text-tertiary mb-1.5">带清除按钮（已选）</div>
            <FilterBar>
              <FilterChip label="板块" value="白酒" active onClear={() => alert("清除板块")} />
              <FilterChip label="成交额" value="≥8亿" active onClear={() => {}} />
              <FilterChip label="RS120" value="≥87" active onClear={() => {}} />
            </FilterBar>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">SegmentedControl</h2>
        <SegmentedControlDemo />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">ThresholdInput</h2>
        <ThresholdDemo />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">EmptyState</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border-default rounded-md">
            <EmptyState
              icon={<Inbox className="w-10 h-10" />}
              title="暂无数据"
              description="当前筛选条件下没有符合的股票，尝试放宽阈值"
            />
          </div>
          <div className="border border-border-default rounded-md">
            <EmptyState
              size="sm"
              icon={<Search className="w-7 h-7" />}
              title="未找到结果"
              description="换个关键词试试"
            />
          </div>
          <div className="border border-border-default rounded-md">
            <EmptyState
              icon={<AlertCircle className="w-10 h-10" />}
              title="加载失败"
              description="请检查网络或稍后重试"
              action={<button className="h-7 px-3 text-[11px] border border-border-default rounded hover:bg-surface-hover">重试</button>}
            />
          </div>
          <div className="border border-border-default rounded-md">
            <EmptyState
              title="未选择股票"
              description="从左侧列表选择一只股票查看详情"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Tabs</h2>
        <TabsDemo />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Panel</h2>
        <div className="grid grid-cols-2 gap-4">
          <Panel title="基础卡片">这是 Panel 内的内容</Panel>

          <Panel title="带副标题" subtitle="第二行说明文字">
            内容
          </Panel>

          <Panel
            title="带操作按钮"
            subtitle="右上角 actions"
            actions={
              <button className="text-[11px] text-accent hover:underline">
                更多
              </button>
            }
          >
            内容
          </Panel>

          <Panel title="无 padding" padded={false}>
            <div className="px-3 py-2 text-[11px] text-text-tertiary">
              自定义 padding
            </div>
          </Panel>

          <Panel>无 header 的 Panel</Panel>

          <Panel bordered={false} title="无边框">
            适合嵌套场景
          </Panel>
        </div>
      </section>
    </div>
  );
}

function TabsDemo() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] text-text-tertiary mb-2">default（原风格）</div>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">全部</TabsTrigger>
            <TabsTrigger value="b">已选</TabsTrigger>
            <TabsTrigger value="c">已弃</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-[11px] text-text-secondary mt-2">内容 A</TabsContent>
          <TabsContent value="b" className="text-[11px] text-text-secondary mt-2">内容 B</TabsContent>
          <TabsContent value="c" className="text-[11px] text-text-secondary mt-2">内容 C</TabsContent>
        </Tabs>
      </div>
      <div>
        <div className="text-[11px] text-text-tertiary mb-2">minimal（TradingView 风格）</div>
        <Tabs defaultValue="overview">
          <TabsList variant="minimal">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="kline">K线</TabsTrigger>
            <TabsTrigger value="fundamentals">基本面</TabsTrigger>
            <TabsTrigger value="news">新闻</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-[11px] text-text-secondary mt-3">概览内容</TabsContent>
          <TabsContent value="kline" className="text-[11px] text-text-secondary mt-3">K线内容</TabsContent>
          <TabsContent value="fundamentals" className="text-[11px] text-text-secondary mt-3">基本面内容</TabsContent>
          <TabsContent value="news" className="text-[11px] text-text-secondary mt-3">新闻内容</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ThresholdDemo() {
  const [amount, setAmount] = React.useState(8);
  const [rs, setRs] = React.useState(87);
  const [pctChange, setPctChange] = React.useState(2);
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <ThresholdInput label="成交额 ≥" value={amount} onChange={setAmount} min={0} suffix="亿" />
      <ThresholdInput label="RS120 ≥" value={rs} onChange={setRs} min={0} max={100} />
      <ThresholdInput label="涨幅 ≥" value={pctChange} onChange={setPctChange} min={-20} max={20} step={0.5} suffix="%" />
    </div>
  );
}

function SegmentedControlDemo() {
  const [tab, setTab] = React.useState<"recommend" | "mine">("recommend");
  const [freq, setFreq] = React.useState<"1d" | "1w" | "1M">("1d");
  const [size, setSize] = React.useState<"3d" | "7d" | "15d" | "30d">("7d");
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] text-text-tertiary mb-1.5">md（默认）· 2 选</div>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "recommend", label: "系统推荐" },
            { value: "mine", label: "我的主流" },
          ]}
        />
        <div className="text-[10px] text-text-tertiary mt-1">当前：{tab}</div>
      </div>
      <div>
        <div className="text-[11px] text-text-tertiary mb-1.5">md · 3 选（K线周期）</div>
        <SegmentedControl
          value={freq}
          onChange={setFreq}
          options={[
            { value: "1d", label: "日K" },
            { value: "1w", label: "周K" },
            { value: "1M", label: "月K" },
          ]}
        />
      </div>
      <div>
        <div className="text-[11px] text-text-tertiary mb-1.5">sm · 4 选（时间窗口）</div>
        <SegmentedControl
          size="sm"
          value={size}
          onChange={setSize}
          options={[
            { value: "3d", label: "3日" },
            { value: "7d", label: "7日" },
            { value: "15d", label: "15日" },
            { value: "30d", label: "30日" },
          ]}
        />
      </div>
    </div>
  );
}
