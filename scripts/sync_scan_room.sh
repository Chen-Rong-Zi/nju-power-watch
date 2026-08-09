#!/usr/bin/env bash
# 从 scan-room 分支摘取 config/room_ids.json + scan_progress.json，作为普通提交合入当前分支（master）。
# 附属同步：任何失败只降级（::error:: + exit 0），绝不中止调用它的 query 工作流。
set -euo pipefail

if ! git fetch origin scan-room --depth=200 2>/dev/null; then
  echo "::error::Failed to fetch scan-room, skipping sync (retry next cycle)"
  exit 0
fi

if ! git branch -r | grep -q 'origin/scan-room'; then
  echo "scan-room branch does not exist, skipping sync"
  exit 0
fi

# 摘取前预检：任一文件缺失时 checkout 会整体原子失败（bash -e 中止 job），故先确认都存在
for f in config/room_ids.json scan_progress.json; do
  if ! git cat-file -e "origin/scan-room:$f" 2>/dev/null; then
    echo "::error::$f missing on scan-room, skipping sync (retry next cycle)"
    exit 0
  fi
done

echo "Restoring config/room_ids.json + scan_progress.json from scan-room..."
if ! git checkout origin/scan-room -- config/room_ids.json scan_progress.json; then
  echo "::error::Failed to restore files from scan-room, skipping sync"
  git reset --hard HEAD
  exit 0
fi

# 摘取内容校验：坏 JSON 不入库
if ! python3 -c "import json; json.load(open('config/room_ids.json'))" 2>/dev/null \
  || ! python3 -c "import json; json.load(open('scan_progress.json'))" 2>/dev/null; then
  echo "::error::Invalid JSON in synced files, skipping commit"
  git reset --hard HEAD
  exit 0
fi

if git diff --cached --quiet; then
  echo "No changes, nothing to commit"
  exit 0
fi

# 提交前显式配置 git 身份（根治 08-08 empty ident 事故根因）
git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"
CURSOR=$(git show origin/scan-room:scan_progress.json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('cursor','?'))" || echo "?")

if ! git commit -m "scan: sync room mapping and progress (cursor ${CURSOR})"; then
  echo "::error::Commit failed, skipping push"
  git reset --hard HEAD
  exit 0
fi

if git push origin master; then
  echo "✓ Pushed config/room_ids.json + scan_progress.json (cursor ${CURSOR})"
else
  echo "::error::Failed to push synced files, will retry next cycle"
  git reset --hard HEAD~1   # 丢弃本地 sync 提交，回到 checkout 时的 master 状态
  exit 0
fi
