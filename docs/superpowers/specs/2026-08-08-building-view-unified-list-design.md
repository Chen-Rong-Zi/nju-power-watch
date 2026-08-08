# 楼栋页统一房间列表（is_noRoom 标记）设计

## 概述

重构楼栋页（`docs/building-view.html`）的数据模型：把当前"有数据房间（`allRankings`）+ 暂无数据房间（`noDataRooms`）"两条平行数组**合并为一个统一列表**，每个房间条目携带 `is_noRoom` 标记。所有组件（侧边栏、抽屉、楼层图表、顶部统计、分页、分布图）都从这一个列表派生所需数据，从结构上消除"暂无数据房间导致组件数据对不上"的问题。

## 背景与根因

体验中发现两个 bug：

1. **侧边栏只显示有今日数据的房间数量**：`FloorAnalytics.calculateFloorStats`（`docs/js/floor-analytics.js:14-33`）对 `roomCount` 的口径不一致——楼层有数据房间时 `roomCount = floorRankings.length`（仅数据房间），无数据房间时回退为 `rooms.length`（全部房间）。同一侧边栏内不同楼层的"N间"含义不同。
2. **顶部"房间总数"对不上**：`displayRanking`（line 2770）统计 `rankings.length + noDataRooms.length`（全部房间），但 `onFloorSelectionChange`（line 1851-1862）只统计 `filteredRankings.length`（漏算筛选后的暂无数据房间），且数据房间为 0 时直接显示 `--`。选中楼层时数字与"选中楼层总和数量"不符。

**本质**：`allRankings` 与 `noDataRooms` 两条数组需要所有组件手动保持同步，任何组件漏合并一处就会产生不一致。暂无数据房间是常态（限流、新房间、被删除的房间条目），所以问题反复出现。

## 设计决策

### 决策一：统一列表 + `is_noRoom` 标记（用户指定）

暂无数据不再作为"另一条数组"，而是统一列表里每个房间条目的一个布尔标记。只有少数组件读取 `is_noRoom` 来判断（分布图、消耗统计、分页切分），其余组件（侧边栏、顶部统计）直接遍历整个列表。

### 决策二：计数口径（用户确认）

- **侧边栏 / 抽屉** 的"N间"：显示该楼层**总房间数（`totalCount`，含暂无数据）**（执行中用户追加要求：侧边栏/抽屉也显示总房间数量，且只显示总数）
- **楼层图表 tooltip** 的"房间 N 间"：保持**有数据房间数（`withDataCount`）**（与均耗/总耗的数据上下文一致）
- **抽屉"均耗"**：只基于有数据房间（排除 `is_noRoom`，即 `avgConsumption`），用户明确要求
- **顶部"房间总数"**（`stat-rooms`）：显示**总房间数（含暂无数据）**，全部楼层与选中楼层口径一致（选中楼层 = 筛选后列表长度）

## 数据模型

统一列表 `allRooms`，每个条目：

```js
{
  roomName: '19栋第16层1613',
  room: '1613',
  campus: '仙林校区',
  building: '19幢',
  consumption: 2.34 | null,   // 暂无数据 = null
  balance: 12.5 | null,       // 暂无数据 = null
  rank: 3 | null,             // 数据房间排名 1..N；暂无数据 = null
  is_noRoom: false | true     // ⇔ consumption === null
}
```

**不变量**：

- `allRooms.length === 楼栋总房间数`（`buildingSummary.rooms` 的全部房间，一条不落）
- `is_noRoom === true` ⇔ `consumption === null` ⇔ `rank === null`
- 加载时排序约定：数据房间按消耗降序在前、暂无数据固定末尾；`rank` 只赋给数据房间（1..N）

**状态替换**：

| 旧状态 | 新状态 |
|---|---|
| `state.allRankings` + `state.noDataRooms` | `state.allRooms` |
| `state.filteredRankings` + `state.filteredNoDataRooms` | `state.filteredRooms`（筛选后子集；`null` = 未筛选） |

## 纯函数层 `FloorAnalytics`（docs/js/floor-analytics.js）

所有函数改为接受统一列表，口径唯一：

### 1. `calculateFloorStats(allRooms, floorGroups)`

每层返回：

```js
{
  withDataCount,  // 该层有数据房间数 → 楼层图表 tooltip 的"N间"
  totalCount,     // 该层全部房间数 → 侧边栏/抽屉的"N间"
  totalCount,     // 该层全部房间数（含暂无数据）
  rooms,          // 该层全部房间名
  totalConsumption, avgConsumption, maxConsumption, minConsumption  // 仅基于数据房间
}
```

- 有数据 0 间的楼层：`withDataCount = 0`，消耗统计全 0。**不再有"总房间数回退"**（消除 bug 1 的口径不一致）。
- `unknown` 楼层与普通层同口径处理。
- `sortedFloors` 结构不变。

