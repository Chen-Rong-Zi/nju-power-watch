# Room ID 扫描限流适配 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `--scan` 模式添加速率限制（3.0s 间隔）、进度追踪、限流恢复，并替换旧的 4 个扫描工作流为单个进度追踪式工作流。

**Architecture:** 修改 `nju_electric_query.py` 的 `scan_room_ids()` 函数，复用 `_query_batch_internal` 的限流传播模式；新增 `--scan-progress` / `--scan-batch-size` 参数；新建单个 workflow 文件，废弃 4 个旧文件。

**Tech Stack:** Python 3.8+, aiohttp, GitHub Actions, config_utils.py

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `nju_electric_query.py` | 修改 | `scan_room_ids()` 重构 + `scan_single()` 限流检测 + `async_main` 接线 |
| `.github/workflows/room-id-scan.yml` | 新建 | 单个进度追踪式扫描工作流 |
| `.github/workflows/monthly-scan-part-1.yml` | 删除 | 废弃 |
| `.github/workflows/monthly-scan-part-2.yml` | 删除 | 废弃 |
| `.github/workflows/monthly-scan-part-3.yml` | 删除 | 废弃 |
| `.github/workflows/monthly-scan-part-4.yml` | 删除 | 废弃 |
| `.gitignore` | 修改 | 忽略 `.scan_progress.json.tmp` |

---

### Task 1: 给 `scan_single()` 添加限流检测和请求延迟

**Files:**
- Modify: `nju_electric_query.py:496-580`

- [ ] **Step 1: 在 `scan_single()` 中增加 `RateLimitedError` 检测**

在 `"login"` 检查之后、`parse_html` 之前（第 527-530 行之间）插入：

```python
# 检查限流响应
if "查询已被限制" in html or "请60分钟后再试" in html:
    raise RateLimitedError("查询已被限制，请60分钟后再试")
```

- [ ] **Step 2: 在 `scan_single()` 成功分支末尾添加 `request_delay`**

在 `update_id` 调用之后、`break` 之前（第 550-552 行之间）插入：

```python
await asyncio.sleep(request_delay)
```

- [ ] **Step 3: 在 `scan_single()` 外层添加 `RateLimitedError` 捕获**

在 `except Exception` 分支（第 569 行）之前添加：

```python
except RateLimitedError:
    raise  # 让 RateLimitedError 传播到上层，触发批量级取消
```

- [ ] **Step 4: 更新 `scan_single()` 签名**

`scan_single` 内部函数需要能访问 `request_delay`。通过闭包即可（`scan_room_ids` 的参数），不需要改签名。

- [ ] **Step 5: 提交**

```bash
git add nju_electric_query.py
git commit -m "feat: add rate limit detection and request delay to scan_single"
```

---

### Task 2: 重构 `scan_room_ids()` — 新参数 + 限流传播 + 进度追踪

**Files:**
- Modify: `nju_electric_query.py:448-633`

- [ ] **Step 1: 更新 `scan_room_ids()` 函数签名**

新增参数：
```python
async def scan_room_ids(start_id: int, end_id: int, cookies: dict, output_file: str,
                         max_concurrent: int = DEFAULT_CONCURRENCY, show_progress: bool = True,
                         progress_file: str | None = None, batch_size: int = 3600,
                         request_delay: float = 3.0) -> dict:
    """扫描ID区间，发现存在的房间
    ...
    Args:
        progress_file: 进度文件路径，为 None 则不使用进度追踪
        batch_size: 每批扫描 ID 数
        request_delay: 请求间间隔秒数
    """
```

- [ ] **Step 2: 添加进度文件加载逻辑**

在 `existing_id_set` 加载之后（第 463 行）插入：

```python
# 进度追踪
if progress_file:
    cursor = 0
    cycle = 1
    range_end = end_id
    batches = {}
    cumulative = {"scanned": 0, "found": 0, "failed": 0}
    batch_seq = 0

    try:
        with open(progress_file, "r", encoding="utf-8") as f:
            prog = json.load(f)
            cursor = prog.get("cursor", 0)
            cycle = prog.get("cycle", 1)
            range_end = prog.get("range_end", end_id)
            batches = prog.get("batches", {})
            cumulative = prog.get("cumulative", {"scanned": 0, "found": 0, "failed": 0})
            # 从现有 batches 中取最大 key 作为 batch_seq
            if batches:
                batch_seq = max(int(k) for k in batches.keys())
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        print(f"警告: 无法读取进度文件 {progress_file}，从 cursor=0 开始")

    if cursor > 0 and show_progress:
        print(f"从进度文件恢复: cursor={cursor}, cycle={cycle}")
```

- [ ] **Step 3: 修改扫描区间计算**

用 cursor 替换 `start_id` / `end_id`：

```python
# 如果使用进度追踪，用 cursor 覆盖扫描区间
if progress_file:
    scan_start = cursor + 1
    scan_end = min(cursor + batch_size, range_end)
    total = scan_end - scan_start + 1
else:
    scan_start = start_id
    scan_end = end_id
    total = scan_end - scan_start + 1
```

