/**
 * 通知设置面板
 *
 * 仅在桌面客户端环境中显示，用于配置推送提醒规则。
 */
import { useState, useEffect } from "react";
import {
  isDesktop,
  getNotifyConfig,
  setNotifyConfig,
  getMonitorStatus,
  toggleMonitor,
  type NotifyConfig,
  type MonitorStatus,
} from "@/lib/desktop";

export function NotifySettings() {
  const [config, setConfig] = useState<NotifyConfig | null>(null);
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    getNotifyConfig().then(setConfig);
    getMonitorStatus().then(setStatus);
  }, []);

  if (!isDesktop) return null;
  if (!config) return <div className="p-4 text-sm text-gray-400">加载中...</div>;

  const handleSave = async () => {
    setSaving(true);
    await setNotifyConfig(config);
    setSaving(false);
  };

  const handleToggle = async () => {
    const newEnabled = !status?.enabled;
    await toggleMonitor(newEnabled);
    setStatus((s) => (s ? { ...s, enabled: newEnabled } : s));
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">推送提醒设置</h3>
        <button
          onClick={handleToggle}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            status?.enabled
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {status?.enabled ? "监控中" : "已暂停"}
        </button>
      </div>

      {/* 牛股集中营 */}
      <SettingRow
        title="牛股集中营新股提醒"
        description="当有新的个股满足筛选条件进入牛股集中营时推送通知"
        enabled={config.bullCampNew}
        onChange={(v) => setConfig({ ...config, bullCampNew: v })}
      />

      {/* 板块排名变动 */}
      <SettingRow
        title="板块排名大幅变动提醒"
        description="当板块排名变化超过阈值时推送通知"
        enabled={config.sectorRankChange}
        onChange={(v) => setConfig({ ...config, sectorRankChange: v })}
      >
        <label className="flex items-center gap-2 text-sm text-gray-500">
          排名变化 &ge;
          <input
            type="number"
            min={1}
            max={50}
            value={config.sectorRankThreshold}
            onChange={(e) =>
              setConfig({
                ...config,
                sectorRankThreshold: parseInt(e.target.value) || 5,
              })
            }
            className="w-16 rounded border px-2 py-1 text-center"
          />
          名
        </label>
      </SettingRow>

      {/* 自选股提醒 */}
      <SettingRow
        title="自选股条件提醒"
        description="当自选股满足 RPS/成交额/价格突破 MA20 等条件时推送"
        enabled={config.watchlistAlert}
        onChange={(v) => setConfig({ ...config, watchlistAlert: v })}
      >
        <label className="flex items-center gap-2 text-sm text-gray-500">
          RPS &ge;
          <input
            type="number"
            min={0}
            max={100}
            value={config.watchlistRpsThreshold}
            onChange={(e) =>
              setConfig({
                ...config,
                watchlistRpsThreshold: parseFloat(e.target.value) || 80,
              })
            }
            className="w-16 rounded border px-2 py-1 text-center"
          />
        </label>
      </SettingRow>

      {/* 轮询间隔 */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">检查频率</label>
        <select
          value={config.pollIntervalSecs}
          onChange={(e) =>
            setConfig({
              ...config,
              pollIntervalSecs: parseInt(e.target.value),
            })
          }
          className="rounded border px-3 py-2 text-sm"
        >
          <option value={60}>每 1 分钟</option>
          <option value={180}>每 3 分钟</option>
          <option value={300}>每 5 分钟</option>
          <option value={600}>每 10 分钟</option>
          <option value={900}>每 15 分钟</option>
        </select>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </div>
  );
}

// ===== 子组件 =====

function SettingRow({
  title,
  description,
  enabled,
  onChange,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-400">{description}</div>
        </div>
        <button
          onClick={() => onChange(!enabled)}
          className={`relative h-6 w-11 rounded-full transition ${
            enabled ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {enabled && children && <div className="mt-2 pl-1">{children}</div>}
    </div>
  );
}

export default NotifySettings;
