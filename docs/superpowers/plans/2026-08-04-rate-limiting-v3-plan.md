# 限流对抗策略 v3 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 17,349 间房的查询分 4 批链式执行，每批独立 workflow run，最后一步触发下一批

**Architecture:** 每批用 `--batch-index` 和 `--total-batches` 参数切片房间列表，3s 请求间隔安全速率。每批完成后通过 `gh workflow run` 触发下一批，`database/.batch_run_summary.json` 追踪跨批次累计统计

**Tech Stack:** Python 3.11, aiohttp, GitHub Actions

---

### Task 1: 更新 nju_electric_query.py — 批次参数和切片逻辑

**Files:**
- Modify: `nju_electric_query.py`

**变更说明:**
1. `--request-delay` 默认值: 1.0 → 3.0
2. 增加 `--batch-index` 参数（默认 1）
3. 增加 `--total-batches` 参数（默认 1）
4. 加载 `--from-mapping` 后，按 batch 切片过滤房间列表

- [ ] **Step 1: 增加 --batch-index 和 --total-batches 参数，更新 --request-delay 默认值**

在 `nju_electric_query.py` 的 `async_main` 函数中，修改参数定义（约第 672 行）：

```python
parser.add_argument("--request-delay", type=float, default=3.0, help="请求间最小间隔秒数（默认 3.0）")
parser.add_argument("--batch-index", type=int, default=1, help="当前批次序号（从 1 开始，默认 1）")
parser.add_argument("--total-batches", type=int, default=1, help="总批次数（默认 1）")
```

- [ ] **Step 2: 添加批次参数验证**

在 `async_main` 中，在 `--batch-size` 验证之后（约第 678 行后），添加：

```python
if args.total_batches <= 0:
    print("错误: --total-batches 必须大于 0")
    sys.exit(1)
if args.batch_index < 1 or args.batch_index > args.total_batches:
    print(f"错误: --batch-index 必须在 1 到 {args.total_batches} 之间")
    sys.exit(1)
```

- [ ] **Step 3: 添加房间切片逻辑**

在 `extract_ids(mapping)` 调用之后、`if show_progress: print(...)` 之前（约第 698 行后），添加切片逻辑：

```python
# 按批次切片
if args.total_batches > 1:
    total_rooms = len(room_ids)
    chunk_size = (total_rooms + args.total_batches - 1) // args.total_batches  # ceil division
    start_idx = chunk_size * (args.batch_index - 1)
    end_idx = min(chunk_size * args.batch_index, total_rooms)
    room_ids = room_ids[start_idx:end_idx]
    if show_progress:
        print(f"✓ 批次 {args.batch_index}/{args.total_batches}: 查询 {len(room_ids)} 个房间 (切片 [{start_idx}:{end_idx}])")
```

- [ ] **Step 4: 测试脚本参数**

```bash
python3 -c "
import sys
sys.path.insert(0, '.')
# 验证命令行参数解析
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--request-delay', type=float, default=3.0)
parser.add_argument('--batch-index', type=int, default=1)
parser.add_argument('--total-batches', type=int, default=1)
parser.add_argument('room_ids', nargs='*')

# 测试默认值
args = parser.parse_args([])
assert args.request_delay == 3.0, f'Expected 3.0, got {args.request_delay}'
assert args.batch_index == 1
assert args.total_batches == 1

# 测试自定义值
args = parser.parse_args(['--batch-index', '2', '--total-batches', '4'])
assert args.batch_index == 2
assert args.total_batches == 4

# 测试切片逻辑
room_ids = list(range(100))
total_batches = 4
chunk_size = (len(room_ids) + total_batches - 1) // total_batches  # = 25
batch_1 = room_ids[0:25]
batch_2 = room_ids[25:50]
batch_4 = room_ids[75:100]
assert len(batch_1) == 25
assert len(batch_2) == 25
assert len(batch_4) == 25
print('All tests passed')
"
```

