# 楼栋页统一房间列表（is_noRoom 标记）重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把楼栋页 `allRankings`+`noDataRooms` 双数组合并为单一 `allRooms` 列表（每房间带 `is_noRoom` 标记），所有组件从同一数据源派生计数，从结构上消除"暂无数据房间导致组件数据对不上"。

**Architecture:** 前端纯函数层（`FloorAnalytics`）+ 页面接线（`building-view.html`）两层。纯函数全部改为接收统一列表并单测；页面按"生产者（loadRanking 构建 allRooms）→ 消费者（displayRanking/onFloorSelectionChange/renderCurrentPage/FloorView）"改造。IndexedDB 缓存格式不变（仍存 data+noDataRooms），仅在 building-view 读取时合并。

**Tech Stack:** vanilla JS ES6+，Node 22+ `node --test`（测试加载用 `new Function` 读全局脚本模式），无浏览器端构建。

**Spec:** `docs/superpowers/specs/2026-08-08-building-view-unified-list-design.md`

---

## 验证工具（各任务复用）

### 内联脚本语法检查（building-view.html 改动后必跑）

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('docs/building-view.html','utf8');
const blocks=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
for(const m of blocks){ new Function(m[1]); }
console.log('OK: inline scripts syntax valid,', blocks.length, 'block(s)');
"
```
预期输出：`OK: inline scripts syntax valid, N block(s)`（任何一行有语法错误会抛异常并失败）

### 独立 JS 文件语法检查

```bash
node --check docs/js/floor-analytics.js && node --check docs/js/floor-view.js && echo OK
```

### 单测运行

```bash
node --test tests/js/floor-analytics.test.js
```
（注意：不要用 `node --test tests/js/` 目录模式，Node 26 有 MODULE_NOT_FOUND 坑，必须显式给文件）

---

## Task 1: floor-analytics.js 纯函数重构（TDD）

**Files:**
- Modify: `docs/js/floor-analytics.js`（整文件重写，105 行）
- Test: `tests/js/floor-analytics.test.js`（新建/恢复）

- [ ] **Step 1: 写测试（先失败）**

创建 `tests/js/floor-analytics.test.js`：

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function loadFloorAnalytics() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'docs', 'js', 'floor-analytics.js'), 'utf8');
  return new Function(src + '\n; return FloorAnalytics;')();
}

// 构造统一列表辅助：makeRoom(name, consumption) — consumption 为 null 表示暂无数据
function makeRoom(name, consumption) {
  return {
    roomName: name, room: name, campus: 'campus', building: 'bldg',
    consumption: consumption === undefined ? null : consumption,
    balance: consumption === undefined ? null : 10,
    rank: consumption === undefined ? null : 5,
    is_noRoom: consumption === undefined
  };
}

const FA = loadFloorAnalytics();

// ---- calculateFloorStats ----
test('calculateFloorStats: withDataCount=有数据房间数, totalCount=全部房间数', () => {
  const rooms = [
    makeRoom('A101', 1.0), makeRoom('A102', 2.0), makeRoom('A103'),   // 1层: 2有数据 + 1暂无
    makeRoom('B201'), makeRoom('B202'),                               // 2层: 0有数据 + 2暂无
    makeRoom('C301', 3.0),                                            // 3层: 1有数据 + 0暂无
  ];
  const floorGroups = {
    groups: { '1': ['A101', 'A102', 'A103'], '2': ['B201', 'B202'], '3': ['C301'] },
    unknown: []
  };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[1].withDataCount, 2);
  assert.strictEqual(floors[1].totalCount, 3);
  assert.strictEqual(floors[2].withDataCount, 0);
  assert.strictEqual(floors[2].totalCount, 2);
  assert.strictEqual(floors[3].withDataCount, 1);
  assert.strictEqual(floors[3].totalCount, 1);
});

test('calculateFloorStats: 消耗统计只基于有数据房间', () => {
  const rooms = [
    makeRoom('A101', 1.0), makeRoom('A102', 3.0), makeRoom('A103'),
  ];
  const floorGroups = { groups: { '1': ['A101', 'A102', 'A103'] }, unknown: [] };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[1].totalConsumption, 4.0);
  assert.strictEqual(floors[1].avgConsumption, 2.0);
  assert.strictEqual(floors[1].maxConsumption, 3.0);
  assert.strictEqual(floors[1].minConsumption, 1.0);
});

test('calculateFloorStats: 0 数据楼层消耗统计全 0', () => {
  const rooms = [makeRoom('B201'), makeRoom('B202')];
  const floorGroups = { groups: { '2': ['B201', 'B202'] }, unknown: [] };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[2].withDataCount, 0);
  assert.strictEqual(floors[2].totalConsumption, 0);
  assert.strictEqual(floors[2].avgConsumption, 0);
});

test('calculateFloorStats: unknown 楼层同样口径', () => {
  const rooms = [makeRoom('X1', 1.0), makeRoom('X2')];
  const floorGroups = { groups: {}, unknown: ['X1', 'X2'] };
  const { floors, sortedFloors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors.unknown.withDataCount, 1);
  assert.strictEqual(floors.unknown.totalCount, 2);
  assert.deepStrictEqual(sortedFloors, ['unknown']);
});

// ---- buildDisplayOrder ----
test('buildDisplayOrder: 降序时数据在前暂无数据末尾', () => {
  const rooms = [makeRoom('A', 1.0), makeRoom('B'), makeRoom('C', 3.0), makeRoom('D', 2.0)];
  const order = FA.buildDisplayOrder(rooms, true);
  assert.deepStrictEqual(order.map(r => r.roomName), ['C', 'D', 'A', 'B']);
});

test('buildDisplayOrder: 升序时数据段反转暂无数据仍末尾', () => {
  const rooms = [makeRoom('A', 3.0), makeRoom('B'), makeRoom('C', 1.0), makeRoom('D', 2.0)];
  const order = FA.buildDisplayOrder(rooms, false);
  assert.deepStrictEqual(order.map(r => r.roomName), ['C', 'D', 'A', 'B']);
});

// ---- computePageSlices ----
function displayOrderOf(names) {
  return names.map(n => ({ roomName: n, is_noRoom: n.startsWith('N') }));
}

test('computePageSlices: 数据页干净，暂无数据只占尾页', () => {
  // 5 数据 + 2 暂无, itemsPerPage=2 → 数据页3页(2/2/1)，暂无数据1页
  const order = displayOrderOf(['D1', 'D2', 'D3', 'D4', 'D5', 'N1', 'N2']);
  const p1 = FA.computePageSlices(order, 1, 2);
  assert.strictEqual(p1.totalPages, 4);
  assert.deepStrictEqual(p1.pageRankings.map(r => r.roomName), ['D1', 'D2']);
  assert.deepStrictEqual(p1.pageNoDataRooms, []);
  const p3 = FA.computePageSlices(order, 3, 2);
  assert.deepStrictEqual(p3.pageRankings.map(r => r.roomName), ['D5']);
  assert.deepStrictEqual(p3.pageNoDataRooms, []);
  const p4 = FA.computePageSlices(order, 4, 2);
  assert.deepStrictEqual(p4.pageRankings, []);
  assert.deepStrictEqual(p4.pageNoDataRooms.map(r => r.roomName), ['N1', 'N2']);
});

test('computePageSlices: 页码越界被钳制', () => {
  const order = displayOrderOf(['D1', 'D2', 'N1']);
  const p = FA.computePageSlices(order, 99, 2);
  assert.strictEqual(p.totalPages, 2);
  // 不抛异常即通过（内部钳制到末页）
});

test('computePageSlices: 全部暂无数据时只有尾页', () => {
  const order = displayOrderOf(['N1', 'N2', 'N3']);
  const p = FA.computePageSlices(order, 1, 2);
  assert.strictEqual(p.totalPages, 2);
  assert.deepStrictEqual(p.pageRankings, []);
  assert.deepStrictEqual(p.pageNoDataRooms.map(r => r.roomName), ['N1', 'N2']);
});

// ---- filterRoomsByFloors ----
test('filterRoomsByFloors: 按楼层过滤统一列表（含暂无数据）', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('A102'), makeRoom('B201', 2.0)];
  const floorGroups = { groups: { '1': ['A101', 'A102'], '2': ['B201'] }, unknown: [] };
  const selected = new Set([1]);
  const out = FA.filterRoomsByFloors(rooms, floorGroups, selected);
  assert.deepStrictEqual(out.map(r => r.roomName), ['A101', 'A102']);
});

test('filterRoomsByFloors: null 选中返回原列表', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('A102')];
  const floorGroups = { groups: { '1': ['A101', 'A102'] }, unknown: [] };
  const out = FA.filterRoomsByFloors(rooms, floorGroups, null);
  assert.strictEqual(out, rooms);
});

test('filterRoomsByFloors: unknown 楼层选择', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('X1')];
  const floorGroups = { groups: { '1': ['A101'] }, unknown: ['X1'] };
  const out = FA.filterRoomsByFloors(rooms, floorGroups, new Set(['unknown']));
  assert.deepStrictEqual(out.map(r => r.roomName), ['X1']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/js/floor-analytics.test.js`
