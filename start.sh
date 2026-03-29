#!/bin/bash
# 一键启动：后端 + 前端
# 用法: ./start.sh        启动全部
#       ./start.sh stop    停止全部

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PID_DIR="$PROJECT_DIR/.pids"

mkdir -p "$PID_DIR"

stop_all() {
    echo "正在停止服务..."
    for pidfile in "$PID_DIR"/*.pid; do
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "  已停止 PID $pid ($(basename "$pidfile" .pid))"
        fi
        rm -f "$pidfile"
    done
    echo "全部已停止"
}

if [ "$1" = "stop" ]; then
    stop_all
    exit 0
fi

# 先停掉旧进程
stop_all 2>/dev/null

# 加载 .env
if [ -f "$BACKEND_DIR/.env" ]; then
    export $(cat "$BACKEND_DIR/.env" | grep -v '^#' | xargs)
fi

if [ -z "$TUSHARE_TOKEN" ]; then
    echo "错误: 未设置 TUSHARE_TOKEN"
    echo "请在 backend/.env 中设置，或 export TUSHARE_TOKEN='your_token'"
    exit 1
fi

# 启动后端
echo "启动后端 (http://127.0.0.1:8080) ..."
cd "$BACKEND_DIR"
python3 server.py > "$PROJECT_DIR/.pids/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"

# 等后端就绪
for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:8080 >/dev/null 2>&1; then
        echo "  后端已就绪"
        break
    fi
    sleep 1
done

# 启动前端
echo "启动前端 (http://127.0.0.1:5173) ..."
cd "$FRONTEND_DIR"
npx vite --port 5173 > "$PROJECT_DIR/.pids/frontend.log" 2>&1 &
echo $! > "$PID_DIR/frontend.pid"

sleep 2
echo ""
echo "============================="
echo "  后端: http://127.0.0.1:8080"
echo "  前端: http://127.0.0.1:5173"
echo "============================="
echo ""
echo "停止服务: ./start.sh stop"
echo "查看日志: tail -f .pids/backend.log"
echo "         tail -f .pids/frontend.log"
