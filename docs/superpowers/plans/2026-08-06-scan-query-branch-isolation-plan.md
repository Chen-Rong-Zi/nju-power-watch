# Scan-Query 分支隔离 Workflow 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 避免 Scan 和 Query 两个 workflow 同时向 master 提交导致的冲突。Scan 推送到独立分支 `scan-room`，Query 每次运行前合并 `scan-room` 到 master

**Architecture:** Query 在 checkout 后合并 scan-room → master → 删除 scan-room 分支。Scan 在启动时检查 scan-room 分支是否存在，不存在则从 master 创建，运行后推送到 scan-room

**Tech Stack:** GitHub Actions YAML, git CLI

---

### Task 1: 修改 Query workflow — 合并 scan-room 到 master

**Files:**
- Modify: `.github/workflows/daily-query.yml`

- [ ] **Step 1: 在 `Checkout repository` 之后、`Set up Python` 之前增加合并步骤**

```yaml
      - name: Merge scan-room into master
        run: |
          git fetch origin scan-room --depth=50 || true
          git fetch origin master --depth=50
          if git branch -r | grep -q 'origin/scan-room'; then
            echo "Merging scan-room into master..."
            if git merge origin/scan-room --no-edit; then
              echo "✓ Merged scan-room into master"
              if git push origin master; then
                echo "✓ Pushed merged master"
                echo "Deleting scan-room branch..."
                git push origin --delete scan-room || echo "::warning::Failed to delete scan-room branch"
              else
                echo "::error::Failed to push merged master, scan-room branch preserved"
              fi
            else
              echo "::warning::Merge conflict with scan-room, aborting merge"
              git merge --abort
            fi
          else
            echo "scan-room branch does not exist, skipping merge"
          fi
```

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: merge scan-room into master before query, delete after push"
```

### Task 2: 修改 Scan workflow — 推送到 scan-room 分支

**Files:**
- Modify: `.github/workflows/room-id-scan.yml`

- [ ] **Step 1: 替换 `actions/checkout` 之后的步骤，增加分支管理**

原有：
```yaml
      - name: Pull latest
        run: git pull --rebase origin ${{ github.ref_name }}
```

替换为：
```yaml
      - name: Ensure scan-room branch
        run: |
          git fetch origin scan-room --depth=50 || true
          git fetch origin master --depth=50
          if git branch -r | grep -q 'origin/scan-room'; then
            echo "scan-room exists, rebasing onto origin/master..."
            git checkout scan-room
            if git rebase origin/master; then
              echo "✓ Rebased scan-room onto origin/master"
            else
              echo "::warning::Rebase conflict, aborting rebase and creating fresh branch"
              git rebase --abort
              git checkout -b scan-room origin/master
            fi
          else
            echo "Creating scan-room from master..."
            git checkout -b scan-room origin/master
          fi
```

- [ ] **Step 2: 修改提交步骤，推送到 scan-room 分支**

将原有 `Commit and push` 步骤中的 push 目标从默认分支改为 `scan-room`：

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
            for i in 1 2 3; do
              if git push origin scan-room; then
                echo "✓ Pushed to scan-room (cursor=${CURSOR})"
                break
              fi
              echo "Push failed (attempt $i), retrying in 3s..."
              sleep 3
              git pull --rebase origin scan-room
            done
          fi
```

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/room-id-scan.yml
git commit -m "feat: scan pushes to scan-room branch, created from master if missing"
```

### 验证方式

1. 手动触发 Query workflow → 确认合并 scan-room 成功，scan-room 分支被删除
2. 手动触发 Scan workflow → 确认 scan-room 分支从 master 重建，扫描后推送到 scan-room
3. 再次触发 Query → 确认合并 scan-room 成功，分支被删除