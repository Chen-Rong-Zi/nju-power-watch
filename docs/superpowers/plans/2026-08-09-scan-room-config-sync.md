# scan-room 配置同步机制（restore 代替 merge）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用"从 scan-room 分支摘取 `config/room_ids.json` + `scan_progress.json` 并作为普通提交合入 master"替换 daily-query.yml 的 "Merge scan-room into master" 步骤，根治 2026-08-08 `empty ident name` 事故，scan 侧零改动。

**Architecture:** 把 sync 逻辑提取为独立脚本 `scripts/sync_scan_room.sh`（可测试、YAML 保持干净），workflow 的 merge 步骤改为一行调用；用临时裸仓库构造 master/scan-room 拓扑的模拟测试逐场景断言。任何失败路径只降级（`::error::` + exit 0），绝不中止 query。

**Tech Stack:** bash + git CLI + GitHub Actions YAML

**Spec:** `docs/superpowers/specs/2026-08-09-scan-room-config-sync-design.md`

> **注（PR 决策）**：模拟测试脚本 `scripts/test_sync_scan_room.sh` 已按维护者决策从本 PR 移除（本 PR 不携带测试代码）。验证结论记录于最终整体评审：6 场景 16 断言全过，门禁验证真实回归会 exit 1。下方 Task 1/2/4 中创建/运行该脚本的步骤为历史记录。

---

### Task 1: 编写 sync 脚本的模拟测试（TDD 先失败）

**Files:**
- Create: `scripts/test_sync_scan_room.sh`

- [ ] **Step 1: 编写测试脚本**

```bash
#!/usr/bin/env bash
# 模拟测试 scripts/sync_scan_room.sh：在临时裸仓库上构造 master/scan-room 拓扑，逐场景断言
set -euo pipefail

SYNC_SCRIPT="$(cd "$(dirname "$0")" && pwd)/sync_scan_room.sh"
if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "FAIL: sync_scan_room.sh not found（先实现它）"
  exit 1
fi

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
ORIGIN="$ROOT/origin.git"
git init --bare -q "$ORIGIN"

# 构造 origin：master=base、scan-room=base（两分支同点，均含 config + progress）
build_origin() {
  local d="$ROOT/seed"
  rm -rf "$d"; git clone -q "$ORIGIN" "$d"
  ( cd "$d" \
    && git config user.email t@t.com && git config user.name T \
    && mkdir -p config \
    && echo '{"campus":{"b":{"r1":"101"}}}' > config/room_ids.json \
    && echo '{"cursor":100}' > scan_progress.json \
    && git add . && git commit -qm base \
    && git branch scan-room \
    && git push -q origin master scan-room )
}

# scan-room 做一次 scan 提交（推进 config + 进度）
scan_advance() {
  ( cd "$ROOT/seed" \
    && git checkout -q scan-room \
    && echo '{"campus":{"b":{"r1":"101","r2":"202"}}}' > config/room_ids.json \
    && echo '{"cursor":5462}' > scan_progress.json \
    && git add . && git commit -qm "scan: cursor 5462/150000 (cycle 1)" \
    && git push -q origin scan-room )
}

# master 工作区 = 干净的 origin/master
setup_wt() {
  rm -rf "$ROOT/wt"
  git clone -q "$ORIGIN" "$ROOT/wt"
  ( cd "$ROOT/wt" && git config user.email w@w.com && git config user.name W && git checkout -q master )
}

# 在 master 工作区运行被测脚本，捕获输出（不中止）
run_sync() { ( cd "$ROOT/wt" && bash "$SYNC_SCRIPT" 2>&1 || true ); }

PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
has() { grep -q "$2" <<< "$1"; }

echo "== 场景 1: 正常同步 =="
build_origin; scan_advance; setup_wt
OUT=$(run_sync)
has "$OUT" "Pushed config" && ok "正常路径推送成功" || bad "正常路径推送成功 (out: $OUT)"
has "$OUT" "cursor 5462" && ok "提交信息含 cursor 5462" || bad "提交信息含 cursor 5462"
( cd "$ROOT/wt" \
  && diff <(git show HEAD:config/room_ids.json) <(git show origin/scan-room:config/room_ids.json) >/dev/null \
     && ok "master config == scan-room config" || bad "master config == scan-room config" \
  && diff <(git show HEAD:scan_progress.json) <(git show origin/scan-room:scan_progress.json) >/dev/null \
     && ok "master progress == scan-room progress" || bad "master progress == scan-room progress" \
  && git log --oneline -1 | grep -q "scan: sync" && ok "提交为普通提交" || bad "提交为普通提交" )

echo "== 场景 2: scan-room 分支不存在 =="
build_origin
git -C "$ORIGIN" branch -D scan-room >/dev/null
setup_wt
OUT=$(run_sync)
has "$OUT" "does not exist" && ok "跳过提示" || bad "跳过提示 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git log --oneline | wc -l)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 3: scan_progress.json 在 scan-room 缺失 =="
build_origin
( cd "$ROOT/seed" \
  && git checkout -q scan-room \
  && git rm -q scan_progress.json && git commit -qm "rm progress" \
  && git push -q origin scan-room )
setup_wt
OUT=$(run_sync)
has "$OUT" "missing on scan-room" && ok "预检跳过" || bad "预检跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git log --oneline | wc -l)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 4: 摘取内容为坏 JSON =="
build_origin
( cd "$ROOT/seed" \
  && git checkout -q scan-room \
  && echo '{bad json' > config/room_ids.json && git commit -qam "bad json" \
  && git push -q origin scan-room )
setup_wt
OUT=$(run_sync)
has "$OUT" "Invalid JSON" && ok "JSON 校验跳过" || bad "JSON 校验跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git log --oneline | wc -l)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 5: 无变化（幂等）=="
build_origin
setup_wt
OUT=$(run_sync)
has "$OUT" "No changes" && ok "幂等跳过" || bad "幂等跳过 (out: $OUT)"
( cd "$ROOT/wt" && [ "$(git log --oneline | wc -l)" = 1 ] && ok "无新提交" || bad "无新提交" )

echo "== 场景 6: push 失败回滚 =="
build_origin; scan_advance; setup_wt
# 制造并发：setup_wt 之后 origin/master 被外部推进（wt 不知道）
( cd "$ROOT/seed" \
  && git checkout -q master && git pull -q origin master \
  && echo x > README && git add . && git commit -qm "concurrent master advance" \
  && git push -q origin master )
OUT=$(run_sync)
has "$OUT" "Failed to push" && ok "push 失败被捕获" || bad "push 失败被捕获 (out: $OUT)"
( cd "$ROOT/wt" \
  && [ "$(git log --oneline | wc -l)" = 1 ] && ok "本地回滚到 pre-sync master" || bad "本地回滚 (HEAD: $(git log --oneline -1))" \
  && [ -z "$(git status --porcelain)" ] && ok "工作树干净" || bad "工作树干净" )

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] || exit 1
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bash scripts/test_sync_scan_room.sh`
Expected: `FAIL: sync_scan_room.sh not found（先实现它）`，退出码 1。

