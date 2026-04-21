#!/bin/bash
# 每日 16:35 自动同步 Tushare 数据到 Cloudflare D1
# 自动检查数据是否最新，不是当天的就从 Tushare 拉

export WORKER_URL="https://a-data-api.bbtizan.workers.dev"
export ACCESS_TOKEN="${A_DATA_TOKEN:-}" # 在 ~/.zshrc 或 launchd plist 中设置

cd /Users/kp/Code/A数据

LOG="/Users/kp/Code/A数据/scripts/sync.log"
echo "========== $(date) ==========" >> "$LOG"

python3 scripts/smart_sync.py >> "$LOG" 2>&1

echo "Done at $(date)" >> "$LOG"
echo "" >> "$LOG"
