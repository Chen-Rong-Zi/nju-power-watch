# 楼层分析交互增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复"耗电量分布"图不随楼层筛选更新、增加底部抽屉楼层选择和楼层图表点击切换楼层

**架构：** `floor-view.js` 新增图表点击回调和 FAB/抽屉方法，`building-view.html` 新增 CSS 和 `syncSidebarState()` 函数，三者共享 `state.selectedFloors`

**Tech Stack:** Vanilla JavaScript, Chart.js 4.4.0

---

## 文件结构

| 文件 | 变更 |
|------|------|
| `docs/building-view.html` (CSS) | 新增 FAB/抽屉/遮罩样式，手机端隐藏侧边栏 |
| `docs/building-view.html` (inline JS) | 修复分布图、新增 `syncSidebarState()`、更新 `runFloorAnalysis()` |
| `docs/js/floor-view.js` | 新增图表点击回调、新增 FAB/抽屉方法 |

---

### Task 1: 修复耗电量分布图不随楼层筛选更新

**Files:**
- Modify: `docs/building-view.html:1579`

- [ ] **Step 1: 在 `onFloorSelectionChange()` 末尾添加分布图更新**

在 `renderCurrentPage()` 调用之后添加：

```javascript
// 更新耗电量分布图
renderDistributionChart(filteredRankings);
```

- [ ] **Step 2: 验证**

启动 dev server，打开 building-view.html，选择一个楼层，检查"耗电量分布"图的数据是否随筛选变化。

- [ ] **Step 3: 提交**

```bash
git add docs/building-view.html
git commit -m "fix: update distribution chart on floor selection change"
```

---

### Task 2: 楼层图表点击回调

**Files:**
- Modify: `docs/js/floor-view.js:130-168`

- [ ] **Step 1: 修改 `renderFloorChart()` 签名增加 `onChartClick` 参数**

```javascript
renderFloorChart(floorStats, container, selectedFloors, onChartClick) {
```

- [ ] **Step 2: 在 `new Chart()` 的 options 中添加 `onClick` 回调**

在 options 对象中添加（已有 `responsive`, `maintainAspectRatio`, `plugins`, `scales`）：

```javascript
onClick: function(e, elements) {
  if (elements.length > 0) {
    var idx = elements[0].index;
    var floor = numericFloors[idx];
    if (onChartClick) onChartClick(floor);
  }
}
```

- [ ] **Step 3: 验证**

```bash
cd docs && python3 -m http.server 8000
```

打开浏览器，控制台检查点击柱子时是否触发回调。

- [ ] **Step 4: 提交**

```bash
git add docs/js/floor-view.js
git commit -m "feat: add chart click callback to renderFloorChart"
```

---

### Task 3: 添加 FAB/抽屉 CSS

**Files:**
- Modify: `docs/building-view.html`（在现有 CSS 末尾，`</style>` 之前）

- [ ] **Step 1: 添加手机端隐藏侧边栏的媒体查询**

```css
@media (max-width: 800px) {
  .floor-side { display: none !important; }
}
```

- [ ] **Step 2: 添加 FAB 按钮样式**

```css
.floor-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
  z-index: 50;
  font-size: 18px;
  display: none;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}
.floor-fab:hover { transform: scale(1.05); }
.floor-fab:active { transform: scale(0.92); }

.floor-fab-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 18px; height: 18px;
  border-radius: 9px;
  background: #f59e0b;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
```

- [ ] **Step 3: 添加抽屉遮罩样式**

```css
.floor-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}
.floor-drawer-overlay.open { opacity: 1; pointer-events: auto; }
```

- [ ] **Step 4: 添加抽屉面板样式**

