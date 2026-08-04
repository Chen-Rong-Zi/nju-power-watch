# 日志系统增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强日志系统：去除 `\r` 进度条、添加机器可读 `RESULT:` 摘要行、添加 `--log-file` 参数

**Architecture:** 三个独立变更：(1) 两处 `\r` 改为 `\n` (2) 新增 `TeeLogger` 类和 `--log-file` 参数 (3) `try/finally` 包裹 `async_main` 输出 `RESULT:` 行。最后更新 workflow 使用新日志机制

**Tech Stack:** Python 3.11, aiohttp, GitHub Actions

---

### Task 1: 去除 `\r` 进度条，改用 `\n`

**Files:**
- Modify: `nju_electric_query.py:346` 和 `nju_electric_query.py:547`

- [ ] **Step 1: 修改 query_batch 中的进度输出**

将第 346 行：
```python
print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)
```
改为：
```python
print(f"[{completed}/{total}] 成功: {succeeded}, 失败: {failed}")
```

- [ ] **Step 2: 修改 scan_room_ids 中的进度输出**

将第 547 行：
```python
print(f"\r[{processed}/{scan_count}] 新发现: {new_found}", end="", flush=True)
```
改为：
```python
print(f"[{processed}/{scan_count}] 新发现: {new_found}")
```

- [ ] **Step 3: 移除多余的空 print**

第 348-349 行的空 print 原本用于在 `\r` 进度后换行，现在不再需要：
```python
# 删除这两行:
if show_progress:
    print()
```

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "refactor: replace \r progress with \n lines for clean log output"
```

---

### Task 2: 添加 `TeeLogger` 类和 `--log-file` 参数

**Files:**
- Modify: `nju_electric_query.py` (在文件顶部附近添加 TeeLogger 类，在参数列表添加 `--log-file`)

- [ ] **Step 1: 在文件顶部添加 TeeLogger 类**

在 `DEFAULT_COOKIE_FILE` 定义之后（第 25 行后）、`HEADERS` 定义之前，添加：

```python
import contextlib

class TeeLogger:
    """将 stdout/stderr 同时输出到文件和控制台"""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.file = None

    def __enter__(self):
        self.file = open(self.filepath, "w", encoding="utf-8")
        self.stdout_redirect = contextlib.redirect_stdout(self._tee(sys.stdout))
        self.stderr_redirect = contextlib.redirect_stderr(self._tee(sys.stderr))
        self.stdout_redirect.__enter__()
        self.stderr_redirect.__enter__()
        return self

    def __exit__(self, *args):
        self.stderr_redirect.__exit__(*args)
        self.stdout_redirect.__exit__(*args)
        self.file.close()

    def _tee(self, original_stream):
        class TeeStream:
            def __init__(self, file, original):
                self.file = file
                self.original = original
            def write(self, text):
                self.file.write(text)
                self.original.write(text)
            def flush(self):
                self.file.flush()
                self.original.flush()
        return TeeStream(self.file, original_stream)
