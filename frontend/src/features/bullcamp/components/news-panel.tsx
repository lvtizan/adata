import { useStockNews } from "@/queries";
import { formatDate } from "@/shared/utils/format";

export function NewsPanel({ tsCode }: { tsCode: string }) {
  const { data: items = [], isLoading, error } = useStockNews(tsCode);

  if (!tsCode) return <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">选择个股后显示</div>;
  if (isLoading) return <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">公告加载中...</div>;
  if (error) return <div className="flex items-center justify-center h-48 text-state-up text-sm">{error.message}</div>;

  if (!items.length) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">
        暂无近期公告
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="space-y-0">
        {items.map((item, idx) => (
          <div
            key={`${item.date}-${idx}`}
            className="flex items-start gap-3 px-3 py-2.5 border-b border-border-subtle hover:bg-surface-hover transition-colors"
          >
            <span className="shrink-0 text-xs text-text-tertiary font-mono mt-0.5 w-[72px]">
              {item.date ? formatDate(item.date) : "-"}
            </span>
            <span className="text-sm text-text-primary leading-snug">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
