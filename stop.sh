#!/bin/bash
for p in 5173 8080; do lsof -ti :$p 2>/dev/null | xargs kill -9 2>/dev/null; done
echo "✅ 已停止"