```css
.floor-drawer-panel {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  z-index: 101;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 60vh;
  padding: 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}
.floor-drawer-panel.open { transform: translateY(0); }

.floor-drawer-handle {
  width: 36px; height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin: 12px auto;
  flex-shrink: 0;
}

.floor-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.floor-drawer-title { font-weight: 600; font-size: 16px; }
.floor-drawer-close {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #f5f5f5;
  border: none;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}
.floor-drawer-close:hover { background: #e8e8e8; }

.floor-drawer-list {
  overflow-y: auto;
  padding: 8px 20px 20px;
  -webkit-overflow-scrolling: touch;
}

.floor-drawer-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 8px;
}
.floor-drawer-item:last-child { border-bottom: none; }
.floor-drawer-item:hover { background: #f8f8fa; }

.floor-drawer-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #d0d0d0;
  margin-right: 14px;
  flex-shrink: 0;
  transition: all 0.2s;
}
.floor-drawer-dot.active {
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 20%, transparent);
  width: 16px; height: 16px;
}

.floor-drawer-item-label { font-size: 14px; flex: 1; }
.floor-drawer-item-count { font-size: 12px; color: var(--muted); }
.floor-drawer-item-sub { font-size: 12px; color: #bbb; margin-left: 8px; }
```

- [ ] **Step 5: 提交**

```bash
git add docs/building-view.html
git commit -m "feat: add FAB and drawer CSS styles"
```

---

### Task 4: 在 FloorView 中添加 FAB/抽屉 JS 方法

**Files:**
- Modify: `docs/js/floor-view.js`

- [ ] **Step 1: 在 FloorView 中添加 FAB/抽屉相关方法**

在 `updateChart()` 方法之后（或文件末尾 `}` 之前），添加以下方法：

