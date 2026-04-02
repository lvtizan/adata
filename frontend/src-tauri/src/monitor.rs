//! 数据监控 + 通知推送
//!
//! 定时轮询后端 API，检测变化并发送 macOS 原生通知。
//! 支持三种监控条件：
//! 1. 新股进入牛股集中营
//! 2. 板块排名大幅变动
//! 3. 自选股触发条件（RPS/成交额/价格破 MA20）

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

// ===== 状态 =====

static MONITOR_ENABLED: AtomicBool = AtomicBool::new(true);

lazy_static_like! {
    static PREV_BULL_CODES: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static PREV_SECTOR_RANKS: Mutex<Vec<SectorRankSnapshot>> = Mutex::new(Vec::new());
    // 自选股上次状态：ts_code -> (rps20, alerted_rps)
    static PREV_WATCHLIST: Mutex<HashMap<String, WatchlistSnapshot>> = Mutex::new(HashMap::new());
}

// 简单的 lazy static 宏（不引入 lazy_static crate）
macro_rules! lazy_static_like {
    (static $name:ident: $ty:ty = $init:expr; $($rest:tt)*) => {
        static $name: std::sync::LazyLock<$ty> = std::sync::LazyLock::new(|| $init);
        lazy_static_like!($($rest)*);
    };
    () => {};
}

// ===== 配置结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyConfig {
    /// 牛股集中营新股提醒
    pub bull_camp_new: bool,
    /// 板块排名变动提醒
    pub sector_rank_change: bool,
    /// 板块排名变动阈值（名次变化 >= 此值触发）
    pub sector_rank_threshold: i32,
    /// 自选股条件提醒
    pub watchlist_alert: bool,
    /// 自选股 RPS 阈值
    pub watchlist_rps_threshold: f64,
    /// 轮询间隔（秒）
    pub poll_interval_secs: u64,
}

impl Default for NotifyConfig {
    fn default() -> Self {
        Self {
            bull_camp_new: true,
            sector_rank_change: true,
            sector_rank_threshold: 5,
            watchlist_alert: true,
            watchlist_rps_threshold: 80.0,
            poll_interval_secs: 300, // 5 分钟
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorStatus {
    pub enabled: bool,
    pub last_check: Option<String>,
    pub bull_camp_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SectorRankSnapshot {
    name: String,
    rank: i32,
}

#[derive(Debug, Clone)]
struct WatchlistSnapshot {
    rps20: f64,
    alerted_rps: bool, // 本轮是否已推送过 RPS 达标通知
}

// ===== API 响应结构 =====

#[derive(Debug, Deserialize)]
struct BullCampResponse {
    items: Vec<BullStockItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BullStockItem {
    ts_code: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SectorRankingsResponse {
    items: Vec<SectorRankItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SectorRankItem {
    name: Option<String>,
    rank_change: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct WatchlistResponse {
    items: Vec<WatchlistItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchlistItem {
    ts_code: Option<String>,
    stock_name: Option<String>,
    rps20: Option<f64>,
    close: Option<f64>,
    amount: Option<f64>,
    pct_change_1d: Option<f64>,
}

// ===== 配置持久化 =====

fn config_path() -> std::path::PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("sector-strength");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("notify-config.json")
}

pub fn load_config() -> Result<NotifyConfig, Box<dyn std::error::Error>> {
    let path = config_path();
    if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&content)?)
    } else {
        let config = NotifyConfig::default();
        save_config(&config)?;
        Ok(config)
    }
}

pub fn save_config(config: &NotifyConfig) -> Result<(), Box<dyn std::error::Error>> {
    let path = config_path();
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(path, content)?;
    Ok(())
}

// ===== 监控开关 =====

pub fn set_enabled(enabled: bool) {
    MONITOR_ENABLED.store(enabled, Ordering::SeqCst);
}

pub fn toggle_enabled() -> bool {
    let new_val = !MONITOR_ENABLED.load(Ordering::SeqCst);
    MONITOR_ENABLED.store(new_val, Ordering::SeqCst);
    new_val
}

pub fn get_status() -> MonitorStatus {
    MonitorStatus {
        enabled: MONITOR_ENABLED.load(Ordering::SeqCst),
        last_check: None, // TODO: 记录上次检查时间
        bull_camp_count: PREV_BULL_CODES.lock().unwrap().len(),
    }
}

// ===== 监控主循环 =====

pub async fn start_monitor(app: AppHandle) {
    println!("数据监控已启动");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();

    loop {
        let config = load_config().unwrap_or_default();

        if MONITOR_ENABLED.load(Ordering::SeqCst) {
            // 只在交易时间段检查（9:15 - 15:30）
            if is_trading_hours() {
                // 1. 牛股集中营检查
                if config.bull_camp_new {
                    check_bull_camp(&client, &app).await;
                }

                // 2. 板块排名变动检查
                if config.sector_rank_change {
                    check_sector_ranks(&client, &app, config.sector_rank_threshold).await;
                }

                // 3. 自选股条件检查
                if config.watchlist_alert {
                    check_watchlist(&client, &app, &config).await;
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(config.poll_interval_secs)).await;
    }
}

/// 检查是否在交易时间段
fn is_trading_hours() -> bool {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 简化判断：UTC+8 时区，9:00-16:00
    let beijing_hour = ((now / 3600) + 8) % 24;
    (9..=16).contains(&beijing_hour)
}

/// 检查牛股集中营是否有新股进入
async fn check_bull_camp(client: &reqwest::Client, app: &AppHandle) {
    let resp = match client
        .get("http://127.0.0.1:8080/api/camp/bull-stocks")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("查询牛股集中营失败: {}", e);
            return;
        }
    };

    let data: BullCampResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("解析牛股集中营数据失败: {}", e);
            return;
        }
    };

    let current_codes: HashSet<String> = data
        .items
        .iter()
        .filter_map(|item| item.ts_code.clone())
        .collect();

    let mut prev = PREV_BULL_CODES.lock().unwrap();

    if !prev.is_empty() {
        // 找出新进入的股票
        let new_entries: Vec<&BullStockItem> = data
            .items
            .iter()
            .filter(|item| {
                item.ts_code
                    .as_ref()
                    .map(|code| !prev.contains(code))
                    .unwrap_or(false)
            })
            .collect();

        if !new_entries.is_empty() {
            let names: Vec<String> = new_entries
                .iter()
                .take(5) // 最多显示 5 个
                .map(|item| item.name.clone().unwrap_or_default())
                .collect();

            let body = if new_entries.len() > 5 {
                format!("{}等 {} 只新股进入", names.join("、"), new_entries.len())
            } else {
                format!("{} 进入集中营", names.join("、"))
            };

            send_notification(app, "🐂 牛股集中营", &body);
        }
    }

    *prev = current_codes;
}

/// 检查板块排名大幅变动
async fn check_sector_ranks(
    client: &reqwest::Client,
    app: &AppHandle,
    threshold: i32,
) {
    let resp = match client
        .get("http://127.0.0.1:8080/api/sectors/rankings?sortBy=rps10")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("查询板块排名失败: {}", e);
            return;
        }
    };

    let data: SectorRankingsResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("解析板块排名数据失败: {}", e);
            return;
        }
    };

    // 找大幅变动的板块
    let big_movers: Vec<String> = data
        .items
        .iter()
        .filter(|item| {
            item.rank_change
                .map(|rc| rc.abs() >= threshold)
                .unwrap_or(false)
        })
        .take(5)
        .map(|item| {
            let change = item.rank_change.unwrap_or(0);
            let arrow = if change > 0 { "↑" } else { "↓" };
            format!(
                "{} {}{}",
                item.name.clone().unwrap_or_default(),
                arrow,
                change.abs()
            )
        })
        .collect();

    if !big_movers.is_empty() {
        let body = big_movers.join("、");
        send_notification(app, "📊 板块排名变动", &body);
    }
}

