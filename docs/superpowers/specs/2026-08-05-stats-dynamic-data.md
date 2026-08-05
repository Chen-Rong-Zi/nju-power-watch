# 首页统计条动态数据加载

## 概述

将 index.html 统计条中的硬编码数据替换为从 `overview.json` 和 `batch_run_summary.json` 动态加载，并实现数字递增动画效果。

## 修改范围

只修改 `docs/index.html`，不新增文件、不改动其他页面。

## 统计条布局

4 个指标，从左到右：

| 指标 | 数据源 | 显示格式 | 动画 |
|------|--------|----------|------|
| 校区覆盖 | 硬编码 "4" | 纯文本 | 无，直接显示 |
| 楼栋监控 | overview.json → 各校区 buildings_count 之和 | 千分位数字（如 "107"） | 先缓后快 |
| 房间追踪 | overview.json → total_rooms | 千分位数字（如 "17,404"） | 先缓后快 |
| 当日批次 | batch_run_summary.json → batches + date | 状态标签 | 无 |

> 校区覆盖写死为 4，不参与 fetch 和动画，因为南京大学校区数量不会变化。

## 数据来源

### overview.json 结构

```json
{
  "generated_at": "2026-08-05T14:01:43.816820",
  "total_rooms": 17404,
  "campuses": {
    "仙林校区": { "total_rooms": 9948, "buildings_count": 37 },
    "苏州校区": { "total_rooms": 1735, "buildings_count": 17 },
    "鼓楼校区": { "total_rooms": 3865, "buildings_count": 30 },
    "浦口校区": { "total_rooms": 1856, "buildings_count": 23 }
  }
}
```

- `buildings_count` 之和 → 楼栋数
- `total_rooms` → 房间数

### batch_run_summary.json 结构

```json
{
  "date": "2026-08-04",
  "total_batches": 4,
  "batches": {
    "1": { "success": 4323, "failed": 15 },
    "2": { "success": 4333, "failed": 5 },
    "3": { "success": 4331, "failed": 7 },
    "4": { "success": 4296, "failed": 39 }
  },
  "cumulative": { "success": 17283, "failed": 66 }
}
```

- `date` 与当天对比 → 判断是否今日数据
- `Object.keys(batches).length` / `total_batches` → 批次进度

## 数据加载流程

```
页面加载
  │
  ├─ 立即显示 "4"（校区，硬编码）
  │
  ├─ 立即启动楼栋/房间的"先缓"动画
  │   ├─ 楼栋: 0→100 (3s ease-out cubic)
  │   └─ 房间: 0→16,000 (3s ease-out cubic)
  │
  ├─ fetch /database/summaries/overview.json
  │   └─ 返回后启动"后快"动画
  │       ├─ 取消当前动画帧
  │       ├─ 楼栋: 当前值→107 (0.5s)
  │       └─ 房间: 当前值→17,404 (0.8s)
  │
  └─ fetch /database/batch_run_summary.json
      └─ 判断日期 → 渲染批次状态标签
```

## 动画实现

### 动画函数

```javascript
const animFrames = {};

function animateValue(el, target, duration = 800) {
  // 取消该元素上正在运行的动画
  if (animFrames[el.id]) cancelAnimationFrame(animFrames[el.id]);

  // 读取当前显示的数值作为起始点
  const raw = el.textContent.replace(/,/g, '');
  const start = parseInt(raw) || 0;
  const startTime = performance.now();
  const delta = target - start;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + delta * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) {
      animFrames[el.id] = requestAnimationFrame(update);
    } else {
      delete animFrames[el.id];
    }
  }
  animFrames[el.id] = requestAnimationFrame(update);
}
```

关键设计：
- `animFrames` 对象追踪每个元素的动画帧 ID，新动画自动取消旧动画
- `parseInt(el.textContent)` 从当前显示值开始，不会跳回 0
- 先缓动画（3s）→ fetch 返回 → 后快动画（0.5s/0.8s），共用同一个元素

### 持续时间

| 阶段 | 楼栋 | 房间 |
|------|------|------|
| 初始（数据未到） | 0→100，3 秒 | 0→16,000，3 秒 |
| 数据到达后 | 当前→107，0.5 秒 | 当前→17,404，0.8 秒 |

## 批次状态逻辑

```javascript
const summary = await response.json();
const today = new Date().toISOString().slice(0, 10);
const isToday = summary.date === today;

if (isToday) {
  const done = Object.keys(summary.batches).length;
  const total = summary.total_batches;
  if (done >= total) {
    // 绿色 badge: "4/4 完成"
  } else {
    // 黄色 badge: "2/4 进行中"
  }
} else {
  // 灰色 badge: "尚未更新"
}
```

## 加载状态

- 校区 "4" 直接显示，无加载状态
- 楼栋/房间：数字从 0 开始递增，没有占位符（数字一直在动，视觉上就是加载中）
- 批次：默认显示 "尚未更新"（灰色 badge），fetch 返回后更新

## 错误处理

- `overview.json` 加载失败：楼栋和房间数字停在当前动画值，不显示错误
- `batch_run_summary.json` 加载失败：批次保持 "尚未更新"
- 两个请求独立，互不影响