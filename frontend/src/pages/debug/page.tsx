import { Panel } from "@/shared/ui/panel";
import { PageHeader } from "@/shared/ui/page-header";

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
