# 日志系统增强 — 机器可读摘要 + 日志文件输出

## 问题

1. 进度条使用 `\r`（回车符）将所有更新写在同一行。`grep -oP` 匹配到该行所有出现，$SUCCESS/$FAILED 变成多行文本，写入 `$GITHUB_OUTPUT` 时报 `Invalid format`，导致 workflow 失败。
2. 当前使用 shell 重定向 `> /tmp/query_output.txt 2>&1` 捕获输出，但文件内容包含 `\r` 原始字符，与终端显示不一致。
3. workflow 通过 `grep '成功: \K\d+'` 猜测结果，日志格式脆弱。

## 方案

### 0. 去除 `\r` 进度条

将进度输出从 `\r`（回车覆盖）改为 `\n`（逐行输出）：

```python
# 修改前
print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)

# 修改后
print(f"[{completed}/{total}] 成功: {succeeded}, 失败: {failed}")
```

影响的两处：
- `query_batch` 中的查询进度
- 扫描模式进度

变更后，每行进度独立一行，日志文件干净可读，`grep` 不会出现多匹配问题。

### 1. 机器可读摘要行

脚本在所有输出结束时（包括正常结束、`sys.exit()`、未捕获异常），输出一行固定格式摘要：

```
RESULT: total=4338 success=4338 failed=0 elapsed=15183.45s
```

格式约束：
- 前缀 `RESULT:` 唯一标识，不会被进度行干扰
- 字段：`total`、`success`、`failed`、`elapsed`（秒）
- 字段间用空格分隔，`key=value` 格式
- **始终输出**，不受 `--quiet` 影响
- 查询模式和扫描模式都输出。扫描模式：`RESULT: scanned=1000 found=50 skipped=10 errors=2 elapsed=120.5s`

workflow 解析方式：

```bash
RESULT_LINE=$(grep '^RESULT:' /tmp/query_output.txt)
TOTAL=$(echo "$RESULT_LINE" | grep -oP 'total=\K\d+')
SUCCESS=$(echo "$RESULT_LINE" | grep -oP 'success=\K\d+')
FAILED=$(echo "$RESULT_LINE" | grep -oP 'failed=\K\d+')
```

### 2. `--log-file` 参数

新增 `--log-file PATH` 参数：

- 脚本将 stdout + stderr 同时写入文件和控制台（tee 模式）
- 配合 `\r` 去除后，日志文件内容与终端输出完全一致，干净可读
- 统一控制日志位置，不依赖 shell 重定向；workflow 命令更简洁

### 修改文件

#### `nju_electric_query.py`

- 新增 `--log-file` 参数
- 实现 tee 输出：`TeeLogger` 类，用 `contextlib.redirect_stdout` + `contextlib.redirect_stderr` + 自身文件写入实现双路输出
- `try/finally` 包裹 `async_main` **整个函数体**（包括参数验证），确保所有退出路径都输出 `RESULT:` 行
  - 若查询正常完成：输出真实统计
  - 若参数错误或早期退出：输出 `total=0 success=0 failed=0 elapsed=0.00s`

#### `.github/workflows/daily-query.yml`

- 查询命令：`--log-file /tmp/query_output.txt`（替换 shell 重定向 `> /tmp/query_output.txt 2>&1`）
- 解析逻辑：`grep '^RESULT:' /tmp/query_output.txt` 提取字段
- 移除 `cat /tmp/query_output.txt`（脚本自身已输出到控制台）
- 下游步骤引用 `${{ steps.query.outputs.* }}` 逻辑不变

### 错误处理

| 场景 | 行为 |
|------|------|
| `--log-file` 路径不可写 | 打印警告，继续运行（不阻断查询） |
| 脚本正常结束 | `try/finally` 输出 `RESULT:` 行 |
| 脚本 `sys.exit(N)` | `try/finally` 覆盖，输出 `RESULT:` 行 |
| 未捕获异常 | `try/finally` 覆盖，输出 `RESULT:` 行 |
| 信号终止（SIGTERM/SIGKILL） | `finally` 不触发，`RESULT:` 行可能缺失 |