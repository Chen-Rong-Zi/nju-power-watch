# Query Error Handling and Success Threshold

## 问题

1. **`| tee` 吞掉了 Python 的退出码**：`python ... 2>&1 | tee query_output.log` 中 bash 只取管道最后一条命令的退出码，Python 的 `sys.exit(1)` 不会传递到 workflow
2. **阈值不合理**：当前 `failed >= succeeded` 才退出，意味着 50% 失败才算失败。实际 4,307/16,864（25.5%）成功也应该失败
3. **错误原因未输出到 GitHub Actions**：Python 内部已有按 error_type 分类的统计，但 workflow 的 Step Summary 中没有展示

## 改动

### 1. Python 脚本：阈值改为 90%，失败统计始终输出

`nju_electric_query.py` 中 `async_main` 末尾：

```python
# 当前:
if summary['failed'] >= summary['succeeded']:
    sys.exit(1)

# 改为:
success_rate = summary['succeeded'] / summary['total'] if summary['total'] > 0 else 0
if success_rate < 0.9:
    print(f"错误: 成功率 {success_rate:.1%} ({summary['succeeded']}/{summary['total']}) 低于 90% 阈值")
    sys.exit(1)
```

同时移除失败统计的 `if show_progress:` 守卫，让错误分类明细在安静模式下也输出：

```python
# 当前 (line 725-726):
if summary['failed'] > 0:
    if show_progress:
        print("\n--- 失败原因统计 ---")

# 改为:
if summary['failed'] > 0:
    print("\n--- 失败原因统计 ---")
```

### 2. Workflow：修复管道退出码

`daily-query.yml` 的 Query 步骤开头加 `set -o pipefail`：

```yaml
run: |
  set -o pipefail
  python nju_electric_query.py \
    ...
```

### 3. Workflow：输出错误分类到 Step Summary

在 Summary 步骤中追加失败原因统计（从 `query_output.log` 中提取）。
`$FAILED` 已在 Summary 步骤开头定义（`FAILED=${{ steps.query.outputs.failed_count }}`）：

```yaml
      - name: Summary
        if: always()
        run: |
          SUCCESS=${{ steps.query.outputs.success_count }}
          FAILED=${{ steps.query.outputs.failed_count }}
          TOTAL=$((SUCCESS + FAILED))
          ...
          if [ "$FAILED" -gt 0 ]; then
              echo "**Failed Rooms**: $FAILED" >> $GITHUB_STEP_SUMMARY
              echo "" >> $GITHUB_STEP_SUMMARY
              echo "**Failure Breakdown:**" >> $GITHUB_STEP_SUMMARY
              echo '```' >> $GITHUB_STEP_SUMMARY
              awk '/--- 失败原因统计 ---/{flag=1} flag' query_output.log 2>/dev/null>> $GITHUB_STEP_SUMMARY || true
              echo '```' >> $GITHUB_STEP_SUMMARY
          fi
```

注意：使用 `awk` 而非 `sed`，因为 `sed` 的区间结束模式 `/^---/` 会和区间起始行 `--- 失败原因统计 ---` 匹配在同一行，导致只输出标题行。

## 验证

1. 本地运行 `python nju_electric_query.py -q -d ./database ...` 检查失败统计是否输出, 注意请你使用一个错误的cookie, 不要真正地请求资源
2. 验证 `awk '/--- 失败原因统计 ---/{flag=1} flag' query_output.log` 能正确提取错误分类
3. 确认 `set -o pipefail` 后 Python 的 `sys.exit(1)` 能正确传递到 workflow

## 影响范围

| 文件 | 改动 |
|------|------|
| `nju_electric_query.py` | 2 处：阈值条件 + 移除 `if show_progress:` 守卫 |
| `.github/workflows/daily-query.yml` | 2 处：`set -o pipefail` + Summary 补充 |
