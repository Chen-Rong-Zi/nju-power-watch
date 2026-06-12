# GitHub Actions 工作流容错增强设计

## 背景

每日电费查询工作流（daily-query.yml）存在两个主要脆弱点：

1. **登录失败** — 验证码识别（云码API）不稳定，导致整次运行失败
2. **查询阶段容错不足** — 网络波动导致部分房间失败时，失败条件过于严格（失败>成功就退出），导致已成功的数据也被丢弃

## 目标

- 登录阶段自动重试（验证码识别错误）
- Cookie 验证阶段自动重试
- 查询阶段放宽失败条件
- 工作流失败时自动创建 Issue 通知

## 设计方案

### 架构

```
┌─────────────────────┐
│ Auto Login          │ ← nick-fields/retry@v3, 最多3次, 间隔3秒
├─────────────────────┤
│ Validate Cookie     │ ← nick-fields/retry@v3, 最多3次, 间隔3秒
├─────────────────────┤
│ Query Electricity   │ ← 放宽失败条件: 有成功就继续, 全失败才退出
├─────────────────────┤
│ Generate Summaries  │ ← 不变
├─────────────────────┤
│ Commit & Push       │ ← 不变
├─────────────────────┤
│ Create Issue on Fail│ ← gh issue create, 失败时自动创建
└─────────────────────┘
```

### 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `.github/workflows/daily-query.yml` | 登录/验证步骤增加 retry，查询放宽条件，增加失败 Issue |
| `.github/workflows/manual-query.yml` | 登录/验证步骤增加 retry，查询放宽条件 |
| `.github/workflows/monthly-scan-part-*.yml` | 登录步骤增加 retry（验证码重试） |

### 关键技术

- `nick-fields/retry@v3` — GitHub Actions step 级别重试
- `gh issue create` — 失败时自动创建 Issue
- GitHub Actions `$GITHUB_OUTPUT` — 步骤间传递数据
- `if: failure()` — 条件执行失败处理

### 容错策略

| Step | 容错方式 | 重试次数 | 间隔 | 触发条件 |
|------|---------|---------|------|---------|
| Auto login | `nick-fields/retry` | 3 | 3秒 | 非零退出码 |
| Validate cookie | `nick-fields/retry` | 3 | 3秒 | 非零退出码 |
| Query (房间级) | Python 指数退避 | 5/房间 | 2/3/4.5秒 | 网络错误/超时 |
| Query (工作流级) | 放宽条件 | — | — | 失败>0但有成功 |
| 失败通知 | gh issue create | — | — | 工作流失败且为定时触发 |
