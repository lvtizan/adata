# 板块强度选股系统 — Tauri v2 桌面客户端方案

## 一、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面壳 | **Tauri v2** (Rust) | 轻量、原生 WebView、macOS 约 10-15MB |
| 前端 | 复用现有 React + Vite | 零改动 |
| 后端 | Python FastAPI (sidecar) | Tauri 管理进程生命周期 |
| 通知 | Tauri notification plugin | macOS 原生通知中心 |
| 托盘 | Tauri tray plugin | 系统托盘常驻 |

## 二、项目结构

```
frontend/
├── src/                      # 现有 React 代码（不动）
├── src-tauri/                # 新增：Tauri 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json       # Tauri 配置
│   ├── capabilities/         # 权限声明
│   │   └── default.json
│   ├── icons/                # App 图标
│   ├── src/
│   │   ├── main.rs           # 入口
│   │   ├── lib.rs            # Tauri 初始化
│   │   ├── sidecar.rs        # Python 后端进程管理
│   │   ├── tray.rs           # 系统托盘
│   │   └── monitor.rs        # 数据监控 + 通知推送
│   └── binaries/             # sidecar 二进制（或启动脚本）
├── package.json              # 加 tauri 脚本
├── vite.config.ts            # 不动
└── ...
```

## 三、核心功能模块

### 3.1 Sidecar 后端管理

Tauri 启动时自动拉起 Python 后端进程：

```
App 启动 → spawn python3 api_app.py → 轮询 /health → 就绪后加载前端
App 退出 → kill python 进程 → 清理资源
```

两种实现方式：
- **方式 A (推荐)**：用 Tauri 的 `shell` plugin 的 `Command::new_sidecar()` 注册 Python 为 sidecar
- **方式 B**：用 `std::process::Command` 直接管理

选方式 A，因为 Tauri 会自动处理进程清理。

### 3.2 系统托盘

- 左键点击：显示/隐藏主窗口
- 右键菜单：
  - 📊 打开主面板
  - 🔔 通知设置
  - ⏸️ 暂停监控 / ▶️ 恢复监控
  - 🔄 刷新数据
  - ❌ 退出

### 3.3 通知推送系统

**监控引擎** (Rust 端定时轮询 API)：

| 条件 | 轮询接口 | 检测逻辑 | 默认频率 |
|------|---------|----------|---------|
| 新股进入牛股集中营 | `/api/camp/bull-stocks` | 对比前后两次结果的 ts_code 集合 | 5 分钟 |
| 板块排名大幅变动 | `/api/sectors/rankings` | rank_change 绝对值 >= 阈值 | 5 分钟 |
| 自选股触发条件 | `/api/watchlist` + 各股数据 | RPS >= 阈值 / 价格破 MA20 | 10 分钟 |

推送流程：
```
定时器触发 → 调用本地 API → 对比缓存 → 有变化 → 发 macOS 通知
                                      → 无变化 → 静默
```

通知设置持久化到 `~/.sector-strength/notify-config.json`。

### 3.4 前端适配

几乎不需要改动现有代码，只需：
1. `vite.config.ts` 中判断 Tauri 环境时调整 API 地址
2. 可选：加一个 `useDesktop` hook 暴露原生能力（通知开关等）

## 四、构建与分发

### 开发模式
```bash
cd frontend
npm run tauri dev
# 自动启动: Vite dev server + Python backend + Tauri 窗口
```

### 生产构建
```bash
npm run tauri build
# 产出: frontend/src-tauri/target/release/bundle/macos/板块强度选股.app
```

打包后的 `.app` 包含：
- Tauri 二进制 (~5MB)
- 前端静态资源 (~2MB)
- Python sidecar 启动器

> 注意：Python 运行时不打包进 app，依赖用户系统已安装的 Python3。
> 后续可以用 PyInstaller 把后端打包成独立二进制，彻底去掉 Python 依赖。

## 五、实施路线

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| **P0** | Tauri 壳 + sidecar + 基础托盘 | 1 天 |
| **P1** | 通知推送（三种条件） | 1 天 |
| **P2** | 通知设置 UI + 持久化 | 0.5 天 |
| **P3** | App 图标 + 打包 + 签名 | 0.5 天 |
| **P4** | PyInstaller 打包后端（可选） | 1 天 |

## 六、前置条件

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Tauri CLI
cargo install tauri-cli@^2

# 或用 npm
npm install -D @tauri-apps/cli@^2
```

macOS 还需要 Xcode Command Line Tools（你应该已经有了）。
