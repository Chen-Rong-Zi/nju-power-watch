# Room ID 扫描限流适配设计

## 问题

房间 ID 扫描（`--scan` 模式）目前没有速率限制，工作流使用 `-c 200` 并发扫描，触发 epay 服务器限流。同时，扫描工作流（`monthly-scan-part-*.yml`）与每日查询工作流（`daily-query.yml`）共用同一分支，需要避免推送冲突。

## 约束

- 请求间隔：**3.0s**（固定，不动态调整）
- 扫描范围：**1-150,000**
- 单次 workflow run 时长：**~2.5h**（为登录和 push 重试留 ~1h 缓冲）
- 每批处理 ID 数：**3,000 个**（2.5h ÷ 3.0s/req = 3,000 req）
- 调度时间：**21:00 UTC**（daily query 18:00 UTC 结束，3h 缓冲）
- 并发数：**1**

## 方案

**进度追踪式扫描：每天 21:00 UTC 触发，每次从上次位置继续扫描 3,000 个 ID，到终点后绕回。**

### 进度文件格式

`scan_progress.json`：

```json
{
  "cycle": 1,
  "date": "2026-08-06",
  "range_start": 1,
  "range_end": 150000,
  "cursor": 3000,
  "batch_size": 3000,
  "batches": {
    "1": { "scanned": 3000, "found": 518, "failed": 0, "date": "2026-08-06", "cycle": 1 }
  },
  "cumulative": { "scanned": 3000, "found": 518, "failed": 0 }
}
```

| 字段 | 说明 |
|------|------|
| `cycle` | 当前轮次，cursor 归 0 时 +1 |
| `cursor` | 当前扫描位置，0 表示从头开始 |
| `range_start` / `range_end` | 扫描范围，固定 1-150000 |
| `batch_size` | 每批扫描 ID 数，固定 3000 |
| `batches` | 每批记录，key 为自增序号，cursor 归 0 时清空 |
| `cumulative` | 本轮累计统计，cursor 归 0 时重置 |

**原子写入：** 进度文件先写入临时文件 `scan_progress.json.tmp`，然后 `os.replace()` 覆盖原文件，防止写入过程中崩溃导致损坏。

### `--scan` 与 `--scan-progress` 的交互

- `--scan` 定义绝对范围，用于初始化进度文件的 `range_start` / `range_end`
- **进度文件中的 `cursor` 优先级最高**，决定实际扫描起始位置
- 如果进度文件已存在，`--scan` 的 `range_end` 参数仅用于验证：若不一致则打印警告，以进度文件为准
- 如果进度文件不存在，用 `--scan` 的参数创建新进度文件

### 限流处理（关键设计）

**复用 `_query_batch_internal` 的模式：** 检测到 `RateLimitedError` 时取消所有待处理任务，只重试当前 ID，当前 batch 的剩余 ID 留到下次触发。

```
scan_room_ids():
  1. 计算扫描区间 start → end
  2. 生成 ids_to_scan（跳过已知 ID）
  3. 逐个创建任务，用 task_map 维护 task→room_id 映射

     for room_id in ids_to_scan:
         if rate_limited: break
         task = create_task(scan_single(room_id))
         task_map[task] = room_id
         pending.add(task)

     # 用 asyncio.wait(FIRST_COMPLETED) 等待任务完成
     while pending and not rate_limited:
         done, pending = await asyncio.wait(pending, FIRST_COMPLETED)
         for task in done:
             try:
                 await task  # 成功结果已在 scan_single 内部处理
             except RateLimitedError:
                 rate_limited = True
                 rate_limited_id = task_map[task]
                 cancel_all(pending)    # 取消剩余任务
                 wait 3600s
                 retry rate_limited_id  # 只重试被限流的 ID（最多 2 次）
                 break

  4. 保存进度（cursor 更新为已扫描的最后一个 ID）
  5. 未扫描的 ID 留到下次触发时处理
```

这与 `_query_batch_internal` 一致：限流时取消待处理任务，只重试被限流的 ID，不级联影响其他 ID。

### `scan_single()` 的限流检测

在现有检查之后增加（`"login"` 检查之后、`parse_html` 之前）：

```python
# 检查限流响应
if "查询已被限制" in html or "请60分钟后再试" in html:
    raise RateLimitedError("查询已被限制，请60分钟后再试")
```

放在 `"房间查询失败"` 和 `"login"` 检查之后、`parse_html` 之前。这样限流响应不会被错误归类为"解析失败"。

### 扫描逻辑

