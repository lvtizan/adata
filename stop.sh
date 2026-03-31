#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
# 停止所有服务
for p in 5174 8088 8082 2024 8001 3000; do
    lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null
done
# 停止调度器
PID_FILE="$DIR/.pids/scheduler.pid"
[ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null && rm -f "$PID_FILE"
# DeerFlow 相关进程
pkill -f "langgraph dev" 2>/dev/null
pkill -f "uvicorn app.gateway.app:app" 2>/dev/null
echo "✅ 已停止全部服务"
