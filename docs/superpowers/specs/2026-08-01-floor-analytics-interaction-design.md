# 楼层分析交互增强设计

> **基于** 2026-08-01-floor-analytics-design.md 的补充交互设计

**目标：** 修复"耗电量分布"图不随楼层筛选更新、增加手机端楼层选择抽屉、楼层图表可点击切换楼层

**架构：** 所有三种交互方式（侧边栏/底部抽屉/楼层图表）共享 `state.selectedFloors`，统一通过 `onFloorSelectionChange()` 刷新数据，三者始终保持同步

**设计范围：** 仅修改 `docs/building-view.html`（内联 JS）和 `docs/js/floor-view.js`，不新增文件

---

## 变更一览

| 变更 | 文件 | 类型 |
|------|------|------|
| 分布图随楼层筛选更新 | `docs/building-view.html` | 修复 |
| 楼层图表点击切换楼层 | `docs/js/floor-view.js` | 新增功能 |
| FAB 悬浮按钮 + 底部抽屉 | `docs/js/floor-view.js` | 新增功能 |
| 手机端隐藏侧边栏 | `docs/building-view.html` (CSS) | 样式调整 |
| 桌面端侧边栏保持 | `docs/building-view.html` (CSS) | 不变 |

---

## 1. 耗电量分布图修复

### 问题

`onFloorSelectionChange()` 更新了统计卡片、楼层图表和排行榜，但未调用 `renderDistributionChart()`，导致分布图始终显示全部楼层的数据。

### 修复

在 `onFloorSelectionChange()` 中，更新统计卡片后，添加：

```javascript
// 更新耗电量分布图
renderDistributionChart(filteredRankings);
```

`renderDistributionChart()` 已存在（line 2912），直接传入筛选后的数据即可。

---

## 2. 楼层图表点击

### 行为

- 点击楼层耗电对比图表的柱子 → 切换该楼层在 `state.selectedFloors` 中的选中状态
- 已选中的柱子保持绿色，未选中的变灰
- 点击后同步更新侧边栏、FAB 徽标、抽屉

### 实现

`renderFloorChart()` 增加 `onChartClick` 回调和 `numericFloors` 局部变量：

```javascript
renderFloorChart(floorStats, container, selectedFloors, onChartClick) {
  const { floors, sortedFloors } = floorStats;
  const numericFloors = sortedFloors.filter(f => f !== 'unknown');
  // ... 现有图表代码 ...

  this._chartInstance.options.onClick = function(e, elements) {
    if (elements.length > 0) {
      const idx = elements[0].index;
      const floor = numericFloors[idx];
      onChartClick(floor);
    }
  };
}
```

在 `runFloorAnalysis()` 中调用：

```javascript
FloorView.renderFloorChart(state.floorStats, floorChartCard, state.selectedFloors, function(clickedFloor) {
  const isSelected = state.selectedFloors?.has(clickedFloor);
  let newSelection;

  if (state.selectedFloors === null) {
    // 当前是"全部楼层"，先选中所有，再切换点击的楼层
    newSelection = new Set(state.floorStats.sortedFloors.filter(f => f !== 'unknown'));
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
```

---

## 3. FAB 悬浮按钮 + 底部抽屉

### CSS

```css
/* 手机端隐藏侧边栏 */
@media (max-width: 800px) {
  .floor-side { display: none !important; }
}

/* FAB 悬浮按钮 */
.floor-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
  z-index: 50;
  font-size: 18px;
  display: none; /* 默认隐藏，楼层数据加载后通过 JS 显示 */
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}
.floor-fab:hover { transform: scale(1.05); }
.floor-fab:active { transform: scale(0.92); }

.floor-fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
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

/* 抽屉遮罩 */
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

/* 抽屉面板 */
.floor-drawer-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
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
  width: 36px;
  height: 4px;
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
.floor-drawer-title {
  font-weight: 600;
  font-size: 16px;
}
.floor-drawer-close {
  width: 28px;
  height: 28px;
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
  border-radius: 8px; /* 防止 hover 时 margin 溢出 */
}
.floor-drawer-item:last-child { border-bottom: none; }
.floor-drawer-item:hover { background: #f8f8fa; }

.floor-drawer-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #d0d0d0;
  margin-right: 14px;
  flex-shrink: 0;
  transition: all 0.2s;
}
.floor-drawer-dot.active {
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 20%, transparent);
  width: 16px;
  height: 16px;
}

.floor-drawer-item-label { font-size: 14px; flex: 1; }
.floor-drawer-item-count { font-size: 12px; color: var(--muted); }
.floor-drawer-item-sub { font-size: 12px; color: #bbb; margin-left: 8px; }
```

### JS 实现

在 `FloorView` 中新增方法：