```

- [ ] **Step 2: 添加 `--log-file` CLI 参数**

在 `async_main` 的参数列表中，`--total-batches` 之后添加：

```python
parser.add_argument("--log-file", type=str, help="日志文件路径（同时输出到文件和控制台）")
```

- [ ] **Step 3: 在 async_main 入口处使用 TeeLogger**

在 `args = parser.parse_args()` 之后、任何其他逻辑之前，添加：

```python
# 日志文件输出
if args.log_file:
    try:
        log_file_path = args.log_file
        # 确保目录存在
        log_dir = os.path.dirname(log_file_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        tee = TeeLogger(log_file_path)
        tee.__enter__()
    except (OSError, IOError) as e:
        print(f"警告: 无法创建日志文件 {args.log_file}: {e}，继续运行但不输出到文件")
```

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add TeeLogger and --log-file parameter for dual output"
```

---

### Task 3: 添加 `RESULT:` 机器可读摘要行

**Files:**
- Modify: `nju_electric_query.py` (在 `async_main` 中包装 `try/finally`，添加 RESULT 输出)

- [ ] **Step 1: 用 try/finally 包裹 async_main 函数体**

将 `async_main` 函数体从 `args = parser.parse_args()` 到结尾，整体缩进到 `try:` 块中。在 `finally:` 中输出 RESULT 行。

修改后的结构：

```python
async def async_main():
    parser = argparse.ArgumentParser(description="南京大学电费查询工具")
    # ... 所有参数定义 ...
    args = parser.parse_args()

    # 日志文件输出
    if args.log_file:
        # ... TeeLogger 初始化和进入 ...

    start_time = time.time()
    summary_data = None
    scan_mode = False
    scan_result = None

    try:
        # ... 原有的所有逻辑（参数验证、扫描模式、查询模式）...
        # 在查询模式末尾，记录 summary_data = summary
        # 在扫描模式末尾，记录 scan_result = result, scan_mode = True
    finally:
        elapsed = time.time() - start_time
        if scan_mode and scan_result:
            print(f"RESULT: scanned={scan_result['scanned']} found={scan_result['found']} skipped={scan_result['skipped']} errors={scan_result['total_errors']} elapsed={elapsed:.2f}s")
        elif summary_data:
            print(f"RESULT: total={summary_data['total']} success={summary_data['succeeded']} failed={summary_data['failed']} elapsed={elapsed:.2f}s")
        else:
            print(f"RESULT: total=0 success=0 failed=0 elapsed={elapsed:.2f}s")

        # 如果在 try 中使用了 TeeLogger，在这里退出
        if args.log_file and 'tee' in dir():
            tee.__exit__(None, None, None)
```

- [ ] **Step 2: 具体实现——修改 async_main 的结构**

`async_main` 当前以 `args = parser.parse_args()` 开始（第 676 行），以 `sys.exit(1)` 或 `return` 结束。

需要做以下修改：
1. 在 `start_time = time.time()` 之前，已有的两个 `start_time` 赋值（第 744 行扫描模式、第 778 行查询模式）会被统一到 `try` 块开头的 `start_time = time.time()`（注意不要重复定义）
2. 将 `summary = await query_batch(...)` 的结果赋值给外部变量 `summary_data = await query_batch(...)`
3. 将 `result = await scan_room_ids(...)` 的结果赋值给外部变量 `scan_result = result; scan_mode = True`
4. 将所有 `return` 替换为 `break` 或直接落到 `finally`（`finally` 在 `return` 前执行，所以 `return` 可以保留）
5. 将所有 `sys.exit(1)` 保留（`finally` 在 `sys.exit()` 前执行）

**关键：`finally` 在 `sys.exit()` 和 `return` 之前执行**，所以不需要移除退出语句，`finally` 中的 RESULT 行总会输出。

实际修改：

```python
async def async_main():
    parser = argparse.ArgumentParser(description="南京大学电费查询工具")
    # ... 参数定义（保持不变）...
    args = parser.parse_args()

    # 日志文件输出
    tee = None
    if args.log_file:
        try:
            log_dir = os.path.dirname(args.log_file)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            tee = TeeLogger(args.log_file)
            tee.__enter__()
        except (OSError, IOError) as e:
            print(f"警告: 无法创建日志文件 {args.log_file}: {e}，继续运行但不输出到文件")

    start_time = time.time()
    summary_data = None
    scan_result = None
    scan_mode = False

    try:
        # 原有的参数验证代码（保持不变）
        if args.batch_size <= 0:
            print("错误: --batch-size 必须大于 0")
            sys.exit(1)
        # ... 其余验证 ...

        # 扫描模式（修改）
        if args.scan:
            # ... 起始验证（保持不变）...
            scan_result = await scan_room_ids(start_id, end_id, cookies, args.scan_output, max_concurrent, show_progress)
            scan_mode = True
            # 删除原有的 return（让代码落到 finally）
            return  # finally 会在 return 前执行，可以保留

        # 正常查询模式（修改）
        # ... 验证（保持不变）...
        summary_data = await query_batch(...)
        # ... 原有的 summary 输出（保持不变）...
        # 删除原有的 sys.exit(1) 在成功率低于 90% 处，或保留（finally 会在 exit 前执行）
    finally:
        elapsed = time.time() - start_time
        if scan_mode and scan_result:
            print(f"RESULT: scanned={scan_result['scanned']} found={scan_result['found']} skipped={scan_result['skipped']} errors={scan_result['total_errors']} elapsed={elapsed:.2f}s")
        elif summary_data:
            print(f"RESULT: total={summary_data['total']} success={summary_data['succeeded']} failed={summary_data['failed']} elapsed={elapsed:.2f}s")
        else:
            print(f"RESULT: total=0 success=0 failed=0 elapsed={elapsed:.2f}s")

        if tee:
            tee.__exit__(None, None, None)
```

- [ ] **Step 3: 删除旧的 start_time 赋值**

第 744 行的 `start_time = time.time()` 和 第 778 行的 `start_time = time.time()` 需要删除，因为 `start_time` 已经在 `try` 块之前统一赋值了。

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add RESULT machine-readable summary line with try/finally guard"
```

---

### Task 4: 更新 workflow 使用新日志机制

**Files:**
- Modify: `.github/workflows/daily-query.yml`

- [ ] **Step 1: 更新查询命令**

将 `>> /tmp/query_output.txt 2>&1` 替换为 `--log-file /tmp/query_output.txt`，移除 `cat` 命令：

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
      --log-file /tmp/query_output.txt \
      -d ./database

    RESULT_LINE=$(grep '^RESULT:' /tmp/query_output.txt)
    echo "RESULT_LINE=$RESULT_LINE"
    TOTAL=$(echo "$RESULT_LINE" | grep -oP 'total=\K\d+')
    SUCCESS=$(echo "$RESULT_LINE" | grep -oP 'success=\K\d+')
    FAILED=$(echo "$RESULT_LINE" | grep -oP 'failed=\K\d+')
    echo "success_count=$SUCCESS" >> $GITHUB_OUTPUT
    echo "failed_count=$FAILED" >> $GITHUB_OUTPUT
    echo "total_count=$TOTAL" >> $GITHUB_OUTPUT

    if [ "$SUCCESS" -eq 0 ]; then
      echo "::error::All queries failed ($FAILED rooms)"
      exit 1
    elif [ "$FAILED" -gt 0 ]; then
      echo "::warning::$FAILED rooms failed, $SUCCESS succeeded — continuing with partial results"
    fi
```

- [ ] **Step 2: 更新 Summary 步骤中的失败原因统计**

将 `awk '/--- 失败原因统计 ---/{flag=1} flag' /tmp/query_output.txt` 改为 `awk '/^--- 失败原因统计 ---/{flag=1} /^RESULT:/{flag=0} flag' /tmp/query_output.txt`，避免 RESULT 行被包含：

```bash
awk '/^--- 失败原因统计 ---/{flag=1} /^RESULT:/{flag=0} flag' /tmp/query_output.txt 2>/dev/null >> $GITHUB_STEP_SUMMARY || true
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: use --log-file and parse RESULT line in workflow"
```

---

### Task 5: 本地验证

- [ ] **Step 1: 运行快速测试确认语法正确**

```bash
python3 -c "import ast; ast.parse(open('nju_electric_query.py').read()); print('Syntax OK')"
```

- [ ] **Step 2: 测试 --help 输出包含新参数**

```bash
python3 nju_electric_query.py --help 2>&1 | grep -E "log-file|RESULT"
```

- [ ] **Step 3: 测试 --log-file 实际写入**

```bash
python3 nju_electric_query.py --log-file /tmp/test_log.txt 53463 2>&1 || true
cat /tmp/test_log.txt | grep "RESULT:"
```