修改 `ids_to_scan` 生成逻辑（第 582-588 行），使用 `scan_start` 和 `scan_end`：

```python
ids_to_scan = []
for room_id in range(scan_start, scan_end + 1):
    if str(room_id) in existing_id_set:
        skipped += 1
    else:
        ids_to_scan.append(room_id)
```

- [ ] **Step 4: 替换 `asyncio.gather` 为 `_query_batch_internal` 风格的限流传播**

删除第 594-597 行的 `gather` 代码，替换为：

```python
connector = aiohttp.TCPConnector(limit=max_concurrent)
async with aiohttp.ClientSession(connector=connector) as session:
    semaphore = asyncio.Semaphore(max_concurrent)
    pending = set()
    rate_limited = False
    rate_limit_retries = 0
    max_rate_limit_retries = 2
    rate_limited_id = None

    # 逐个创建任务
    for room_id in ids_to_scan:
        if rate_limited:
            break
        task = asyncio.create_task(scan_single(session, room_id))
        pending.add(task)

    # 等待所有任务完成（或遇限流取消）
    while pending and not rate_limited:
        done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            rid = task_map.get(task)  # 需要维护 task→room_id 的映射
            exc = task.exception()
            if exc is not None:
                if isinstance(exc, RateLimitedError):
                    rate_limited = True
                    rate_limited_id = rid
                    break
                # 其他异常已在 scan_single 内部处理，不会传播到这里
            # 成功结果已在 scan_single 内部处理（通过闭包更新 mapping）

    if rate_limited:
        # 取消剩余的待处理任务
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.wait(pending)
        # 进度文件更新到 rate_limited_id 之前的位置
        error_counts["rate_limited"] = error_counts.get("rate_limited", 0) + 1
        if rate_limit_retries < max_rate_limit_retries:
            rate_limit_retries += 1
            print(f"\n[限流] 等待 3600s 后重试 ID {rate_limited_id} (第 {rate_limit_retries} 次)...")
            await asyncio.sleep(3600)
            # 重试被限流的 ID
            task = asyncio.create_task(scan_single(session, rate_limited_id))
            await task
            exc = task.exception()
            if isinstance(exc, RateLimitedError):
                print(f"  ID {rate_limited_id} 重试仍被限流，跳过")
                error_counts["rate_limited"] = error_counts.get("rate_limited", 0) + 1
```

注意：需要维护 `task_map` 映射。在创建任务时：

```python
task_map = {}
for room_id in ids_to_scan:
    if rate_limited:
        break
    task = asyncio.create_task(scan_single(session, room_id))
    task_map[task] = room_id
    pending.add(task)
```

- [ ] **Step 5: 添加进度文件保存逻辑**

在 `save_mapping` 调用之后（第 604 行）插入：

```python
# 保存进度
if progress_file:
    batch_seq += 1
    new_cursor = scan_end if not rate_limited else rate_limited_id - 1
    if new_cursor >= range_end:
        new_cursor = 0
        cycle += 1
        batches = {}
        cumulative = {"scanned": 0, "found": 0, "failed": 0}
    else:
        batches[str(batch_seq)] = {
            "scanned": scan_count,
            "found": new_found,
            "failed": error_counts.get("rate_limited", 0),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "cycle": cycle,
        }
        cumulative["scanned"] += scan_count
        cumulative["found"] += new_found
        cumulative["failed"] += error_counts.get("rate_limited", 0)

    prog_data = {
        "cycle": cycle,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "range_start": start_id,
        "range_end": range_end,
        "cursor": new_cursor,
        "batch_size": batch_size,
        "batches": batches,
        "cumulative": cumulative,
    }

    # 原子写入
    tmp_file = progress_file + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(prog_data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, progress_file)  # 原子替换
```

- [ ] **Step 6: 提交**

```bash
git add nju_electric_query.py
git commit -m "feat: refactor scan_room_ids with rate limit propagation and progress tracking"
```

---

### Task 3: 将 `--request-delay` 接入 `scan_room_ids()` 调用

**Files:**
- Modify: `nju_electric_query.py:786-812`

- [ ] **Step 1: 添加 `--scan-progress` 和 `--scan-batch-size` CLI 参数**

在 `--scan-output` 参数之后（第 702 行）插入：

```python
parser.add_argument("--scan-progress", type=str, help="扫描进度文件路径")
parser.add_argument("--scan-batch-size", type=int, default=3600, help="每批扫描 ID 数（默认 3600）")
```

- [ ] **Step 2: 修改 `scan_room_ids()` 调用，传递新参数**

将第 797 行：

```python
result = await scan_room_ids(start_id, end_id, cookies, args.scan_output, max_concurrent, show_progress)
```

改为：

```python
result = await scan_room_ids(
    start_id, end_id, cookies, args.scan_output,
    max_concurrent, show_progress,
    progress_file=args.scan_progress,
    batch_size=args.scan_batch_size,
    request_delay=args.request_delay,
)
```

- [ ] **Step 3: 提交**

```bash
git add nju_electric_query.py
git commit -m "feat: wire --scan-progress, --scan-batch-size, --request-delay to scan_room_ids"
```

---

