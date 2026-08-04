# 爬虫限流对抗策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rate limiting resilience for the daily electricity query workflow

**Architecture:** Split 17,349 rooms into 6 time-separated batches (every 4 hours), each batch uses conservative concurrency (3) + request delay (0.3s) + small batch processing (100 rooms) + rate limit detection with 60-min auto-recovery

**Tech Stack:** Python 3.11+ (asyncio/aiohttp), GitHub Actions

---

## File Structure

- Modify: `nju_electric_query.py` — RateLimitedError, rate limit detection, batch processing, request delay, batch index parameters
- Modify: `.github/workflows/daily-query.yml` — Multiple schedules, batch index calculation, aggregation in last batch

---

### Task 1: Add RateLimitedError and rate limit detection

**Files:**
- Modify: `nju_electric_query.py` — add exception class and detection logic in `query_single_with_retry`

- [ ] **Step 1: Add RateLimitedError exception class**

Add after the `QueryError` class definition (around line 139):

```python
class RateLimitedError(Exception):
    """服务器返回限流响应时抛出，触发上层批量重试"""
    pass
```

- [ ] **Step 2: Add rate limit detection in `query_single_with_retry`**

In the `query_single_with_retry` function, after the "login" check (line ~170) and before `parse_html` (line ~174), add:

```python
# 检查限流响应
if "查询已被限制" in html or "请60分钟后再试" in html:
    raise RateLimitedError("查询已被限制，请60分钟后再试")
```

The exact insertion point in the current code (around lines 169-175):
```python
# 检查是否需要登录
if "login" in html.lower() or "登录" in html:
    last_error = {"id": room_id, "error": QueryError.AUTH_FAILED, ...}
    break

# >>> 在这里插入限流检测 <<<

# 解析 HTML
result = parse_html(html)
```

- [ ] **Step 3: Verify the change**

Run: `python3 -c "import nju_electric_query; print('Import OK')"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add RateLimitedError and rate limit detection"
```

---

### Task 2: Add new CLI parameters

**Files:**
- Modify: `nju_electric_query.py` — add new argparse arguments and batch index slicing logic

- [ ] **Step 1: Add batch-related parameters to argparse**

In `async_main()`, after the existing `--from-mapping` argument (around line 622), add:

```python
parser.add_argument("--batch-index", type=int, help="当前批次编号 (从 0 开始)")
parser.add_argument("--total-batches", type=int, default=6, help="总批次数（默认 6）")
parser.add_argument("--batch-size", type=int, default=100, help="小批量大小（默认 100）")
parser.add_argument("--batch-delay", type=int, default=30, help="小批量间延迟秒数（默认 30）")
parser.add_argument("--rate-limit-wait", type=int, default=3600, help="限流后等待秒数（默认 3600）")
parser.add_argument("--request-delay", type=float, default=0.3, help="请求间最小间隔秒数（默认 0.3）")
```

- [ ] **Step 2: Add batch index slicing logic**

After the `--from-mapping` loading block (after line ~648 where `room_ids = extract_ids(mapping)`), add:

```python
# 批次切分
if args.batch_index is not None:
    import math
    batch_size_slice = math.ceil(len(room_ids) / args.total_batches)
    start = args.batch_index * batch_size_slice
    end = min(start + batch_size_slice, len(room_ids))
    room_ids = room_ids[start:end]
    if show_progress:
        print(f"批次 {args.batch_index}/{args.total_batches}: {len(room_ids)} 间房")
```

- [ ] **Step 3: Pass new parameters to query_batch**

In the `async_main()`, find the `query_batch()` call (around line 706) and update it to pass the new parameters:

```python
summary = await query_batch(
    room_ids, cookies, output_dir,
    show_progress=show_progress,
    max_concurrent=max_concurrent,
    batch_size=args.batch_size,
    batch_delay=args.batch_delay,
    rate_limit_wait=args.rate_limit_wait,
    request_delay=args.request_delay,
)
```

- [ ] **Step 4: Update query_batch signature**

Update the `query_batch` function definition to accept new parameters:

```python
async def query_batch(room_ids: list[str], cookies: dict, output_dir: Optional[Path] = None,
                      show_progress: bool = True, max_concurrent: int = DEFAULT_CONCURRENCY,
                      batch_size: int = 100, batch_delay: int = 30,
                      rate_limit_wait: int = 3600, request_delay: float = 0.3):
```

