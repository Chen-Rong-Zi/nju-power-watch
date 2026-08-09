# scan-room 配置同步机制（restore 代替 merge）设计

## 概述

重构 query 工作流（`daily-query.yml`）与 scan 工作流（`room-id-scan.yml`）之间的协作机制：把"把 `scan-room` 分支 **merge** 进 master"改为"从 `scan-room` 分支 **摘取文件**（`config/room_ids.json` + `scan_progress.json`）并作为**普通提交**合入 master"。scan 侧零改动。

**一句话**：`scan-room` 是 scan 的持久私有分支（永不删除、永不 merge）；master 只通过摘取接收 scan 的两个文件的最新版本。

## 背景与事故根因

2026-08-08 22:23 UTC，Daily Electricity Query 的 "Merge scan-room into master" 步骤失败（run=31281579112），导致当天整轮电费查询未执行。日志关键行：

```
Committer identity unknown
fatal: empty ident name (for <runner@...>) not allowed
##[warning]Merge conflict with scan-room, aborting merge   ← 误导性报错
fatal: There is no merge to abort (MERGE_HEAD missing).    ← 二次报错
##[error]Process completed with exit code 128.
```

**根因链**：master 与 scan-room **真实分叉**（#31/#32 两个 PR 在 scan 提交之后、query 运行之前合入 master）→ `git merge` 需要创建真实合并提交 → 合并提交需要 git 身份 → 而 merge 步骤从未配置 `user.name/user.email` → `empty ident name` → 旧错误处理把一切失败当冲突、又对不存在的 MERGE_HEAD 执行 `--abort` → exit 128 → 任务失败。

**本质**：merge 整条分支引入了一整套不必要的复杂性——合并提交、身份、真实冲突、分支删除。而这些复杂性对一个"只需把两个文件的最新版带给 master"的需求而言，全是负担。

## 设计目标

1. **消除 merge 与分支删除**：不再 merge、不再删 scan-room → 根除 `empty ident`、真实冲突、删分支丢进度这三类问题。
2. **scan-room 常驻**：作为 scan 的持久工作分支，持有 `scan_progress.json`（进度）与 `config/room_ids.json`（发现）。进度只依赖 scan-room，不依赖 master。
3. **scan 侧零改动**：扫描逻辑与分支维护步骤（rebase + 提交 + push）完全不动。
4. **master 保留一份进度副本**：sync 步骤把 `scan_progress.json` 一并摘取提交（机制不依赖它，但保留一份最新副本，替换掉旧残留）。

## 设计决策

### 决策一：摘取文件 + 普通提交，替代 merge（用户指定）

query 的 "Merge scan-room into master" 步骤改为 "Sync room mapping from scan-room"：

```bash
git fetch origin scan-room --depth=200 || true
if ! git branch -r | grep -q 'origin/scan-room'; then
  echo "scan-room branch does not exist, skipping sync"
  exit 0
fi

echo "Restoring config/room_ids.json + scan_progress.json from scan-room..."
git checkout origin/scan-room -- config/room_ids.json scan_progress.json

if git diff --cached --quiet; then
  echo "No changes, nothing to commit"
  exit 0
fi

git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"
CURSOR=$(git show origin/scan-room:scan_progress.json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('cursor','?'))" || echo "?")
git commit -m "scan: sync room mapping and progress (cursor ${CURSOR})"
if git push origin master; then
  echo "✓ Pushed config/room_ids.json + scan_progress.json to master (cursor ${CURSOR})"
else
  echo "::error::Failed to push synced files, will retry next cycle"
  git reset --hard HEAD~1   # 丢弃本地 sync 提交，回到 checkout 时的 master 状态
fi
```

要点：
- `git checkout origin/scan-room -- <files>` 把文件从 scan-room 摘到工作树并暂存（覆盖 master 版），**不做任何合并**。
- 提交前显式配置 git 身份（根治事故根因）。
- 提交为普通提交（非 merge 提交）。
- 幂等：config/progress 无变化时跳过提交（batch 2+ 自动跳过）。

### 决策二：master 不手动修改 `config/room_ids.json`（用户指定）

