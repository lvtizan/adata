#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-quick}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "${YELLOW}[Harness]${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

if [[ "$MODE" != "quick" && "$MODE" != "strict" ]]; then
  fail "参数仅支持: quick | strict"
fi

cd "$ROOT_DIR"

step "项目结构校验"
python3 scripts/validate_project.py
ok "项目结构校验通过"

step "前端构建校验"
(
  cd frontend
  npm run build
)
ok "前端构建通过"

step "后端语法校验"
python3 -m py_compile backend/server.py backend/market_engine.py backend/pattern_detector.py
ok "后端核心文件语法通过"

step "后端健康检查（如果服务已启动）"
if curl -sS --max-time 2 "http://127.0.0.1:8088/api/status" >/dev/null 2>&1; then
  ok "8088 /api/status 可访问"
elif curl -sS --max-time 2 "http://127.0.0.1:8082/health" >/dev/null 2>&1; then
  ok "8082 /health 可访问"
else
  warn "未检测到运行中的后端服务（已跳过在线健康检查）"
fi

if [[ "$MODE" == "strict" ]]; then
  step "后端单测（strict）"
  if command -v pytest >/dev/null 2>&1; then
    (
      cd backend
      pytest -q
    )
    ok "pytest 通过"
  else
    warn "pytest 未安装，跳过 strict 单测"
  fi
fi

ok "Harness 检查完成（mode=$MODE）"
