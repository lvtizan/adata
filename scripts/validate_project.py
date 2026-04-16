#!/usr/bin/env python3
"""
项目验证脚本 — 检查 import 链、路由一致性、API 一致性、端口一致性。
用法: python3 scripts/validate_project.py
"""

import os
import re
import sys
from pathlib import Path

# 颜色
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

errors = []
warnings = []

def ok(msg):
    print(f"  {GREEN}✓{RESET} {msg}")

def err(msg):
    errors.append(msg)
    print(f"  {RED}✗{RESET} {msg}")

def warn(msg):
    warnings.append(msg)
    print(f"  {YELLOW}!{RESET} {msg}")


# ── 定位项目根目录 ──────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"
BACKEND_DIR = PROJECT_ROOT / "backend"


def check_icloud_conflicts():
    """检查 iCloud 冲突副本"""
    print("\n[1/5] 检查 iCloud 冲突副本...")
    conflict_pattern = re.compile(r".+ 2$")
    found = False
    for root, dirs, files in os.walk(FRONTEND_SRC):
        for name in dirs + files:
            if conflict_pattern.match(name):
                err(f"发现冲突副本: {os.path.join(root, name)}")
                found = True
    if not found:
        ok("无 iCloud 冲突副本")


def check_imports():
    """检查 @/ 别名 import 的目标文件是否存在"""
    print("\n[2/5] 检查 Import 链...")
    import_re = re.compile(r'from\s+"@/(.+?)"')
    checked = 0
    broken = 0

    for ts_file in FRONTEND_SRC.rglob("*.ts"):
        _check_file_imports(ts_file, import_re, checked_count_ref=[0], broken_count_ref=[0])
    for tsx_file in FRONTEND_SRC.rglob("*.tsx"):
        _check_file_imports(tsx_file, import_re, checked_count_ref=[0], broken_count_ref=[0])

    # 用递归的方式统计有点繁琐，换个简单的做法
    total_checked = 0
    total_broken = 0
    for src_file in list(FRONTEND_SRC.rglob("*.ts")) + list(FRONTEND_SRC.rglob("*.tsx")):
        try:
            content = src_file.read_text(encoding="utf-8")
        except Exception:
            continue
        for match in import_re.finditer(content):
            total_checked += 1
            import_path = match.group(1)
            resolved = _resolve_import(import_path)
            if resolved is None:
                err(f"  找不到 import 目标: @/{import_path}  ← {src_file.relative_to(PROJECT_ROOT)}")
                total_broken += 1

    if total_broken == 0:
        ok(f"所有 {total_checked} 个 @/ import 均有效")
    else:
        err(f"{total_broken}/{total_checked} 个 import 找不到目标")


def _check_file_imports(path, pattern, checked_count_ref, broken_count_ref):
    """辅助：被 check_imports 内部调用但已不使用"""
    pass


def _resolve_import(import_path: str):
    """尝试解析 @/xxx 到实际文件"""
    base = FRONTEND_SRC / import_path

    # 直接匹配文件
    for ext in ["", ".ts", ".tsx", ".js", ".jsx"]:
        candidate = Path(str(base) + ext)
        if candidate.is_file():
            return candidate

    # 目录 + index
    if base.is_dir():
        for idx in ["index.ts", "index.tsx", "index.js"]:
            candidate = base / idx
            if candidate.is_file():
                return candidate

    return None


def check_routes():
    """检查路由定义和页面文件的一致性"""
    print("\n[3/5] 检查路由一致性...")
    routes_file = FRONTEND_SRC / "app" / "router" / "routes.tsx"
    if not routes_file.exists():
        err("routes.tsx 不存在")
        return

    content = routes_file.read_text(encoding="utf-8")

    # 提取 import 的页面路径
    page_imports = re.findall(r'from\s+"@/pages/(.+?)"', content)

    # 提取路由 path 定义
    route_paths = re.findall(r'path:\s*"(.+?)"', content)

    pages_dir = FRONTEND_SRC / "pages"
    if not pages_dir.exists():
        err("pages/ 目录不存在")
        return

    # 检查每个实际存在的页面目录是否有路由
    actual_pages = [d.name for d in pages_dir.iterdir() if d.is_dir() and (d / "page.tsx").exists()]

    for page_name in actual_pages:
        # 检查是否在路由中
        found_in_routes = any(page_name in imp for imp in page_imports)
        if not found_in_routes:
            warn(f"页面 pages/{page_name}/page.tsx 存在但未在 routes.tsx 中 import")

    ok(f"发现 {len(actual_pages)} 个页面, {len(route_paths)} 条路由")