- [ ] **Step 5: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add batch index, batch size, request delay CLI parameters"
```

---

### Task 3: Refactor query_batch with batch processing and rate limit recovery

**Files:**
- Modify: `nju_electric_query.py` — extract `_query_batch_internal`, add request delay, implement batch-level retry

- [ ] **Step 1: Create `_query_batch_internal` function**

Extract the current query logic inside `query_batch` into a new method. The new method handles the actual querying of a small batch of rooms with concurrency control and request delay:

```python
async def _query_batch_internal(room_ids: list[str], cookies: dict, output_dir: Optional[Path],
                                 show_progress: bool, max_concurrent: int, request_delay: float,
                                 session: aiohttp.ClientSession) -> list[dict]:
    """查询一小批房间，带请求间隔控制。遇限流则抛出 RateLimitedError。"""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def limited_query(room_id):
        async with semaphore:
            try:
                result = await query_single_with_retry(
                    semaphore, session, room_id, cookies, show_progress
                )
            except RateLimitedError:
                # 重新抛出，让上层处理
                raise
            finally:
                await asyncio.sleep(request_delay)
            return result

    tasks = [limited_query(room_id) for room_id in room_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 检查是否有 RateLimitedError
    for r in results:
        if isinstance(r, RateLimitedError):
            raise RateLimitedError(str(r))

    return results
```

- [ ] **Step 2: Rewrite `query_batch` to use batch processing**

Replace the existing `query_batch` body. The new version iterates over small batches, calls `_query_batch_internal` for each, and handles rate limiting with retry:

```python
async def query_batch(room_ids: list[str], cookies: dict, output_dir: Optional[Path] = None,
                      show_progress: bool = True, max_concurrent: int = DEFAULT_CONCURRENCY,
                      batch_size: int = 100, batch_delay: int = 30,
                      rate_limit_wait: int = 3600, request_delay: float = 0.3):
    """异步批量查询 - 分批处理 + 请求间隔 + 限流恢复"""
    total = len(room_ids)
    completed = 0
    succeeded = 0
    failed = 0

    failed_details = []
    success_details = []

    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        for i in range(0, total, batch_size):
            batch = room_ids[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (total + batch_size - 1) // batch_size

            max_retries = 2
            retries = 0
            batch_success = False

            while retries <= max_retries and not batch_success:
                try:
                    results = await _query_batch_internal(
                        batch, cookies, output_dir, show_progress,
                        max_concurrent, request_delay, session
                    )

                    batch_succeeded = 0
                    batch_failed = 0
                    for result in results:
                        if result["success"]:
                            batch_succeeded += 1
                            succeeded += 1
                            if output_dir:
                                await save_result(result, output_dir, quiet=not show_progress)
                            success_details.append({
                                "id": result["id"],
                                "building": result.get("楼栋", "未知"),
                                "room": result.get("房间", "未知"),
                                "power": result.get("剩余电量", "未知"),
                            })
                        else:
                            batch_failed += 1
                            failed += 1
                            failed_details.append({
                                "id": result["id"],
                                "error": result.get("error", "未知错误"),
                                "error_type": result.get("error_type", "unknown"),
                            })

                    completed += len(batch)
                    if show_progress:
                        print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)

                    batch_success = True

                except RateLimitedError:
                    retries += 1
                    if retries > max_retries:
                        # 重试耗尽，标记整批失败
                        failed += len(batch)
                        completed += len(batch)
                        for rid in batch:
                            failed_details.append({
                                "id": rid,
                                "error": "限流重试耗尽",
                                "error_type": "rate_limited",
                            })
                        if show_progress:
                            print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)
                        break

                    if show_progress:
                        print(f"\n  [限流] 等待 {rate_limit_wait}s 后重试小批量 (第 {retries} 次)...")
                    await asyncio.sleep(rate_limit_wait)

            # 小批量间延迟（如果当前批次成功且还有下一批）
            if batch_success and i + batch_size < total:
                await asyncio.sleep(batch_delay)

    if show_progress:
        print()

    if success_details and show_progress:
        print("\n--- 查询成功 ---")
        for detail in success_details[:10]:  # 最多显示前10个
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

- [ ] **Step 3: Update the default concurrency constant**

Change `DEFAULT_CONCURRENCY` from 24 to 3 (line 34):

