import { Panel } from "@/shared/ui/panel";
import { PageHeader } from "@/shared/ui/page-header";
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
