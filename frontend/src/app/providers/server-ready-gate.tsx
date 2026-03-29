import { useEffect, useState } from "react";

/**
 * 等待后端可连接即放行（不等预热），实现秒开。
 * 显示品牌化加载动画而非白屏。
 */
export function ServerReadyGate({ children }: { children: React.ReactNode }) {
  const [reachable, setReachable] = useState(false);
  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/status");
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

  // 动画点
  useEffect(() => {
    if (reachable) return;
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, [reachable]);

  // 计时器
  useEffect(() => {
    if (reachable) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [reachable]);

  if (reachable) return <>{children}</>;

  const tips = [
    "正在连接数据服务",
    "正在加载市场引擎",
    "正在初始化缓存",
    "数据预热中，请稍候",
  ];
  const tipIndex = Math.min(Math.floor(elapsed / 4), tips.length - 1);

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
          gap: 28,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo / 品牌 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="rgba(59,130,246,0.15)" />
            <path
              d="M10 24L14 12L18 20L22 14L26 24"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#e2e8f0",
              letterSpacing: 1,
            }}
          >
            板块强度选股系统
          </span>
        </div>

        {/* 加载动画 */}
        <div style={{ position: "relative", width: 48, height: 48 }}>
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "spin 1.2s linear infinite" }}>
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="rgba(59,130,246,0.15)"
              strokeWidth="3"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80 50"
            />
          </svg>
        </div>

        {/* 状态文字 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <p
            style={{
              color: "#94a3b8",
              fontSize: 14,
              margin: 0,
              minWidth: 180,
              textAlign: "center",
            }}
          >
            {tips[tipIndex]}{".".repeat(dots)}
          </p>
          {elapsed > 6 && (
            <p
              style={{
                color: "#475569",
                fontSize: 12,
                margin: 0,
              }}
            >
              首次启动需要加载数据，约 15-30 秒
            </p>
          )}
        </div>

        {/* 进度条 */}
        <div
          style={{
            width: 200,
            height: 3,
            borderRadius: 2,
            background: "rgba(59,130,246,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              background: "linear-gradient(90deg, #3b82f6, #6366f1)",
              animation: "loading-bar 2s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loading-bar {
          0% { width: 0%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