```python
DEFAULT_CONCURRENCY = 3  # 默认并发数（降低以避免触发限流）
```

- [ ] **Step 4: Update the `query_batch` call in `async_main` for scan mode**

In the scan mode block (around line 672), update the `scan_room_ids` call to use the new concurrency parameter:

```python
result = await scan_room_ids(start_id, end_id, cookies, args.scan_output,
                              max_concurrent, show_progress)
```

(No changes needed here — `scan_room_ids` is a different function and its concurrency is a separate concern.)

- [ ] **Step 5: Verify the changes**

Run: `python3 -c "import nju_electric_query; print('Import OK')"`

- [ ] **Step 6: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add batch processing, request delay, and rate limit recovery"
```

---

### Task 4: Update daily-query.yml with multiple schedules

**Files:**
- Modify: `.github/workflows/daily-query.yml` — multiple schedules, batch index calculation, aggregation in last batch

- [ ] **Step 1: Rewrite the workflow file**

Replace the entire `daily-query.yml` with the new version:

```yaml
name: Daily Electricity Query

on:
  schedule:
    - cron: '0 0 * * *'   # 00:00 UTC → batch 0
    - cron: '0 4 * * *'   # 04:00 UTC → batch 1
    - cron: '0 8 * * *'   # 08:00 UTC → batch 2
    - cron: '0 12 * * *'  # 12:00 UTC → batch 3
    - cron: '0 16 * * *'  # 16:00 UTC → batch 4
    - cron: '0 20 * * *'  # 20:00 UTC → batch 5
  workflow_dispatch:
    inputs:
      batch_index:
        description: 'Batch index (0-5)'
        required: true
        type: number
      total_batches:
        description: 'Total number of batches'
        required: false
        type: number
        default: 6

permissions:
  contents: write

env:
  PYTHON_VERSION: '3.11'

