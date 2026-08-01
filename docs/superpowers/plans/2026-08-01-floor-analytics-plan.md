# 楼层耗电分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add floor-level consumption analytics to the building view with a subtle left-side floor indicator supporting multi-select filtering.

**Architecture:** Three new JS modules (floor-utils.js for extraction, floor-analytics.js for aggregation, floor-view.js for UI) plus a config file. The existing building-view.html integrates them with minimal changes to its core logic.

**Tech Stack:** Vanilla JavaScript (ES6+), Chart.js, static JSON config

**Branch:** `005-floor-analytics`

---

### Task 1: Create config/floor_map.json

**Files:**
- Create: `config/floor_map.json`

- [ ] **Step 1: Create empty floor map config**

Write `config/floor_map.json`:

```json
{
  "仙林校区": {
    "19幢": {
      "mode": "auto"
    }
  }
}
```

Start with just one building as a template. The `mode: "auto"` means all rooms in this building use rule-based extraction. This file will be expanded manually as needed.

- [ ] **Step 2: Commit**

```bash
git add config/floor_map.json
git commit -m "feat: add floor_map.json config for manual floor mapping"
```

---

### Task 2: Create floor-utils.js

**Files:**
- Create: `docs/js/floor-utils.js`

- [ ] **Step 1: Implement floor-utils.js**

Write `docs/js/floor-utils.js`:

```javascript
/**
 * 楼层提取引擎
 * 从房间名中提取楼层号，支持规则解析和手动映射覆盖
 */

const FloorUtils = {
  _floorMap: null,

  async loadFloorMap() {
    try {
      const resp = await fetch('../config/floor_map.json');
      if (!resp.ok) {
        this._floorMap = {};
        return {};
      }
      this._floorMap = await resp.json();
      return this._floorMap;
    } catch (e) {
      this._floorMap = {};
      return {};
    }
  },

  extractFloor(roomName, campus, building, floorMap) {
    const map = floorMap || this._floorMap || {};

    // 1. 检查手动映射
    if (map[campus] && map[campus][building]) {
      const buildingMap = map[campus][building];
      if (buildingMap.manual && buildingMap.manual[roomName] !== undefined) {
        return buildingMap.manual[roomName];
      }
      if (buildingMap.mode === 'manual') {
        return null;
      }
    }

    // 2. 规则: "第X层" 模式 — "19栋第2层201" → 2, "19栋第16层1613" → 16
    const floorMatch = roomName.match(/第(\d+)层/);
    if (floorMatch) return parseInt(floorMatch[1]);

    // 3. 规则: 字母后首数字 — "4A101" → 1, "4A211" → 2
    const letterNumMatch = roomName.match(/[A-Za-z](\d)/);
    if (letterNumMatch) return parseInt(letterNumMatch[1]);

    // 4. 规则: 中文前缀后首数字 — "戊504" → 5
    const chinesePrefixMatch = roomName.match(/^[^\dA-Za-z]+(\d)/);
    if (chinesePrefixMatch) return parseInt(chinesePrefixMatch[1]);

    // 5. 无法识别
    return null;
  },

  groupRoomsByFloor(roomNames, campus, building, floorMap) {
    const groups = {};
    let unknown = [];

    roomNames.forEach(name => {
      const floor = this.extractFloor(name, campus, building, floorMap);
      if (floor !== null) {
        if (!groups[floor]) groups[floor] = [];
        groups[floor].push(name);
      } else {
        unknown.push(name);
      }
    });

    return { groups, unknown };
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/floor-utils.js
git commit -m "feat: add floor-utils.js with floor extraction engine"
```

---

### Task 3: Create floor-analytics.js

**Files:**
- Create: `docs/js/floor-analytics.js`

- [ ] **Step 1: Implement floor-analytics.js**

Write `docs/js/floor-analytics.js`:

```javascript
/**
 * 楼层聚合计算
 * 在排行榜数据基础上，按楼层聚合统计
 */

const FloorAnalytics = {
  calculateFloorStats(rankings, floorGroups) {
    const floors = {};

    Object.entries(floorGroups.groups).forEach(([floor, rooms]) => {
      const floorNum = parseInt(floor);
      const floorRankings = rankings.filter(r => rooms.includes(r.roomName));

      if (floorRankings.length === 0) {
        floors[floorNum] = {
          roomCount: rooms.length,
          rooms: rooms,
          totalConsumption: 0,
          avgConsumption: 0,
          maxConsumption: 0,
          minConsumption: 0
        };
        return;
      }

      const consumptions = floorRankings.map(r => r.consumption);
      const total = consumptions.reduce((s, v) => s + v, 0);

      floors[floorNum] = {
        roomCount: floorRankings.length,
        rooms: rooms,
        totalConsumption: total,
        avgConsumption: total / floorRankings.length,
        maxConsumption: Math.max(...consumptions),
        minConsumption: Math.min(...consumptions)
      };
    });

    // 处理 unknown 房间
    if (floorGroups.unknown && floorGroups.unknown.length > 0) {
      const unknownRankings = rankings.filter(r => floorGroups.unknown.includes(r.roomName));
      floors.unknown = {
        roomCount: floorGroups.unknown.length,
        rooms: floorGroups.unknown,
        totalConsumption: unknownRankings.reduce((s, r) => s + r.consumption, 0),
        avgConsumption: unknownRankings.length > 0
          ? unknownRankings.reduce((s, r) => s + r.consumption, 0) / unknownRankings.length
          : 0,
        maxConsumption: unknownRankings.length > 0 ? Math.max(...unknownRankings.map(r => r.consumption)) : 0,
        minConsumption: unknownRankings.length > 0 ? Math.min(...unknownRankings.map(r => r.consumption)) : 0
      };
    }

    // 排序楼层号
    const sortedFloors = Object.keys(floors)
      .filter(k => k !== 'unknown')
      .map(Number)
      .sort((a, b) => a - b);

    if (floors.unknown) sortedFloors.push('unknown');

    return { floors, sortedFloors };
  },

  getFilteredRankings(rankings, floorGroups, selectedFloors) {
    if (selectedFloors === null) return rankings;

    const allowedRooms = new Set();
    selectedFloors.forEach(floor => {
      if (floor === 'unknown') {
        floorGroups.unknown.forEach(r => allowedRooms.add(r));
      } else if (floorGroups.groups[floor]) {
        floorGroups.groups[floor].forEach(r => allowedRooms.add(r));
      }
    });

    return rankings.filter(r => allowedRooms.has(r.roomName));
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/floor-analytics.js
git commit -m "feat: add floor-analytics.js with aggregation and filtering"
```

---

### Task 4: Create floor-view.js

**Files:**
- Create: `docs/js/floor-view.js`

- [ ] **Step 1: Implement floor-view.js**

Write `docs/js/floor-view.js`:

```javascript
/**
 * 楼层指示器 UI 组件
 * 渲染左侧楼层指示器、处理多选交互、联动内容刷新
 */

const FloorView = {
  _chartInstance: null,
  _onToggle: null,

  renderIndicator(floorStats, container, onToggle) {
    this._onToggle = onToggle;
    const { floors, sortedFloors } = floorStats;

    const hasMultipleFloors = sortedFloors.filter(f => f !== 'unknown').length > 1;
    if (!hasMultipleFloors) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    // 竖线
    const line = document.createElement('div');
    line.className = 'floor-line';
    container.appendChild(line);

    // 高亮线
    const highlight = document.createElement('div');
    highlight.className = 'floor-line-highlight';
    highlight.id = 'floor-highlight';
    container.appendChild(highlight);

    // 全部楼层节点
    const allNode = this._createNode('all', '全部楼层', true, f => {
      this._toggleAll(f);
    });
    container.appendChild(allNode);

    // 各楼层节点
    sortedFloors.forEach(floor => {
      const stats = floors[floor];
      const label = floor === 'unknown'
        ? `未识别 · ${stats.roomCount}间`
        : `${floor}层 · ${stats.roomCount}间`;
      const node = this._createNode(floor, label, false, f => {
        this._toggleFloor(f);
      });
      node.dataset.floor = String(floor);
      container.appendChild(node);
    });

    this._updateHighlight();
  },

  _createNode(floor, label, isAll, onClick) {
    const node = document.createElement('div');
    node.className = 'floor-node' + (isAll ? ' all' : '') + ' active';
    node.onclick = () => onClick(floor);

    const dot = document.createElement('div');
    dot.className = 'floor-dot';
    node.appendChild(dot);

    const labelEl = document.createElement('span');
    labelEl.className = 'floor-label';
    labelEl.textContent = label;
    node.appendChild(labelEl);

    return node;
  },

  _toggleAll(floor) {
    const nodes = document.querySelectorAll('.floor-node');
    const allActive = Array.from(nodes).every(n => n.classList.contains('active'));

    if (allActive) {
      nodes.forEach(n => n.classList.remove('active'));
      this._onToggle(new Set());
    } else {
      nodes.forEach(n => n.classList.add('active'));
      this._onToggle(null);
    }
    this._updateHighlight();
  },

  _toggleFloor(floor) {
    const node = document.querySelector(`.floor-node[data-floor="${floor}"]`);
    if (!node) return;

    const isActive = node.classList.toggle('active');

    // 收集当前选中的楼层
    const activeNodes = document.querySelectorAll('.floor-node.active:not(.all)');
    const selected = new Set();
    activeNodes.forEach(n => {
      const val = n.dataset.floor === 'unknown' ? 'unknown' : parseInt(n.dataset.floor);
      selected.add(val);
    });

    // 更新全部楼层节点状态
    const allNode = document.querySelector('.floor-node.all');
    const allFloorNodes = document.querySelectorAll('.floor-node:not(.all)');
    const allSelected = Array.from(allFloorNodes).every(n => n.classList.contains('active'));
    allNode.classList.toggle('active', allSelected);

    this._onToggle(selected.size > 0 ? selected : null);
    this._updateHighlight();
  },

  _updateHighlight() {
    const highlight = document.getElementById('floor-highlight');
    if (!highlight) return;

    const activeNodes = document.querySelectorAll('.floor-node.active');
    if (activeNodes.length === 0) {
      highlight.style.opacity = '0';
      return;
    }

    const first = activeNodes[0];
    const last = activeNodes[activeNodes.length - 1];
    const top = first.offsetTop + 4;
    const bottom = last.offsetTop + last.offsetHeight - 4;
    highlight.style.top = top + 'px';
    highlight.style.height = (bottom - top) + 'px';
    highlight.style.opacity = '1';
  },

  renderFloorChart(floorStats, container, selectedFloors) {
    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    const { floors, sortedFloors } = floorStats;
    const numericFloors = sortedFloors.filter(f => f !== 'unknown');

    if (numericFloors.length < 2) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    const isAllSelected = selectedFloors === null;
    const labels = numericFloors.map(f => `${f}层`);
    const avgs = numericFloors.map(f => floors[f].avgConsumption);
    const totals = numericFloors.map(f => floors[f].totalConsumption);
    const roomCounts = numericFloors.map(f => floors[f].roomCount);

    const ctx = container.querySelector('canvas').getContext('2d');
    this._chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '均耗 (度/间)',
          data: avgs,
          backgroundColor: numericFloors.map(f => {
            const isActive = isAllSelected || selectedFloors.has(f);
            return isActive ? 'rgba(16, 185, 129, 0.8)' : 'rgba(200, 200, 200, 0.3)';
          }),
          borderColor: numericFloors.map(f => {
            const isActive = isAllSelected || selectedFloors.has(f);
            return isActive ? 'rgba(16, 185, 129, 1)' : 'rgba(200, 200, 200, 0.5)';
          }),
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const i = ctx.dataIndex;
                const f = numericFloors[i];
                return [
                  `均耗: ${avgs[i].toFixed(2)} 度/间`,
                  `总耗: ${totals[i].toFixed(1)} 度`,
                  `房间: ${roomCounts[i]} 间`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 11 } }
          }
        },
        onClick: (e, elements) => {
          if (elements.length > 0) {
            const i = elements[0].datasetIndex;
            const floor = numericFloors[i];
            // 模拟点击楼层节点
            const node = document.querySelector(`.floor-node[data-floor="${floor}"]`);
            if (node) node.click();
          }
        }
      }
    });
  },

  updateChart(floorStats, selectedFloors) {
    if (!this._chartInstance) return;
    const { floors, sortedFloors } = floorStats;
    const numericFloors = sortedFloors.filter(f => f !== 'unknown');
    const isAllSelected = selectedFloors === null;

    this._chartInstance.data.datasets[0].backgroundColor = numericFloors.map(f => {
      const isActive = isAllSelected || selectedFloors.has(f);
      return isActive ? 'rgba(16, 185, 129, 0.8)' : 'rgba(200, 200, 200, 0.3)';
    });
    this._chartInstance.data.datasets[0].borderColor = numericFloors.map(f => {
      const isActive = isAllSelected || selectedFloors.has(f);
      return isActive ? 'rgba(16, 185, 129, 1)' : 'rgba(200, 200, 200, 0.5)';
    });
    this._chartInstance.update();
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/floor-view.js
git commit -m "feat: add floor-view.js with indicator UI, multi-select, and chart"
```

