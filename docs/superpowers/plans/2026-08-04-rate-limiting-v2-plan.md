# 限流对抗策略 v2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将每日电费查询从 6 批改为 3 批，1 并发 + 3s 请求间隔，子批次触发限流后 60 分钟重试

**Architecture:** 修改 `nju_electric_query.py` 的默认参数和 `query_batch` 的重试逻辑，修改 `daily-query.yml` 的调度、超时和查询参数。3 个 cron 调度（00:00, 08:00, 16:00 UTC）各自独立运行，每批约 5,783 间房，单线程 3s 间隔查询。

**Tech Stack:** Python 3.11, aiohttp, GitHub Actions

---

### Task 1: 更新默认参数

**Files:**
- Modify: `nju_electric_query.py:34` (DEFAULT_CONCURRENCY)
- Modify: `nju_electric_query.py:645` (--total-batches default)
- Modify: `nju_electric_query.py:648` (--request-delay default)

- [ ] **Step 1: 修改 DEFAULT_CONCURRENCY**

```python
# 第 34 行
DEFAULT_CONCURRENCY = 1  # 默认并发数（单线程，避免触发限流）
```

- [ ] **Step 2: 修改 --total-batches 默认值**

```python
# 第 645 行
parser.add_argument("--total-batches", type=int, default=3, help="总批次数（默认 3）")
```

- [ ] **Step 3: 修改 --request-delay 默认值**

```python
# 第 648 行
parser.add_argument("--request-delay", type=float, default=3.0, help="请求间最小间隔秒数（默认 3.0）")
```

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: reduce concurrency to 1, adjust batch defaults for rate-limit v2

- DEFAULT_CONCURRENCY: 3 → 1
- --total-batches default: 6 → 3
- --request-delay default: 0.3 → 3.0"
```

---

### Task 2: 添加限流子批次重试逻辑

**Files:**
- Modify: `nju_electric_query.py:272-344` (query_batch function)

- [ ] **Step 1: 替换 query_batch 函数**

将 `query_batch` 函数（第 272-344 行）替换为带限流重试的版本：

```python
async def query_batch(room_ids: list[str], cookies: dict, output_dir: Optional[Path] = None,
                      show_progress: bool = True, max_concurrent: int = DEFAULT_CONCURRENCY,
                      batch_size: int = 100, batch_delay: int = 30,
                      request_delay: float = 3.0):
    """异步批量查询 - 分批处理 + 请求间隔 + 限流自动恢复"""
    total = len(room_ids)
    succeeded = 0
    failed = 0

    failed_details = []
    success_details = []

    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        for i in range(0, total, batch_size):
            batch = room_ids[i:i + batch_size]
            retries = 0
            max_retries = 2

            while retries <= max_retries:
                results = await _query_batch_internal(
                    batch, cookies, output_dir, show_progress,
                    max_concurrent, request_delay, session
                )

                # 找出被限流的房间
                rate_limited_rooms = [
                    r for r in results
                    if not r["success"] and r.get("error_type") == "rate_limited"
                ]

                # 先处理非限流结果
                for result in results:
                    if result["success"]:
                        succeeded += 1
                        if output_dir:
                            await save_result(result, output_dir, quiet=not show_progress)
                        success_details.append({
                            "id": result["id"],
                            "building": result.get("楼栋", "未知"),
                            "room": result.get("房间", "未知"),
                            "power": result.get("剩余电量", "未知"),
                        })
                    elif result.get("error_type") != "rate_limited":
                        failed += 1
                        failed_details.append({
                            "id": result["id"],
                            "error": result.get("error", "未知错误"),
                            "error_type": result.get("error_type", "unknown"),
                        })

                if not rate_limited_rooms:
                    break  # 无限流，当前子批次完成

                retries += 1
                if retries > max_retries:
                    # 超过重试次数，标记为失败
                    failed += len(rate_limited_rooms)
                    for r in rate_limited_rooms:
                        failed_details.append({
                            "id": r["id"],
                            "error": "重试次数耗尽（限流）",
                            "error_type": "rate_limited",
                        })
                    break

                # 只重试被限流的房间
                batch = [r["id"] for r in rate_limited_rooms]
                if show_progress:
                    print(f"\n[限流] 检测到 {len(rate_limited_rooms)} 个限流，等待 3600s 后重试 (第 {retries} 次)...")
                await asyncio.sleep(3600)

            completed = succeeded + failed
            if show_progress:
                print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)

            # 小批量间延迟（使用原始 batch_size 判断是否还有下一批）
            if i + batch_size < total:
                await asyncio.sleep(batch_delay)

    if show_progress:
        print()

    if success_details and show_progress:
        print("\n--- 查询成功 ---")
        for detail in success_details[:10]:
            print(f"  {detail['id']}: {detail['building']} {detail['room']} | 剩余电量: {detail['power']}")

    if failed_details and show_progress:
        print("\n--- 查询失败 (具体原因) ---")
        error_count = {}
        for detail in failed_details:
            error_type = detail.get("error_type", "unknown")
            error_count[error_type] = error_count.get(error_type, 0) + 1
        for error_type, count in error_count.items():
            print(f"  {error_type}: {count}个")

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "success_details": success_details,
        "failed_details": failed_details,
    }
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add rate-limit retry with 60-min wait per sub-batch