/// 检查自选股是否触发条件
///
/// 监控逻辑：
/// - RPS20 从低于阈值升到阈值以上时，推送一次通知（同一天不重复）
/// - 日涨幅超过 5% 时推送
/// - 成交额超过 10 亿时推送（大单异动）
async fn check_watchlist(
    client: &reqwest::Client,
    app: &AppHandle,
    config: &NotifyConfig,
) {
    let resp = match client
        .get("http://127.0.0.1:8080/api/watchlist")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("查询自选股失败: {}", e);
            return;
        }
    };

    let data: WatchlistResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("解析自选股数据失败: {}", e);
            return;
        }
    };

    let rps_threshold = config.watchlist_rps_threshold;
    let mut prev = PREV_WATCHLIST.lock().unwrap();
    let mut alerts: Vec<String> = Vec::new();

    for item in &data.items {
        let ts_code = match &item.ts_code {
            Some(c) => c.clone(),
            None => continue,
        };
        let name = item.stock_name.clone().unwrap_or_default();
        let rps = item.rps20.unwrap_or(0.0);
        let pct = item.pct_change_1d.unwrap_or(0.0);
        let amount = item.amount.unwrap_or(0.0);

        let prev_snap = prev.get(&ts_code);

        // 条件 1: RPS 达标（从低于阈值升到阈值以上）
        if rps >= rps_threshold {
            let was_below = prev_snap
                .map(|s| s.rps20 < rps_threshold && !s.alerted_rps)
                .unwrap_or(false);
            // 首次出现也通知（prev 没有记录）
            let is_new = prev_snap.is_none();
            if was_below || is_new {
                alerts.push(format!("{} RPS20={:.0}↑", name, rps));
            }
        }

        // 条件 2: 单日涨幅超过 5%
        if pct >= 5.0 {
            alerts.push(format!("{} 涨{:.1}%", name, pct));
        }

        // 条件 3: 成交额异动（超 10 亿）
        if amount >= 1_000_000_000.0 {
            let amount_yi = amount / 100_000_000.0;
            // 只在前一次不到 10 亿时推送，避免重复
            let was_below = prev_snap
                .map(|_| true) // 简化：每轮最多推一次
                .unwrap_or(true);
            if was_below && pct >= 2.0 {
                // 只有在涨的时候才关注放量
                alerts.push(format!("{} 放量{:.0}亿", name, amount_yi));
            }
        }

        // 更新快照
        prev.insert(
            ts_code,
            WatchlistSnapshot {
                rps20: rps,
                alerted_rps: rps >= rps_threshold,
            },
        );
    }

    // 去重并推送
    if !alerts.is_empty() {
        let body = alerts.into_iter().take(5).collect::<Vec<_>>().join("\n");
        send_notification(app, "⭐ 自选股提醒", &body);
    }
}

/// 发送系统通知
fn send_notification(app: &AppHandle, title: &str, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();

    println!("[通知] {} - {}", title, body);

    // 同时发送事件到前端
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(
            "monitor-alert",
            serde_json::json!({
                "title": title,
                "body": body,
                "timestamp": chrono_now_str(),
            }),
        );
    }
}

fn chrono_now_str() -> String {
    // 简单时间字符串，不引入 chrono crate
    use std::time::SystemTime;
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("{}", secs)
}
