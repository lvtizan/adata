#!/bin/bash
# 一键启动：A-Stock 后端 + 前端 + DeerFlow AI
# 用法: bash dev.sh          启动全部
#       bash dev.sh stop      停止全部
#       bash dev.sh status    查看状态

DIR="$(cd "$(dirname "$0")" && pwd)"
DEERFLOW_DIR="$DIR/deer-flow-service"
LOG_DIR="/tmp"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 停止所有服务 ──
stop_all() {
    for p in 5174 8088 8082 2024 8001 3000 5173 8080; do
        lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null
    done
    # 停止调度器
    local pid_file="$DIR/.pids/scheduler.pid"
    [ -f "$pid_file" ] && kill "$(cat "$pid_file")" 2>/dev/null && rm -f "$pid_file"
    # DeerFlow 相关进程
    pkill -f "langgraph dev" 2>/dev/null
    pkill -f "uvicorn app.gateway.app:app" 2>/dev/null
    sleep 1
    echo -e "${GREEN}✅ 已停止全部服务${NC}"
}

# ── 查看状态 ──
show_status() {
    echo ""
    check_port() {
        if lsof -ti :$1 >/dev/null 2>&1; then
            echo -e "  ${GREEN}●${NC} $2  http://127.0.0.1:$1"
        else
            echo -e "  ${RED}○${NC} $2  (未运行)"
        fi
    }
    check_port 8088 "A-Stock 后端    "
    check_port 5174 "A-Stock 前端    "
    if [ -d "$DEERFLOW_DIR" ]; then
        check_port 2024 "DeerFlow LangGraph"
        check_port 8001 "DeerFlow Gateway  "
        check_port 3000 "DeerFlow 前端    "
    fi
    echo ""
}

# ── 命令分发 ──
case "${1:-}" in
    stop)   stop_all;    exit 0 ;;
    status) show_status; exit 0 ;;
esac

# ── 先停旧进程 ──
stop_all 2>/dev/null

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  A-Stock Terminal · 一键启动${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

# ═══════════════════════════════════════
# 1. A-Stock 后端
# ═══════════════════════════════════════
echo -e "${YELLOW}[1/3]${NC} 启动 A-Stock 后端..."
cd "$DIR/backend"
nohup python3 server.py > "$LOG_DIR/a-data-backend.log" 2>&1 &

# 启动定时调度器
nohup python3 daily_scheduler.py --daemon > "$LOG_DIR/a-data-scheduler.log" 2>&1 &

# ═══════════════════════════════════════
# 2. A-Stock 前端
# ═══════════════════════════════════════
echo -e "${YELLOW}[2/3]${NC} 启动 A-Stock 前端..."
cd "$DIR/frontend"
nohup npx vite --host 127.0.0.1 --port 5174 > "$LOG_DIR/a-data-frontend.log" 2>&1 &

# ═══════════════════════════════════════
# 3. DeerFlow AI（如果存在）
# ═══════════════════════════════════════
HAS_DEERFLOW=false
if [ -d "$DEERFLOW_DIR/backend" ]; then
    HAS_DEERFLOW=true
    echo -e "${YELLOW}[3/3]${NC} 启动 DeerFlow AI..."

    # 加载 DeerFlow 环境变量
    if [ -f "$DEERFLOW_DIR/.env" ]; then
        set -a; source "$DEERFLOW_DIR/.env"; set +a
    fi
    mkdir -p "$DEERFLOW_DIR/logs"

    # LangGraph
    (cd "$DEERFLOW_DIR/backend" && NO_COLOR=1 uv run langgraph dev \
        --no-browser --allow-blocking --no-reload \
        > "$DEERFLOW_DIR/logs/langgraph.log" 2>&1) &

    # Gateway
    (cd "$DEERFLOW_DIR/backend" && PYTHONPATH=. uv run uvicorn app.gateway.app:app \
        --host 0.0.0.0 --port 8001 --reload \
        > "$DEERFLOW_DIR/logs/gateway.log" 2>&1) &

    # Frontend (Next.js)
    (cd "$DEERFLOW_DIR/frontend" && pnpm run dev \
        > "$DEERFLOW_DIR/logs/frontend.log" 2>&1) &
else
    echo -e "${YELLOW}[3/3]${NC} 跳过 DeerFlow（deer-flow-service 目录不存在）"
fi

# ═══════════════════════════════════════
# 等待服务就绪
# ═══════════════════════════════════════
echo ""
echo "⏳ 等待服务启动..."

TIMEOUT=20
if [ "$HAS_DEERFLOW" = true ]; then
    TIMEOUT=60
fi

for i in $(seq 1 $TIMEOUT); do
    BACK_OK=$(lsof -ti :8088 2>/dev/null)
    FRONT_OK=$(lsof -ti :5174 2>/dev/null)

    if [ "$HAS_DEERFLOW" = true ]; then
        DF_OK=$(lsof -ti :3000 2>/dev/null)
        if [ -n "$BACK_OK" ] && [ -n "$FRONT_OK" ] && [ -n "$DF_OK" ]; then
            break
        fi
    else
        if [ -n "$BACK_OK" ] && [ -n "$FRONT_OK" ]; then
            break
        fi
    fi
    sleep 1
done

# ── 报告状态 ──
echo ""
ALL_OK=true

if lsof -ti :8088 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} A-Stock 后端      http://127.0.0.1:8088"
else
    echo -e "  ${RED}✗${NC} A-Stock 后端      → tail -f $LOG_DIR/a-data-backend.log"
    ALL_OK=false
fi

if lsof -ti :5174 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} A-Stock 前端      http://127.0.0.1:5174"
else
    echo -e "  ${RED}✗${NC} A-Stock 前端      → tail -f $LOG_DIR/a-data-frontend.log"
    ALL_OK=false
fi

if [ "$HAS_DEERFLOW" = true ]; then
    if lsof -ti :2024 >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} DeerFlow LangGraph http://127.0.0.1:2024"
    else
        echo -e "  ${RED}✗${NC} DeerFlow LangGraph → tail -f $DEERFLOW_DIR/logs/langgraph.log"
        ALL_OK=false
    fi
    if lsof -ti :8001 >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} DeerFlow Gateway   http://127.0.0.1:8001"
    else
        echo -e "  ${RED}✗${NC} DeerFlow Gateway   → tail -f $DEERFLOW_DIR/logs/gateway.log"
        ALL_OK=false
    fi
    if lsof -ti :3000 >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} DeerFlow 前端     http://127.0.0.1:3000"
    else
        echo -e "  ${RED}✗${NC} DeerFlow 前端     → tail -f $DEERFLOW_DIR/logs/frontend.log"
        ALL_OK=false
    fi
fi

echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ 全部服务已启动${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
else
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠ 部分服务启动失败，请检查日志${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
fi

echo ""
echo "  停止: bash dev.sh stop"
echo "  状态: bash dev.sh status"
echo ""

# 打开浏览器
if lsof -ti :5174 >/dev/null 2>&1; then
    sleep 1 && open "http://127.0.0.1:5174" &
fi