jobs:
  query-electricity:
    runs-on: ubuntu-latest
    timeout-minutes: 35

    concurrency:
      group: daily-query-batch-${{ github.event_name == 'schedule' && github.event.schedule || github.event.inputs.batch_index }}
      cancel-in-progress: false

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Determine batch index
        id: batch
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "BATCH_INDEX=${{ github.event.inputs.batch_index }}" >> $GITHUB_ENV
            echo "TOTAL_BATCHES=${{ github.event.inputs.total_batches || 6 }}" >> $GITHUB_ENV
          else
            HOUR=$(date -u +%H)
            BATCH_INDEX=$((HOUR / 4))
            echo "BATCH_INDEX=$BATCH_INDEX" >> $GITHUB_ENV
            echo "TOTAL_BATCHES=6" >> $GITHUB_ENV
          fi

      - name: Auto login to get cookie
        id: login
        uses: nick-fields/retry@v3
        env:
          NJU_USERNAME: ${{ secrets.NJU_USERNAME }}
          NJU_PASSWORD: ${{ secrets.NJU_PASSWORD }}
        with:
          timeout_minutes: 3
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: |
            echo "$NJU_USERNAME" > /tmp/username
            echo "$NJU_PASSWORD" > /tmp/password
            python scripts/nju_auto_login.py
            if [ ! -f "/tmp/cookie.json" ]; then
              echo "Cookie file not generated"
              exit 1
            fi

      - name: Validate cookie
        id: validate
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 2
          max_attempts: 3
          retry_wait_seconds: 3
          warning_on_retry: true
          command: python scripts/validate_cookie.py /tmp/cookie.json

      - name: Query electricity data
        id: query
        run: |
          set -o pipefail
          python nju_electric_query.py \
            --cookie-file /tmp/cookie.json \
            --from-mapping config/room_ids.json \
            --batch-index ${{ env.BATCH_INDEX }} \
            --total-batches ${{ env.TOTAL_BATCHES }} \
            -c 3 \
            --batch-size 100 \
            --batch-delay 30 \
            --request-delay 0.3 \
            -d ./database \
            -q \
            2>&1 | tee query_output.log

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

      - name: Rollback on failure
        if: failure()
        run: |
          python scripts/rollback_failed_run.py -d ./database
          echo "::warning::Query failed - partial results rolled back"

      - name: Generate aggregated summaries (all batches)
        run: |
          python scripts/aggregate_data.py \
            --database ./database \
            --output ./database/summaries

      - name: Generate building details (all batches)
        run: |
          python scripts/generate_building_details.py \
            --summaries ./database/summaries

      - name: Commit and push summaries
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"

          git add -f database/summaries/

          STAGED_FILES=$(git diff --staged --name-only)
          if [ -z "$STAGED_FILES" ]; then
            echo "No new summaries to commit"
          else
            echo "Files to commit:"
            echo "$STAGED_FILES" | head -10
            echo "... and $(echo "$STAGED_FILES" | wc -l) files total"

            git commit -m "chore: update electricity summaries for $(date +%Y-%m-%d)"
            git push
            echo "✓ Summaries committed and pushed"
          fi

      - name: Create failure issue
        if: failure() && github.event_name == 'schedule'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TODAY=$(date +%Y-%m-%d)
          EXISTING=$(gh issue list \
            --label "daily-query-failure" \
            --state open \
            --json title \
            --jq '.[].title' \
            | grep -c "$TODAY" || true)

          if [ "$EXISTING" -eq 0 ]; then
            gh issue create \
              --title "⚠️ 每日电费查询失败 - $TODAY (批次 ${{ env.BATCH_INDEX }})" \
              --label "daily-query-failure" \
              --assignee "@me" \
              --body "
          ## 查询失败详情

          - **日期**: $TODAY
          - **批次**: ${{ env.BATCH_INDEX }}/${{ env.TOTAL_BATCHES }}
          - **工作流**: ${{ github.workflow }}
          - **运行编号**: ${{ github.run_id }}
          - **触发方式**: ${{ github.event_name }}

          | 指标 | 数值 |
          |------|------|
          | 成功 | ${{ steps.query.outputs.success_count || 'N/A' }} |
          | 失败 | ${{ steps.query.outputs.failed_count || 'N/A' }} |

          [查看运行日志](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})
          "
          else
            echo "今日已有失败 Issue（$EXISTING 个），跳过创建"
          fi

      - name: Summary
        if: always()
        run: |
          SUCCESS=${{ steps.query.outputs.success_count }}
          FAILED=${{ steps.query.outputs.failed_count }}
          TOTAL=$((SUCCESS + FAILED))

          echo "## 📊 Daily Query Summary (Batch ${{ env.BATCH_INDEX }}/${{ env.TOTAL_BATCHES }})" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Count |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Total Rooms | $TOTAL |" >> $GITHUB_STEP_SUMMARY
          echo "| ✅ Success | $SUCCESS |" >> $GITHUB_STEP_SUMMARY
          echo "| ❌ Failed | $FAILED |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Auto Login**: ${{ steps.login.outcome }}" >> $GITHUB_STEP_SUMMARY
          if [ "$FAILED" -gt 0 ]; then
              echo "**Failure Breakdown:**" >> $GITHUB_STEP_SUMMARY
              echo '```' >> $GITHUB_STEP_SUMMARY
              awk '/--- 失败原因统计 ---/{flag=1} flag' query_output.log 2>/dev/null >> $GITHUB_STEP_SUMMARY || true
              echo '```' >> $GITHUB_STEP_SUMMARY
          fi
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Batch ${{ env.BATCH_INDEX }}/${{ env.TOTAL_BATCHES }}**" >> $GITHUB_STEP_SUMMARY
```

Key changes from the old workflow:
- `on.schedule` now has 6 entries (every 4 hours)
- `workflow_dispatch` has `batch_index` input
- New `Determine batch index` step
- Query step uses `--batch-index` and `--total-batches` and new rate control parameters
- Aggregation steps run **every batch** (not just the last one), since each batch writes to the same database directory
- Failure issue title includes batch number
- Summary includes batch number

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: split daily query into 6 batches across 24 hours"
```

---

## Spec Coverage Checklist

- [x] RateLimitedError exception class → Task 1
- [x] Rate limit detection in query_single_with_retry → Task 1
- [x] New CLI parameters (--batch-index, --total-batches, --batch-size, --batch-delay, --rate-limit-wait, --request-delay) → Task 2
- [x] Batch index slicing logic → Task 2
- [x] _query_batch_internal with request delay → Task 3
- [x] query_batch rewritten with batch processing → Task 3
- [x] Rate limit recovery with 60-min wait → Task 3
- [x] Multiple schedule entries in workflow → Task 4
- [x] Batch index determination from UTC hour → Task 4
- [x] Aggregation in each batch → Task 4
- [x] workflow_dispatch with batch_index input → Task 4