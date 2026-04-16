import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "px-4 py-2 border-b border-border-default flex items-center gap-3 shrink-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-[14px] font-semibold text-text-primary leading-tight truncate">
          {title}
        </h1>
        {subtitle != null && (
          <p className="text-[11px] text-text-tertiary leading-tight truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {actions != null && (
        <div className="shrink-0 flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