```javascript
  // ============ FAB + 抽屉 ============

  renderDrawer(floorStats, onToggle) {
    this._drawerOnToggle = onToggle;

    if (!this._fabEl) {
      this._fabEl = document.createElement('button');
      this._fabEl.className = 'floor-fab';
      this._fabEl.innerHTML = '<span>🏢</span><span class="floor-fab-badge" id="fab-badge"></span>';
      this._fabEl.onclick = function() { FloorView._toggleDrawer(true); };
      document.body.appendChild(this._fabEl);
    }
    this._fabEl.style.display = 'flex';

    if (!this._overlayEl) {
      this._overlayEl = document.createElement('div');
      this._overlayEl.className = 'floor-drawer-overlay';
      this._overlayEl.onclick = function() { FloorView._toggleDrawer(false); };
      document.body.appendChild(this._overlayEl);
    }

    if (!this._drawerEl) {
      this._drawerEl = document.createElement('div');
      this._drawerEl.className = 'floor-drawer-panel';
      this._drawerEl.innerHTML = [
        '<div class="floor-drawer-handle"></div>',
        '<div class="floor-drawer-header">',
        '  <span class="floor-drawer-title">选择楼层</span>',
        '  <button class="floor-drawer-close">✕</button>',
        '</div>',
        '<div class="floor-drawer-list" id="drawer-list"></div>'
      ].join('');
      this._drawerEl.querySelector('.floor-drawer-close').onclick = function() { FloorView._toggleDrawer(false); };
      document.body.appendChild(this._drawerEl);
    }

    this._renderDrawerList(floorStats);
    this.updateFabBadge(null, floorStats);
  },

  _renderDrawerList(floorStats) {
    const { floors, sortedFloors } = floorStats;
    const listEl = document.getElementById('drawer-list');
    listEl.innerHTML = '';

    const self = this;

    function createItem(floor, label, stats) {
      const item = document.createElement('div');
      item.className = 'floor-drawer-item' + (floor === 'all' ? ' all' : '');
      item.dataset.floor = String(floor);
      const count = floor === 'all'
        ? sortedFloors.filter(function(f) { return f !== 'unknown'; }).length
        : stats.roomCount;
      var avg = null;
      if (floor !== 'all') avg = stats.avgConsumption;
      var html = [
        '<div class="floor-drawer-dot active"></div>',
        '<span class="floor-drawer-item-label">' + label + '</span>',
        '<span class="floor-drawer-item-count">' + count + '间</span>'
      ];
      if (avg !== null) {
        html.push('<span class="floor-drawer-item-sub">均耗 ' + avg.toFixed(1) + '</span>');
      }
      item.innerHTML = html.join('');
      item.onclick = function(e) {
        e.stopPropagation();
        if (floor === 'all') {
          self._toggleAllFromDrawer();
        } else {
          var f = floor === 'unknown' ? 'unknown' : parseInt(floor);
          self._toggleFloorFromDrawer(f);
        }
      };
      return item;
    }

    listEl.appendChild(createItem('all', '全部楼层', null));

    for (var i = 0; i < sortedFloors.length; i++) {
      var floor = sortedFloors[i];
      if (floor === 'unknown') continue;
      listEl.appendChild(createItem(floor, floor + '层', floors[floor]));
    }

    if (floors.unknown) {
      listEl.appendChild(createItem('unknown', '未识别', floors.unknown));
    }
  },

  _toggleAllFromDrawer() {
    var allDot = this._drawerEl && this._drawerEl.querySelector('.floor-drawer-item.all .floor-drawer-dot');
    var allActive = allDot && allDot.classList.contains('active');
    if (this._drawerOnToggle) {
      this._drawerOnToggle(allActive ? null : new Set());
    }
  },

  _toggleFloorFromDrawer(floor) {
    var items = this._drawerEl && this._drawerEl.querySelectorAll('.floor-drawer-item:not(.all)');
    if (!items) return;

    var activeSet = new Set();
    for (var i = 0; i < items.length; i++) {
      var dot = items[i].querySelector('.floor-drawer-dot');
      var f = items[i].dataset.floor;
      if (f === 'unknown') f = 'unknown';
      else f = parseInt(f);
      if (dot && dot.classList.contains('active')) {
        activeSet.add(f);
      }
    }

    if (activeSet.has(floor)) {
      activeSet.delete(floor);
    } else {
      activeSet.add(floor);
    }

    if (this._drawerOnToggle) {
      this._drawerOnToggle(activeSet.size > 0 ? activeSet : null);
    }
  },

  _toggleDrawer(open) {
    this._drawerOpen = open;
    if (this._overlayEl) this._overlayEl.classList.toggle('open', open);
    if (this._drawerEl) this._drawerEl.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  },

  updateDrawer(selectedFloors) {
    if (!this._drawerEl) return;
    var items = this._drawerEl.querySelectorAll('.floor-drawer-item');
    if (!items.length) return;
    var isAll = selectedFloors === null;

    var allDot = items[0].querySelector('.floor-drawer-dot');
    if (allDot) {
      var allSelected = true;
      for (var i = 1; i < items.length; i++) {
        var dot = items[i].querySelector('.floor-drawer-dot');
        if (dot) {
          var floor = items[i].dataset.floor;
          if (floor === 'unknown') floor = 'unknown';
          else floor = parseInt(floor);
          var isActive = isAll || (selectedFloors && selectedFloors.has(floor));
          dot.classList.toggle('active', !!isActive);
          if (!isActive) allSelected = false;
        }
      }
      allDot.classList.toggle('active', allSelected);
    }
  },

  updateFabBadge(selectedFloors, floorStats) {
    var badge = document.getElementById('fab-badge');
    if (!badge) return;
    var totalFloors = 0;
    var floors = floorStats.sortedFloors;
    for (var i = 0; i < floors.length; i++) {
      if (floors[i] !== 'unknown') totalFloors++;
    }
    badge.textContent = selectedFloors === null ? totalFloors : selectedFloors.size;
  },

  hideDrawer() {
    this._toggleDrawer(false);
    if (this._fabEl) this._fabEl.style.display = 'none';
  }
```

- [ ] **Step 2: 验证**

```bash
cd docs && python3 -m http.server 8000
```

打开浏览器，检查控制台 `FloorView.renderDrawer` 是否存在。

- [ ] **Step 3: 提交**