约定：`config/room_ids.json` 在 master 上归 **scan 拥有**，禁止在 master 分支手动修改。因此 sync 摘取覆盖 master 版永远安全（`scan-room.config ⊇ master.config`），无需冲突检测或 3-way 合并。

### 决策三：`scan_progress.json` 一并摘取提交（用户追加要求）

master 上原有的 `scan_progress.json` 残留（cursor 3000）**保留不删**，并由 sync 步骤随 `config/room_ids.json` 一并更新到最新（cursor 5462 → …）。master 的进度副本**不是机制依赖**（scan 从 scan-room 读进度），只是记录/追溯用，从此保持新鲜。

### 决策四：scan 侧零改动（已用模拟验证）

scan 工作流（rebase scan-room 到 master → 扫描 → 提交 push scan-room）**完全不变**。担忧"master 冻结旧进度会令 rebase 冲突"经模拟证伪：

- 每次 scan run **先 rebase 再推进进度**，scan 提交的基线进度恒等于当时 master 的进度 → 三方合并 base==ours，永不冲突。
- 第二轮模拟（推进到 8000 后再 rebase）验证 "HEAD is up to date"，干净通过。
- master 进度保持最新（决策三）后，base==ours 关系依旧成立，rebase 依旧干净。

## 架构与数据流

```
┌─────────────────────────────┐       摘取文件（普通提交）       ┌─────────────────┐
│  scan-room（scan 私有常驻）   │ ── config/room_ids.json ─────▶ │  master (query)  │
│  • config/room_ids.json      │ ── scan_progress.json  ─────▶ │  • 只收两个文件   │
│  • scan_progress.json (进度)  │      (永不 merge / 永不删除)   │  • 不手动改 config │
│  • rebase + 提交 + push (原样) │                              └─────────────────┘
└─────────────────────────────┘
```

**单向发布**：`scan-room → master`，只针对两个文件。master 永远不反向影响 scan-room 的进度。

## 不变量

- `scan-room.config ⊇ master.config`（决策二保证）
- scan-room 永不删除、永不 merge；master 的进度副本保持最新（决策三）
- sync 提交为普通提交，无 merge 提交
- 机制不依赖 master 上的进度副本（scan 只从 scan-room 读）

## 错误处理与边界

| 场景 | 行为 |
|---|---|
| `scan-room` 分支不存在 | 跳过 sync（exit 0），query 继续 |
| 摘取后无变化 | 跳过提交（幂等） |
| push 失败 | `::error::` 警告 + `git reset --hard HEAD` 回滚本地提交 + query 继续；下轮 cycle 重试 |
| 本地 git 身份缺失 | 步骤内显式配置（根治本次事故） |
| master 有手动 config 改动 | 约定禁止；若发生，下一次 sync 会覆盖（记录在案，不额外保护） |
| `scan_progress.json` 在 scan-room 缺失 | `CURSOR` 取 `?`，提交仍成功 |

## 测试与验证策略

### 本地模拟（已执行）

- 复现事故：强制空身份 merge → `empty ident name` + 无 MERGE_HEAD + exit 128（与线上日志逐字一致）→ 证明 merge 路径是根因。
- 新路径：`git checkout origin/scan-room -- config/room_ids.json scan_progress.json` + 普通提交 → 干净生成普通提交，无 merge 机制参与。
- scan rebase 稳定性：以当前远端真实分叉状态 rebase scan-room → master，干净成功；再推进一轮（cursor 8000）→ 仍干净。

### 上线后验证

- push 分支 + PR → 合入 master。
- 手动触发 daily query（workflow_dispatch，4 batches）：
  1. 采集当天缺失的电费数据（08-09 事故当天未采集）。
  2. sync 步骤把 scan-room 的 pending 发现（cursor 5462）合入 master。
  3. 用真实线上运行验证修复。

## 修改文件

| 文件 | 改动 |
|---|---|
| `.github/workflows/daily-query.yml` | "Merge scan-room into master" 步骤 → "Sync room mapping from scan-room"（替换为摘取脚本） |
| `docs/superpowers/specs/2026-08-09-scan-room-config-sync-design.md` | 本文档 |
| `.github/workflows/room-id-scan.yml` | **零改动**（scan 侧保持原样） |
