# 限流对抗策略 v3 — 链式批次调度

## 问题

单批次查询 17,349 间房时，3s 请求间隔（安全速率）需要 ~17 小时，但 GitHub Actions 每 run 最多 360 分钟。单个 workflow run 无法装下全部查询。

## 方案

**链式批次调度：将房间分 N 批，每批独立 workflow run，最后一步触发下一批。**

```
06:00 UTC 定时触发
      │
      ▼
  第 1 批 (rooms[0:4338])  →  4.2h  →  gh workflow run 触发第 2 批
                                              │
                                              ▼
                                          第 2 批 (rooms[4338:8675])  →  4.2h  →  gh workflow run 触发第 3 批
                                                                              │
                                                                              ▼
                                                                          第 3 批 (rooms[8675:13013])  →  4.2h  →  gh workflow run 触发第 4 批
                                                                                                          │
                                                                                                          ▼
                                                                                                      第 4 批 (rooms[13013:])  →  4.2h  →  生成全局统计 → 结束
```

## 参数

| 参数 | 值 | 说明 |
|------|------|------|
| 请求间隔 | 3.0s | 0.33 req/s，已验证安全 |
| 并发数 | 1 | 单线程，无突发 |
| 总批次 | 4 | 每批 ~4,338 间 |
| 每批预算 | 5h | 留 1h 缓冲，< 6h 限额 |
| 子批次大小 | 100 | 仅用于进度显示和重试粒度 |
| 限流重试 | 最多 2 次，每次 60 分钟 | 只重试被限流的房间 |

## 耗时估算

```
每间房: 3.0s (延迟) + 0.5s (HTTP) = 3.5s
每批: 4,338 间 × 3.5s = 4.2h  (≈ 15,183s / 3600)
总耗时: 4 × 4.2h = ~17h
```

## 架构

### 1. 房间切片逻辑

`nju_electric_query.py` 增加 `--batch-index` 和 `--total-batches` 参数：

```
输入: rooms = [r1, r2, ..., r17349], total_batches=4, batch_index=N
输出: chunk_size = ceil(17349 / 4) = 4338
      batch 1: rooms[0:4338]
      batch 2: rooms[4338:8675]
      batch 3: rooms[8675:13013]
      batch 4: rooms[13013:]
```

切片在读取 `config/room_ids.json` 后、开始查询前执行。脚本只查询切片范围内的房间。

### 2. 跨批次状态追踪

每批完成后，维护 `database/.batch_run_summary.json` 追踪累计统计：

```json
{
  "date": "2026-08-04",
  "total_batches": 4,
  "batches": {
    "1": { "success": 4330, "failed": 8 },
    "2": { "success": 4335, "failed": 2 }
  },
  "cumulative": { "success": 8665, "failed": 10 }
}
```

- **第 1 批**：创建文件，写入本批结果，提交
- **第 2-3 批**：读取文件，追加本批结果，更新累计，提交
- **第 4 批（最后一批）**：读取文件，追加本批结果，生成最终 Summary，删除该文件，提交

文件通过 git 提交传递，每批都能看到之前批次的累计数据。

### 3. 链式触发

每批没有滚动提交步骤，查询完成后：
1. `git add/commit` 原始数据
2. 运行聚合脚本
3. `git add/commit` 摘要
4. 如果不是最后一批：`gh workflow run <workflow> -f batch_index=N+1 -f total_batches=4`
5. 如果是最后一批：生成最终统计到 `$GITHUB_STEP_SUMMARY`

### 4. 最终统计

最后一批完成后，生成全局统计：

```
## 全批次查询汇总 (2026-08-04)

| 批次 | 成功 | 失败 |
|------|------|------|
| 1 | 4330 | 8 |
| 2 | 4335 | 2 |
| 3 | 4332 | 5 |
| 4 | 4337 | 0 |
| **合计** | **17334** | **15** |

失败原因分布:
- 超时: 10
- 连接错误: 5
```

### 5. 错误处理

| 场景 | 行为 |
|------|------|
| 某批限流 | 批次内重试 2 次（60 分钟等待），成功或耗尽后继续 |
| 某批失败 | 该批失败，不影响链式触发（失败也要触发下一批，否则链断裂） |
| 链式触发失败 | 重试 3 次（3s 间隔），仍失败则创建 Issue 标记断链位置，手动触发后续批次 |
| 全部失败 | 最后一批生成全部失败的统计，创建 Issue |

### 6. 定时调度

- `cron: 0 6 * * *`（6am UTC = 14:00 CST）
- 定时触发默认 `batch_index=1, total_batches=4`
- 最后一批约 22:48 UTC 完成

## 修改文件

### `nju_electric_query.py`
- 增加 `--batch-index` 参数（默认 1）
- 增加 `--total-batches` 参数（默认 1）
- `--request-delay` 默认值: 3.0
- 读取 `--from-mapping` 后，按 batch 切片过滤房间列表

### `.github/workflows/daily-query.yml`
- `schedule` 改为 `0 6 * * *`
- `workflow_dispatch` 增加 `batch_index` 和 `total_batches` 输入
- 查询命令: `-c 1 --batch-size 100 --request-delay 3.0 --batch-index N --total-batches 4`
- 最后一步：链式触发下一批或生成最终统计
- 新增 `database/.batch_run_summary.json` 的提交步骤