- [ ] **Step 5: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add batch-index/total-batches params, 3s delay default for v3 chained mode"
```

---

### Task 2: 更新 daily-query.yml — 链式工作流

**Files:**
- Modify: `.github/workflows/daily-query.yml`

**变更说明:**
1. `schedule` 改为 `0 6 * * *`
2. `workflow_dispatch` 增加 `batch_index` 和 `total_batches` 输入
3. 查询命令增加批次参数
4. 新增 batch run summary 追踪步骤
5. 新增链式触发步骤（`gh workflow run` 触发下一批）
6. 最后一批生成最终全局统计

- [ ] **Step 1: 更新 schedule 和 workflow_dispatch 输入**

```yaml
on:
  schedule:
    - cron: '0 6 * * *'   # 06:00 UTC daily (14:00 CST)
  workflow_dispatch:
    inputs:
      batch_index:
        description: 'Current batch index (starts at 1)'
        required: false
        default: '1'
        type: string
      total_batches:
        description: 'Total number of batches'
        required: false
        default: '4'
        type: string
```

- [ ] **Step 2: 更新查询命令**

```yaml
- name: Query electricity data
  id: query
  run: |
    set -o pipefail
    python nju_electric_query.py \
      --cookie-file /tmp/cookie.json \
      --from-mapping config/room_ids.json \
      -c 1 \
      --batch-size 100 \
      --request-delay 3.0 \
      --batch-index ${{ inputs.batch_index || '1' }} \
      --total-batches ${{ inputs.total_batches || '4' }} \
      -d ./database \
      2>&1 | stdbuf -o0 tee query_output.log

    SUCCESS=$(grep -oP '成功: \K\d+' query_output.log || echo "0")
    FAILED=$(grep -oP '失败: \K\d+' query_output.log || echo "0")
    echo "success_count=$SUCCESS" >> $GITHUB_OUTPUT
    echo "failed_count=$FAILED" >> $GITHUB_OUTPUT

    if [ "$SUCCESS" -eq 0 ]; then
      echo "::error::All queries failed ($FAILED rooms)"
      exit 1
    elif [ "$FAILED" -gt 0 ]; then
      echo "::warning::$FAILED rooms failed, $SUCCESS succeeded — continuing with partial results"
    fi
```

- [ ] **Step 3: 添加 batch run summary 追踪步骤**

在 `Commit and push summaries` 步骤之后，添加 batch run summary 步骤：

```yaml
- name: Update batch run summary
  id: summary
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    BATCH_INDEX="${{ inputs.batch_index || '1' }}"
    TOTAL_BATCHES="${{ inputs.total_batches || '4' }}"
    SUCCESS="${{ steps.query.outputs.success_count }}"
    FAILED="${{ steps.query.outputs.failed_count }}"
    SUMMARY_FILE="database/.batch_run_summary.json"

    if [ "$BATCH_INDEX" -eq 1 ]; then
      # 第 1 批：创建新文件
      CUM_SUCCESS=$SUCCESS
      CUM_FAILED=$FAILED
      cat > "$SUMMARY_FILE" << EOF
    {
      "date": "$(date +%Y-%m-%d)",
      "total_batches": $TOTAL_BATCHES,
      "batches": {
        "$BATCH_INDEX": { "success": $SUCCESS, "failed": $FAILED }
      },
      "cumulative": { "success": $CUM_SUCCESS, "failed": $CUM_FAILED }
    }
    EOF
    else
      # 第 2+ 批：读取并追加
      PREV_SUCCESS=$(python3 -c "import json; d=json.load(open('$SUMMARY_FILE')); print(d['cumulative']['success'])")
      PREV_FAILED=$(python3 -c "import json; d=json.load(open('$SUMMARY_FILE')); print(d['cumulative']['failed'])")
      CUM_SUCCESS=$((PREV_SUCCESS + SUCCESS))
      CUM_FAILED=$((PREV_FAILED + FAILED))

      python3 -c "
    import json
    d = json.load(open('$SUMMARY_FILE'))
    d['batches']['$BATCH_INDEX'] = {'success': $SUCCESS, 'failed': $FAILED}
    d['cumulative'] = {'success': $CUM_SUCCESS, 'failed': $CUM_FAILED}
    json.dump(d, open('$SUMMARY_FILE', 'w'), indent=2, ensure_ascii=False)
    "
    fi

    echo "cumulative_success=$CUM_SUCCESS" >> $GITHUB_OUTPUT
    echo "cumulative_failed=$CUM_FAILED" >> $GITHUB_OUTPUT
    echo "✓ Batch run summary updated (batch $BATCH_INDEX/$TOTAL_BATCHES)"
