#!/bin/bash
# 一键设置 Tauri 桌面客户端环境
# 双击此文件即可运行

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================"
echo "  板块强度选股系统 — Tauri 桌面客户端设置"
echo "========================================"
echo ""

# === 1. 检查 Xcode Command Line Tools ===
echo "[1/5] 检查 Xcode Command Line Tools..."
if ! xcode-select -p &>/dev/null; then
    echo "  → 正在安装 Xcode Command Line Tools..."
    xcode-select --install
    echo "  → 请在弹窗中点击「安装」，安装完后重新运行此脚本"
    exit 1
fi
echo "  ✅ 已安装"

# === 2. 检查/安装 Rust ===
echo "[2/5] 检查 Rust 工具链..."
if ! command -v rustc &>/dev/null; then
    echo "  → 正在安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "  ✅ Rust 安装完成"
else
    echo "  ✅ Rust $(rustc --version | awk '{print $2}') 已安装"
fi

# 确保 cargo 在 PATH 中
export PATH="$HOME/.cargo/bin:$PATH"

# === 3. 安装前端依赖 ===
echo "[3/5] 安装前端依赖 (npm install)..."
cd "$FRONTEND_DIR"
npm install
echo "  ✅ 依赖安装完成"

# === 4. 生成临时图标（如果还没有） ===
echo "[4/5] 检查 App 图标..."
if [ ! -f "$FRONTEND_DIR/src-tauri/icons/icon.png" ]; then
    echo "  → 生成默认图标（后续可替换）..."
    # 用 Python 生成一个简单的占位图标
    python3 -c "
import struct, zlib, os

def create_png(width, height, color_rgb):
    \"\"\"生成纯色 PNG\"\"\"
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            # 简单渐变效果
            r = min(255, color_rgb[0] + (x * 30 // width))
            g = min(255, color_rgb[1] + (y * 20 // height))
            b = color_rgb[2]
            raw += struct.pack('BBB', r, g, b)

    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

icons_dir = '$FRONTEND_DIR/src-tauri/icons'
os.makedirs(icons_dir, exist_ok=True)

# 蓝色主题 (40, 80, 200)
for size, name in [(32,'32x32.png'), (128,'128x128.png'), (256,'128x128@2x.png'), (512,'icon.png')]:
    png = create_png(size, size, (40, 80, 200))
    with open(os.path.join(icons_dir, name), 'wb') as f:
        f.write(png)
print('  ✅ 图标已生成（占位用）')
"
else
    echo "  ✅ 图标已存在"
fi

# === 5. 首次编译 ===
echo "[5/5] 首次编译 Tauri 项目（约 2-3 分钟）..."
echo "  → 这是首次编译，后续启动会很快"
echo ""

cd "$FRONTEND_DIR"
npm run tauri:dev

echo ""
echo "========================================"
echo "  设置完成！后续启动只需运行："
echo "  cd frontend && npm run tauri:dev"
echo "========================================"
