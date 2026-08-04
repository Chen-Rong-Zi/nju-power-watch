# 限流对抗策略 v2 — 低速单线程 + 3 批次

## 问题

每日电费查询工作流触发 epay 服务器限流（额度约 28 次/会话/60 分钟），返回"查询已被限制，请60分钟后再试"。当前方案（3 并发 + 0.3s 间隔 + 6 批次）仍会触发限流，因为突发速率过高，在几秒内耗尽配额。

## 根因分析

- 限流类型：**有额度限流**（服务器允许一定量请求，超限后封锁 60 分钟）
- 每次会话/60 分钟窗口的配额约 **28 次请求**
- 3 并发 + 0.3s 间隔 = 10 req/s，约 3 秒内烧光配额

## 设计目标

- **稳定优先**：绝不触发限流，或触发后能自愈
- **合理速度**：不限流情况下 21 小时完成全量查询
- **保持简单**：不引入多账号、代理等复杂机制

## 架构

```
                    config/room_ids.json (17,349 rooms)
                              │
                    按 --batch-index 切分为 3 批
                    切分方式: math.ceil(17349/3) = 5783 间/批
                    ┌──────────┬──────────┬──────────┐
                    │    0     │    1     │    2     │
                    ├──────────┼──────────┼──────────┤
                    │  0-5782  │ 5783-11565│11566-17348│
                    └────┬─────┴─────┬────┴─────┬────┘
                         │           │          │
                    ┌────┘           │          └────┐
                    ▼                ▼               ▼
               cron: 0 0  * * *  0 8  * * *  0 16 * * *
                 00:00 UTC        08:00 UTC     16:00 UTC
                 批次 0            批次 1         批次 2

## 参数设计

| 参数 | 当前值 | 新值 | 说明 |
|------|--------|------|------|
| 总批次数 | 6 | **3** | 减少批次，拉长单次窗口 |
| 并发数 | 3 | **1** | 单线程，避免突发 |
| 请求间隔 | 0.3s | **3s** | 0.33 req/s，极低速 |
| 子批次大小 | 100 | **100** | 不变 |
| 子批次间隔 | 30s | **30s** | 不变 |
| 工作流超时 | 130min | **480min** | 为限流恢复留余量 |

## 耗时估算

```
每批 5,783 间
请求耗时: 5,783 × 3s = 17,349s = 289 分钟
批间隔:  57 × 30s = 1,710s = 29 分钟
每批运行时长: 318 分钟 ≈ 5 小时 18 分

调度窗口（3 批独立并行运行，每批在各自 runner 上执行）:
  批次 0 (00:00-05:18)    5,783 间
  批次 1 (08:00-13:18)    5,783 间
  批次 2 (16:00-21:18)    5,783 间

最后一批完成时间: ~21:18 UTC
全量查询用时: ~21 小时（从 00:00 到 21:18）
```

## 限流恢复

- 如果某子批次触发限流，等待 60 分钟后**只重试被限流的房间**（已成功的房间不会被重复查询）
- 每子批次最多重试 2 次（即初始查询 + 最多 2 次限流恢复，共 3 次尝试机会）
- 2 次重试都触发限流 → 该子批次的剩余房间标记为失败，继续下一子批次
- 失败批次的数据会在第二天补跑（第二天相同批次会被重新调度，覆盖前一天的未完成数据）

## 查询脚本修改

### `nju_electric_query.py`

**参数调整：**
- `DEFAULT_CONCURRENCY = 3` → **1**
- `--total-batches` 默认值 6 → **3**
- `--request-delay` 默认值 0.3 → **3.0**

**批次切分逻辑（已有，参数已变）：**
```python
# 按 batch_index 将 room_ids 均匀切分
batch_size = math.ceil(len(room_ids) / total_batches)  # ceil(17349/3) = 5783
start = batch_index * batch_size
end = min(start + batch_size, len(room_ids))
room_ids = room_ids[start:end]  # batch 0: [0:5783], batch 1: [5783:11566], batch 2: [11566:17349]
```

**`query_batch` 增加限流恢复逻辑：**

当前 `query_batch` 在 `_query_batch_internal` 返回 `RateLimitedError` 时已取消待处理任务并标记为 `rate_limited`。在此基础上增加：

1. 统计当前子批次中 `rate_limited` 的数量
2. 如果 `rate_limited > 0`，打印等待信息，`await asyncio.sleep(3600)` 后重试该子批次
3. 最多重试 2 次
4. 重试仍失败则跳过该子批次

```python
# 修改 query_batch 中子批次循环逻辑
for i in range(0, total, batch_size):
    batch = room_ids[i:i + batch_size]
    retries = 0
    max_retries = 2

    while retries <= max_retries:
        results = await _query_batch_internal(
            batch, cookies, output_dir, show_progress,
            max_concurrent, request_delay, session
        )

        # 检查是否有 rate_limited
        rate_limited_rooms = [
            r for r in results
            if not r["success"] and r.get("error_type") == "rate_limited"
        ]

        # 先处理所有非限流结果
        for result in results:
            if result["success"]:
                succeeded += 1
                if output_dir:
                    await save_result(result, output_dir, quiet=not show_progress)
            elif result.get("error_type") != "rate_limited":
                # 非限流的失败（如 auth_failed, room_not_found）直接计数
                failed += 1

        if not rate_limited_rooms:
            # 无限流，当前子批次完成
            break

        # 只重试被限流的房间
        retries += 1
        if retries > max_retries:
            # 超过重试次数，标记为失败
            failed += len(rate_limited_rooms)
            break

        batch = [r["id"] for r in rate_limited_rooms]
        print(f"\n[限流] 检测到 {len(rate_limited_rooms)} 个限流，等待 3600s 后重试...")
        await asyncio.sleep(3600)
```

### `daily-query.yml`

**调度改为 3 个：**

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

**超时改为 360 分钟：**

```yaml
timeout-minutes: 360
```

**查询命令调整：**

```yaml
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
  -q
```

## 安全降级

- 如果某子批次连续 2 次重试都触发限流，该子批次标记为失败，继续下一批
- 如果某批次整体失败，其他 2 个批次不受影响
- 工作流超时 480 分钟：限流等待（60 分 × 2 次 = 120 分）预留充足
- 失败批次的数据会在第二天补跑

## 回滚方案

如需回滚到旧版本：
1. 回退 `nju_electric_query.py` 到旧版本
2. 回退 `daily-query.yml` 到旧版本（单 schedule + 200 并发）