#!/bin/bash
# 一键构建桌面应用 (.app + .dmg)
# 双击此文件即可运行

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
TAURI_DIR="$FRONTEND_DIR/src-tauri"

echo "========================================"
echo "  板块强度选股系统 — 构建桌面应用"
echo "========================================"
echo ""

# 前置检查
echo "[检查] 验证环境..."

if ! command -v rustc &>/dev/null; then
    echo "❌ 未安装 Rust，请先运行 setup_tauri.command"
    exit 1
fi
echo "  ✅ Rust $(rustc --version | awk '{print $2}')"

if ! command -v node &>/dev/null; then
    echo "❌ 未安装 Node.js"
    exit 1
fi
echo "  ✅ Node $(node --version)"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "  → 安装前端依赖..."
    cd "$FRONTEND_DIR" && npm install
fi
echo "  ✅ node_modules 就绪"

# 检查后端文件
if [ ! -f "$PROJECT_DIR/backend/server.py" ]; then
    echo "❌ 找不到 backend/server.py"
    exit 1
fi
echo "  ✅ 后端文件就绪"

# 检查图标
if [ ! -f "$TAURI_DIR/icons/icon.png" ]; then
    echo "  → 生成图标..."
    cd "$TAURI_DIR" && python3 gen_icon.py
fi
echo "  ✅ 图标就绪"

# 构建
echo ""
echo "[构建] 正在编译..."
echo "  这可能需要 3-5 分钟（首次更久）"
echo ""

cd "$FRONTEND_DIR"
npm run tauri:build 2>&1

# 查找产出
echo ""
echo "========================================"
echo "  构建完成！"
echo "========================================"

APP_PATH=$(find "$TAURI_DIR/target/release/bundle" -name "*.app" -maxdepth 3 2>/dev/null | head -1)
DMG_PATH=$(find "$TAURI_DIR/target/release/bundle" -name "*.dmg" -maxdepth 3 2>/dev/null | head -1)

if [ -n "$APP_PATH" ]; then
    echo "  📦 App: $APP_PATH"
    echo "  → 可以拖到 /Applications 安装"
fi

if [ -n "$DMG_PATH" ]; then
    echo "  💿 DMG: $DMG_PATH"
    echo "  → 可以分发给其他人"
fi

echo ""
echo "  直接运行: open \"$APP_PATH\""
echo ""

# 询问是否立即打开
read -p "是否立即打开应用？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "$APP_PATH"
fi
