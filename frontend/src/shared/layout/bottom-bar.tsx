interface BottomBarProps {
  children?: React.ReactNode;
}

export function BottomBar({ children }: BottomBarProps) {
  if (!children) return null;
  return (
    <footer className="h-9 flex items-center px-3 border-t border-border-default bg-canvas text-text-tertiary text-xs shrink-0">
      {children}
    </footer>
  );
}