def check_nav_items():
    """检查 root-layout.tsx 中的导航项"""
    layout_file = FRONTEND_SRC / "app" / "layouts" / "root-layout.tsx"
    if not layout_file.exists():
        warn("root-layout.tsx 不存在，跳过导航检查")
        return

    content = layout_file.read_text(encoding="utf-8")
    nav_paths = re.findall(r'path:\s*"(/[^"]*)"', content)
    ok(f"导航栏有 {len(nav_paths)} 个项: {', '.join(nav_paths)}")


def check_ports():
    """检查端口硬编码的一致性"""
    print("\n[4/5] 检查端口一致性...")

    # Vite proxy target
    vite_config = PROJECT_ROOT / "frontend" / "vite.config.ts"
    if vite_config.exists():
        content = vite_config.read_text(encoding="utf-8")
        proxy_ports = re.findall(r"http://127\.0\.0\.1:(\d+)", content)
        for port in proxy_ports:
            if port != "8080":
                warn(f"vite.config.ts proxy 指向端口 {port}（预期 8080）")
            else:
                ok(f"vite.config.ts proxy → 8080")

    # 检查前端代码中的硬编码 localhost
    hardcoded_ports = set()
    for src_file in list(FRONTEND_SRC.rglob("*.ts")) + list(FRONTEND_SRC.rglob("*.tsx")):
        try:
            content = src_file.read_text(encoding="utf-8")
        except Exception:
            continue
        ports = re.findall(r"(?:localhost|127\.0\.0\.1):(\d+)", content)
        for p in ports:
            hardcoded_ports.add((str(src_file.relative_to(PROJECT_ROOT)), p))

    if hardcoded_ports:
        for file_path, port in sorted(hardcoded_ports):
            if port not in ("5188", "8088", "8082", "8083"):
                warn(f"非标准端口 {port} 在 {file_path}")
            else:
                ok(f"端口 {port} 在 {file_path}")
    else:
        ok("前端代码无硬编码 localhost 端口（通过 proxy 访问）")


def check_backend():
    """基本检查后端文件"""
    print("\n[5/5] 检查后端...")

    server_py = BACKEND_DIR / "server.py"
    api_app_py = BACKEND_DIR / "api_app.py"
    env_file = BACKEND_DIR / ".env"

    if server_py.exists():
        ok("server.py 存在（端口 8080）")
    else:
        err("server.py 不存在")

    if api_app_py.exists():
        ok("api_app.py 存在（端口 8082）")
    else:
        err("api_app.py 不存在")

    if env_file.exists():
        content = env_file.read_text(encoding="utf-8")
        if "TUSHARE_TOKEN" in content:
            token_line = [l for l in content.splitlines() if "TUSHARE_TOKEN" in l and not l.strip().startswith("#")]
            if token_line:
                ok("TUSHARE_TOKEN 已配置")
            else:
                warn("TUSHARE_TOKEN 被注释或未设置")
        else:
            warn(".env 中未发现 TUSHARE_TOKEN")
    else:
        warn(".env 文件不存在")


def main():
    print("=" * 40)
    print("  板块强度选股系统 — 项目验证")
    print("=" * 40)

    check_icloud_conflicts()
    check_imports()
    check_routes()
    check_nav_items()
    check_ports()
    check_backend()

    print("\n" + "=" * 40)
    if errors:
        print(f"  {RED}发现 {len(errors)} 个错误, {len(warnings)} 个警告{RESET}")
        sys.exit(1)
    elif warnings:
        print(f"  {YELLOW}无错误, {len(warnings)} 个警告{RESET}")
    else:
        print(f"  {GREEN}全部通过！{RESET}")
    print("=" * 40)


if __name__ == "__main__":
    main()
