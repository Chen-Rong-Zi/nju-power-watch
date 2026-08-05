# Scan-Query 分支隔离 Workflow 协调

## 概述

避免 Scan 和 Query 两个 workflow 同时向 master 提交导致的冲突。Scan 推送到独立分支 `scan-room`，Query 每次运行前合并 `scan-room` 到 master。

## 分支策略

```
master（生产分支）
  ↑ Query 运行在此分支，合并 scan-room 的更新

scan-room（扫描分支）
  ↑ Scan 运行在此分支，推送新发现的房间 ID
  ↑ 每天被 Query 合并后删除，再由 Scan 或 Query 重建
```

## 生命周期

```
Day N
  21:00 Scan 启动
       ├─ scan-room 不存在 → 从 master 创建
       └─ scan-room 存在 → rebase master
       运行扫描 → 推送到 scan-room

Day N+1
  06:00 Query 启动
       ├─ 合并 scan-room → master
       ├─ 删除 scan-room 分支
       └─ 运行查询（4批链式）

  21:00 Scan 启动
       └─ scan-room 不存在 → 从 master 重建
       运行扫描 → 推送到 scan-room（重复）
```

## 修改文件

- `.github/workflows/daily-query.yml` — Query 增加合并/删除/重建步骤
- `.github/workflows/room-id-scan.yml` — Scan 增加分支检查/创建步骤

## 详细设计

### Scan 流程变更

在 `actions/checkout@v4` 之后、`Auto login` 之前，增加分支管理步骤：

```yaml
- name: Ensure scan-room branch
  run: |
    git fetch origin scan-room --depth=50 || true
    git fetch origin master --depth=50
    if git branch -r | grep -q 'origin/scan-room'; then
      echo "scan-room exists, rebasing onto master..."
      git checkout scan-room
      if git rebase master; then
        echo "✓ Rebased scan-room onto master"
      else
        echo "::warning::Rebase conflict, aborting rebase and creating fresh branch"
        git rebase --abort
        git checkout -b scan-room master
      fi
    else
      echo "Creating scan-room from master..."
      git checkout -b scan-room master
    fi
```

后续的扫描和提交步骤不变，但 push 目标改为 `scan-room` 分支：

```yaml
- name: Commit and push to scan-room
  run: |
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    if git diff --name-only | grep -qE 'config/room_ids\.json|scan_progress\.json'; then
      CURSOR=$(python3 -c "import json; d=json.load(open('scan_progress.json')); print(d['cursor'])")
      CYCLE=$(python3 -c "import json; d=json.load(open('scan_progress.json')); print(d['cycle'])")
      git add config/room_ids.json scan_progress.json
      git commit -m "scan: cursor ${CURSOR}/150000 (cycle ${CYCLE})" || true
      # 推送到 scan-room 分支
      for i in 1 2 3; do
        if git push origin scan-room; then
          echo "✓ Pushed to scan-room (cursor=${CURSOR})"
          break
        fi
        sleep 3
        git pull --rebase origin scan-room
      done
    fi
```

### Query 流程变更

在 `Checkout repository` 和 `Set up Python` 之间，增加分支合并步骤：

```yaml
- name: Merge scan-room into master
  run: |
    git fetch origin scan-room --depth=50 || true
    git fetch origin master --depth=50
    if git branch -r | grep -q 'origin/scan-room'; then
      echo "Merging scan-room into master..."
      if git merge origin/scan-room --no-edit; then
        echo "✓ Merged scan-room into master"
        git push origin master || echo "::warning::Failed to push merged master"
        echo "Deleting scan-room branch..."
        git push origin --delete scan-room || echo "::warning::Failed to delete scan-room branch"
      else
        echo "::warning::Merge conflict with scan-room, aborting merge"
        git merge --abort
      fi
    else
      echo "scan-room branch does not exist, skipping merge"
    fi
```

## 容错处理

| 场景 | 处理方式 |
|------|----------|
| scan-room 分支不存在 | Query 跳过合并，Scan 自己创建 |
| 合并冲突 | Query 执行 `merge --abort`，跳过合并继续跑查询 |
| 删除分支失败 | 记录 warning，不阻塞查询 |
| Scan 重复触发（手动 + 定时同时） | 操作相同分支，依赖 push retry 循环处理冲突 |

## 注意事项

- `actions/checkout@v4` 默认 `fetch-depth: 1`（浅克隆），但 git rebase/merge 需要共同祖先，所以 merge 和 rebase 前必须显式 `git fetch --depth=50` 获取更多历史
- Query 的 `actions/checkout@v4` 使用默认行为（checkout master），后续的 merge/delete 都在 master 上操作
- Scan 的 `actions/checkout@v4` 需要确保最终工作在 scan-room 分支上
- 删除分支使用 `git push origin --delete scan-room`，需要 `contents: write` 权限（两个 workflow 已有）