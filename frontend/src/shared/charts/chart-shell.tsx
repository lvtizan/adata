import { cn } from "@/lib/utils";

interface ChartShellProps {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  empty?: string;
  className?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function ChartShell({ title, subtitle, loading, error, empty, className, children, actions }: ChartShellProps) {
  // 合并标题和副标题：如 "细分板块：电力"
  const label = title && subtitle ? `${title}：${subtitle}` : title || subtitle;

  return (
    <div className={cn("flex flex-col border-b border-border-subtle", className)}>
      <div className="relative flex-1 min-h-[200px]">
        {/* 标题叠加在左上角 */}
        {(label || actions) && (
          <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between z-20 pointer-events-none">
            {label && (
              <span className="text-xs text-text-secondary bg-canvas/70 px-1.5 py-0.5 rounded">
                {label}
              </span>
            )}
            {actions && <div className="pointer-events-auto">{actions}</div>}
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            加载中...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-state-up text-sm z-10 bg-canvas/80">
            {error}
          </div>
        )}
        {empty && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm z-10 bg-canvas/80">
            {empty}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
