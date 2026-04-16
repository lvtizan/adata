import * as React from "react";
import { cn } from "@/lib/utils";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean; // 默认 true
  bordered?: boolean; // 默认 true
}

export function Panel({
  title,
  subtitle,
  actions,
  padded = true,
  bordered = true,
  className,
  children,
  ...rest
}: PanelProps) {
  const hasHeader = title != null || subtitle != null || actions != null;
  return (
    <div
      className={cn(
        "bg-canvas rounded-md flex flex-col min-h-0",
        bordered && "border border-border-default",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="px-3 py-1.5 border-b border-border-subtle flex items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            {title != null && (
              <div className="text-[13px] font-semibold text-text-primary leading-tight truncate">
                {title}
              </div>
            )}
            {subtitle != null && (
              <div className="text-[11px] text-text-tertiary leading-tight truncate mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
          {actions != null && (
            <div className="shrink-0 flex items-center gap-1">{actions}</div>
          )}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", padded && "p-3")}>{children}</div>
    </div>
  );
}