Expected: 全部 FAIL（`calculateFloorStats` 返回 `floors[1].withDataCount` 为 undefined 等；`buildDisplayOrder`/`computePageSlices` 报 not a function）

- [ ] **Step 3: 重写 floor-analytics.js**

整体替换 `docs/js/floor-analytics.js` 内容为：

```js
/**
 * 楼层聚合计算
 * 在统一房间列表（含 is_noRoom 标记）基础上，按楼层聚合统计
 */

const FloorAnalytics = {
  calculateFloorStats(allRooms, floorGroups) {
    const floors = {};

    Object.entries(floorGroups.groups).forEach(([floor, rooms]) => {
      const floorNum = parseInt(floor);
      const dataRooms = allRooms.filter(r => !r.is_noRoom && rooms.includes(r.roomName));
      const consumptions = dataRooms.map(r => r.consumption);

      floors[floorNum] = {
        withDataCount: dataRooms.length,
        totalCount: rooms.length,
        rooms: rooms,
        totalConsumption: consumptions.reduce((s, v) => s + v, 0),
        avgConsumption: dataRooms.length > 0
          ? consumptions.reduce((s, v) => s + v, 0) / dataRooms.length
          : 0,
        maxConsumption: dataRooms.length > 0 ? Math.max(...consumptions) : 0,
        minConsumption: dataRooms.length > 0 ? Math.min(...consumptions) : 0
      };
    });

    // 处理 unknown 房间
    if (floorGroups.unknown && floorGroups.unknown.length > 0) {
      const uData = allRooms.filter(r => !r.is_noRoom && floorGroups.unknown.includes(r.roomName));
      const uCons = uData.map(r => r.consumption);
      floors.unknown = {
        withDataCount: uData.length,
        totalCount: floorGroups.unknown.length,
        rooms: floorGroups.unknown,
        totalConsumption: uCons.reduce((s, v) => s + v, 0),
        avgConsumption: uData.length > 0 ? uCons.reduce((s, v) => s + v, 0) / uData.length : 0,
        maxConsumption: uData.length > 0 ? Math.max(...uCons) : 0,
        minConsumption: uData.length > 0 ? Math.min(...uCons) : 0
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
  },

  buildDisplayOrder(allRooms, sortDesc) {
    const dataRooms = allRooms.filter(r => !r.is_noRoom);
    const noDataRooms = allRooms.filter(r => r.is_noRoom);
    if (sortDesc) return [...dataRooms, ...noDataRooms];
    return [...dataRooms].reverse().concat(noDataRooms);
  },

  computePageSlices(displayOrder, currentPage, itemsPerPage) {
    const dataRooms = displayOrder.filter(r => !r.is_noRoom);
    const noDataRooms = displayOrder.filter(r => r.is_noRoom);

    const dataPages = Math.ceil(dataRooms.length / itemsPerPage);
    const noDataPages = noDataRooms.length > 0
      ? Math.ceil(noDataRooms.length / itemsPerPage)
      : 0;
    const totalPages = Math.max(1, dataPages + noDataPages);
    const page = Math.max(1, Math.min(currentPage, totalPages));

    let pageRankings = [];
    let pageNoDataRooms = [];

    if (page <= dataPages) {
      const start = (page - 1) * itemsPerPage;
      pageRankings = dataRooms.slice(start, start + itemsPerPage);
    } else {
      const noDataPage = page - dataPages;
      const start = (noDataPage - 1) * itemsPerPage;
      pageNoDataRooms = noDataRooms.slice(start, start + itemsPerPage);
    }

    return { pageRankings, pageNoDataRooms, totalPages };
  },
};
```

