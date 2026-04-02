#!/usr/bin/env python3
"""生成 App 图标 — 使用 numpy-free 的快速方法，仅生成小尺寸"""

import struct, zlib, os, math

ICONS_DIR = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(ICONS_DIR, exist_ok=True)


def make_icon(size):
    """生成深蓝背景 + 绿色柱状图 + 白色趋势线的图标"""
    raw = bytearray()

    for y in range(size):
        raw.append(0)  # PNG filter: none
        ny = y / size
        for x in range(size):
            nx = x / size

            # 圆角 mask
            m = size * 0.08
            cr = size * 0.2
            dx = max(0, m - x, x - size + 1 + m)
            dy = max(0, m - y, y - size + 1 + m)
            if dx > 0 and dy > 0 and math.hypot(dx, dy) > cr:
                raw += b'\x00\x00\x00\x00'
                continue

            # 背景渐变
            t = (nx + ny) / 2
            r = int(15 + t * 30)
            g = int(28 + t * 52)
            b = int(130 + t * 70)

            # 柱状图
            bars = [0.30, 0.42, 0.35, 0.55, 0.48, 0.62, 0.58, 0.75]
            bw = 0.76 / 8
            in_bar = False
            for i, bh in enumerate(bars):
                bx = 0.12 + i * bw
                by = 0.87 - bh * 0.52
                if bx + bw * 0.15 <= nx <= bx + bw * 0.85 and by <= ny <= 0.87:
                    frac = 1 - (ny - by) / max(0.001, 0.87 - by)
                    r = int(30 + frac * 30)
                    g = int(160 + frac * 60)
                    b = int(90 + frac * 40)
                    in_bar = True
                    break

            # 趋势线
            if not in_bar and 0.10 <= nx <= 0.90:
                lt = (nx - 0.10) / 0.80
                ly = (1-lt)**3*0.72 + 3*(1-lt)**2*lt*0.66 + 3*(1-lt)*lt**2*0.28 + lt**3*0.14
                d = abs(ny - ly) * size
                th = max(1.5, size * 0.022)
                if d < th:
                    a = max(0, 1 - d / th) ** 0.6
                    r = int(r*(1-a) + 255*a)
                    g = int(g*(1-a) + 255*a)
                    b = int(b*(1-a) + 255*a)

            raw += struct.pack('BBBB', min(255,r), min(255,g), min(255,b), 255)

    # 编码 PNG
    def chunk(ct, data):
        c = ct + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(bytes(raw), 9)) +
            chunk(b'IEND', b''))


for name, sz in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 256)]:
    p = os.path.join(ICONS_DIR, name)
    with open(p, 'wb') as f:
        f.write(make_icon(sz))
    print(f"✅ {name} ({sz}x{sz})")
print("done")
