# 日志系统增强 — 机器可读摘要 + 日志文件输出

## 问题

1. 进度条使用 `\r`（回车符）将所有更新写在同一行。`grep -oP` 匹配到该行所有出现，$SUCCESS/$FAILED 变成多行文本，写入 `$GITHUB_OUTPUT` 时报 `Invalid format`，导致 workflow 失败。
2. 当前使用 shell 重定向 `> /tmp/query_output.txt 2>&1` 捕获输出，但文件内容包含 `\r` 原始字符，与终端显示不一致。
3. workflow 通过 `grep '成功: \K\d+'` 猜测结果，日志格式脆弱。

## 方案

### 1. 机器可读摘要行

脚本在所有输出结束时（包括正常结束和 `sys.exit()`），额外输出一行固定格式摘要：

```
RESULT: total=4338 success=4338 failed=0 elapsed=15183.45s
```

格式约束：
- 前缀 `RESULT:` 唯一标识，不会被进度行干扰
- 字段：`total`、`success`、`failed`、`elapsed`（秒）
- 字段间用空格分隔，`key=value` 格式
- 始终输出，即使脚本因错误退出（如 `sys.exit(1)` 之前）

workflow 解析方式：

```bash
RESULT_LINE=$(grep '^RESULT:' /tmp/query_output.txt)
TOTAL=$(echo "$RESULT_LINE" | grep -oP 'total=\K\d+')
SUCCESS=$(echo "$RESULT_LINE" | grep -oP 'success=\K\d+')
FAILED=$(echo "$RESULT_LINE" | grep -oP 'failed=\K\d+')
```

### 2. `--log-file` 参数

新增 `--log-file PATH` 参数：

- 脚本将 stdout 输出同时写入文件和控制台（tee 模式）
- 文件内容与终端输出**基本一致**（`\r` 字符仍存在，但 `cat` 显示时正常）
- `--log-file` 的价值：统一控制日志位置，不依赖 shell 重定向；workflow 命令更简洁
- **注意**：`--log-file` 不解决 `\r` 字符问题。真正解决 workflow 解析问题的是机器可读摘要行（方案 1）

### 修改文件

#### `nju_electric_query.py`

- 新增 `--log-file` 参数
- 实现 tee 输出：`TeeLogger` 类，用 `contextlib.redirect_stdout` + 自身文件写入实现双路输出
- 在 `async_main` 主查询逻辑外包 `try/finally`，`finally` 中输出 `RESULT:` 行
  - 若查询已启动且有结果：输出真实统计
  - 若查询未启动（如参数错误）：输出 `total=0 success=0 failed=0`
- 无需 `atexit`，`try/finally` 覆盖 `sys.exit()` 和正常返回路径

#### `.github/workflows/daily-query.yml`

- 查询命令：`--log-file /tmp/query_output.txt`（替换 shell 重定向 `> /tmp/query_output.txt 2>&1`）
- 解析逻辑：`grep '^RESULT:' /tmp/query_output.txt` 提取字段
- 移除 `cat /tmp/query_output.txt`（脚本自身已输出到控制台）
- 下游步骤引用 `${{ steps.query.outputs.* }}` 逻辑不变

### 错误处理

| 场景 | 行为 |
|------|------|
| `--log-file` 路径不可写 | 打印警告，继续运行（不阻断查询） |
| 脚本正常结束 | 自动输出 `RESULT:` 行 |
| 脚本 `sys.exit(N)` | `atexit` 注册的回调输出 `RESULT:` 行 |
| 未捕获异常 | `atexit` 注册的回调输出 `RESULT:` 行 |
| 信号终止（SIGTERM） | `atexit` 不触发，`RESULT:` 行可能缺失 |