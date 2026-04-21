import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * 等待后端可连接即放行（不等预热），实现秒开。
 * 显示品牌化加载动画而非白屏。
 */
export function ServerReadyGate({ children }: { children: React.ReactNode }) {
  const [reachable, setReachable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("正在连接数据服务");

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      while (!cancelled) {
        try {
          const token = import.meta.env.VITE_API_TOKEN || "";
            const headers: Record<string, string> = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch(`${API_BASE}/status`, { headers });
          if (res.ok) {
            if (!cancelled) setReachable(true);
            return;
          }
        } catch {
          /* server not up yet */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    ping();
    return () => {
      cancelled = true;
    };
  }, []);

  // 监听预加载进度
  useEffect(() => {
    if (reachable) return;

    const handleProgress = (e: CustomEvent) => {
      const { progress, stage } = e.detail;
      setProgress(progress);
      setStatusText(stage);
    };

    window.addEventListener('prefetch-progress', handleProgress as EventListener);
    return () => {
      window.removeEventListener('prefetch-progress', handleProgress as EventListener);
    };
  }, [reachable]);

  if (reachable) return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f1219 0%, #1a1f2e 50%, #0f1219 100%)",
        zIndex: 50,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* 背景装饰 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "15%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            right: "15%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* 主内容 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* 只保留一个大的转圈动画 */}
        <div style={{ position: "relative", width: 80, height: 80 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ animation: "spin 1.2s linear infinite" }}>
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="rgba(59,130,246,0.15)"
              strokeWidth="4"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${progress * 2.26} ${226 - progress * 2.26}`}
              style={{
                transition: "stroke-dasharray 0.3s ease"
              }}
            />
          </svg>
          {/* 中心显示进度百分比 */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: 20,
              fontWeight: 700,
              color: "#e2e8f0",
            }}
          >
            {Math.round(progress)}%
          </div>
        </div>

        {/* 状态文字 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p
            style={{
              color: "#94a3b8",
              fontSize: 15,
              margin: 0,
              minWidth: 200,
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            {statusText}
          </p>
          
          {/* 进度条 */}
          <div
            style={{
              width: 240,
              height: 4,
              borderRadius: 2,
              background: "rgba(59,130,246,0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 2,
                background: "linear-gradient(90deg, #3b82f6, #6366f1)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