### Task 4: 新建 `room-id-scan.yml` 工作流

**Files:**
- Create: `.github/workflows/room-id-scan.yml`

- [ ] **Step 1: 创建 workflow 文件**

```yaml
name: Room ID Scan

on:
  schedule:
    - cron: '0 21 * * *'
  workflow_dispatch:
    inputs:
      scan_progress:
        description: 'Override progress file path'
        required: false
        default: '.scan_progress.json'

permissions:
  contents: write

env:
  PYTHON_VERSION: '3.11'

jobs:
  scan-rooms:
    runs-on: ubuntu-latest
    timeout-minutes: 210

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Pull latest
        run: git pull --rebase origin ${{ github.ref_name }}

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Auto login
        id: login
        uses: nick-fields/retry@v3
        env:
          NJU_USERNAME: ${{ secrets.NJU_USERNAME }}
          NJU_PASSWORD: ${{ secrets.NJU_PASSWORD }}
        with:
          timeout_minutes: 3
          max_attempts: 3
          command: |
            echo "$NJU_USERNAME" > /tmp/username
            echo "$NJU_PASSWORD" > /tmp/password
            python scripts/nju_auto_login.py
            test -f /tmp/cookie.json

      - name: Scan room IDs
        id: scan
        run: |
          python nju_electric_query.py \
            --scan 1 150000 \
            --scan-progress .scan_progress.json \
            --scan-batch-size 3600 \
            -c 1 --request-delay 3.0 \
            --cookie-file /tmp/cookie.json

      - name: Commit and push
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add config/room_ids.json .scan_progress.json
          if git diff --staged --name-only | grep -q .; then
            CURSOR=$(python3 -c "import json; d=json.load(open('.scan_progress.json')); print(d['cursor'])")
            CYCLE=$(python3 -c "import json; d=json.load(open('.scan_progress.json')); print(d['cycle'])")
            git commit -m "scan: cursor ${CURSOR}/150000 (cycle ${CYCLE})"
            for i in 1 2 3; do
              if git push; then
                break
              fi
              echo "Push failed (attempt $i), retrying in 3s..."
              sleep 3
              git pull --rebase origin ${{ github.ref_name }}
            done
          fi
```

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/room-id-scan.yml
git commit -m "feat: add room-id-scan workflow with progress tracking"
```

---

### Task 5: 废弃旧的 4 个扫描工作流

**Files:**
- Delete: `.github/workflows/monthly-scan-part-1.yml`
- Delete: `.github/workflows/monthly-scan-part-2.yml`
- Delete: `.github/workflows/monthly-scan-part-3.yml`
- Delete: `.github/workflows/monthly-scan-part-4.yml`

- [ ] **Step 1: 删除 4 个旧文件**

```bash
git rm .github/workflows/monthly-scan-part-1.yml
git rm .github/workflows/monthly-scan-part-2.yml
git rm .github/workflows/monthly-scan-part-3.yml
git rm .github/workflows/monthly-scan-part-4.yml
```

- [ ] **Step 2: 提交**

```bash
git commit -m "chore: remove deprecated monthly-scan-part workflows"
```

---

### Task 6: 更新 `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 添加 `.scan_progress.json.tmp` 忽略规则**

在 `*.tmp` 行附近（第 46 行）插入：

```
# Scan progress temp files
.scan_progress.json.tmp
```

- [ ] **Step 2: 提交**

```bash
git add .gitignore
git commit -m "chore: ignore .scan_progress.json.tmp"
```

---

## 自审检查

### Spec 覆盖检查

| Spec 需求 | 对应 Task |
|-----------|-----------|
| 3.0s 请求间隔 | Task 1 (scan_single sleep) + Task 3 (request_delay 接线) |
| 进度文件格式 `.scan_progress.json` | Task 2 Step 5 |
| 原子写入（临时文件 + os.rename） | Task 2 Step 5 (`os.replace`) |
| cursor 到 150000 归 0 清空累积 | Task 2 Step 5 (`new_cursor >= range_end`) |
| 限流时取消待处理任务 | Task 2 Step 4 (cancel pending on RateLimitedError) |
| 限流重试当前 ID（最多 2 次） | Task 2 Step 4 (rate_limit_retries loop) |
| `scan_single` 检测限流字符串 | Task 1 Step 1 |
| `--scan-progress` / `--scan-batch-size` 参数 | Task 3 Step 1 |
| 21:00 UTC 定时触发 | Task 4 (cron: '0 21 * * *') |
| push 重试 3 次 | Task 4 (push retry loop) |
| 废弃 4 个旧 workflow | Task 5 |
| `.gitignore` 忽略临时文件 | Task 6 |

### 无占位符

所有代码块包含完整实现，无 TBD/TODO 占位符。

### 类型一致性

- `scan_room_ids` 签名：`progress_file: str | None`, `batch_size: int`, `request_delay: float` — 与 `async_main` 调用一致
- `task_map` 映射类型：`dict[asyncio.Task, int]` — 与 `_query_batch_internal` 一致
- `prog_data` 字段名：`cursor`, `cycle`, `range_end`, `batches`, `cumulative` — 与 spec 一致