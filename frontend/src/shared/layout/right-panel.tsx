import { useAppStore } from "@/store";

interface RightPanelProps {
  children?: React.ReactNode;
}

export function RightPanel({ children }: RightPanelProps) {
  const open = useAppStore((s) => s.rightPanelOpen);
  if (!open) return null;

  return (
    <aside className="w-[320px] min-w-[280px] max-w-[360px] border-l border-border-default bg-canvas shrink-0 overflow-y-auto">
      {children}
    </aside>
  );
}