```
1. 加载 config/room_ids.json（已有 ID 集）
2. 加载 scan_progress.json
   ├─ 不存在 → 用 --scan 参数创建默认
   └─ 存在   → 读取 cursor，以进度文件为准
3. 计算扫描区间:
   start = cursor + 1
   end   = min(cursor + batch_size, range_end)
4. 扫描 start → end:
   ├─ 跳过已在 config/room_ids.json 中的 ID
   ├─ 对未知 ID 发起请求（3.0s 间隔，1 并发）
   └─ 遇限流 → 取消待处理任务 → 等 3600s → 重试当前 ID（最多 2 次）
5. 更新进度:
   cursor = (end >= range_end) ? 0 : end
   cycle  = (cursor == 0) ? cycle + 1 : cycle
   cursor 归 0 时清空 batches 和 cumulative
6. 原子写入 scan_progress.json（临时文件 + os.replace）
7. 输出 RESULT 行
```

### 时间线

```
Daily query chain:
  06:00 → batch 1 (~3h → 09:00)
  09:00 → batch 2 (~3h → 12:00)
  12:00 → batch 3 (~3h → 15:00)
  15:00 → batch 4 (~3h → 18:00)
                             18:00 daily query 完成
                             21:00 scan 开始
                             21:00-23:30 scan 运行 (2.5h)
                             23:30 完成，无冲突
```

首次全量扫描（1-150,000）：
- 150,000 ÷ 3,000 = **50 天**
- 每天 2.5h，不影响 daily query

cursor 到 150,000 后归 0 开始新一轮：
- 大部分 ID 已知，跳过
- 只对新增房间的 ID 发起请求
- 通常秒级到数分钟完成

### 对 `nju_electric_query.py` 的修改

#### 新增参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--scan-progress` | str | 无 | 进度文件路径 |
| `--scan-batch-size` | int | 3000 | 每批扫描 ID 数 |

#### 改动函数

**`scan_room_ids()`** 新增参数：
- `progress_file: str` — 进度文件路径
- `batch_size: int` — 每批 ID 数
- `request_delay: float` — 请求间隔

**`scan_room_ids()`** 内部逻辑改为：
- 逐个创建任务，遇限流取消待处理任务（复用 `_query_batch_internal` 模式）
- `async_main` 将 `--request-delay` 值传递给 `scan_room_ids`

**`scan_single()`** 内部函数新增：
- `await asyncio.sleep(request_delay)` — 每次请求后等待（在信号量块内，确保延迟生效）
- `"查询已被限制"` / `"请60分钟后再试"` 检测 → 抛出 `RateLimitedError`

#### 信号处理器

信号处理器同时保存 `config/room_ids.json` 和 `scan_progress.json`，确保中断后可恢复。

#### 不变的部分

- `scan_single()` 的 HTML 解析逻辑
- `config/room_ids.json` 的读写
- `parse_html()` 函数
- 房间名去重逻辑

### 错误处理

| 场景 | 行为 |
|------|------|
| 限流 | 取消待处理任务，等待 3600s，重试当前 ID，最多 2 次 |
| HTTP 错误 | 指数退避重试，最多 5 次 |
| 网络超时 | 指数退避重试，最多 5 次 |
| 房间不存在 | 永久错误，跳过 |
| 认证失败 | 永久错误，跳过 |
| 进度文件损坏 | 打印警告，从 cursor=0 重新开始 |
| 进度文件写入崩溃 | 临时文件机制确保不会损坏已存在的进度文件 |
| 工作流超时 | 已发现的 ID 已保存到 mapping，下次自动跳过 |
| push 冲突 | `git pull --rebase` 后重试，最多 3 次 |

### 工作流

新建 `.github/workflows/room-id-scan.yml`，废弃 `monthly-scan-part-*.yml`。

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
        default: 'scan_progress.json'

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
            --scan-progress scan_progress.json \
            --scan-batch-size 3000 \
            -c 1 --request-delay 3.0 \
            --cookie-file /tmp/cookie.json

      - name: Commit and push
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          if git diff --name-only | grep -qE 'config/room_ids\.json|scan_progress\.json'; then
            CURSOR=$(python3 -c "import json; d=json.load(open('scan_progress.json')); print(d['cursor'])")
            CYCLE=$(python3 -c "import json; d=json.load(open('scan_progress.json')); print(d['cycle'])")
            PUSHED=0
            for i in 1 2 3; do
              git add config/room_ids.json scan_progress.json
              git commit -m "scan: cursor ${CURSOR}/150000 (cycle ${CYCLE})" || true
              if git push; then
                PUSHED=1
                break
              fi
              echo "Push failed (attempt $i), retrying in 3s..."
              sleep 3
              git pull --rebase origin ${{ github.ref_name }}
            done
            if [ "$PUSHED" -eq 0 ]; then
              echo "::error::All push attempts failed"
              exit 1
            fi
          fi
```

### 废弃的文件

- `.github/workflows/monthly-scan-part-1.yml`
- `.github/workflows/monthly-scan-part-2.yml`
- `.github/workflows/monthly-scan-part-3.yml`
- `.github/workflows/monthly-scan-part-4.yml`