### 2. `buildDisplayOrder(allRooms, sortDesc)`

```js
// 数据房间按消耗 降序/升序，暂无数据固定末尾
return [...sortedDataRooms, ...noDataRooms];
```

用于渲染的展示顺序。`sortDesc === true` 时直接取加载顺序（已降序）；否则数据段反转。

### 3. `computePageSlices(displayOrder, currentPage, itemsPerPage)`

语义不变（保持修复二的分页分离）：数据房间独占前面的页，暂无数据只占尾页。内部按 `is_noRoom` 把 `displayOrder` 拆为数据段与暂无数据段，沿用现有公式：

```js
dataPages = ceil(dataRooms.length / itemsPerPage)
noDataPages = noDataRooms.length > 0 ? ceil(noDataRooms.length / itemsPerPage) : 0
totalPages = max(1, dataPages + noDataPages)
// page <= dataPages → 只渲染数据房间；否则渲染对应暂无数据页
```

### 4. `filterRoomsByFloors(rooms, floorGroups, selectedFloors)`

逻辑不变，直接作用于统一列表（按 `roomName` 匹配，`unknown` 照旧支持）。**一处调用**即可得到筛选后的完整列表（数据 + 暂无数据）。

删除 `getFilteredRankings`（原供 `onFloorSelectionChange` 使用，现改为直接调用 `filterRoomsByFloors`）。

## 页面接线 `building-view.html`

改造以下函数，其余组件（侧边栏/抽屉）把 `roomCount` 改为 `totalCount`，楼层图表 tooltip 改为 `withDataCount`：

> **接线注意（实现时必须显式覆盖，避免漏改）**
> - `displayRanking` 签名改为 `displayRanking(allRooms)` 后，**`loadRanking` 内部的 4 处调用点**（L2166 / L2248 / L2446 / L2488）必须同步改为传 `allRooms`（旧的 `(rankings, noDataRooms)` 双参数全部删除）。`loadRanking` 虽不在"7 个函数"改造名单里，但这 4 处是最大漏改风险。
> - `renderDistributionChart`（L2789 / L1875）**一律只接收有数据子集**（`allRooms.filter(r => !r.is_noRoom)`），不得传入含暂无数据房间的完整列表，否则暂无数据房间会被画进分布图。

### `loadRanking`（三条路径统一构建 `allRooms`）

1. **内存缓存路径**：读新格式 `{ allRooms }`；旧格式 `{ rankings, noDataRooms }` 存在时合并重建（data 各项补 `is_noRoom:false` + rank，noData 各项补 `consumption:null, is_noRoom:true`）
2. **IndexedDB 缓存路径**：`localStorageCache.data`（数据房间）+ `noDataRooms`（`is_noRoom:true`）→ 合并为 `allRooms`；`noDataRooms` 缺失时从 `buildingSummary.rooms` 推导（现有逻辑）
3. **全新加载路径**：`streamRoomHistory` 回调里 `consumption !== null` → push 数据房间；否则 push `{ consumption: null, is_noRoom: true }` 的房间条目到**同一个 `allRooms` 数组**，不再维护独立的 `noDataRooms` 数组

### `runFloorAnalysis(allRooms, roomNames, preloadedFloorMap)`

`calculateFloorStats(allRooms, state.floorGroups)`；其余（renderIndicator / renderFloorChart / renderDrawer 回调）不变。

### `displayRanking(allRooms)`

```js
const dataRooms = allRooms.filter(r => !r.is_noRoom);
// stat-total / stat-avg / stat-max 基于 dataRooms
// stat-rooms = allRooms.length          ← 总房间数（含暂无数据）
state.allRooms = allRooms;
renderCurrentPage();
renderDistributionChart(dataRooms);
// 日期切换后若楼层筛选仍激活，重新应用（保留已修复行为 fix #3）
if (state.selectedFloors && state.floorStats) onFloorSelectionChange();
```

### `onFloorSelectionChange()`

```js
if (!state.floorStats || !state.allRooms) return;
const filteredRooms = state.selectedFloors === null
  ? state.allRooms
  : FloorAnalytics.filterRoomsByFloors(state.allRooms, state.floorGroups, state.selectedFloors);

// 顶部统计：总房间数（含暂无数据）——与数据房间是否为 0 无关
document.getElementById('stat-rooms').textContent = filteredRooms.length;

const dataRooms = filteredRooms.filter(r => !r.is_noRoom);
if (dataRooms.length === 0) {
  // stat-total / stat-avg / stat-max 显示 '--'
} else {
  // 计算并显示 total / avg / max
}

FloorView.updateChart(state.floorStats, state.selectedFloors);
state.filteredRooms = state.selectedFloors === null ? null : filteredRooms;
state.currentPage = 1;
renderCurrentPage();
renderDistributionChart(dataRooms);
```

