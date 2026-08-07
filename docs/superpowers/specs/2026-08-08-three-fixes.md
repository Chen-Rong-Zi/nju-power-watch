# 三个修复：Workflow 互斥 · 楼栋分页 · about.md 排序

## 概述

修复三个独立问题：
1. Query 和 Scan 两个 workflow 同时运行会触发 epay 限流，需要互斥
2. 楼栋页面排行榜的"暂无该日期数据"房间混入每一页底部，应只显示在最后几页
3. about.md 的"功能更新"时间顺序应改为最新在上

## 修改文件

- `.github/workflows/daily-query.yml` — 增加 concurrency 组
- `.github/workflows/room-id-scan.yml` — 增加 concurrency 组
- `docs/building-view.html` — 修复分页逻辑 + 楼层筛选过滤无数据房间
- `docs/js/floor-analytics.js` — 新增按楼层过滤房间数组的辅助函数
- `docs/about.md` — 重排功能更新时间顺序

---

## 修复一：Workflow 互斥

### 方案

在两个 workflow 顶层（`permissions` 之前）都增加相同名称的 concurrency 组：

```yaml
concurrency:
  group: epay-access
  cancel-in-progress: false
```

### 行为分析

- GitHub Actions 的 concurrency 组是仓库全局的，跨 workflow 生效
- Query 的 4 个链式批次共享 `epay-access` 组，Scan 也共享同一组
- 任何时刻 `epay-access` 组内只有一个 run 在执行，其余排队等待
- `cancel-in-progress: false`：不取消正在运行的 run，后来的排队

### 排队时序

```
Query Batch 1 运行中 → Scan 触发 → Scan 排队
Query Batch 1 完成 → 触发 Query Batch 2
Queue: [Scan, Query Batch 2]  → Scan 先运行
Scan 完成 → Query Batch 2 运行 → ...
```

- Scan 可能插在 Query 批次之间运行，但绝不重叠（限流保护达成）
- Query 批次链通过 `batch_run_summary.json` 传递累积状态，Scan 插队不影响

### 注意

- 手动触发 Query 时若 Scan 正在跑，Query 排队等待，不取消 Scan
- 手动触发 Scan 时若 Query 正在跑，Scan 排队等待，不取消 Query

---

## 修复二：楼栋排行榜分页

### 根因

`docs/building-view.html` 的 `renderCurrentPage()`（约 line 2799）用**单一滑动窗口**遍历（有效房间 + 无数据房间拼接的虚拟列表）：

```javascript
const totalItems = displayRankings.length + noDataRooms.length;
const totalPages = Math.ceil(totalItems / state.itemsPerPage);
const startIdx = (state.currentPage - 1) * state.itemsPerPage;
const endIdx = startIdx + state.itemsPerPage;
const pageRankings = displayRankings.slice(startIdx, endIdx);
const noDataStartIdx = Math.max(0, startIdx - displayRankings.length);
const noDataEndIdx = Math.min(noDataRooms.length, endIdx - displayRankings.length);
const pageNoDataRooms = noDataRooms.slice(noDataStartIdx, noDataEndIdx);
```

**问题**：当某页的有效房间数不足 `itemsPerPage` 时（限流事件期间大部分房间无数据，或楼层筛选后有效房间骤减），无数据房间会补进当前页，导致无数据房间出现在数据页底部。

### 修复方案

#### 1. 分页分离

有效房间独占前面的页，无数据房间独占后面的页：

```javascript
const dataPages = Math.ceil(displayRankings.length / state.itemsPerPage);
const noDataPages = noDataRooms.length > 0
  ? Math.ceil(noDataRooms.length / state.itemsPerPage)
  : 0;
const totalPages = Math.max(1, dataPages + noDataPages);
state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));

let pageRankings = [];
let pageNoDataRooms = [];

if (state.currentPage <= dataPages) {
  // 数据页：只显示有效房间
  const start = (state.currentPage - 1) * state.itemsPerPage;
  pageRankings = displayRankings.slice(start, start + state.itemsPerPage);
} else {
  // 无数据页：只显示无数据房间
  const noDataPage = state.currentPage - dataPages;
  const start = (noDataPage - 1) * state.itemsPerPage;
  pageNoDataRooms = noDataRooms.slice(start, start + state.itemsPerPage);
}
```

效果：数据页绝不混入无数据房间，无数据房间只出现在最后几页。

#### 2. 楼层筛选同步过滤 noDataRooms

当前 `onFloorSelectionChange()`（约 line 1844）只过滤有效房间：

```javascript
state.filteredRankings = state.selectedFloors === null ? null : filteredRankings;
```

需要同时过滤 `state.noDataRooms`。

**floor-analytics.js** 新增辅助函数（可被 `getFilteredRankings` 复用）：

```javascript
filterRoomsByFloors(rooms, floorGroups, selectedFloors) {
  if (selectedFloors === null) return rooms;
  const allowedRooms = new Set();
  selectedFloors.forEach(floor => {
    if (floor === 'unknown') {
      floorGroups.unknown.forEach(r => allowedRooms.add(r));
    } else if (floorGroups.groups[floor]) {
      floorGroups.groups[floor].forEach(r => allowedRooms.add(r));
    }
  });
  return rooms.filter(r => allowedRooms.has(r.roomName));
}
```

`getFilteredRankings` 改为调用此函数（传 rankings），`onFloorSelectionChange` 用同一函数过滤 noDataRooms。

**onFloorSelectionChange 修改**：

```javascript
const filteredNoData = state.selectedFloors === null
  ? state.noDataRooms
  : FloorAnalytics.filterRoomsByFloors(state.noDataRooms, state.floorGroups, state.selectedFloors);
state.filteredNoDataRooms = state.selectedFloors === null ? null : filteredNoData;
state.currentPage = 1;
renderCurrentPage();
```

**renderCurrentPage 修改**（line 2800-2801）：

```javascript
const allRankings = state.filteredRankings || state.allRankings || [];
const noDataRooms = state.filteredNoDataRooms || state.noDataRooms || [];
```

**重置筛选状态**：现有代码在加载新数据时会把 `state.filteredRankings = null`（约 line 1971、2028）。需在同一处同步重置 `state.filteredNoDataRooms = null`，否则切换楼栋后残留上一次的楼层无数据过滤。

### 验证

- 不筛选楼层：无数据房间只在最后几页，数据页干净
- 筛选楼层：只显示该楼层的有效房间 + 该楼层的无数据房间（在最后几页）
- 全部无数据（限流期间）：显示为纯无数据页

---

## 修复三：about.md 排序

将"功能更新"（line 16-43）的各月份条目按时间倒序，最新在上：

当前顺序（旧→新）：
```
2026 年 5 月 · 项目启动
2026 年 6 月 · 数据可视化增强
2026 年 7 月 · 体验优化
2026 年 8 月 · 楼层分析上线
2026 年 8 月 · 限流事件
```

改为（新→旧）：
```
### 📅 2026 年 8 月 · 限流事件
### 📅 2026 年 8 月 · 楼层分析上线
### 📅 2026 年 7 月 · 体验优化
### 📅 2026 年 6 月 · 数据可视化增强
### 📅 2026 年 5 月 · 项目启动
```

仅调整 `###` 标题和 `-` 列表的顺序，不修改内容文案。