import { useState } from "react";
import { MessageSquare, X, Minus } from "lucide-react";

const DEERFLOW_URL = "http://localhost:3000/workspace/chats/new";

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-accent text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          title="AI 研究助手"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}

      {/* 聊天窗口 */}
      {open && (
        <div
          className="fixed z-50 rounded-xl overflow-hidden shadow-2xl border border-border-default bg-canvas flex flex-col transition-all"
          style={{
            bottom: 20,
            right: 20,
            width: minimized ? 280 : 420,
            height: minimized ? 48 : 600,
            maxHeight: "calc(100vh - 80px)",
          }}
        >
          {/* 标题栏 */}
          <div
            className="flex items-center justify-between px-3 py-2.5 bg-accent text-white shrink-0 cursor-pointer select-none"
            onClick={() => minimized && setMinimized(false)}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="w-4 h-4" />
              AI 研究助手
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* iframe 内容 */}
          {!minimized && (
            <div className="flex-1 min-h-0">
              <iframe
                src={DEERFLOW_URL}
                className="w-full h-full border-0"
                allow="clipboard-write"
                title="DeerFlow AI 研究助手"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