> 注意：`getFilteredRankings` 已删除（`onFloorSelectionChange` 改直接调 `filterRoomsByFloors`，见 Task 3）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/js/floor-analytics.test.js`
Expected: 全部 PASS（10 个测试）

- [ ] **Step 5: 语法检查其他 JS（确认无遗漏引用）**

Run: `grep -rn "getFilteredRankings" docs/`
Expected: 无输出（已删除）；若有引用，说明还有地方要用 `filterRoomsByFloors` 替换，在 Task 3 处理。
同时 `node --check docs/js/floor-analytics.js` → 无输出。

- [ ] **Step 6: Commit**

```bash
git add docs/js/floor-analytics.js tests/js/floor-analytics.test.js
git commit -m "refactor: FloorAnalytics 统一列表纯函数（is_noRoom）+ 恢复单测"
```

---

## Task 2: floor-view.js 字段重命名（roomCount → withDataCount）

**Files:**
- Modify: `docs/js/floor-view.js:44,45,150,284`

- [ ] **Step 1: 修改 3 处字段读取**

在 `docs/js/floor-view.js` 中做 3 处替换：

1. L44-45（renderIndicator 楼层标签）：
```js
// 旧
const label = floor === 'unknown'
  ? `未识别 · ${stats.roomCount}间`
  : `${floor}层 · ${stats.roomCount}间`;
// 新
const label = floor === 'unknown'
  ? `未识别 · ${stats.withDataCount}间`
  : `${floor}层 · ${stats.withDataCount}间`;
