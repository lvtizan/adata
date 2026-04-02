# Tauri 桌面客户端 — 搭建指南

## 前置条件

### 1. 安装 Rust 工具链
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 2. 确认 Xcode Command Line Tools
```bash
xcode-select --install  # 如果已安装会提示
```

### 3. 安装前端依赖（含 Tauri CLI）
```bash
cd frontend
npm install
```

这会同时安装 `@tauri-apps/cli`（开发工具）和 `@tauri-apps/api`（前端 SDK）。

## 开发模式

```bash
cd frontend
npm run tauri:dev
```

这个命令会同时：
1. 启动 Vite dev server（前端热更新）
2. 编译 Rust 代码
3. 启动 Tauri 窗口
4. 自动拉起 Python 后端

首次编译 Rust 需要 2-3 分钟，之后增量编译很快。

> **注意**：Python 后端由 Tauri 自动管理，不需要手动启动 `api_app.py`。

## 生产构建

```bash
cd frontend
npm run tauri:build
```

产出位置：`src-tauri/target/release/bundle/macos/板块强度选股.app`

双击 `.app` 即可运行，无需终端。

## 项目结构说明

```
src-tauri/
├── Cargo.toml           # Rust 依赖
├── tauri.conf.json      # Tauri 配置（窗口、图标、sidecar）
├── capabilities/        # 权限声明
│   └── default.json     # shell、notification、process 权限
├── src/
│   ├── main.rs          # 入口
│   ├── lib.rs           # Tauri Builder 配置
│   ├── sidecar.rs       # Python 后端进程管理
│   ├── tray.rs          # 系统托盘（左键显示/隐藏，右键菜单）
│   └── monitor.rs       # 数据监控 + macOS 通知推送
├── binaries/            # sidecar 启动脚本
│   └── python-backend-aarch64-apple-darwin
└── icons/               # App 图标（需要生成）
```

## 生成 App 图标

准备一个 1024x1024 的 PNG 图标，放到 `icons/app-icon.png`，然后运行：

```bash
npx tauri icon icons/app-icon.png
```

这会自动生成所有尺寸的图标文件。

## 通知设置

配置文件位置：`~/.config/sector-strength/notify-config.json`

默认配置：
```json
{
  "bullCampNew": true,
  "sectorRankChange": true,
  "sectorRankThreshold": 5,
  "watchlistAlert": true,
  "watchlistRpsThreshold": 80.0,
  "pollIntervalSecs": 300
}
```

也可以在 App 内的设置页面修改。

## 常见问题

### Rust 编译慢
首次编译需要下载和编译所有依赖，约 2-3 分钟。后续增量编译约 5-10 秒。

### Python 后端未启动
检查 `backend/.env` 是否配置了 `TUSHARE_TOKEN`。

### macOS 通知权限
首次运行时系统会弹窗请求通知权限，请点击"允许"。

### Apple Silicon vs Intel
sidecar 脚本名中的 `aarch64-apple-darwin` 对应 Apple Silicon (M1/M2/M3)。
如果是 Intel Mac，需要复制一份改名为 `python-backend-x86_64-apple-darwin`。