### `renderCurrentPage()`

```js
const allRooms = state.filteredRooms || state.allRooms || [];
if (allRooms.length === 0) return;
const displayOrder = FloorAnalytics.buildDisplayOrder(allRooms, state.sortDesc);
const { pageRankings, pageNoDataRooms, totalPages } =
  FloorAnalytics.computePageSlices(displayOrder, state.currentPage, state.itemsPerPage);
state.currentPage = clamp(page, 1, totalPages);
state.totalPages = totalPages;
// 数据房间行：rank 徽标 = sortDesc ? item.rank : (dataCount - item.rank + 1)；dataCount = displayOrder 中数据段长度
// 暂无数据行：淡化样式，rank 徽标 '-'
```

### 其他

- `displayRankingFromCache(cacheKey)`：读 `cached.allRooms`；旧 `{rankings, noDataRooms}` 合并兼容
- `onCampusChange` / `onBuildingChange`：重置 `state.filteredRooms = null`（替代原两个 filtered 重置）
- `toggleSortOrder`：无需额外改动，`renderCurrentPage` 内 `buildDisplayOrder` 已处理升降序
- `FloorView`：`renderIndicator` / `_renderDrawerList` 的"N间"读 `floors[f].totalCount`（总房间数）；`renderFloorChart` tooltip 的"房间 N 间"读 `floors[f].withDataCount`（有数据房间数）；抽屉"全部楼层"行显示全楼总房间数

## 缓存兼容 `data-service.js`

- **IndexedDB 缓存 `saveRankingCache` 签名不变**（仍存 `data` = 数据房间 + `noDataRooms` 元数据）。校区页（line 1317-1325）消费 `totalConsumption / roomCount`，不破坏它。
- building-view 读取时负责 `data` + `noDataRooms` → `allRooms` 合并；`noDataRooms` 为空时从 `buildingSummary.rooms` 推导。
- 全新加载路径写缓存时，由 `allRooms` 拆回 `data`（数据房间）+ `noDataRooms`（暂无数据房间名）传给 `saveRankingCache`。
- **内存缓存 `consumptionCache`**：格式升级为 `{ allRooms }`；`displayRankingFromCache` 兼容旧格式。
- 效果：旧缓存（双数组）自动可用、无需清空，用户无感。

## 边界与错误处理

| 场景 | 行为 |
|---|---|
| 整层暂无数据 | 侧边栏显示该层**总间数**（如 `5层 · 22间`）；选中该层 `stat-rooms` = 该层总间数，`stat-total/avg/max` 显示 `--` |
| 全部暂无数据（限流事件） | `stat-rooms` = 总数，全部为暂无数据页 |
| `unknown` 楼层 | 与其他层同口径；选中 `unknown` 时 `filterRoomsByFloors` 照旧支持 |
| `filteredRooms` 为空 | 防呆：显示空态 |
| 旧缓存（双数组）存在 | 读取时自动合并，正常渲染 |

## 测试策略

### 纯函数单测（恢复 `tests/js/floor-analytics.test.js`，node --test）

- `calculateFloorStats`：`withDataCount` / `totalCount` 一致性；0 数据层；`unknown`
- `buildDisplayOrder`：降序 / 升序；暂无数据固定末尾
- `computePageSlices`：数据页干净（无暂无数据混入）；尾页纯暂无数据
- `filterRoomsByFloors`：统一列表过滤；`unknown`

### 浏览器验证

- 侧边栏/抽屉每层显示**总房间数**（`totalCount`），两者一致；楼层图表 tooltip 显示有数据房间数
- 顶部"房间总数"：全部楼层 = 楼栋总房间数；选中楼层 = 选中楼层总和（含暂无数据）
- 日期切换 + 楼层筛选：筛选保留且计数正确（回归 fix #3）
- 分页：数据页无暂无数据混入，暂无数据只在尾页
- 旧 IndexedDB 缓存存在时仍正常渲染

## 修改文件

| 文件 | 改动 |
|---|---|
| `docs/js/floor-analytics.js` | 重构 4 个纯函数；删除 `getFilteredRankings` |
| `docs/building-view.html` | 7 个函数接线改造 + `FloorView` 字段名 |
| `docs/js/floor-view.js` | 侧边栏/抽屉 `roomCount` → `totalCount`；图表 tooltip → `withDataCount` |
| `tests/js/floor-analytics.test.js` | 恢复并重写（针对新纯函数） |
| `docs/js/data-service.js` | 仅确认 `saveRankingCache` 签名不变，无需改动（如无必要） |