```

2. L150（renderFloorChart tooltip 数据）：
```js
// 旧
const roomCounts = numericFloors.map(f => floors[f].roomCount);
// 新
const roomCounts = numericFloors.map(f => floors[f].withDataCount);
```

3. L284（_renderDrawerList 抽屉计数）：
```js
// 旧
: stats.roomCount;
// 新
: stats.withDataCount;
```

- [ ] **Step 2: 语法检查 + 确认无残留**

Run: `node --check docs/js/floor-view.js && grep -n "roomCount" docs/js/floor-view.js`
Expected: 语法 OK；grep 无输出（`roomCounts` 变量名不算——检查 `stats.roomCount`/`floors[f].roomCount` 已全替换）

- [ ] **Step 3: Commit**

```bash
git add docs/js/floor-view.js
git commit -m "refactor: floor-view 侧边栏/抽屉/图表计数改用 withDataCount"
```

---

## Task 3: building-view.html 统一列表迁移

**Files:**
- Modify: `docs/building-view.html`（8 处函数/状态）

> 本任务改动相互耦合，按下列 Step 顺序逐个修改。**每个 Step 后跑一次"内联脚本语法检查"**（见顶部验证工具），保证任一步都不留下语法错误。全部完成后页面数据流才一致（浏览器验证在 Task 4）。

- [ ] **Step 1: state 增加 allRooms/filteredRooms**

在 `docs/building-view.html` 的 state 定义（约 L1620-1633）末尾 `floorMap` 后追加两个字段：

```js
      floorMap: null,           // 楼层映射配置
      allRooms: null,           // 统一房间列表（含 is_noRoom 标记）
      filteredRooms: null,      // 楼层筛选后的子集（null = 未筛选）
    };
