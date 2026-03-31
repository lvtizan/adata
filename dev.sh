#!/bin/bash
# 用法: bash dev.sh (启动) / bash stop.sh (停止)
DIR="$(cd "$(dirname "$0")" && pwd)"

# 先清理旧进程
for p in 5174 8088 8082; do
    lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null
done
sleep 1

# 启动后端
cd "$DIR/backend"
nohup python3 server.py > /tmp/a-data-backend.log 2>&1 &
BACKEND_PID=$!

# 启动定时调度器
nohup python3 daily_scheduler.py --daemon > /tmp/a-data-scheduler.log 2>&1 &

# 启动前端
cd "$DIR/frontend"
nohup npx vite --host 127.0.0.1 --port 5174 > /tmp/a-data-frontend.log 2>&1 &
FRONTEND_PID=$!

# 等待服务就绪
echo "⏳ 等待服务启动..."
for i in $(seq 1 15); do
    BACK_OK=$(lsof -ti :8088 2>/dev/null)
    FRONT_OK=$(lsof -ti :5174 2>/dev/null)
    if [ -n "$BACK_OK" ] && [ -n "$FRONT_OK" ]; then
        echo "✅ 已启动"
        echo "   前端: http://127.0.0.1:5174"
        echo "   后端: http://127.0.0.1:8088"
        echo "   停止: bash stop.sh"
        sleep 1 && open "http://127.0.0.1:5174" &
        exit 0
    fi
    sleep 1
done

# 如果超时，报告哪个没起来
echo "⚠️ 启动超时，检查状态："
[ -z "$(lsof -ti :8088 2>/dev/null)" ] && echo "   ❌ 后端 8088 未启动 → tail -f /tmp/a-data-backend.log"
[ -z "$(lsof -ti :5174 2>/dev/null)" ] && echo "   ❌ 前端 5174 未启动 → tail -f /tmp/a-data-frontend.log"
[ -n "$(lsof -ti :8088 2>/dev/null)" ] && echo "   ✅ 后端 8088 正常"
[ -n "$(lsof -ti :5174 2>/dev/null)" ] && echo "   ✅ 前端 5174 正常"
