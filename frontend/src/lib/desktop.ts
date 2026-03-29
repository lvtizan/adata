/**
 * 桌面客户端集成层
 *
 * 封装 Tauri API 调用，在浏览器环境下提供 fallback。
 * 前端代码无需关心是 Web 还是 Desktop 环境。
 */

// 检测是否在 Tauri 桌面环境中运行
export const isDesktop = typeof window !== "undefined" && "__TAURI__" in window;

// ===== 通知配置 =====

export interface NotifyConfig {
  bullCampNew: boolean;
  sectorRankChange: boolean;
  sectorRankThreshold: number;
  watchlistAlert: boolean;
  watchlistRpsThreshold: number;
  pollIntervalSecs: number;
}

const DEFAULT_CONFIG: NotifyConfig = {
  bullCampNew: true,
  sectorRankChange: true,
  sectorRankThreshold: 5,
  watchlistAlert: true,
  watchlistRpsThreshold: 80,
  pollIntervalSecs: 300,
};

export interface MonitorStatus {
  enabled: boolean;
  lastCheck: string | null;
  bullCampCount: number;
}

// ===== Tauri 命令调用 =====

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop) {
    throw new Error("Not in desktop environment");
  }
  // @ts-ignore - Tauri API 在运行时注入
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(cmd, args);
}

/** 获取通知配置 */
export async function getNotifyConfig(): Promise<NotifyConfig> {
  if (!isDesktop) return DEFAULT_CONFIG;
  try {
    return await invoke<NotifyConfig>("get_notify_config");
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** 保存通知配置 */
export async function setNotifyConfig(config: NotifyConfig): Promise<void> {
  if (!isDesktop) return;
  await invoke("set_notify_config", { config });
}

/** 获取监控状态 */
export async function getMonitorStatus(): Promise<MonitorStatus> {
  if (!isDesktop) {
    return { enabled: false, lastCheck: null, bullCampCount: 0 };
  }
  return invoke<MonitorStatus>("get_monitor_status");
}

/** 切换监控开关 */
export async function toggleMonitor(enabled: boolean): Promise<void> {
  if (!isDesktop) return;
  await invoke("toggle_monitor", { enabled });
}

// ===== 事件监听 =====

export interface MonitorAlert {
  title: string;
  body: string;
  timestamp: string;
}

/** 监听监控告警事件 */
export async function onMonitorAlert(
  callback: (alert: MonitorAlert) => void
): Promise<(() => void) | undefined> {
  if (!isDesktop) return undefined;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<MonitorAlert>("monitor-alert", (event) => {
    callback(event.payload);
  });
  return unlisten;
}

/** 监听数据刷新事件（来自托盘菜单） */
export async function onRefreshData(
  callback: () => void
): Promise<(() => void) | undefined> {
  if (!isDesktop) return undefined;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen("refresh-data", () => {
    callback();
  });
  return unlisten;
}
