# 爬虫限流对抗策略设计

## 问题

每日电费查询工作流因并发过高（200）触发 epay 服务器限流，返回"查询已被限制，请60分钟后再试"，导致 17,349 个房间中仅 28 个查询成功（成功率 0.2%）。

## 设计目标

- **稳定优先**：避免触发限流，而非触发后补救
- **自愈能力**：限流后能自动恢复，不丢失数据
- **无单点故障**：单个批次失败不影响其他批次
- **保持简单**：不引入多账号、代理等复杂机制

## 架构

```
                    config/room_ids.json (17,349 rooms)
                              │
                    查询脚本按 --batch-index 切分
                    ┌─────┬─────┬─────┬─────┬─────┬─────┐
                    │ 0   │ 1   │ 2   │ 3   │ 4   │ 5   │
                    ├─────┼─────┼─────┼─────┼─────┼─────┤
                    │~2891│~2891│~2891│~2891│~2891│~2891│
                    └──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┘
                       │     │     │     │     │     │
                 ┌─────┘     │     │     │     │     └─────┐
                 ▼           ▼     ▼     ▼     ▼           ▼
              00:00       04:00  08:00  12:00  16:00      20:00 UTC
              ┌───────────────────────────────────────────────┐
              │        同一 daily-query.yml, 6 个 schedule     │
              │    每个独立运行, 根据 UTC 小时算出自身批次编号   │
              └───────────────────────────────────────────────┘
                       │     │     │     │     │
                       │     │     │     │     │
                       ▼     ▼     ▼     ▼     ▼
              ┌───────────────────────────────────────────────┐
              │  每批内部:                                     │
              │    小批量 100 间 → 3 并发 → 批间 30s 延迟     │
              │    小批量 100 间 → 3 并发 → 批间 30s 延迟     │
              │    检测到限流 → 等 60 分钟 → 重试当前小批量    │
              └───────────────────────────────────────────────┘
```

## 修改清单

### 1. `nju_electric_query.py` — 核心修改

#### 1a. 新增 RateLimitedError 异常

```python
class RateLimitedError(Exception):
    """服务器返回限流响应时抛出，触发上层批量重试"""
    pass
```

#### 1b. `query_single_with_retry` 增加限流检测

在现有响应检测逻辑中增加：

```python
# 检查限流响应
if "查询已被限制" in html or "请60分钟后再试" in html:
    raise RateLimitedError("查询已被限制，请60分钟后再试")
```

放在现有检查之后（"房间查询失败"、"login"检查之后），在 `parse_html` 之前。这样限流响应不会被错误归为"解析失败"。

#### 1c. 新增可配置参数

```python
parser.add_argument("--batch-size", type=int, default=100, help="小批量大小（默认 100）")
parser.add_argument("--batch-delay", type=int, default=30, help="小批量间延迟秒数（默认 30）")
parser.add_argument("--rate-limit-wait", type=int, default=3600, help="限流后等待秒数（默认 3600）")
parser.add_argument("--request-delay", type=float, default=0.3, help="请求间最小间隔秒数（默认 0.3）")
parser.add_argument("--concurrency", type=int, default=3, help="并发数（默认 3）")
```

#### 1d. `query_batch` 改为分批处理 + 请求间隔 + 限流恢复

```python
async def query_batch(room_ids, cookies, output_dir, ...):
    batch_size = args.batch_size          # 100
    batch_delay = args.batch_delay        # 30s
    rate_limit_wait = args.rate_limit_wait  # 3600s
    request_delay = args.request_delay    # 0.3s
    max_concurrent = args.concurrency     # 3

    total = len(room_ids)
    succeeded = 0
    failed = 0
    
    for i in range(0, total, batch_size):
        batch = room_ids[i:i + batch_size]
        retries = 0
        max_retries = 2  # 每个小批量最多重试 2 次
        
        while retries <= max_retries:
            try:
                results = await _query_batch_internal(
                    batch, cookies, output_dir, ...,
                    max_concurrent=max_concurrent,
                    request_delay=request_delay
                )
                succeeded += len(results)
                break
            except RateLimitedError:
                retries += 1
                if retries > max_retries:
                    failed += len(batch)
                    break
                print(f"\n[限流] 等待 {rate_limit_wait}s 后重试小批量 (第 {retries} 次)...")
                await asyncio.sleep(rate_limit_wait)
        
        # 小批量间延迟
        await asyncio.sleep(batch_delay)
    
    return {"total": total, "succeeded": succeeded, "failed": failed, ...}
```

#### 1e. `_query_batch_internal` — 提取现有查询逻辑 + 请求间隔控制

将现有的 `query_batch` 中的查询逻辑提取为新方法，在每个请求完成后增加固定延迟：

```python
async def _query_batch_internal(room_ids, cookies, output_dir, ...,
                                 max_concurrent=3, request_delay=0.3):
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def limited_query(session, room_id):
        async with semaphore:
            result = await query_single_with_retry(..., session, room_id, ...)
            await asyncio.sleep(request_delay)  # 请求间最小间隔
            return result
    
    # ... 其余逻辑保持现有代码结构
```

