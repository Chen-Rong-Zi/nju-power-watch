# 限流对抗策略 v2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单批次查询所有 17,349 间房，1 并发 + 0.5s 请求间隔，限流后 60 分钟自动重试

**Architecture:** 修改 `nju_electric_query.py` 的默认参数和 CLI 参数，删除批次切分逻辑，保留子批次循环用于进度显示。修改 `daily-query.yml` 为单 cron 调度。

**Tech Stack:** Python 3.11, aiohttp, GitHub Actions

---

### Task 1: 更新 nju_electric_query.py 参数和逻辑

**Files:**
- Modify: `nju_electric_query.py`

**Changes:**
1. `--request-delay` 默认值: 3.0 → 0.5
2. 删除 `--batch-index`、`--total-batches` CLI 参数
3. 删除 `--batch-delay` 参数
4. 删除批次切分逻辑
5. 删除 `query_batch` 中的批间隔延迟
6. 更新 `query_batch` 函数签名（删除 `batch_delay` 参数）

**Commit:**
```bash
git add nju_electric_query.py
git commit -m "feat: single-batch mode C — 1 concurrent, 0.5s delay, no batch gap"
```

### Task 2: 更新 daily-query.yml

**Files:**
- Modify: `.github/workflows/daily-query.yml`

**Changes:**
1. 单 cron 调度: `0 0 * * *`
2. 删除 `workflow_dispatch` 的 batch 输入
3. 超时: 360 分钟
4. 删除 `Determine batch index` 步骤
5. 删除并发组配置
6. 更新查询命令: `-c 1 --batch-size 100 --request-delay 0.5`
7. 更新失败 Issue 标题和 Summary 步骤（删除批次引用）

**Commit:**
```bash
git add .github/workflows/daily-query.yml
git commit -m "feat: single-batch workflow — no batch splitting, mode C timing"
```

### Task 3: 更新文档

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-rate-limiting-v2-design.md`
- Modify: `docs/superpowers/plans/2026-08-04-rate-limiting-v2-plan.md`

**Commit:**
```bash
git add docs/superpowers/
git commit -m "docs: update spec and plan for single-batch mode C"
```