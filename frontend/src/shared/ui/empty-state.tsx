import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({
  icon, title, description, action, size = "md", className,
}: EmptyStateProps) {
  const padY = size === "sm" ? "py-6" : "py-12";
  const iconSize = size === "sm" ? "w-7 h-7" : "w-10 h-10";
  const titleFont = size === "sm" ? "text-[12px]" : "text-[13px]";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        padY,
        className,
      )}
    >
      {icon && (
        <div className={cn("mb-3 text-text-tertiary flex items-center justify-center", iconSize)}>
          {icon}
        </div>
      )}
      <div className={cn("font-medium text-text-secondary", titleFont)}>
        {title}
      </div>
      {description && (
        <div className="mt-1 text-[11px] text-text-tertiary max-w-xs">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
