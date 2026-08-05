# 首页统计条动态数据加载 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 index.html 统计条中的硬编码数据替换为从 overview.json 和 batch_run_summary.json 动态加载，并实现数字递增动画效果

**Architecture:** 在 index.html 的 DOMContentLoaded 回调中增加 fetch 逻辑，并行加载两个 JSON 文件。楼栋和房间数字使用先缓后快的动画策略，校区写死为 4，批次状态根据日期判断显示对应标签

**Tech Stack:** 纯前端 JavaScript (ES6+)，无框架依赖

---

### Task 1: 实现动画函数和 fetch 逻辑

**Files:**
- Modify: `docs/index.html` (在 `DOMContentLoaded` 回调中增加)

- [ ] **Step 1: 在 DOMContentLoaded 中增加动画和 fetch 逻辑**

在 `checkUserConfig()` 之后，增加 `loadStats()` 调用：

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await DataService.initDB();
  checkUserConfig();
  loadStats(); // 新增
});
```

- [ ] **Step 2: 实现 `loadStats()` 函数**

在 `</script>` 之前，`clearConfig` 函数之后，增加以下代码：

```javascript
const animFrames = {};

function animateValue(el, target, duration = 800) {
  if (animFrames[el.id]) cancelAnimationFrame(animFrames[el.id]);

  const raw = el.textContent.replace(/,/g, '');
  const start = parseInt(raw) || 0;
  const startTime = performance.now();
  const delta = target - start;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
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

async function loadStats() {
  const buildingEl = document.querySelector('.stats-inner .stat-item:nth-child(2) .stat-value');
  const roomEl = document.querySelector('.stats-inner .stat-item:nth-child(3) .stat-value');
  const batchEl = document.querySelector('.stats-inner .stat-item:nth-child(4) .stat-value');

  // 先缓动画
  animateValue(buildingEl, 100, 3000);
  animateValue(roomEl, 16000, 3000);

  // 并行请求
  const [overviewResp, batchResp] = await Promise.all([
    fetch('/database/summaries/overview.json'),
    fetch('/database/batch_run_summary.json')
  ]);

  // 处理 overview.json
  if (overviewResp.ok) {
    const overview = await overviewResp.json();
    const buildings = Object.values(overview.campuses).reduce((sum, c) => sum + c.buildings_count, 0);
    const rooms = overview.total_rooms;

    // 后快动画
    animateValue(buildingEl, buildings, 500);
    animateValue(roomEl, rooms, 800);
  }

  // 处理 batch_run_summary.json
  if (batchResp.ok) {
    const summary = await batchResp.json();
    const today = new Date().toISOString().slice(0, 10);
    const isToday = summary.date === today;

    if (isToday) {
      const done = Object.keys(summary.batches).length;
      const total = summary.total_batches;
      if (done >= total) {
        batchEl.innerHTML = '<span class="badge badge-ok">' + done + '/' + total + ' 完成</span>';
      } else {
        batchEl.innerHTML = '<span class="badge badge-warn">' + done + '/' + total + ' 进行中</span>';
      }
    } else {
      batchEl.innerHTML = '<span class="badge badge-muted">尚未更新</span>';
    }
  }
}
```

- [ ] **Step 3: 修改 HTML 统计条结构**

将 stats-bar 中的硬编码数字替换为可被 JS 操作的占位，并增加批次标签的 CSS 样式：

原有 HTML：
```html
<section class="stats-bar">
  <div class="stats-inner">
    <div class="stat-item">
      <div class="stat-value">4</div>
      <div class="stat-label">校区覆盖</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">106</div>
      <div class="stat-label">楼栋监控</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">16,644</div>
      <div class="stat-label">房间追踪</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">14:00</div>
      <div class="stat-label">每日更新</div>
    </div>
  </div>
</section>
```

替换为：
```html
<section class="stats-bar">
  <div class="stats-inner">
    <div class="stat-item">
      <div class="stat-value" id="stat-campuses">4</div>
      <div class="stat-label">校区覆盖</div>
    </div>
    <div class="stat-item">
      <div class="stat-value" id="stat-buildings">0</div>
      <div class="stat-label">楼栋监控</div>
    </div>
    <div class="stat-item">
      <div class="stat-value" id="stat-rooms">0</div>
      <div class="stat-label">房间追踪</div>
    </div>
    <div class="stat-item">
      <div class="stat-value" id="stat-batches">尚未更新</div>
      <div class="stat-label">当日批次</div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 增加 badge 样式**

在 CSS 中（`</style>` 之前）增加 badge 样式：

```css
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}
.badge-ok {
  background: #d1fae5;
  color: #065f46;
}
.badge-warn {
  background: #fff3cd;
  color: #856404;
}
.badge-muted {
  background: #f3f4f6;
  color: #9ca3af;
}
```

- [ ] **Step 5: 更新 `loadStats` 中的选择器**

使用新加的 id 选择器替换 `nth-child` 选择器：

```javascript
async function loadStats() {
  const buildingEl = document.getElementById('stat-buildings');
  const roomEl = document.getElementById('stat-rooms');
  const batchEl = document.getElementById('stat-batches');

  // 先缓动画 — 从 0 开始
  animateValue(buildingEl, 100, 3000);
  animateValue(roomEl, 16000, 3000);

  // 并行请求
  const [overviewResp, batchResp] = await Promise.all([
    fetch('/database/summaries/overview.json'),
    fetch('/database/batch_run_summary.json')
  ]);

  // 处理 overview.json
  if (overviewResp.ok) {
    const overview = await overviewResp.json();
    const buildings = Object.values(overview.campuses).reduce((sum, c) => sum + c.buildings_count, 0);
    const rooms = overview.total_rooms;
    animateValue(buildingEl, buildings, 500);
    animateValue(roomEl, rooms, 800);
  }

  // 处理 batch_run_summary.json
  if (batchResp.ok) {
    const summary = await batchResp.json();
    const today = new Date().toISOString().slice(0, 10);
    const isToday = summary.date === today;

    if (isToday) {
      const done = Object.keys(summary.batches).length;
      const total = summary.total_batches;
      if (done >= total) {
        batchEl.innerHTML = '<span class="badge badge-ok">' + done + '/' + total + ' 完成</span>';
      } else {
        batchEl.innerHTML = '<span class="badge badge-warn">' + done + '/' + total + ' 进行中</span>';
      }
    } else {
      batchEl.innerHTML = '<span class="badge badge-muted">尚未更新</span>';
    }
  }
}
```

- [ ] **Step 6: 提交**

```bash
git add docs/index.html
git commit -m "feat: replace hardcoded stats with dynamic data from overview.json"
```

### 验证方式

1. 本地启动 `python3 -m http.server 8000` 在 `docs/` 目录
2. 访问 `http://localhost:8000/index.html`
3. 确认统计条显示：校区 4、楼栋 107、房间 17,404、批次 "N/N 完成" 或 "尚未更新"
4. 确认数字从 0 开始递增动画，fetch 返回后加速冲到目标值