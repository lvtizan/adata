#!/bin/zsh
set -e
cd "/Users/kp/Library/Mobile Documents/com~apple~CloudDocs/AI项目/A数据"
if [ -f /tmp/sector-web.pid ]; then
  kill "$(cat /tmp/sector-web.pid)" >/dev/null 2>&1 || true
fi
nohup env HOST=0.0.0.0 PORT=8080 python3 backend/server.py >/tmp/sector-web.log 2>&1 </dev/null &
echo $! >/tmp/sector-web.pid
sleep 1

# 优先用 Chrome 的无代理模式打开，避免系统代理把 localhost 转发到失效端口
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --proxy-server='direct://' --proxy-bypass-list='*' "http://127.0.0.1:8080"
else
  open "http://127.0.0.1:8080"
fi
echo "服务已启动: http://127.0.0.1:8080"
