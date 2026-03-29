#!/bin/bash
# 用法: bash dev.sh (启动) / bash stop.sh (停止)
DIR="$(cd "$(dirname "$0")" && pwd)"

# 先清理旧进程
for p in 5173 8080 8082; do
    lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null
done
sleep 1

# 启动后端（日志写到 /tmp，方便排查）
cd "$DIR/backend"
nohup python3 server.py > /tmp/a-data-backend.log 2>&1 &

# 启动定时调度器（每日自动更新）
cd "$DIR/backend"
nohup python3 daily_scheduler.py --daemon > /tmp/a-data-scheduler.log 2>&1 &

# 启动前端
cd "$DIR/frontend"
nohup ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 > /tmp/a-data-frontend.log 2>&1 &

# 等几秒后打开浏览器
( sleep 3 && open "http://127.0.0.1:5173" ) &

echo "✅ 已启动"
echo "   前端: http://127.0.0.1:5173"
echo "   后端: http://127.0.0.1:8080"
echo "   调度器: 自动运行（09:00/11:35/15:10）"
echo "   日志: tail -f /tmp/a-data-backend.log"
echo "   调度日志: tail -f /tmp/a-data-scheduler.log"
echo "   停止: bash stop.sh"
