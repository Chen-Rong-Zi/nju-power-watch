# 首页统计条动态数据加载

## 概述

将 index.html 统计条中的硬编码数据替换为从 `overview.json` 和 `batch_run_summary.json` 动态加载，并实现数字递增动画效果。

## 修改范围

只修改 `docs/index.html`，不新增文件、不改动其他页面。

## 统计条布局

4 个指标，从左到右：

| 指标 | 数据源 | 显示格式 | 动画 |
|------|--------|----------|------|
| 校区覆盖 | overview.json → campuses 键数 | 纯数字（如 "4"） | 无，写死 |
| 楼栋监控 | overview.json → 各校区 buildings_count 之和 | 千分位数字（如 "107"） | 先缓后快 |
| 房间追踪 | overview.json → total_rooms | 千分位数字（如 "17,404"） | 先缓后快 |
| 当日批次 | batch_run_summary.json → batches + date | 状态标签 | 无 |

## 数据加载流程

```
页面加载
  │
  ├─ 立即启动动画：楼栋 0→100、房间 0→16,000（缓慢递增）
  │
  ├─ fetch /database/summaries/overview.json
  │   └─ 返回后更新动画目标值，加速冲到真实值
  │
  └─ fetch /database/batch_run_summary.json
      └─ 判断日期 → 渲染批次状态标签
```

## 动画实现

### 动画函数

```javascript
function animateValue(el, target, duration = 800, format = true) {
  const start = 0;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (target - start) * eased);
    el.textContent = format ? current.toLocaleString() : current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
```

### 先缓后快策略

- 初始调用 `animateValue(el, initialTarget, longDuration)` — 缓慢爬升
- fetch 返回后调用 `animateValue(el, realTarget, shortDuration)` — 从当前值快速冲到真实值
- 通过 `performance.now()` 确保动画帧连续，不跳帧

### 持续时间

| 阶段 | 楼栋 | 房间 |
|------|------|------|
| 初始（数据未到） | 0→100，3 秒 | 0→16,000，3 秒 |
| 数据到达后 | 当前→107，0.5 秒 | 当前→17,404，0.8 秒 |

## 批次状态逻辑

从 `batch_run_summary.json` 读取：

```javascript
const summary = await response.json();
const today = new Date().toISOString().slice(0, 10);
const isToday = summary.date === today;

if (isToday) {
  const done = Object.keys(summary.batches).length;
  const total = summary.total_batches;
  if (done >= total) {
    // 绿色: "4/4 完成"
  } else {
    // 黄色: "2/4 进行中"
  }
} else {
  // 灰色: "尚未更新"
}
```

## 加载状态

- 数字动画开始前，显示 `...` 占位符（灰色，带闪烁动画）
- fetch 请求和动画同时进行，不阻塞
- 网络请求失败时：数字停在当前动画值，批次显示"尚未更新"

## 错误处理

- `overview.json` 加载失败：楼栋和房间数字停在当前动画值，不显示错误
- `batch_run_summary.json` 加载失败：批次显示"尚未更新"
- 两个请求独立，互不影响