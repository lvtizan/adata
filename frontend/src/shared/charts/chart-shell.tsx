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
  return (
    <div className={cn("flex flex-col border-b border-border-subtle", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
          <div>
            {title && <h3 className="text-sm font-medium">{title}</h3>}
            {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="relative flex-1 min-h-[200px]">
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
