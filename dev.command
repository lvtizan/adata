#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
for p in 5173 8080; do lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null; done
cd "$DIR/backend" && python3 server.py </dev/null >/dev/null 2>&1 & disown
cd "$DIR/frontend" && ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 </dev/null >/dev/null 2>&1 & disown
( sleep 3 && open "http://127.0.0.1:5173" ) </dev/null >/dev/null 2>&1 & disown
echo "✅ 已启动"
