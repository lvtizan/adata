mod sidecar;
mod tray;
mod monitor;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // 启动 Python 后端 sidecar
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar::start_backend(&handle).await {
                    eprintln!("启动后端失败: {}", e);
                }
            });

            // 初始化系统托盘
            tray::setup_tray(app)?;

            // 启动数据监控 + 通知推送
            let monitor_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 等后端就绪后再启动监控
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                monitor::start_monitor(monitor_handle).await;
            });

            // 后端就绪后显示窗口
            let window_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sidecar::wait_backend_ready().await;
                if let Some(window) = window_handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notify_config,
            set_notify_config,
            get_monitor_status,
            toggle_monitor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ===== 前端可调用的命令 =====

#[tauri::command]
async fn get_notify_config() -> Result<monitor::NotifyConfig, String> {
    monitor::load_config().map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_notify_config(config: monitor::NotifyConfig) -> Result<(), String> {
    monitor::save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_monitor_status() -> Result<monitor::MonitorStatus, String> {
    Ok(monitor::get_status())
}

#[tauri::command]
async fn toggle_monitor(enabled: bool) -> Result<(), String> {
    monitor::set_enabled(enabled);
    Ok(())
}
