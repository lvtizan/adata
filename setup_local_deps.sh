#!/bin/bash
# ============================================================
# setup_local_deps.sh
# 把 node_modules、后端缓存等重目录分离到本地缓存，用 symlink 连回来。
#
# 用法：在项目根目录运行一次即可
#   cd /Users/kp/Code/A数据
#   bash setup_local_deps.sh
# ============================================================

set -euo pipefail

LOCAL_BASE="$HOME/.cache/a-data-local"

# 需要分离的目录：[iCloud 相对路径]  [本地子目录名]
DIRS=(
  "frontend/node_modules   frontend-node_modules"
  "backend/data            backend-data"
)

echo "📦 本地缓存根目录: $LOCAL_BASE"
mkdir -p "$LOCAL_BASE"

for entry in "${DIRS[@]}"; do
  read -r rel_path local_name <<< "$entry"

  local_dir="$LOCAL_BASE/$local_name"
  target="./$rel_path"

  # 1. 确保本地目录存在
  mkdir -p "$local_dir"

  # 2. 如果 iCloud 侧已经是 symlink，跳过
  if [ -L "$target" ]; then
    echo "✅ $rel_path → 已是 symlink，跳过"
    continue
  fi

  # 3. 如果 iCloud 侧是真实目录，先把内容迁移过去
  if [ -d "$target" ]; then
    echo "🚚 迁移 $rel_path → $local_dir"
    # rsync 保留权限，增量复制
    rsync -a "$target/" "$local_dir/"
    rm -rf "$target"
  fi

  # 4. 确保父目录存在
  mkdir -p "$(dirname "$target")"

  # 5. 创建 symlink
  ln -s "$local_dir" "$target"
  echo "🔗 $rel_path → $local_dir"
done

echo ""
echo "✅ 完成！以下目录现在指向本地:"
for entry in "${DIRS[@]}"; do
  read -r rel_path _ <<< "$entry"
  ls -la "$rel_path" 2>/dev/null || true
done
echo ""
echo "提示: 如果需要重新 npm install，直接在 frontend/ 里运行即可，"
echo "      node_modules 会写到本地 $LOCAL_BASE/frontend-node_modules/"
