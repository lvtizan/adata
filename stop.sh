#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
# 停止前端和后端
for p in 5174 8088 8082; do lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null; done
# 停止调度器
PID_FILE="$DIR/.pids/scheduler.pid"
if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
fi
echo "✅ 已停止（前端+后端+调度器）"
