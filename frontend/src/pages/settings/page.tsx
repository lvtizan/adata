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
import { Moon, Sun, Monitor, Bell, Info, Key, Shield, ShieldOff } from "lucide-react";
import { useUII18n } from "@/i18n/ui";
import {
  getWebhookSettings,
  saveWebhookSettings,
  getPushplusSettings,
  savePushplusSettings,
  getPriceMonitorStatus,
  setPriceMonitorEnabled,
} from "@/services";
import { Switch } from "@/shared/ui/switch";

export default function SettingsPage() {
  const { theme, setTheme, stealthMode, setStealthMode, locale, setLocale } = useAppStore();
  const { t } = useUII18n();
  const [recentAlerts, setRecentAlerts] = useState<MonitorAlert[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [pushplusToken, setPushplusToken] = useState("");
  const [pushplusConfigured, setPushplusConfigured] = useState(false);
  const [monitorEnabled, setMonitorEnabled] = useState(true);
  const [monitorAlive, setMonitorAlive] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);

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

  useEffect(() => {
    getWebhookSettings()
      .then((res) => {
        setWebhookUrl(res.webhookUrl || "");
        setWebhookConfigured(Boolean(res.configured));
      })
      .catch(() => undefined);
    getPushplusSettings()
      .then((res) => {
        setPushplusToken(res.token || "");
        setPushplusConfigured(Boolean(res.configured));
      })
      .catch(() => undefined);
    getPriceMonitorStatus()
      .then((res) => {
        setMonitorEnabled(Boolean(res.enabled));
        setMonitorAlive(Boolean(res.alive));
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-8">
        <h2 className="text-xl font-semibold">{t("settings.title")}</h2>

        {/* 外观设置 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Monitor className="w-4 h-4" />
            <span>{t("settings.appearance")}</span>
          </div>
          <div className="flex gap-2">
            <ThemeButton
              active={theme === "light"}
              onClick={() => setTheme("light")}
              icon={<Sun className="w-4 h-4" />}
              label={t("settings.light")}
            />
            <ThemeButton
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              icon={<Moon className="w-4 h-4" />}
              label={t("settings.dark")}
            />
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-sm mb-2">{t("settings.language")}</div>
            <div className="flex gap-2">
              <ThemeButton
                active={locale === "zh-CN"}
                onClick={() => setLocale("zh-CN")}
                icon={null}
                label={t("settings.locale.zh")}
              />
              <ThemeButton
                active={locale === "en-US"}
                onClick={() => setLocale("en-US")}
                icon={null}
                label={t("settings.locale.en")}
              />
            </div>
          </div>
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div className="text-sm flex items-center gap-2">
              {stealthMode ? <Shield className="w-4 h-4 text-accent" /> : <ShieldOff className="w-4 h-4 text-text-tertiary" />}
              <span>{t("settings.stealth")}</span>
            </div>
            <Switch checked={stealthMode} onChange={setStealthMode} label="切换摸鱼模式" />
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

        {/* 价格预警通知（Web + 桌面） */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Bell className="w-4 h-4" />
            <span>价格预警微信通知</span>
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">监控开关（触发止盈/止损/买入价）</div>
              <Switch
                checked={monitorEnabled}
                onChange={async (next) => {
                  setMonitorEnabled(next);
                  try {
                    const res = await setPriceMonitorEnabled(next);
                    setMonitorEnabled(Boolean(res.enabled));
                    setMonitorAlive(Boolean(res.alive));
                  } catch {
                    setMonitorEnabled(!next);
                  }
                }}
                label="切换价格预警监控"
              />
            </div>
            <div className="text-xs text-text-tertiary">
              监控线程：{monitorAlive ? "运行中" : "未运行"} · 当前状态：{monitorEnabled ? "已启用" : "已暂停"}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={pushplusToken}
                onChange={(e) => setPushplusToken(e.target.value)}
                placeholder="PushPlus Token（推荐）"
                className="flex-1 rounded-lg border border-border-default bg-transparent px-3 py-2 text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                disabled={alertSaving}
                onClick={async () => {
                  setAlertSaving(true);
                  try {
                    const res = await savePushplusSettings(pushplusToken.trim());
                    setPushplusConfigured(Boolean(res.configured));
                  } finally {
                    setAlertSaving(false);
                  }
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {alertSaving ? "保存中..." : "保存"}
              </button>
            </div>
            <div className="text-xs text-text-tertiary">
              PushPlus：{pushplusConfigured ? "已配置" : "未配置"}（已配置时优先使用）
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="企业微信机器人 Webhook URL"
                className="flex-1 rounded-lg border border-border-default bg-transparent px-3 py-2 text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                disabled={alertSaving}
                onClick={async () => {
                  setAlertSaving(true);
                  try {
                    const res = await saveWebhookSettings(webhookUrl.trim());
                    setWebhookConfigured(Boolean(res.configured));
                  } finally {
                    setAlertSaving(false);
                  }
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {alertSaving ? "保存中..." : "保存"}
              </button>
            </div>
            <div className="text-xs text-text-tertiary">
              Webhook：{webhookConfigured ? "已配置" : "未配置"}。当 PushPlus 未配置时使用企微 webhook 兜底。
            </div>
          </div>
        </section>

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

        {/* 数据源配置 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Key className="w-4 h-4" />
            <span>数据源配置</span>
          </div>
          <ZsxqCookieConfig />
        </section>

        {/* 关于 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Info className="w-4 h-4" />
            <span>关于</span>
          </div>
          <div className="text-sm text-text-secondary space-y-1">
            <p>板块强度选股系统 v2.0</p>
            <p>数据源: Tushare / Sina / Eastmoney / Local Clusters</p>
            {isDesktop && <p>运行环境: 桌面客户端 (Tauri)</p>}
            {!isDesktop && <p>运行环境: 浏览器</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function ZsxqCookieConfig() {
  const [status, setStatus] = useState<{ configured: boolean; token_preview?: string } | null>(null);
  const [cookie, setCookie] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/zsxq/cookie-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  }, []);

  const handleSave = async () => {
    if (!cookie.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/zsxq/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookie.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Cookie 已保存" });
        setCookie("");
        // refresh status
        const s = await fetch("/api/zsxq/cookie-status").then((r) => r.json());
        setStatus(s);
      } else {
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">知识星球 Cookie</span>
          {status && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.configured ? "bg-green-500/15 text-green-500" : "bg-yellow-500/15 text-yellow-500"}`}>
              {status.configured ? "已配置" : "未配置"}
            </span>
          )}
        </div>
        {status?.configured && status.token_preview && (
          <p className="text-xs text-text-secondary">Token: {status.token_preview}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="粘贴 Cookie 值 (从浏览器 F12 → Network → Headers 获取)"
            className="flex-1 rounded-lg border border-border-default bg-transparent px-3 py-2 text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleSave}
            disabled={saving || !cookie.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
        {message && (
          <p className={`text-xs ${message.type === "success" ? "text-green-500" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
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
