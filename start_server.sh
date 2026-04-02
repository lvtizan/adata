#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "start_server.sh 已并入 dev.sh，统一启动前后端联动监听。"
exec bash "$DIR/dev.sh"
