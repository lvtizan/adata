//! Python 后端 sidecar 管理
//!
//! 负责启动、健康检查、停止 Python FastAPI 后端进程。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::AppHandle;

static BACKEND_READY: AtomicBool = AtomicBool::new(false);

const BACKEND_URL: &str = "http://127.0.0.1:8080";
const HEALTH_CHECK_URL: &str = "http://127.0.0.1:8080/";
const MAX_WAIT_SECS: u64 = 30;

/// 启动 Python 后端进程
pub async fn start_backend(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_shell::ShellExt;

    // 获取项目根目录（frontend 的上一级）
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_default();

    // 在开发模式下，后端在 ../backend/api_app.py
    // 在打包模式下，通过 sidecar 启动
    let backend_dir = if cfg!(debug_assertions) {
        // 开发模式：直接从项目目录启动
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        std::path::PathBuf::from(manifest_dir)
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("backend")
    } else {
        resource_dir.join("backend")
    };

    println!("后端目录: {:?}", backend_dir);
    let api_app = backend_dir.join("server.py");

    if !api_app.exists() {
        return Err(format!("找不到后端文件: {:?}", api_app).into());
    }

    // 用 shell plugin 启动 Python 进程
    let shell = app.shell();
    let (_rx, _child) = shell
        .command("python3")
        .args([api_app.to_string_lossy().to_string()])
        .current_dir(backend_dir)
        .spawn()
        .map_err(|e| format!("启动 Python 后端失败: {}", e))?;

    println!("Python 后端进程已启动，等待就绪...");

    // 等待后端健康检查通过
    let client = reqwest::Client::new();
    for i in 0..MAX_WAIT_SECS {
        tokio::time::sleep(Duration::from_secs(1)).await;
        match client.get(HEALTH_CHECK_URL).send().await {
            Ok(resp) if resp.status().is_success() => {
                println!("后端已就绪 (耗时 {}s)", i + 1);
                BACKEND_READY.store(true, Ordering::SeqCst);
                return Ok(());
            }
            _ => {
                if i % 5 == 4 {
                    println!("等待后端就绪... ({}s)", i + 1);
                }
            }
        }
    }

    Err(format!("后端未在 {}s 内就绪", MAX_WAIT_SECS).into())
}

/// 等待后端就绪
pub async fn wait_backend_ready() {
    while !BACKEND_READY.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// 检查后端是否就绪
pub fn is_backend_ready() -> bool {
    BACKEND_READY.load(Ordering::SeqCst)
}
