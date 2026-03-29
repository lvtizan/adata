/**
 * 设置页面
 *
 * 桌面客户端环境下显示通知设置等配置项。
 * 浏览器环境下显示基础设置（主题等）。
 */
import { useAppStore } from "@/store";
import { NotifySettings } from "@/features/settings/NotifySettings";
import { isDesktop, onMonitorAlert, type MonitorAlert } from "@/lib/desktop";
import { useState, useEffect } from "react";
import { Moon, Sun, Monitor, Bell, Info } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useAppStore();
  const [recentAlerts, setRecentAlerts] = useState<MonitorAlert[]>([]);

  // 监听通知事件，在设置页展示最近的通知记录
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMonitorAlert((alert) => {
      setRecentAlerts((prev) => [alert, ...prev].slice(0, 20));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-8">
        <h2 className="text-xl font-semibold">设置</h2>

        {/* 外观设置 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Monitor className="w-4 h-4" />
            <span>外观</span>
          </div>
          <div className="flex gap-2">
            <ThemeButton
              active={theme === "light"}
              onClick={() => setTheme("light")}
              icon={<Sun className="w-4 h-4" />}
              label="浅色"
            />
            <ThemeButton
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              icon={<Moon className="w-4 h-4" />}
              label="深色"
            />
          </div>
        </section>

        {/* 通知设置 — 仅桌面端 */}
        {isDesktop && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Bell className="w-4 h-4" />
              <span>推送提醒</span>
            </div>
            <NotifySettings />
          </section>
        )}

        {/* 最近通知记录 */}
        {isDesktop && recentAlerts.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Info className="w-4 h-4" />
              <span>最近通知</span>
            </div>
            <div className="space-y-2">
              {recentAlerts.map((alert, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="font-medium">{alert.title}</div>
                  <div className="text-text-secondary mt-0.5">{alert.body}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 关于 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Info className="w-4 h-4" />
            <span>关于</span>
          </div>
          <div className="text-sm text-text-secondary space-y-1">
            <p>板块强度选股系统 v2.0</p>
            <p>数据源: Tushare</p>
            {isDesktop && <p>运行环境: 桌面客户端 (Tauri)</p>}
            {!isDesktop && <p>运行环境: 浏览器</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition ${
        active
          ? "border-accent bg-accent/10 text-accent font-medium"
          : "border-border-default text-text-secondary hover:bg-surface-hover"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