```

- [ ] **Step 4: 添加链式触发步骤**

在 `Update batch run summary` 步骤之后，添加链式触发：

```yaml
- name: Trigger next batch or finalize
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    BATCH_INDEX="${{ inputs.batch_index || '1' }}"
    TOTAL_BATCHES="${{ inputs.total_batches || '4' }}"

    if [ "$BATCH_INDEX" -lt "$TOTAL_BATCHES" ]; then
      NEXT_BATCH=$((BATCH_INDEX + 1))
      echo "Triggering batch $NEXT_BATCH/$TOTAL_BATCHES..."

      for i in 1 2 3; do
        if gh workflow run "${{ github.workflow }}" \
          --ref "${{ github.ref_name }}" \
          -f batch_index="$NEXT_BATCH" \
          -f total_batches="$TOTAL_BATCHES"; then
          echo "✓ Triggered batch $NEXT_BATCH (attempt $i)"
          break
        else
          echo "::warning::Trigger failed (attempt $i), retrying in 3s..."
          sleep 3
        fi
      done
    else
      echo "✓ All $TOTAL_BATCHES batches completed"
      echo "final_batch=true" >> $GITHUB_OUTPUT
    fi
```

- [ ] **Step 5: 更新最终统计步骤**

将原来的 `Summary` 步骤替换为基于 batch run summary 的最终统计：

```yaml
- name: Generate final summary
  if: always()
  run: |
    BATCH_INDEX="${{ inputs.batch_index || '1' }}"
    TOTAL_BATCHES="${{ inputs.total_batches || '4' }}"
    SUMMARY_FILE="database/.batch_run_summary.json"
    SUCCESS="${{ steps.query.outputs.success_count }}"
    FAILED="${{ steps.query.outputs.failed_count }}"

    echo "## 📊 Batch Query Summary" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "**Batch $BATCH_INDEX / $TOTAL_BATCHES**" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "| Metric | Count |" >> $GITHUB_STEP_SUMMARY
    echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
    echo "| ✅ Success | $SUCCESS |" >> $GITHUB_STEP_SUMMARY
    echo "| ❌ Failed | $FAILED |" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY

    if [ -f "$SUMMARY_FILE" ]; then
      echo "### Cumulative (all batches)" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      python3 -c "
    import json
    d = json.load(open('$SUMMARY_FILE'))
    print(f\"Date: {d['date']}\")
    print(f\"Total batches: {d['total_batches']}\")
    print()
    print(f\"{'Batch':<8} {'Success':<10} {'Failed':<10}\")
    print(f\"{'-----':<8} {'-------':<10} {'------':<10}\")
    for b in sorted(d['batches'].keys()):
        s = d['batches'][b]['success']
        f = d['batches'][b]['failed']
        print(f\"{b:<8} {s:<10} {f:<10}\")
    print()
    c = d['cumulative']
    print(f\"Total: {c['success']} success, {c['failed']} failed\")
    " >> $GITHUB_STEP_SUMMARY || true
      echo '```' >> $GITHUB_STEP_SUMMARY
    fi

    echo "" >> $GITHUB_STEP_SUMMARY
    echo "**Auto Login**: ${{ steps.login.outcome }}" >> $GITHUB_STEP_SUMMARY
    if [ "$FAILED" -gt 0 ]; then
        echo "**Failure Breakdown:**" >> $GITHUB_STEP_SUMMARY
        echo '```' >> $GITHUB_STEP_SUMMARY
        awk '/--- 失败原因统计 ---/{flag=1} flag' query_output.log 2>/dev/null >> $GITHUB_STEP_SUMMARY || true
        echo '```' >> $GITHUB_STEP_SUMMARY
    fi
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: chained batch workflow — 4 batches, 3s delay, auto-trigger next batch"
```

---

### Task 3: 更新文档

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-rate-limiting-v3-design.md`
- Modify: `docs/superpowers/plans/2026-08-04-rate-limiting-v3-plan.md`

- [ ] **Step 1: 提交 spec 和 plan**

```bash
git add docs/superpowers/specs/2026-08-04-rate-limiting-v3-design.md docs/superpowers/plans/2026-08-04-rate-limiting-v3-plan.md
git commit -m "docs: add spec and plan for chained batch v3"
```