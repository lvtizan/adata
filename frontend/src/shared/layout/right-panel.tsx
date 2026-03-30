import { useAppStore } from "@/store";
import { MessageSquare, X } from "lucide-react";

const DEERFLOW_URL = "http://localhost:3000/workspace/chats";

interface RightPanelProps {
  children?: React.ReactNode;
}

export function RightPanel({ children }: RightPanelProps) {
  const open = useAppStore((s) => s.rightPanelOpen);
  const toggle = useAppStore((s) => s.toggleRightPanel);

  if (!open) return null;

  return (
    <aside className="w-[380px] min-w-[320px] max-w-[440px] border-l border-border-default bg-canvas shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <MessageSquare className="w-4 h-4" />
          AI 研究助手
        </div>
        <button
          onClick={toggle}
          className="p-1 rounded hover:bg-surface-hover text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* DeerFlow iframe */}
      <div className="flex-1 min-h-0">
        <iframe
          src={DEERFLOW_URL}
          className="w-full h-full border-0"
          allow="clipboard-write"
          title="DeerFlow AI 研究助手"
        />
      </div>

      {/* 备用：如果有其他 children 也渲染 */}
      {children}
    </aside>
  );
}
