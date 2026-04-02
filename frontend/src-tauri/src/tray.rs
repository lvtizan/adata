//! 系统托盘管理
//!
//! 提供系统托盘图标、右键菜单、点击行为。

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconEvent,
    App, Manager,
};

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    // 构建菜单项
    let open = MenuItem::with_id(handle, "open", "📊 打开主面板", true, None::<&str>)?;
    let refresh = MenuItem::with_id(handle, "refresh", "🔄 刷新数据", true, None::<&str>)?;
    let toggle_monitor =
        MenuItem::with_id(handle, "toggle_monitor", "⏸️ 暂停监控", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(handle)?;
    let quit = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        handle,
        &[&open, &refresh, &separator, &toggle_monitor, &separator, &quit],
    )?;

    // 获取托盘图标
    let tray = app.tray_by_id("main-tray").expect("找不到托盘图标");
    tray.set_menu(Some(menu))?;
    tray.set_show_menu_on_left_click(false)?;

    // 托盘事件处理
    let tray_handle = handle.clone();
    tray.on_menu_event(move |app_handle, event| {
        match event.id().as_ref() {
            "open" => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "refresh" => {
                // 通知前端刷新数据
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.emit("refresh-data", ());
                }
            }
            "toggle_monitor" => {
                let is_enabled = crate::monitor::toggle_enabled();
                // 更新菜单文字（下一次打开菜单时生效）
                println!(
                    "监控状态: {}",
                    if is_enabled { "已启用" } else { "已暂停" }
                );
            }
            "quit" => {
                app_handle.exit(0);
            }
            _ => {}
        }
    });

    // 左键点击显示/隐藏窗口
    let click_handle = handle.clone();
    tray.on_tray_icon_event(move |_tray, event| {
        if let TrayIconEvent::Click { button, .. } = event {
            if button == tauri::tray::MouseButton::Left {
                if let Some(window) = click_handle.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        }
    });

    Ok(())
}