```

- [ ] **Step 2: runFloorAnalysis 参数更名 allRooms**

`runFloorAnalysis`（约 L1796）：把第一行 `async function runFloorAnalysis(allRankings, roomNames, preloadedFloorMap) {` 改为 `async function runFloorAnalysis(allRooms, roomNames, preloadedFloorMap) {`，并把函数体内 `state.floorStats = FloorAnalytics.calculateFloorStats(allRankings, state.floorGroups);` 改为 `state.floorStats = FloorAnalytics.calculateFloorStats(allRooms, state.floorGroups);`。其余（renderIndicator/renderFloorChart/renderDrawer 回调）不变。

- [ ] **Step 3: loadRanking 内存缓存路径**

替换 `loadRanking` 中内存缓存分支（约 L2151-2167）：

```js
      // 1. 先检查内存缓存
      if (consumptionCache.has(effectiveCacheKey)) {
        updateCacheStatus('已缓存', false);
        const cachedData = consumptionCache.get(effectiveCacheKey);
        let allRooms;
        if (Array.isArray(cachedData.allRooms)) {
          allRooms = cachedData.allRooms;
        } else if (Array.isArray(cachedData)) {
          // 极旧格式：直接是数组（全部视为有数据）
          allRooms = cachedData.map(r => ({ ...r, is_noRoom: false }));
        } else {
          // 旧格式 { rankings, noDataRooms } 合并重建
          const rankings = cachedData.rankings || [];
          const noDataRooms = cachedData.noDataRooms || [];
          allRooms = [
            ...rankings.map(r => ({ ...r, is_noRoom: false })),
            ...noDataRooms.map(r => ({ ...r, room: r.roomName, consumption: null, balance: null, rank: null, is_noRoom: true }))
          ];
        }

        // 楼层分析（建筑摘要通常已缓存，不会触发网络请求）
        const summary = await DataService.getBuildingSummary(state.campus, state.building);
        if (thisLoadId !== state.currentLoadId) return;
        if (summary && summary.rooms) {
          const allRoomNames = Object.keys(summary.rooms);
          await runFloorAnalysis(allRooms, allRoomNames);
        }

        displayRanking(allRooms);
        return;
      }
```

- [ ] **Step 4: loadRanking IndexedDB 缓存路径**

替换 `loadRanking` 中 IndexedDB 缓存分支（约 L2171-2249）。把 `let allRankings = localStorageCache.data.map(...)` 改为构建 `dataRooms`（带 `is_noRoom:false` + rank），把后面的 `noDataRooms` 计算改为构建 `noDataRooms`（带 `is_noRoom:true`），最后合并为 `allRooms`。具体替换该分支内从"转换缓存格式"到"保存到内存缓存"的代码：

```js
        // 转换缓存格式，从 state 补充 campus 和 building
        const dataRooms = localStorageCache.data.map((item, idx) => ({
          room: item.roomName || item.name,
          roomName: item.roomName || item.name,
          consumption: item.consumption,
          balance: item.balance,
          campus: state.campus,
          building: state.building,
          rank: idx + 1,
          is_noRoom: false
        }));

        // 从缓存元数据或重新计算暂无数据房间名
        let noDataNames = [];
        if (localStorageCache.noDataRooms && localStorageCache.noDataRooms.length > 0) {
          noDataNames = localStorageCache.noDataRooms;
        } else {
          // 如果缓存中没有 noDataRooms，从楼栋信息计算
          const buildingSummary = await DataService.getBuildingSummary(state.campus, state.building);
          if (buildingSummary && buildingSummary.rooms) {
            const allRoomNames = Object.keys(buildingSummary.rooms);
            const rankingRoomNames = new Set(dataRooms.map(r => r.roomName));
            noDataNames = allRoomNames.filter(name => !rankingRoomNames.has(name));
          }
        }
        const noDataRooms = noDataNames.map(name => ({
          roomName: name, room: name,
          consumption: null, balance: null,
          campus: state.campus, building: state.building,
          rank: null, is_noRoom: true
        }));

        // 检查是否需要排序（sorted 字段为 false 或不存在）
        if (!localStorageCache.sorted) {
          console.log('[缓存修正] 数据未排序，正在重新排序并更新缓存');
          updateCacheStatus('排序中...', true);

          // 按消耗量降序排序（仅数据房间）
          dataRooms.sort((a, b) => b.consumption - a.consumption);
          dataRooms.forEach((item, idx) => item.rank = idx + 1);

          // 更新 IndexedDB 缓存，标记为已排序
          const sortedCacheData = dataRooms.map(item => ({
            room: item.roomName,
            roomName: item.roomName,
            consumption: item.consumption,
            balance: item.balance
          }));
          await DataService.saveRankingCache(state.campus, state.building, effectiveDate === 'today' ? null : effectiveDate, sortedCacheData, true, {
            totalRooms: localStorageCache.totalRooms,
            roomsWithData: localStorageCache.roomsWithData,
            noDataRooms: localStorageCache.noDataRooms
          });
          console.log('[缓存修正] 排序完成，缓存已更新');
        }

        updateCacheStatus('已缓存', false);

        // 合并统一列表（数据在前、暂无数据在后）
        const allRooms = dataRooms.concat(noDataRooms);

        // 同时保存到内存缓存
        consumptionCache.set(effectiveCacheKey, { allRooms: allRooms });

        // 楼层分析（从建筑摘要获取房间名列表）
        const buildingSummaryForFloor = await DataService.getBuildingSummary(state.campus, state.building);
        if (buildingSummaryForFloor && buildingSummaryForFloor.rooms) {
          const allRoomNames = Object.keys(buildingSummaryForFloor.rooms);
          await runFloorAnalysis(allRooms, allRoomNames);
        }

        // 显示结果
        displayRanking(allRooms);
        return;
```

> 注意：`allRankings` 变量名在本分支已全部改为 `dataRooms`；旧代码里对 `allRankings` 的其余引用（L2176-2248）应已全部被本替换覆盖。若仍有残留引用，全部改为 `dataRooms` 或 `allRooms`（视语义）。

- [ ] **Step 5: loadRanking 全新加载路径**

**5a.** 把数组声明（约 L2294-2298）改为单一列表：
```js
      // 动态前10名列表（用于动画展示）
      let currentTop10 = [];
      // 统一房间列表（含 is_noRoom 标记）
      const allRooms = [];
```
（删除 `const allRankings = [];` 与 `const noDataRooms = [];`）

**5b.** `streamRoomHistory` 回调（约 L2325-2362）整体替换为（保留 `const item` 给动画用，同时 push 进 `allRooms`）：

```js
            // 如果数据有效，立即计算消耗量并更新排行榜
            if (roomData && roomData.history && roomData.history.length > 0) {
              const roomInfo = roomMap[roomName];
              const consumption = calculateConsumption(roomData.history, effectiveDate);

              if (consumption !== null) {
                const item = {
                  room: roomName,
                  roomName: roomName,
                  consumption: consumption,
                  balance: roomInfo.current_balance,
                  campus: state.campus,
                  building: state.building,
                  is_noRoom: false
                };
                allRooms.push(item);

                // 如果需要动画，更新前10名显示
                if (!hasAnimationShown) {
                  const inserted = insertIntoTop10(currentTop10, item);
                  renderTop10Immediate(currentTop10, listEl, inserted ? item.roomName : null, loaded, total);
                }
              } else {
                // 指定日期无数据
                allRooms.push({
                  roomName: roomName,
                  campus: state.campus,
                  building: state.building,
                  consumption: null,
                  balance: null,
                  is_noRoom: true
                });
              }
            } else {
              // 无历史数据
              allRooms.push({
                roomName: roomName,
                campus: state.campus,
                building: state.building,
                consumption: null,
                balance: null,
                is_noRoom: true
              });
            }
```

**5c.** 备用批量路径（`batchGetRoomHistory`，约 L2385-2424）同样改造。该循环内两处：

数据有效分支（原 `const item = {...}; allRankings.push(item);`）改为：
```js
              const item = {
                room: roomName,
                roomName: roomName,
                consumption: consumption,
                balance: roomInfo.current_balance,
                campus: state.campus,
                building: state.building,
                is_noRoom: false
              };
              allRooms.push(item);

              // 如果需要动画，更新前10名显示
              if (!hasAnimationShown) {
                const inserted = insertIntoTop10(currentTop10, item);
                renderTop10Immediate(currentTop10, listEl, inserted ? item.roomName : null, processedCount, roomNames.length);
              }
```

指定日期无数据分支（原 `noDataRooms.push({ roomName, campus, building });`）改为：
```js
              // 指定日期无数据
              allRooms.push({
                roomName: roomName,
                campus: state.campus,
                building: state.building,
                consumption: null,
                balance: null,
                is_noRoom: true
              });
```

无历史数据分支（else 里原 `noDataRooms.push(...)`）同样改为 push 上述 `is_noRoom:true` 对象。

**5d.** 收尾段（约 L2432-2489）替换为：

```js
      // 检查是否被取消
      if (thisLoadId !== state.currentLoadId) {
        return;
      }

      const dataRooms = allRooms.filter(r => !r.is_noRoom);

      // 检查是否有有效数据
      if (allRooms.length === 0) {
        showNoDataState(`${getDateDisplayText(state.date)} 暂无耗电数据`);
        return;
      }

      // 只有暂无数据房间（日期缺口导致所有房间消耗为 null），直接渲染
      if (dataRooms.length === 0) {
        // 隐藏进度条
        if (!hasAnimationShown) {
          progressEl.style.display = 'none';
        }
        // 检查是否被取消
        if (thisLoadId !== state.currentLoadId) return;
        displayRanking(allRooms);
        updateCacheStatus('已缓存', false);
        return;
      }

      // 最终排序所有数据房间，暂无数据固定末尾（重建统一列表顺序）
      dataRooms.sort((a, b) => b.consumption - a.consumption);
      dataRooms.forEach((r, idx) => r.rank = idx + 1);
      const noDataPart = allRooms.filter(r => r.is_noRoom);
      allRooms.length = 0;
      allRooms.push(...dataRooms, ...noDataPart);

      // 缓存结果到内存
      consumptionCache.set(effectiveCacheKey, { allRooms: allRooms });

      // 同时保存到 IndexedDB 缓存（只保存必要字段，标记为已排序）
      const cacheData = dataRooms.map(item => ({
        room: item.roomName || item.room,
        roomName: item.roomName || item.room,
        consumption: item.consumption,
        balance: item.balance
      }));
      await DataService.saveRankingCache(state.campus, state.building, effectiveDate === 'today' ? null : effectiveDate, cacheData, true, {
        totalRooms: roomNames.length,
        roomsWithData: dataRooms.length,
        noDataRooms: noDataPart.map(r => r.roomName)
      });

      // 隐藏进度条（立即隐藏，无延迟）
      if (!hasAnimationShown) {
        progressEl.style.display = 'none';
      }

      // 再次检查是否被取消
      if (thisLoadId !== state.currentLoadId) {
        return;
      }

      // === 预加载楼层地图（此时已缓存，同步返回） ===
      const floorMap = await FloorUtils.loadFloorMap();

      // === 楼层分析（使用预加载的 floorMap，避免异步等待） ===
      await runFloorAnalysis(allRooms, roomNames, floorMap);

      // 显示结果
      displayRanking(allRooms);
      updateCacheStatus('已缓存', false);
```

- [ ] **Step 6: displayRanking(allRooms) + 4 调用点 + displayRankingFromCache**

**6a.** 重写 `displayRanking`（约 L2760-2795）：

```js
    async function displayRanking(allRooms) {
      document.getElementById('stats-row').style.display = 'grid';
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('no-data-state').style.display = 'none';

      const dataRooms = allRooms.filter(r => !r.is_noRoom);
      const totalConsumption = dataRooms.reduce((sum, r) => sum + r.consumption, 0);
      const avg = dataRooms.length > 0 ? totalConsumption / dataRooms.length : 0;
      const max = dataRooms.length > 0 ? Math.max(...dataRooms.map(r => r.consumption)) : 0;

      document.getElementById('stat-total').textContent = totalConsumption.toFixed(1) + '度';
      document.getElementById('stat-rooms').textContent = allRooms.length;
      document.getElementById('stat-avg').textContent = avg.toFixed(1) + '度';
      document.getElementById('stat-max').textContent = max.toFixed(1) + '度';

      function setTip(id, kwh) {
        const el = document.getElementById(id);
        if (!el) return;
        const text = EnergyAnalogies.get(kwh);
        el.innerHTML = text ? '<span class="tooltip-icon">⚡</span> ' + text : '';
      }
      setTip('tip-total', totalConsumption);
      setTip('tip-avg', avg);
      setTip('tip-max', max);

      // 存储到 state 用于分页
      state.allRooms = allRooms;

      renderCurrentPage();
      renderDistributionChart(dataRooms);

      // 切换日期后若楼层筛选仍激活，用新数据重新应用（保持筛选状态，避免展示旧日期的过滤结果）
      if (state.selectedFloors && state.floorStats) {
        onFloorSelectionChange();
      }
    }
```

**6b.** 更新 `loadRanking` 内 4 处调用点（都在 Task 3 Step 3/4/5 已一并改为 `displayRanking(allRooms)`；若 grep 到残留 `displayRanking(allRankings, noDataRooms)` 或 `displayRanking(rankings, noDataRooms)` 一律改为 `displayRanking(allRooms)`）。

**6c.** 更新 `displayRankingFromCache`（约 L2798-2805）：

```js
    function displayRankingFromCache(cacheKey) {
      const cached = consumptionCache.get(cacheKey);
      if (!cached) return;
      let allRooms;
      if (Array.isArray(cached.allRooms)) {
        allRooms = cached.allRooms;
      } else if (Array.isArray(cached)) {
        allRooms = cached.map(r => ({ ...r, is_noRoom: false }));
      } else {
        const rankings = cached.rankings || [];
        const noDataRooms = cached.noDataRooms || [];
        allRooms = [
          ...rankings.map(r => ({ ...r, is_noRoom: false })),
          ...noDataRooms.map(r => ({ ...r, room: r.roomName, consumption: null, balance: null, rank: null, is_noRoom: true }))
        ];
      }
      displayRanking(allRooms);
    }
```

- [ ] **Step 7: onFloorSelectionChange 重写**

替换 `onFloorSelectionChange`（约 L1844-1876）整函数为：

```js
    function onFloorSelectionChange() {
      if (!state.floorStats || !state.allRooms) return;
      const filteredRooms = state.selectedFloors === null
        ? state.allRooms
        : FloorAnalytics.filterRoomsByFloors(state.allRooms, state.floorGroups, state.selectedFloors);

      // 顶部统计：总房间数（含暂无数据）——与数据房间是否为 0 无关
      document.getElementById('stat-rooms').textContent = filteredRooms.length;

      const dataRooms = filteredRooms.filter(r => !r.is_noRoom);
      if (dataRooms.length === 0) {
        document.getElementById('stat-total').textContent = '--';
        document.getElementById('stat-avg').textContent = '--';
        document.getElementById('stat-max').textContent = '--';
      } else {
        const total = dataRooms.reduce((s, r) => s + r.consumption, 0);
        const avg = total / dataRooms.length;
        const max = Math.max(...dataRooms.map(r => r.consumption));
        document.getElementById('stat-total').textContent = total.toFixed(1) + '度';
        document.getElementById('stat-avg').textContent = avg.toFixed(1) + '度';
        document.getElementById('stat-max').textContent = max.toFixed(1) + '度';
      }

      // 更新图表
      FloorView.updateChart(state.floorStats, state.selectedFloors);

      // 更新排行榜（不覆盖原始数据）
      state.filteredRooms = state.selectedFloors === null ? null : filteredRooms;
      state.currentPage = 1;
      renderCurrentPage();
      renderDistributionChart(dataRooms);
    }
```

- [ ] **Step 8: renderCurrentPage 重写**

替换 `renderCurrentPage`（约 L2808-2875）开头到分页计算段：

```js
    function renderCurrentPage() {
      const allRooms = state.filteredRooms || state.allRooms || [];
      if (allRooms.length === 0) return;

      const listEl = document.getElementById('ranking-list');
      listEl.innerHTML = '';

      // 展示顺序：数据房间按消耗排序在前，暂无数据固定末尾
      const displayOrder = FloorAnalytics.buildDisplayOrder(allRooms, state.sortDesc);
      const dataCount = displayOrder.filter(r => !r.is_noRoom).length;

      // 分页计算：数据房间独占前面的页，暂无数据房间独占后面的页
      const { pageRankings, pageNoDataRooms, totalPages } =
        FloorAnalytics.computePageSlices(displayOrder, state.currentPage, state.itemsPerPage);
      state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
      state.totalPages = totalPages; // 同步更新，供 nextPage/goToPage 等导航函数使用

      // 渲染有数据房间
      pageRankings.forEach(item => {
        const displayRank = state.sortDesc ? item.rank : (dataCount - item.rank + 1);
        const rankClass = displayRank <= 3 ? `rank-${displayRank}` : 'rank-other';
        const isUserRoom = state.userConfig &&
          state.userConfig.campus === state.campus &&
          state.userConfig.building === state.building &&
          (item.roomName) === state.userConfig.roomName;

        const html = `
          <div class="ranking-item ${isUserRoom ? 'user-room' : ''}"
               data-room-name="${item.roomName}"
               onclick="viewRoomDetail('${item.campus}', '${item.building}', '${item.roomName}')">
            <div class="rank-badge ${rankClass}">${displayRank}</div>
            <div class="room-info">
              <div class="room-name">${item.room}${isUserRoom ? ' (我的房间)' : ''}</div>
            </div>
            <div class="consumption">
              <div class="consumption-value">${item.consumption.toFixed(2)}</div>
              <div class="consumption-unit">度/日</div>
            </div>
          </div>
        `;
        listEl.insertAdjacentHTML('beforeend', html);
      });

      // 渲染暂无数据房间（排在末尾，样式淡化）
      pageNoDataRooms.forEach(item => {
        const html = `
          <div class="ranking-item no-data"
               data-room-name="${item.roomName}"
               onclick="viewRoomDetail('${item.campus}', '${item.building}', '${item.roomName}')"
               style="opacity: 0.5; background: var(--surface);">
            <div class="rank-badge" style="background: var(--border); color: var(--muted);">-</div>
            <div class="room-info">
              <div class="room-name" style="color: var(--muted);">${item.roomName}</div>
              <div style="font-size: 11px; color: var(--muted);">暂无该日期数据</div>
            </div>
            <div class="consumption">
              <div class="consumption-value" style="color: var(--muted);">--</div>
              <div class="consumption-unit">度/日</div>
            </div>
          </div>
        `;
        listEl.insertAdjacentHTML('beforeend', html);
      });

      // 更新分页控件
      updatePagination(totalPages);
    }
```

- [ ] **Step 9: onCampusChange / onBuildingChange 重置**

两处（约 L1973-1975 与 L2031-2033）把：
```js
      state.filteredRankings = null;
      state.filteredNoDataRooms = null;
```
改为：
```js
      state.filteredRooms = null;
```

- [ ] **Step 10: 全量检查 + 语法校验**

Run（从仓库根目录）：
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('docs/building-view.html','utf8');
const blocks=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
for(const m of blocks){ new Function(m[1]); }
console.log('OK: inline scripts syntax valid,', blocks.length, 'block(s)');
"
grep -n "state\.allRankings\|state\.noDataRooms\|state\.filteredRankings\|state\.filteredNoDataRooms\|noDataRooms\b\|allRankings\b" docs/building-view.html
```
预期：
- 语法检查 OK
- grep 应**无输出**（旧双数组变量名已全部清除）；如仍有残留（例如 `const noDataRooms = []` 之类），逐一改为统一列表逻辑后重查
- 另确认 `displayRanking(` 的调用都只有一个实参

- [ ] **Step 11: Commit**

```bash
git add docs/building-view.html
git commit -m "refactor: building-view 统一 allRooms 列表（is_noRoom），修正侧边栏/房间总数口径"
```

---

## Task 4: 浏览器验证与回归

**Files:**
- 验证 `docs/building-view.html`（本地 http 服务 + playwright）

- [ ] **Step 1: 启动本地服务与浏览器**

```bash
cd docs && python3 -m http.server 8000
```
（后台运行）。浏览器导航 `http://localhost:8000/building-view.html`。

- [ ] **Step 2: 加载一栋有暂无数房间的楼栋**

选择某校区/楼栋（如"仙林校区 → 19幢"，或用有暂无数据房间的楼栋），等待加载完成。

验证点 A（顶部房间总数）：
- 全部楼层：`stat-rooms` 文本 == 楼栋总房间数（与 `buildingSummary.rooms` 数量一致）
- 用页面下拉或 URL 参数 `?campus=..&building=..` 加载

验证点 B（侧边栏/抽屉/图表口径一致）：
- 读取侧边栏 `.floor-node:not(.all)` 各节点 label 里的数字
- 打开抽屉 `.floor-drawer-item-count` 数字
- 两者应一致（同一楼层显示相同"有数据 N间"）
- 与 `stat-rooms`（总房间数）不同——侧边栏是有数据口径、顶部是总口径

- [ ] **Step 3: 楼层筛选回归（含 bug 2）**

用 `page.evaluate` 驱动 `state.selectedFloors` + `onFloorSelectionChange()`（沿用先前验证方法）：
- 选单层：`stat-rooms` == 该层**总房间数**（含暂无数据），且 >= 该层有数据房间数
- 选多层（如 {5,6}）：`stat-rooms` == 两层总房间数之和
- 数据房间为 0 的层：`stat-total/avg/max` 为 `--`，但 `stat-rooms` 仍为该层总房间数

- [ ] **Step 4: 日期切换 + 楼层筛选回归（fix #3）**

选中某楼层后切换日期：确认 `filteredRooms` 保持生效、`stat-rooms` 用新日期数据重算、无残留旧日期过滤结果。

- [ ] **Step 5: 分页验证**

翻到末页附近：数据页中不得出现"暂无该日期数据"行；暂无数据行只出现在尾页。

- [ ] **Step 6: 旧缓存兼容**

在浏览器 console 执行 `await DataService.saveRankingCache(campus, building, null, oldData, true, {noDataRooms:['...']})` 造一个旧格式缓存（data 无 is_noRoom 字段），刷新页面确认仍正常渲染（读取路径自动合并）。

- [ ] **Step 7: 回归确认**

全部通过后向主线程汇报验证结果。若任一项失败，回到对应 Task 修正。

---

## 执行顺序与依赖

1. Task 1（floor-analytics 纯函数 + 单测）→ 2. Task 2（floor-view 字段）→ 3. Task 3（building-view 迁移）→ 4. Task 4（浏览器验证）

Task 1-3 之间有耦合（Task 1 改函数签名后，Task 3 才把调用方改到位；Task 2 依赖 Task 1 的 withDataCount），必须按序执行。Task 4 依赖全部完成。