```bash
git add docs/js/floor-view.js
git commit -m "feat: add FAB and drawer methods to FloorView"
```

---

### Task 5: 添加 `syncSidebarState()` 并更新 `runFloorAnalysis()`

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: 在 `runFloorAnalysis` 函数之前添加 `syncSidebarState()`**

```javascript
function syncSidebarState(selectedFloors) {
  document.querySelectorAll('.floor-node:not(.all)').forEach(function(node) {
    var floor = node.dataset.floor === 'unknown' ? 'unknown' : parseInt(node.dataset.floor);
    var isActive = selectedFloors === null || (selectedFloors && selectedFloors.has(floor));
    node.classList.toggle('active', !!isActive);
  });

  var allNode = document.querySelector('.floor-node.all');
  if (allNode) {
    var allFloorNodes = document.querySelectorAll('.floor-node:not(.all)');
    var allSelected = true;
    for (var i = 0; i < allFloorNodes.length; i++) {
      if (!allFloorNodes[i].classList.contains('active')) {
        allSelected = false;
        break;
      }
    }
    allNode.classList.toggle('active', allSelected);
  }

  FloorView._updateHighlight();
}
```

- [ ] **Step 2: 更新 `runFloorAnalysis()` 函数**

将：

```javascript
const floorChartCard = document.getElementById('floor-chart-card');
FloorView.renderFloorChart(state.floorStats, floorChartCard, state.selectedFloors);
```

替换为：

```javascript
const floorChartCard = document.getElementById('floor-chart-card');
FloorView.renderFloorChart(state.floorStats, floorChartCard, state.selectedFloors, function(clickedFloor) {
  var isSelected = state.selectedFloors && state.selectedFloors.has(clickedFloor);
  var newSelection;

  if (state.selectedFloors === null) {
    newSelection = new Set(state.floorStats.sortedFloors.filter(function(f) { return f !== 'unknown'; }));
    if (isSelected) newSelection.delete(clickedFloor);
  } else {
    newSelection = new Set(state.selectedFloors);
    if (isSelected) {
      newSelection.delete(clickedFloor);
    } else {
      newSelection.add(clickedFloor);
    }
  }

  state.selectedFloors = newSelection.size > 0 ? newSelection : null;
  onFloorSelectionChange();
  syncSidebarState(state.selectedFloors);
  FloorView.updateFabBadge(state.selectedFloors, state.floorStats);
  FloorView.updateDrawer(state.selectedFloors);
});

// FAB + 抽屉
FloorView.renderDrawer(state.floorStats, function(selectedFloors) {
  state.selectedFloors = selectedFloors;
  onFloorSelectionChange();
});
```

- [ ] **Step 3: 添加楼栋切换时的清理**

找到 `loadRanking()` 中楼栋切换时清理 FAB 的代码位置（在 `onBuildingChange` 或 `loadRanking` 开始时），添加：

```javascript
FloorView.hideDrawer();
```

- [ ] **Step 4: 验证**

```bash
cd docs && python3 -m http.server 8000
```

打开浏览器，验证：
1. 侧边栏点击正常
2. 楼层图表点击切换选中
3. FAB 按钮显示，点击打开抽屉
4. 抽屉中点击楼层切换选中
5. 手机视图（< 800px）侧边栏隐藏，FAB 显示
6. 分布图随楼层筛选变化

- [ ] **Step 5: 提交**

```bash
git add docs/building-view.html
git commit -m "feat: integrate chart click, drawer, and sidebar sync"
```

---

### 自检项

1. 侧边栏点击 → 统计卡片、分布图、排行榜更新
2. 楼层图表点击柱子 → 该楼层选中切换，侧边栏同步
3. FAB 按钮显示当前选中楼层数
4. 抽屉打开/关闭动画流畅
5. 抽屉中多选/全选/取消全选
6. 手机端侧边栏隐藏，FAB 显示
7. 桌面端侧边栏和 FAB 同时显示
8. 切换楼栋时 FAB 和抽屉隐藏