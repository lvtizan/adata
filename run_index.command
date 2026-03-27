#!/bin/zsh
set -e
cd "/Users/kp/Library/Mobile Documents/com~apple~CloudDocs/AI项目/A数据"
if [ -f /tmp/sector-web.pid ]; then
  kill "$(cat /tmp/sector-web.pid)" >/dev/null 2>&1 || true
fi
nohup env HOST=0.0.0.0 PORT=8080 python3 backend/server.py >/tmp/sector-web.log 2>&1 </dev/null &
echo $! >/tmp/sector-web.pid
sleep 1
open "http://127.0.0.1:8080"
echo "服务已启动: http://127.0.0.1:8080"
