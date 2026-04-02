#!/bin/bash
set -e
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "start.sh 已并入 dev.sh，统一使用 5174/8088 流程。"
exec bash "$PROJECT_DIR/dev.sh" "${1:-}"
