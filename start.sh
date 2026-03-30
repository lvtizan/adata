#!/bin/bash
# 一键启动：A-Stock 后端 + 前端 + DeerFlow AI
# 用法: ./start.sh        启动全部
#       ./start.sh stop    停止全部
#       ./start.sh status  查看状态

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DEERFLOW_DIR="$PROJECT_DIR/deer-flow-service"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/.pids"

mkdir -p "$PID_DIR"

# ── 颜色 ──────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 等待端口就绪 ──────────────────────────────────────
wait_port() {
    local port=$1 max=$2 name=$3
    for i in $(seq 1 "$max"); do
        if curl -s "http://127.0.0.1:$port" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    echo -e "  ${RED}✗ $name 启动超时 (端口 $port)${NC}"
    return 1
}

# ── 停止所有服务 ──────────────────────────────────────
stop_all() {
    echo -e "${YELLOW}正在停止所有服务...${NC}"
    # PID 文件管理的进程
    for pidfile in "$PID_DIR"/*.pid; do
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "  停止 $name (PID $pid)"
        fi
        rm -f "$pidfile"
    done
    # DeerFlow 相关进程
    pkill -f "langgraph dev" 2>/dev/null || true
    pkill -f "uvicorn app.gateway.app:app" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}全部已停止${NC}"
}

# ── 查看状态 ──────────────────────────────────────────
show_status() {
    echo ""
    echo "  服务状态:"
    check_port() {
        if curl -s "http://127.0.0.1:$1" >/dev/null 2>&1; then
            echo -e "    ${GREEN}●${NC} $2  http://127.0.0.1:$1"
        else
            echo -e "    ${RED}○${NC} $2  (未运行)"
        fi
    }
    check_port 8080 "A-Stock 后端    "
    check_port 5173 "A-Stock 前端    "
    if [ -d "$DEERFLOW_DIR" ]; then
        check_port 2024 "DeerFlow LangGraph"
        check_port 8001 "DeerFlow Gateway  "
        check_port 3000 "DeerFlow 前端    "
    fi
    echo ""
}

# ── 命令分发 ──────────────────────────────────────────
case "${1:-}" in
    stop)   stop_all;    exit 0 ;;
    status) show_status; exit 0 ;;
esac

# ── 先停旧进程 ────────────────────────────────────────
stop_all 2>/dev/null

# ── 加载环境变量 ──────────────────────────────────────
if [ -f "$BACKEND_DIR/.env" ]; then
    export $(cat "$BACKEND_DIR/.env" | grep -v '^#' | xargs)
fi

if [ -z "$TUSHARE_TOKEN" ]; then
    echo -e "${RED}错误: 未设置 TUSHARE_TOKEN${NC}"
    echo "请在 backend/.env 中设置"
    exit 1
fi

echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  A-Stock Terminal · 一键启动${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

# ═══════════════════════════════════════════════════════
# 1. A-Stock 后端
# ═══════════════════════════════════════════════════════
echo -e "${YELLOW}[1/5]${NC} 启动 A-Stock 后端..."
cd "$BACKEND_DIR"
python3 server.py > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"
wait_port 8080 15 "A-Stock 后端" && echo -e "  ${GREEN}✓ A-Stock 后端就绪${NC}  http://127.0.0.1:8080"

# ═══════════════════════════════════════════════════════
# 2. A-Stock 前端
# ═══════════════════════════════════════════════════════
echo -e "${YELLOW}[2/5]${NC} 启动 A-Stock 前端..."
cd "$FRONTEND_DIR"
npx vite --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$PID_DIR/frontend.pid"
wait_port 5173 20 "A-Stock 前端" && echo -e "  ${GREEN}✓ A-Stock 前端就绪${NC}  http://127.0.0.1:5173"

# ═══════════════════════════════════════════════════════
# 3-5. DeerFlow AI (如果存在)
# ═══════════════════════════════════════════════════════
if [ -d "$DEERFLOW_DIR" ]; then
    # 加载 DeerFlow 环境变量
    if [ -f "$DEERFLOW_DIR/.env" ]; then
        set -a
        source "$DEERFLOW_DIR/.env"
        set +a
    fi
    mkdir -p "$DEERFLOW_DIR/logs"

    # 3. LangGraph
    echo -e "${YELLOW}[3/5]${NC} 启动 DeerFlow LangGraph..."
    (cd "$DEERFLOW_DIR/backend" && NO_COLOR=1 uv run langgraph dev \
        --no-browser --allow-blocking --no-reload \
        > "$DEERFLOW_DIR/logs/langgraph.log" 2>&1) &
    echo $! > "$PID_DIR/deerflow-langgraph.pid"
    wait_port 2024 60 "DeerFlow LangGraph" && echo -e "  ${GREEN}✓ LangGraph 就绪${NC}    http://127.0.0.1:2024"

    # 4. Gateway
    echo -e "${YELLOW}[4/5]${NC} 启动 DeerFlow Gateway..."
    (cd "$DEERFLOW_DIR/backend" && PYTHONPATH=. uv run uvicorn app.gateway.app:app \
        --host 0.0.0.0 --port 8001 --reload \
        > "$DEERFLOW_DIR/logs/gateway.log" 2>&1) &
    echo $! > "$PID_DIR/deerflow-gateway.pid"
    wait_port 8001 30 "DeerFlow Gateway" && echo -e "  ${GREEN}✓ Gateway 就绪${NC}      http://127.0.0.1:8001"

    # 5. Frontend (Next.js)
    echo -e "${YELLOW}[5/5]${NC} 启动 DeerFlow 前端..."
    (cd "$DEERFLOW_DIR/frontend" && pnpm run dev \
        > "$DEERFLOW_DIR/logs/frontend.log" 2>&1) &
    echo $! > "$PID_DIR/deerflow-frontend.pid"
    wait_port 3000 30 "DeerFlow 前端" && echo -e "  ${GREEN}✓ DeerFlow 前端就绪${NC}  http://127.0.0.1:3000"
else
    echo -e "${YELLOW}[3-5] 跳过 DeerFlow (目录不存在)${NC}"
fi

# ═══════════════════════════════════════════════════════
# 完成
# ═══════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  ✓ 全部服务已启动${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "  ${CYAN}A-Stock Terminal${NC}  http://127.0.0.1:5173"
echo -e "  ${CYAN}A-Stock API${NC}      http://127.0.0.1:8080"
if [ -d "$DEERFLOW_DIR" ]; then
echo -e "  ${CYAN}DeerFlow AI${NC}      http://127.0.0.1:3000"
echo -e "  ${CYAN}DeerFlow API${NC}     http://127.0.0.1:8001"
fi
echo ""
echo "  停止全部:  ./start.sh stop"
echo "  查看状态:  ./start.sh status"
echo ""
echo "  日志:"
echo "    tail -f .pids/backend.log       # A-Stock 后端"
echo "    tail -f .pids/frontend.log      # A-Stock 前端"
if [ -d "$DEERFLOW_DIR" ]; then
echo "    tail -f deer-flow-service/logs/langgraph.log  # DeerFlow"
echo "    tail -f deer-flow-service/logs/gateway.log    # DeerFlow GW"
fi