When a sub-batch hits rate limiting, wait 60 minutes and retry only
the rate-limited rooms (not already-successful ones). Max 2 retries
per sub-batch before marking remaining rooms as failed."
```

---

### Task 3: 更新 daily-query.yml

**Files:**
- Modify: `.github/workflows/daily-query.yml`

- [ ] **Step 1: 修改调度为 3 个 cron**

```yaml
on:
  schedule:
    - cron: '0 0 * * *'   # 00:00 UTC → batch 0
    - cron: '0 8 * * *'   # 08:00 UTC → batch 1
    - cron: '0 16 * * *'  # 16:00 UTC → batch 2
  workflow_dispatch:
    inputs:
      batch_index:
        description: 'Batch index (0-2)'
        required: true
        type: number
      total_batches:
        description: 'Total number of batches'
        required: false
        type: number
        default: 3
```

- [ ] **Step 2: 修改超时为 360 分钟**

```yaml
jobs:
  query-electricity:
    runs-on: ubuntu-latest
    timeout-minutes: 360
```

- [ ] **Step 3: 更新 Determine batch index 步骤**

```yaml
      - name: Determine batch index
        id: batch
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "BATCH_INDEX=${{ github.event.inputs.batch_index }}" >> $GITHUB_ENV
            echo "TOTAL_BATCHES=${{ github.event.inputs.total_batches || 3 }}" >> $GITHUB_ENV
          else
            case "${{ github.event.schedule }}" in
              "0 0 * * *") BATCH_INDEX=0 ;;
              "0 8 * * *") BATCH_INDEX=1 ;;
              "0 16 * * *") BATCH_INDEX=2 ;;
            esac
            echo "BATCH_INDEX=$BATCH_INDEX" >> $GITHUB_ENV
            echo "TOTAL_BATCHES=3" >> $GITHUB_ENV
          fi
```

- [ ] **Step 4: 更新查询命令参数**

```yaml
      - name: Query electricity data
        id: query
        run: |
          set -o pipefail
          python nju_electric_query.py \
            --cookie-file /tmp/cookie.json \
            --from-mapping config/room_ids.json \
            --batch-index ${{ env.BATCH_INDEX }} \
            --total-batches ${{ env.TOTAL_BATCHES }} \
            -c 1 \
            --batch-size 100 \
            --batch-delay 30 \
            --request-delay 3 \
            -d ./database \
            -q \
            2>&1 | tee query_output.log
```

- [ ] **Step 5: 更新失败 Issue 标题中的批次范围**

```yaml
            gh issue create \
              --title "⚠️ 每日电费查询失败 - $TODAY (批次 ${{ env.BATCH_INDEX }}/${{ env.TOTAL_BATCHES }})" \
```

- [ ] **Step 6: 更新 Summary 步骤中的批次范围**

```yaml
          echo "## 📊 Daily Query Summary (Batch ${{ env.BATCH_INDEX }}/${{ env.TOTAL_BATCHES }})" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: change to 3-batch schedule with 360min timeout for rate-limit v2

- Schedule: 6 cron entries → 3 (00:00, 08:00, 16:00 UTC)
- Timeout: 130 min → 360 min
- Concurrency: 3 → 1, request-delay: 0.3 → 3"
```

---

## 自检清单

- [ ] **Spec 覆盖:** 每项 spec 要求都有对应任务
  - 3 批次、1 并发、3s 间隔 → Task 1 (默认参数) + Task 3 (workflow 参数)
  - 限流 60 分钟重试 → Task 2
  - 只重试限流房间不提成功房间 → Task 2
  - 超时 360 分钟 → Task 3
  
- [ ] **占位符检查:** 无 TBD/TODO，所有步骤包含完整代码

- [ ] **类型一致性:** 参数名、函数签名在各任务间保持一致

- [ ] **边界情况:** 无 0 值参数（默认值已设）、空房间列表、超范围 batch_index 已在现有代码中处理