#### 1f. 新增 `--batch-index` / `--total-batches` 参数

```python
parser.add_argument("--batch-index", type=int, help="当前批次编号 (从 0 开始)")
parser.add_argument("--total-batches", type=int, help="总批次数（默认 6）", default=6)
```

在加载房间列表后的切分逻辑：

```python
if args.batch_index is not None:
    batch_size = math.ceil(len(room_ids) / args.total_batches)
    start = args.batch_index * batch_size
    end = min(start + batch_size, len(room_ids))
    room_ids = room_ids[start:end]
    print(f"批次 {args.batch_index}/{args.total_batches}: {len(room_ids)} 间房")
```

### 2. `daily-query.yml` — 工作流修改

#### 2a. 多个 schedule 触发

```yaml
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
```

#### 2b. 批次号计算步骤

```yaml
- name: Determine batch index
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
```

#### 2c. 查询步骤

```yaml
- name: Query electricity data
  run: |
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
      -q
```

#### 2d. 聚合步骤（仅最后一个批次执行）

```yaml
- name: Generate aggregated summaries
  if: env.BATCH_INDEX == '5'
  run: |
    python scripts/aggregate_data.py --database ./database --output ./database/summaries
    python scripts/generate_building_details.py --summaries ./database/summaries
```

## 查询耗时估算

| 指标 | 每批 | 说明 |
|------|------|------|
| 房间数 | ~2,891 | 17,349 / 6 批 |
| 并发数 | 3 | 通过 `-c` 参数控制 |
| 请求间延迟 | 0.3s | 每个请求完成后强制等待 |
| 理论速率 | ~10 req/s | 3 / 0.3s = 10 req/s（不含网络延迟） |
| 小批量大小 | 100 | 每个小批量 100 间 |
| 小批量数 | ~29 | 2,891 / 100 |
| 小批量间延迟 | 30s | 总计 ~14.5 min 等待时间 |
| 纯查询耗时 | ~5 min | 2,891 / 10 req/s ≈ 289s |
| 预估总耗时 | ~20 min | 5 + 14.5 = 19.5 min |
| 工作流超时 | 35 min | 为限流恢复预留 ~15 min 缓冲 |

注意：每批独立运行，~20 min 远低于 35 min 超时限制。如果限流导致 60 分钟等待，工作流可能超时，但这是安全降级的一部分（见下方）。

## 限流策略覆盖分析

| 限流策略 | 本方案的应对 |
|----------|-------------|
| 每秒请求数限制 (如 ≤ 10 req/s) | 3 并发 + 0.3s 间隔 ≈ 10 req/s，处于安全边界。若触发可降为 -c 2 --request-delay 0.5 |
| 每分钟请求数限制 (如 ≤ 500 req/min) | 10 req/s × 60s = 600 req/min，略超。可降为 -c 2 或 --request-delay 0.5 来适配 |
| 每小时请求数限制 | 每批仅 2,891 间，10 req/s × 5 min = 3,000 req，远低于小时级阈值 |
| 每会话累计限制 | 每批使用独立 session，互不影响 |
| 按 IP 的总量限制 | 分成 6 个时间窗口，每 4 小时一批，分摊总量 |
| 滑动窗口限制 | 小批量间 30s 延迟 + 60 分钟限流等待，提供自愈能力 |

## Cookie 有效性

- 每个批次在 workflow 开始时独立执行 `nju_auto_login.py`，获取新鲜 cookie
- 限流等待 60 分钟后重试时使用同一 cookie（限流是查询端点的限制，非登录认证过期）
- 如果 cookie 在等待期间过期，查询会返回"登录"或"login"相关页面，现有代码会检测到并标记为 `auth_failed`

## 日志与监控

正常运行时，输出为：
```
批次 0/6: 2891 间房
[1/29] 小批量 100 间 → 成功 100, 失败 0
[2/29] 小批量 100 间 → 成功 100, 失败 0
...
[29/29] 小批量 91 间 → 成功 91, 失败 0
查询完成: 2891/2891 成功, 失败 0, 耗时 19.5min
```

限流时：
```
[5/29] 小批量 100 间 → 成功 28, 失败 72
  [限流] 检测到: 查询已被限制，请60分钟后再试
  [限流] 等待 3600s 后重试小批量 (第 1 次)...
  [限流] 恢复成功，继续...
```

## 安全降级

- 如果某小批量连续 2 次重试都触发限流，该小批量标记为失败，继续下一批
- 如果某批次整体失败，其他 5 个批次不受影响，当日数据仍可部分使用
- 工作流默认超时 35 分钟：限流等待（60s）在超时前可能来不及完成，超时后 GitHub Actions 自动终止，第二天该批次会被重新调度
- 失败批次的数据会在第二天补跑（因为第二天该批次会被重新调度，前一天的未覆盖数据会被正常补上）

## 回滚方案

如果需要回滚到旧版本：
1. 回退 `nju_electric_query.py` 到旧版本
2. 回退 `daily-query.yml` 到旧版本（单 schedule + 200 并发）