---

### Task 5: Integrate into building-view.html

**Files:**
- Modify: `docs/building-view.html`

This is the most complex task. We need to:
1. Add CSS for the floor indicator
2. Add DOM elements (floor-side container, floor chart container, content wrapper)
3. Add script imports
4. Add state fields
5. Wire up the data flow in loadRanking and onBuildingChange

- [ ] **Step 1: Add floor indicator CSS**

Insert before the existing `.ranking-card` style block (around line 195):

```css
/* 楼层指示器 */
.floor-side {
  width: 60px;
  position: relative;
  padding: 28px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.floor-line {
  position: absolute;
  left: 50%;
  top: 20px;
  bottom: 20px;
  width: 1px;
  background: #e0e0e0;
  transform: translateX(-50%);
}
.floor-line-highlight {
  position: absolute;
  left: 50%;
  width: 2px;
  background: var(--accent);
  transform: translateX(-50%);
  transition: top 0.3s, height 0.3s, opacity 0.3s;
  border-radius: 2px;
  opacity: 0;
}
.floor-node {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  cursor: pointer;
  z-index: 2;
  transition: all 0.2s;
}
.floor-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d0d0d0;
  transition: all 0.2s;
  flex-shrink: 0;
}
.floor-node:hover .floor-dot {
  width: 14px;
  height: 14px;
  background: var(--accent);
}
.floor-node.active .floor-dot {
  width: 14px;
  height: 14px;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 20%, transparent);
}
.floor-label {
  position: absolute;
  left: 70px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.floor-node:hover .floor-label {
  opacity: 1;
}
.floor-node.active .floor-label {
  opacity: 1;
  color: var(--accent);
  font-weight: 600;
}
.floor-node.all .floor-dot {
  width: 12px;
  height: 12px;
  background: var(--accent);
}
.content-area {
  flex: 1;
  min-width: 0;
}
```

Replace the `.main` CSS rule's `max-width: 1200px; margin: 0 auto; padding: 32px 24px;` with `max-width: 1260px; margin: 0 auto; padding: 32px 24px; display: flex; gap: 0;` (or just add `display: flex; gap: 0;` if the rule already exists).

- [ ] **Step 2: Add floor chart card HTML**

Insert after the `#dist-card` div (around line 1221, before `#trend-card`):

```html
<!-- 楼层耗电对比 -->
<div class="chart-card" id="floor-chart-card" style="display: none;">
  <div class="chart-header">
    <h2 class="chart-title">楼层耗电对比</h2>
  </div>
  <div class="chart-container">
    <canvas id="floor-chart"></canvas>
  </div>
</div>
```

- [ ] **Step 3: Wrap content in .content-area and add .floor-side**

Wrap all content inside `.main` (from the selector bar at line 1137 to the end of detail panel at line 1307) in a flex layout:

```html
<main class="main">
  <!-- 楼层指示器 -->
  <div class="floor-side" id="floor-side"></div>

  <!-- 右侧内容 -->
  <div class="content-area">
    <!-- 选择器 -->
    <div class="selector-bar">...</div>
    <!-- ... all existing content ... -->
    <!-- 房间详情面板 -->
    <div class="detail-overlay">...</div>
  </div>
</main>
```

- [ ] **Step 4: Add script imports**

Add after the existing script tags (after line 1311, before the inline `<script>`):

```html
<script src="js/floor-utils.js"></script>
<script src="js/floor-analytics.js"></script>
<script src="js/floor-view.js"></script>
```

- [ ] **Step 5: Add state fields**

In the `state` object (around line 1321), add:

```javascript
const state = {
  // ... existing fields ...
  selectedFloors: null,     // null = 全部楼层, Set = 选中楼层集合
  floorStats: null,         // 楼层聚合统计
  floorGroups: null,        // 房间 → 楼层映射
  floorMap: null,           // 楼层映射配置
};
```

- [ ] **Step 6: Wire up data flow in loadRanking**

After `loadRanking()` completes and before `displayRanking()` is called (around line 1936), add the floor processing:

```javascript
// === 楼层分析 ===
if (allRankings.length > 0) {
  const roomNames = Object.keys(roomMap);
  const floorMap = await FloorUtils.loadFloorMap();
  state.floorMap = floorMap;
  state.floorGroups = FloorUtils.groupRoomsByFloor(roomNames, state.campus, state.building, floorMap);
  state.floorStats = FloorAnalytics.calculateFloorStats(allRankings, state.floorGroups);

  const floorSide = document.getElementById('floor-side');
  FloorView.renderIndicator(state.floorStats, floorSide, (selectedFloors) => {
    state.selectedFloors = selectedFloors;
    onFloorSelectionChange();
  });

  const floorChartCard = document.getElementById('floor-chart-card');
  FloorView.renderFloorChart(state.floorStats, floorChartCard, state.selectedFloors);
}
```

- [ ] **Step 7: Implement onFloorSelectionChange handler**

Add the handler function after the state declaration:

```javascript
function onFloorSelectionChange() {
  // 更新统计摘要
  const filteredRankings = state.selectedFloors === null
    ? state.allRankings
    : FloorAnalytics.getFilteredRankings(state.allRankings, state.floorGroups, state.selectedFloors);

  if (filteredRankings.length === 0) {
    document.getElementById('stat-total').textContent = '--';
    document.getElementById('stat-rooms').textContent = '--';
    document.getElementById('stat-avg').textContent = '--';
    document.getElementById('stat-max').textContent = '--';
    return;
  }

  const total = filteredRankings.reduce((s, r) => s + r.consumption, 0);
  const avg = total / filteredRankings.length;
  const max = Math.max(...filteredRankings.map(r => r.consumption));
  document.getElementById('stat-total').textContent = total.toFixed(1) + '度';
  document.getElementById('stat-rooms').textContent = filteredRankings.length;
  document.getElementById('stat-avg').textContent = avg.toFixed(1) + '度';
  document.getElementById('stat-max').textContent = max.toFixed(1) + '度';

  // 更新图表
  FloorView.updateChart(state.floorStats, state.selectedFloors);

  // 更新排行榜
  state.allRankings = filteredRankings;
  state.currentPage = 1;
  renderCurrentPage();
}
```

- [ ] **Step 8: Handle date switching to preserve floor state**

In the date button click handler and custom date change handler, after `loadRanking()` returns, re-apply floor filtering if floor data exists:

```javascript
// After loadRanking() in date handlers:
if (state.floorStats && state.selectedFloors !== null) {
  onFloorSelectionChange();
}
```

- [ ] **Step 9: Handle empty state**

In the `showEmptyState()` function, hide the floor-side indicator:

```javascript
function showEmptyState() {
  // ... existing code ...
  document.getElementById('floor-side').style.display = 'none';
  document.getElementById('floor-chart-card').style.display = 'none';
}
```

- [ ] **Step 10: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: integrate floor analytics into building-view.html"
```

---

## Spec Coverage Check

| Spec Section | Task |
|---|---|
| config/floor_map.json | Task 1 |
| floor-utils.js: loadFloorMap | Task 2 |
| floor-utils.js: extractFloor | Task 2 |
| floor-utils.js: groupRoomsByFloor | Task 2 |
| floor-analytics.js: calculateFloorStats | Task 3 |
| floor-analytics.js: getFilteredRankings | Task 3 |
| floor-view.js: renderIndicator | Task 4 |
| floor-view.js: renderFloorChart | Task 4 |
| floor-view.js: toggle/toggleAll | Task 4 |
| floor-view.js: updateHighlight | Task 4 |
| floor-view.js: updateChart | Task 4 |
| building-view.html: CSS additions | Task 5 |
| building-view.html: DOM changes | Task 5 |
| building-view.html: state + data flow | Task 5 |