```javascript
// 渲染 FAB + 抽屉
renderDrawer(floorStats, onToggle) {
  this._drawerOnToggle = onToggle;

  // 创建 FAB
  if (!this._fabEl) {
    this._fabEl = document.createElement('button');
    this._fabEl.className = 'floor-fab';
    this._fabEl.innerHTML = '<span>🏢</span><span class="floor-fab-badge" id="fab-badge"></span>';
    this._fabEl.onclick = function() { FloorView._toggleDrawer(true); };
    document.body.appendChild(this._fabEl);
  }
  this._fabEl.style.display = 'flex';

  // 创建遮罩
  if (!this._overlayEl) {
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'floor-drawer-overlay';
    this._overlayEl.onclick = function() { FloorView._toggleDrawer(false); };
    document.body.appendChild(this._overlayEl);
  }

  // 创建抽屉面板
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

  // 填充列表
  this._renderDrawerList(floorStats);
  this.updateFabBadge(null, floorStats);
}

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

  // 全部楼层
  listEl.appendChild(createItem('all', '全部楼层', null));

  // 各楼层（按 sortedFloors 顺序）
  for (var i = 0; i < sortedFloors.length; i++) {
    var floor = sortedFloors[i];
    if (floor === 'unknown') continue;
    listEl.appendChild(createItem(floor, floor + '层', floors[floor]));
  }

  // 处理 unknown
  if (floors.unknown) {
    listEl.appendChild(createItem('unknown', '未识别', floors.unknown));
  }
}

_toggleAllFromDrawer() {
  var allDot = this._drawerEl && this._drawerEl.querySelector('.floor-drawer-item.all .floor-drawer-dot');
  var allActive = allDot && allDot.classList.contains('active');
  // 全部选中 → null（全部楼层）；全部取消 → 空 Set（无选中）
  if (this._drawerOnToggle) {
    this._drawerOnToggle(allActive ? null : new Set());
  }
}

_toggleFloorFromDrawer(floor) {
  // 读取当前抽屉选中状态，切换指定楼层
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

  // 切换指定楼层
  if (activeSet.has(floor)) {
    activeSet.delete(floor);
  } else {
    activeSet.add(floor);
  }

  if (this._drawerOnToggle) {
    this._drawerOnToggle(activeSet.size > 0 ? activeSet : null);
  }
}

_toggleDrawer(open) {
  this._drawerOpen = open;
  if (this._overlayEl) this._overlayEl.classList.toggle('open', open);
  if (this._drawerEl) this._drawerEl.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

updateDrawer(selectedFloors) {
  if (!this._drawerEl) return;
  var items = this._drawerEl.querySelectorAll('.floor-drawer-item');
  if (!items.length) return;
  var isAll = selectedFloors === null;

  // 第一个是"全部楼层"
  var allDot = items[0].querySelector('.floor-drawer-dot');
  if (allDot) {
    // 检查所有非全部楼层是否都选中
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
    if (allDot) allDot.classList.toggle('active', allSelected);
  } else {
    // 没有"全部楼层"项，遍历所有非全部楼层
    for (var j = 0; j < items.length; j++) {
      var d = items[j].querySelector('.floor-drawer-dot');
      if (d) {
        var f = items[j].dataset.floor;
        if (f === 'unknown') f = 'unknown';
        else f = parseInt(f);
        d.classList.toggle('active', !!(isAll || (selectedFloors && selectedFloors.has(f))));
      }
    }
  }
}

updateFabBadge(selectedFloors, floorStats) {
  var badge = document.getElementById('fab-badge');
  if (!badge) return;
  var totalFloors = 0;
  var floors = floorStats.sortedFloors;
  for (var i = 0; i < floors.length; i++) {
    if (floors[i] !== 'unknown') totalFloors++;
  }
  badge.textContent = selectedFloors === null ? totalFloors : selectedFloors.size;
}

hideDrawer() {
  this._toggleDrawer(false);
  if (this._fabEl) this._fabEl.style.display = 'none';
}
```

### 抽屉交互逻辑

| 操作 | 行为 |
|------|------|
| 点击 FAB | 打开抽屉（遮罩淡入，面板滑入） |
| 点击遮罩 / ✕ 按钮 | 关闭抽屉（遮罩淡出，面板滑出） |
| 点击"全部楼层" | 全部选中 / 全部取消（切换） |
| 点击单个楼层 | 切换选中/未选中 |
| 全部楼层手动选中时 | "全部楼层"项自动变为激活状态 |
| 取消某个楼层时 | "全部楼层"项自动取消激活 |

---

## 4. 侧边栏状态同步

新增 `syncSidebarState()` 函数，确保图表点击或抽屉操作后侧边栏的选中状态同步：

```javascript
function syncSidebarState(selectedFloors) {
  // 更新所有楼层节点
  document.querySelectorAll('.floor-node:not(.all)').forEach(function(node) {
    var floor = node.dataset.floor === 'unknown' ? 'unknown' : parseInt(node.dataset.floor);
    var isActive = selectedFloors === null || (selectedFloors && selectedFloors.has(floor));
    node.classList.toggle('active', !!isActive);
  });

  // 更新"全部楼层"节点
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

  // 更新高亮线
  FloorView._updateHighlight();
}
```

---

## 5. 初始化流程

在 `runFloorAnalysis()` 中整合所有组件：

```javascript
async function runFloorAnalysis(allRankings, roomNames) {
  const floorMap = await FloorUtils.loadFloorMap();
  state.floorMap = floorMap;
  state.floorGroups = FloorUtils.groupRoomsByFloor(roomNames, state.campus, state.building, floorMap);
  state.floorStats = FloorAnalytics.calculateFloorStats(allRankings, state.floorGroups);

  // 侧边栏
  var floorSide = document.getElementById('floor-side');
  FloorView.renderIndicator(state.floorStats, floorSide, function(selectedFloors) {
    state.selectedFloors = selectedFloors;
    onFloorSelectionChange();
  });

  // 楼层图表（增加点击回调）
  var floorChartCard = document.getElementById('floor-chart-card');
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
}
```

---

## 6. 清理

在 `loadRanking()` 的清理路径中（如楼栋切换时），隐藏 FAB 和抽屉：

```javascript
// 切换楼栋时隐藏 FAB 和抽屉
FloorView.hideDrawer();
```

---

## 交互流程总结

```
点击 FAB ─→ 打开抽屉
点击楼层项 ─→ 切换选中 ↴
点击图表柱子 ─→ 切换选中 ─→ onFloorSelectionChange()
点击侧边栏节点 ─→ 切换选中 ↕
                              ↓
                        统计卡片更新
                        分布图更新
                        楼层图表高亮更新
                        侧边栏状态同步
                        抽屉状态同步
                        FAB 徽标更新
```