- [ ] **Step 3: Commit**

```bash
git add scripts/test_sync_scan_room.sh
git commit -m "test: simulation harness for sync_scan_room.sh (fails until script exists)"
```

### Task 2: 实现 `scripts/sync_scan_room.sh`

**Files:**
- Create: `scripts/sync_scan_room.sh`

- [ ] **Step 1: 编写脚本（spec 决策一，脚本化）**

```bash
#!/usr/bin/env bash
# 从 scan-room 分支摘取 config/room_ids.json + scan_progress.json，作为普通提交合入当前分支（master）。
# 附属同步：任何失败只降级（::error:: + exit 0），绝不中止调用它的 query 工作流。
set -euo pipefail

if ! git fetch origin +refs/heads/scan-room:refs/remotes/origin/scan-room --depth=200 2>/dev/null; then
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
```

- [ ] **Step 2: 运行测试确认通过**

Run: `bash scripts/test_sync_scan_room.sh`
Expected: 6 个场景全部 PASS，`结果: N 通过, 0 失败`，退出码 0。

- [ ] **Step 3: 语法校验**

Run: `bash -n scripts/sync_scan_room.sh && bash -n scripts/test_sync_scan_room.sh`
Expected: 无输出，退出码 0。

- [ ] **Step 4: Commit**

```bash
git add scripts/sync_scan_room.sh
git commit -m "feat: add sync_scan_room.sh — restore scan files as regular commit instead of merge"
```

### Task 3: 修改 daily-query.yml 替换 merge 步骤

**Files:**
- Modify: `.github/workflows/daily-query.yml:43-65`

- [ ] **Step 1: 替换 "Merge scan-room into master" 步骤**

把第 43-65 行整个步骤（`- name: Merge scan-room into master` 到其 `fi`）替换为：

```yaml
      - name: Sync room mapping from scan-room
        run: bash scripts/sync_scan_room.sh
```

- [ ] **Step 2: 校验 YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/daily-query.yml'); puts 'YAML OK'"`
Expected: `YAML OK`。

- [ ] **Step 3: 确认无 "Merge scan-room" 残留**

Run: `grep -rn "Merge scan-room" .github/ || echo "clean"`
Expected: `clean`（若输出匹配行，说明替换不完整，需修正）。

- [ ] **Step 4: Commit**

注意：`.github/` 被 `.gitignore:7` 的 `.*` 规则忽略，已跟踪文件需 `-f`：

```bash
git add -f .github/workflows/daily-query.yml
git commit -m "ci: replace scan-room merge with file-restore sync step"
```

### Task 4: 全量回归验证

**Files:**
- Test: `scripts/test_sync_scan_room.sh`
- Test: `.github/workflows/daily-query.yml`

- [ ] **Step 1: 重跑模拟测试**

Run: `bash scripts/test_sync_scan_room.sh`
Expected: 6 场景全 PASS，0 失败。

- [ ] **Step 2: 用真实远端状态做一次只读冒烟**

Run（只读，不 push）：

```bash
git fetch origin +refs/heads/scan-room:refs/remotes/origin/scan-room master --depth=200
WT=$(mktemp -d)
git worktree add --detach "$WT" origin/master 2>/dev/null
cd "$WT"
git config user.email "action@github.com"; git config user.name "GitHub Action"
git checkout origin/scan-room -- config/room_ids.json scan_progress.json
python3 -c "import json; json.load(open('config/room_ids.json')); json.load(open('scan_progress.json'))"
git diff --cached --stat
cd - >/dev/null
git worktree remove "$WT" --force; git worktree prune
```

Expected: `git diff --cached --stat` 显示 `config/room_ids.json` 与 `scan_progress.json` 两个文件已暂存（有改动），JSON 校验通过。

- [ ] **Step 3: 收尾清理**

Run: `git worktree list | grep -c "mktemp" || echo "no temp worktrees"`；并确认无遗留临时目录。

### Task 5: 提交与汇报

- [ ] **Step 1: 查看最终 diff 确认范围**

Run: `git log --oneline -4 && git status --short`
Expected: 4 个新提交（test / script / workflow / 若第 4 步有修正），工作树干净。

- [ ] **Step 2: 汇报并询问 push/PR**

向用户汇报：根因、4 个提交、测试结果，并询问是否 push 分支 + 创建 PR（按记忆约束，未经允许不 push）。
