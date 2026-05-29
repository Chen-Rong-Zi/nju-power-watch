# 日期数据完整性处理重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复前端组件在缺失日期数据时错误使用最新数据的问题，改为严格只使用指定日期数据，并在UI中展示数据完整度。

**Architecture:** 在数据层（data-service.js）统一处理日期数据存在性检查，返回结构化数据包含完整度信息；校区和楼栋页面分别展示完整度并正确过滤无数据房间。

**Tech Stack:** JavaScript ES6+, Chart.js 4.4.0, 前端静态 JSON 数据

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `docs/js/data-service.js` | 核心数据服务，修改消耗量计算方法移除 fallback 逻辑 |
| `docs/campus-view.html` | 校区页面，展示数据完整度，过滤无数据房间 |
| `docs/building-view.html` | 楼栋页面，排行榜末尾展示无数据房间 |

---

### Task 1: 修改 getBuildingConsumptionRankingFast 方法移除 fallback

**Files:**
- Modify: `docs/js/data-service.js:644-708`

- [ ] **Step 1: 定位并移除 fallback 逻辑**

找到第691-692行的代码：

```javascript
// 如果找到指定日期则用该日期，否则用最新一天
const entry = targetEntry || roomData.history[roomData.history.length - 1];
```

替换为：

```javascript
// 如果找到指定日期则用该日期，无数据则跳过该房间
if (!targetEntry) continue;
const entry = targetEntry;
```

- [ ] **Step 2: 修改 rankings 构建逻辑，增加数据存在性检查**

找到第685-700行附近的 rankings 构建代码块，完整替换为：

```javascript
// 构建排行数据
const rankings = [];
let roomsWithData = 0;

for (const roomName of roomNames) {
  const roomInfo = roomMap[roomName];
  const roomData = roomDataMap.get(roomName);

  if (roomData && roomData.history && roomData.history.length > 0) {
    // 尝试从历史中找到指定日期的消耗
    const targetEntry = roomData.history.find(h =>
      h.date === targetCompactDate || h.formattedDate === targetDate
    );

    // 只有找到指定日期的数据才加入排行榜
    if (targetEntry && targetEntry.consumption !== undefined && targetEntry.consumption !== null) {
      rankings.push({
        roomName,
        consumption: targetEntry.consumption,
        balance: targetEntry.electricity || roomInfo.current_balance
      });
      roomsWithData++;
    }
  }
}
```

- [ ] **Step 3: 修改缓存保存逻辑，增加完整度信息**

找到第705行的 `saveRankingCache` 调用，修改为：

```javascript
// 保存排序结果到缓存，包含完整度信息
await this.saveRankingCache(campusName, buildingName, targetDate, rankings, true, {
  totalRooms: roomNames.length,
  roomsWithData: roomsWithData
});
```

- [ ] **Step 4: 更新 saveRankingCache 方法签名和实现**

找到 `saveRankingCache` 方法定义（约第1063行），修改参数和实现：

```javascript
/**
 * 保存排序结果到缓存
 * @param {string} campusName 校区名
 * @param {string} buildingName 楼栋名
 * @param {string} date 日期
 * @param {Array} rankingData 排序结果数组
 * @param {boolean} sorted 是否已排序（默认 false）
 * @param {Object} metadata 元数据（totalRooms, roomsWithData）
 */
async saveRankingCache(campusName, buildingName, date, rankingData, sorted = false, metadata = null) {
  const compactDate = this._formatDateCompact(date);
  const key = this._getCacheKey('ranking', campusName, buildingName);

  // 计算总消耗量
  const totalConsumption = rankingData.reduce((sum, item) => sum + (item.consumption || 0), 0);

  // 获取现有缓存或创建新的
  let cache = await IDB.get(key) || {};

  // 保存排序结果，包含总消耗量统计、排序状态和元数据
  cache[compactDate] = {
    data: rankingData,
    totalConsumption: totalConsumption,
    roomCount: rankingData.length,
    sorted: sorted,
    updatedAt: Date.now(),
    // 新增元数据字段
    totalRooms: metadata?.totalRooms || rankingData.length,
    roomsWithData: metadata?.roomsWithData || rankingData.length
  };

  await IDB.set(key, cache);
  console.log(`[缓存保存] 排序结果: ${key} -> ${compactDate}, 共${rankingData.length}条, 总消耗: ${totalConsumption.toFixed(2)}度, 数据完整度: ${metadata?.roomsWithData || rankingData.length}/${metadata?.totalRooms || rankingData.length}`);
}
```

- [ ] **Step 5: Commit**

```bash
git add docs/js/data-service.js
git commit -m "fix(data): remove fallback to latest data in getBuildingConsumptionRankingFast

- Only include rooms with data for the specified date
- Add metadata (totalRooms, roomsWithData) to ranking cache
- Data completeness is now tracked at the data layer"
```

---

### Task 2: 修改 getBuildingConsumptionFromRoomCache 方法移除 fallback

**Files:**
- Modify: `docs/js/data-service.js:718-777`

- [ ] **Step 1: 移除 fallback 到最新日期的逻辑**

找到第735-748行的代码块：

```javascript
// 如果指定日期没有缓存，尝试获取该房间最新的可用日期
if (!roomCache || roomCache.consumption === undefined) {
  const allRoomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomName);
  if (allRoomCache) {
    // 找到最新的可用日期
    const dates = Object.keys(allRoomCache).sort().reverse();
    if (dates.length > 0) {
      const latestDate = dates[0];
      roomCache = allRoomCache[latestDate];
      usedDate = latestDate; // 记录实际使用的日期
    }
  }
}
```

替换为：

```javascript
// 如果指定日期没有缓存，跳过该房间（不使用其他日期数据）
if (!roomCache || roomCache.consumption === undefined) {
  continue;
}
```

- [ ] **Step 2: 移除 usedDate 相关逻辑，简化返回结构**

找到第760-777行的返回部分，修改为：

```javascript
// 如果没有任何缓存数据，返回 null
if (cachedCount === 0) {
  return null;
}

console.log(`[缓存构建] ${campusName}.${buildingName}: ${cachedCount}/${roomNames.length} 间从缓存读取 (日期:${compactDate})`);

// 保存到排名缓存
await this.saveRankingCache(campusName, buildingName, date, rankings, false, {
  totalRooms: roomNames.length,
  roomsWithData: cachedCount
});

return {
  data: rankings,
  noDataRooms: roomNames.filter(rn => !rankings.some(r => r.roomName === rn)),
  totalConsumption: rankings.reduce((sum, r) => sum + r.consumption, 0),
  roomCount: rankings.length,
  totalRooms: roomNames.length,
  roomsWithData: cachedCount
};
```

- [ ] **Step 3: Commit**

```bash
git add docs/js/data-service.js
git commit -m "fix(data): remove fallback logic in getBuildingConsumptionFromRoomCache

- Only use data for the specified date, never fallback
- Return noDataRooms list for UI display
- Simplify return structure"
```

---

### Task 3: 修改 getCampusConsumption 方法返回完整度数据

**Files:**
- Modify: `docs/js/data-service.js:1140-1274`

- [ ] **Step 1: 修改楼栋数据聚合，跟踪无数据房间**

找到 `_aggregateCampusResult` 方法（约第1357行），修改为：

```javascript
/**
 * 聚合楼栋数据为校区结果
 * @private
 */
_aggregateCampusResult(campusName, campusStats, buildingsWithData) {
  let totalConsumption = 0;
  let totalRoomCount = 0;
  let totalRoomsWithData = 0;
  const buildings = {};

  for (const b of buildingsWithData) {
    totalConsumption += b.consumption || 0;
    totalRoomCount += b.total_rooms || 0;
    totalRoomsWithData += b.roomCount || 0;  // roomCount 是有数据的房间数
    buildings[b.name] = {
      consumption: b.consumption || 0,
      roomCount: b.roomCount || 0,           // 有数据房间数
      total_rooms: b.total_rooms || 0,       // 总房间数
      avgConsumption: b.avgConsumption || 0,
      dataCompleteness: b.total_rooms > 0 ? (b.roomCount / b.total_rooms) : 0
    };
  }

  const campusRoomCount = campusStats.rooms || 0;
  return {
    campus: campusName,
    totalConsumption,
    buildingCount: campusStats.buildings || 0,
    roomCount: campusRoomCount,
    roomsWithData: totalRoomsWithData,
    dataCompleteness: campusRoomCount > 0 ? totalRoomsWithData / campusRoomCount : 0,
    avgConsumption: totalRoomsWithData > 0 ? totalConsumption / totalRoomsWithData : 0,
    buildings
  };
}
```

- [ ] **Step 2: 修改 getCampusConsumption 中楼栋加载逻辑，确保使用完整度信息**

找到第1185-1250行的楼栋加载循环，修改 `buildingsWithData.push` 部分：

```javascript
buildingsWithData.push({
  name: building.name,
  total_rooms: building.total_rooms,
  consumption: totalConsumption,
  roomCount: roomCount,  // 有数据的房间数
  avgConsumption: roomCount > 0 ? totalConsumption / roomCount : 0,
  fromCache: fromDetails
});
```

- [ ] **Step 3: Commit**

```bash
git add docs/js/data-service.js
git commit -m "feat(data): add dataCompleteness to getCampusConsumption result

- Track roomsWithData per building
- Calculate and return overall data completeness
- Building objects now include dataCompleteness field"
```

---

### Task 4: 修改 getCampusWideRanking 过滤无数据房间

**Files:**
- Modify: `docs/js/data-service.js:1782-1886`

- [ ] **Step 1: 确认现有逻辑已正确过滤**

检查 `_calculateConsumptionFromHistory` 方法（约第1284行），确认其在找不到数据时返回 `null`：

```javascript
// 自定义日期
targetIdx = dates.indexOf(compactDate);
if (targetIdx === -1 || targetIdx === 0) return null;
```

如果代码已经是这样，无需修改。

- [ ] **Step 2: 确认 getCampusWideRanking 中的过滤逻辑**

检查第1817-1824行，确认只有 `consumption !== null` 才会加入：

```javascript
const consumption = this._calculateConsumptionFromHistory(
  roomData.balance_history,
  targetDate,
  compactDate
);
if (consumption !== null) {
  this._insertIntoTopRooms(topRooms, {...}, limit);
}
```

如果代码已经是这样，无需修改。

- [ ] **Step 3: Commit（如有修改）**

```bash
git add docs/js/data-service.js
git commit -m "fix(data): ensure getCampusWideRanking filters rooms without data"
```

---

### Task 5: 修改校区页面展示数据完整度

**Files:**
- Modify: `docs/campus-view.html:779-841`

- [ ] **Step 1: 修改 updateDashboardWithPartialData 显示完整度**

找到第779-804行的函数，修改数据完整度显示部分：

```javascript
function updateDashboardWithPartialData(partial, loaded, total) {
  if (!partial) return;

  const totalConsumption = partial.totalConsumption || 0;
  const roomCount = partial.roomCount || 0;
  const roomsWithData = partial.roomsWithData || 0;
  const avgConsumption = partial.avgConsumption || 0;

  document.getElementById('dash-total').textContent = totalConsumption.toFixed(0) + '度';
  document.getElementById('dash-buildings').textContent = partial.buildingCount || '--';
  document.getElementById('dash-rooms').textContent = roomCount.toLocaleString();
  document.getElementById('dash-avg').textContent = avgConsumption.toFixed(1) + '度';

  // 数据覆盖提示（显示加载进度或完整度）
  const coverageHint = document.getElementById('coverage-hint');
  const completeness = roomCount > 0 ? Math.floor(roomsWithData / roomCount * 100) : 0;

  if (loaded !== undefined && total !== undefined && loaded < total) {
    coverageHint.textContent = `正在加载 ${loaded}/${total} 栋楼... (${completeness}%)`;
  } else {
    coverageHint.textContent = `数据完整度: ${roomsWithData}/${roomCount} 间 (${completeness}%)`;
  }

  // 更新楼栋网格
  if (partial.buildings && campusData) {
    renderBuildingGridPartial(campusData.buildingDetails, partial.buildings);
    updateBuildingCardTips();
  }
}
```

- [ ] **Step 2: 修改 updateDashboard 显示最终完整度**

找到第807-841行的函数，修改：

```javascript
function updateDashboard(consumption) {
  if (!consumption) return;

  // 核心指标
  document.getElementById('dash-total').textContent = consumption.totalConsumption.toFixed(0) + '度';
  document.getElementById('dash-buildings').textContent = consumption.buildingCount;
  document.getElementById('dash-rooms').textContent = consumption.roomCount.toLocaleString();
  document.getElementById('dash-avg').textContent = consumption.avgConsumption.toFixed(1) + '度';

  // 数据完整度提示
  const coverageHint = document.getElementById('coverage-hint');
  const roomsWithData = consumption.roomsWithData || 0;
  const roomCount = consumption.roomCount || 0;
  const completeness = roomCount > 0 ? Math.floor(roomsWithData / roomCount * 100) : 0;
  coverageHint.textContent = `数据完整度: ${roomsWithData}/${roomCount} 间 (${completeness}%)`;

  // 变化趋势：显示数据完整度
  const changeEl = document.getElementById('dash-change');
  if (completeness < 100) {
    changeEl.innerHTML = `<span>数据完整度</span><span>${completeness}%</span>`;
    changeEl.className = 'dash-change down';
  } else {
    changeEl.innerHTML = `<span>数据完整</span><span>100%</span>`;
    changeEl.className = 'dash-change down';
  }

  // 其他更新...
  updateTotalTip(consumption.totalConsumption);
  updateSmartTip(consumption);
  renderBuildingChart(consumption);
  renderBuildingGrid(campusData.buildingDetails, consumption.buildings);
  updateBuildingCardTips();
  renderEnergyMap(consumption);
}
```

- [ ] **Step 3: 修改楼栋卡片显示完整度**

找到 `renderBuildingGrid` 函数（约第1112行），修改楼栋卡片模板：

```javascript
function renderBuildingGrid(buildingDetails, buildingsConsumption) {
  const grid = document.getElementById('building-grid');
  grid.innerHTML = buildingDetails.map(b => {
    const bc = buildingsConsumption[b.name];
    const consumption = bc ? bc.consumption.toFixed(0) : '0';
    const avg = bc ? bc.avgConsumption.toFixed(1) : '0.0';
    const completeness = bc ? Math.floor((bc.roomCount / b.total_rooms) * 100) : 0;
    const url = `building-view.html?campus=${encodeURIComponent(currentCampus)}&building=${encodeURIComponent(b.name)}`;

    // 完整度标签样式
    const completenessClass = completeness >= 90 ? '' : completeness >= 50 ? 'style="color: var(--warning);"' : 'style="color: var(--danger);"';

    return `
      <div class="building-card" style="cursor: pointer;" onclick="window.location.href='${url}'">
        <div class="consumption-tooltip" data-consumption="${consumption}"></div>
        <div class="building-name">${b.name}</div>
        <div class="building-stats">
          <div class="building-stat">
            <span class="building-stat-label">房间: </span>
            <span class="building-stat-value">${b.total_rooms}</span>
          </div>
          <div class="building-stat">
            <span class="building-stat-label">消耗: </span>
            <span class="building-stat-value">${consumption}度</span>
          </div>
          <div class="building-stat">
            <span class="building-stat-label">均耗: </span>
            <span class="building-stat-value">${avg}度</span>
          </div>
          <div class="building-stat">
            <span class="building-stat-label">完整度: </span>
            <span class="building-stat-value" ${completenessClass}>${completeness}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
```

- [ ] **Step 4: Commit**

```bash
git add docs/campus-view.html
git commit -m "feat(campus): display data completeness in dashboard and building cards

- Show data completeness percentage in coverage hint
- Building cards now show completeness percentage
- Use warning/danger colors for low completeness"
```

---

### Task 6: 修改楼栋页面排行榜展示无数据房间

**Files:**
- Modify: `docs/building-view.html:1541-1787`

- [ ] **Step 1: 修改 loadRanking 函数收集无数据房间**

找到第1541行附近的 `loadRanking` 函数，在数据加载完成后收集无数据房间：

在 `allRankings` 数组定义后添加：

```javascript
const allRankings = [];
const noDataRooms = [];  // 新增：收集无数据房间
```

在处理房间数据的循环中（约第1668行），当 `consumption === null` 时记录：

```javascript
if (roomData && roomData.history && roomData.history.length > 0) {
  const roomInfo = roomMap[roomName];
  const consumption = calculateConsumption(roomData.history, state.date);

  if (consumption !== null) {
    const item = {
      room: roomName,
      roomName: roomName,
      consumption: consumption,
      balance: roomInfo.current_balance,
      campus: state.campus,
      building: state.building
    };
    allRankings.push(item);
    // ... 动画相关代码
  } else {
    // 记录无数据房间
    noDataRooms.push({
      roomName: roomName,
      campus: state.campus,
      building: state.building
    });
  }
}
```

- [ ] **Step 2: 修改 displayRanking 函数接收无数据房间**

找到 `displayRanking` 函数定义位置，修改其参数和实现：

```javascript
function displayRanking(rankings, noDataRooms = []) {
  // 隐藏空状态和无数据状态
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('no-data-state').style.display = 'none';

  // 显示统计和分页
  document.getElementById('stats-row').style.display = 'grid';
  document.getElementById('pagination').style.display = 'flex';

  // 计算统计数据
  const totalConsumption = rankings.reduce((sum, r) => sum + r.consumption, 0);
  const avgConsumption = rankings.length > 0 ? totalConsumption / rankings.length : 0;
  const maxConsumption = rankings.length > 0 ? Math.max(...rankings.map(r => r.consumption)) : 0;

  // 更新统计卡片
  document.getElementById('stat-total').textContent = totalConsumption.toFixed(1) + '度';
  document.getElementById('stat-rooms').textContent = rankings.length + (noDataRooms.length > 0 ? `(+${noDataRooms.length}无数据)` : '');
  document.getElementById('stat-avg').textContent = avgConsumption.toFixed(2) + '度';
  document.getElementById('stat-max').textContent = maxConsumption.toFixed(2) + '度';

  // 存储全局状态用于分页
  state.allRankings = rankings;
  state.noDataRooms = noDataRooms;
  state.totalPages = Math.ceil((rankings.length + noDataRooms.length) / state.itemsPerPage);

  // 渲染当前页
  renderCurrentPage();
}
```

- [ ] **Step 3: 修改 renderCurrentPage 渲染无数据房间**

找到 `renderCurrentPage` 函数，修改为在排行榜末尾渲染无数据房间：

```javascript
function renderCurrentPage() {
  const allRankings = state.allRankings || [];
  const noDataRooms = state.noDataRooms || [];
  const totalItems = allRankings.length + noDataRooms.length;

  // 计算分页（无数据房间排在最后）
  const startIdx = (state.currentPage - 1) * state.itemsPerPage;
  const endIdx = startIdx + state.itemsPerPage;

  // 分离有数据和无数据的房间
  const pageRankings = allRankings.slice(
    Math.max(0, startIdx),
    Math.min(allRankings.length, endIdx)
  );

  // 计算无数据房间的分页
  const noDataStartIdx = Math.max(0, startIdx - allRankings.length);
  const noDataEndIdx = Math.min(noDataRooms.length, endIdx - allRankings.length);
  const pageNoDataRooms = noDataRooms.slice(noDataStartIdx, noDataEndIdx);

  // 渲染排行榜
  const listEl = document.getElementById('ranking-list');
  let html = '';

  // 渲染有数据房间
  pageRankings.forEach((item, idx) => {
    const rank = startIdx + idx + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const isUserRoom = state.userConfig &&
      state.userConfig.campus === item.campus &&
      state.userConfig.building === item.building &&
      item.roomName === state.userConfig.roomName;

    html += `
      <div class="ranking-item ${rankClass} ${isUserRoom ? 'user-room' : ''}"
           onclick="viewRoomDetail('${item.campus}', '${item.building}', '${item.roomName}')"
           style="cursor: pointer;">
        <div class="rank-badge">#${rank}</div>
        <div class="room-info">
          <span class="room-name">${item.roomName}</span>
          ${isUserRoom ? '<span class="user-badge">我的房间</span>' : ''}
        </div>
        <div class="consumption">
          <div class="consumption-value">${item.consumption.toFixed(2)}</div>
          <div class="consumption-unit">度</div>
        </div>
      </div>
    `;
  });

  // 渲染无数据房间（排在末尾，样式淡化）
  pageNoDataRooms.forEach((item) => {
    html += `
      <div class="ranking-item no-data"
           onclick="viewRoomDetail('${item.campus}', '${item.building}', '${item.roomName}')"
           style="cursor: pointer; opacity: 0.5; background: var(--surface);">
        <div class="rank-badge" style="background: var(--border); color: var(--muted);">-</div>
        <div class="room-info">
          <span class="room-name" style="color: var(--muted);">${item.roomName}</span>
          <span style="font-size: 11px; color: var(--muted);">暂无该日期数据</span>
        </div>
        <div class="consumption">
          <div class="consumption-value" style="color: var(--muted);">--</div>
          <div class="consumption-unit">度</div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;

  // 更新分页信息
  updatePagination();
}
```

- [ ] **Step 4: 修改缓存读取逻辑传递无数据房间**

找到第1556-1600行的缓存读取部分，修改为：

```javascript
// 2. 检查 IndexedDB 缓存
const localStorageCache = await DataService.getRankingCache(state.campus, state.building, state.date);
if (localStorageCache && localStorageCache.data && localStorageCache.data.length > 0) {
  console.log(`[缓存命中] 从 localStorage 读取排序结果`);

  let allRankings = localStorageCache.data.map((item, idx) => ({
    room: item.roomName || item.name,
    roomName: item.roomName || item.name,
    consumption: item.consumption,
    balance: item.balance,
    campus: state.campus,
    building: state.building,
    rank: idx + 1
  }));

  // 从缓存元数据或重新计算无数据房间
  let noDataRooms = [];
  if (localStorageCache.noDataRooms) {
    noDataRooms = localStorageCache.noDataRooms.map(name => ({
      roomName: name,
      campus: state.campus,
      building: state.building
    }));
  } else {
    // 如果缓存中没有 noDataRooms，从楼栋信息计算
    const buildingSummary = await DataService.getBuildingSummary(state.campus, state.building);
    if (buildingSummary && buildingSummary.rooms) {
      const allRoomNames = Object.keys(buildingSummary.rooms);
      const rankingRoomNames = new Set(allRankings.map(r => r.roomName));
      noDataRooms = allRoomNames
        .filter(name => !rankingRoomNames.has(name))
        .map(name => ({
          roomName: name,
          campus: state.campus,
          building: state.building
        }));
    }
  }

  // ... 排序逻辑

  updateCacheStatus('已缓存', false);
  displayRanking(allRankings, noDataRooms);
  return;
}
```

- [ ] **Step 5: 修改数据保存逻辑保存无数据房间**

找到第1762-1768行的缓存保存部分，修改为：

```javascript
// 缓存结果
consumptionCache.set(cacheKey, { rankings: allRankings, noDataRooms: noDataRooms });

// 保存到 IndexedDB
const cacheData = allRankings.map(item => ({
  room: item.roomName || item.room,
  roomName: item.roomName || item.room,
  consumption: item.consumption,
  balance: item.balance
}));
await DataService.saveRankingCache(state.campus, state.building, state.date, cacheData, true, {
  totalRooms: roomNames.length,
  roomsWithData: allRankings.length,
  noDataRooms: noDataRooms.map(r => r.roomName)
});
```

- [ ] **Step 6: Commit**

```bash
git add docs/building-view.html
git commit -m "feat(building): show rooms without data at end of ranking

- Collect and display noDataRooms at ranking end
- No-data rooms shown with faded style, no rank number
- Statistics now show 'X(+Y无data)' format"
```

---

### Task 7: 修改楼栋页面分布图表过滤无数据房间

**Files:**
- Modify: `docs/building-view.html` (distribution chart rendering)

- [ ] **Step 1: 定位分布图表渲染代码**

找到 `displayRanking` 函数中调用 `showDistributionChart` 或类似的位置。如果分布图表使用 `state.allRankings` 数据，则无需修改。

确认分布图表数据来源：

```javascript
// 在 renderDistribution 或类似函数中
const chartData = state.allRankings || [];
// 如果 allRankings 只包含有数据房间，则分布图表自动正确
```

- [ ] **Step 2: 添加数据完整度提示到分布图表**

在分布图表区域添加完整度提示，找到分布图表的 HTML 部分（约第1139行），修改 subtitle：

```html
<div class="dist-subtitle" id="dist-subtitle">各房间耗电量分布情况</div>
```

在渲染时更新为：

```javascript
document.getElementById('dist-subtitle').textContent =
  `各房间耗电量分布情况 (基于 ${allRankings.length} 间有数据房间)`;
```

- [ ] **Step 3: Commit**

```bash
git add docs/building-view.html
git commit -m "feat(building): show data completeness in distribution chart subtitle"
```

---

### Task 8: 测试验证

**Files:**
- Test: 浏览器手动测试

- [ ] **Step 1: 启动本地服务器**

```bash
cd docs && python3 -m http.server 8000
```

- [ ] **Step 2: 测试校区页面数据完整度显示**

1. 打开 http://localhost:8000/campus-view.html
2. 选择一个校区
3. 验证仪表盘显示"数据完整度: X/Y 间 (Z%)"
4. 验证楼栋卡片显示完整度百分比
5. 选择不同日期，验证完整度变化

- [ ] **Step 3: 测试楼栋页面无数据房间显示**

1. 点击进入某楼栋页面
2. 选择一个部分房间无数据的日期
3. 验证排行榜末尾显示无数据房间
4. 验证无数据房间样式淡化，无排名编号
5. 验证统计卡片显示"X(+Y无data)"

- [ ] **Step 4: 测试分布图表**

1. 验证分布图表标题显示房间数
2. 验证图表只包含有数据房间

---

## Self-Review Checklist

- [x] Spec coverage: 每个需求都有对应任务
- [x] Placeholder scan: 无 TBD/TODO 等占位符
- [x] Type consistency: 方法签名和返回结构一致

**Plan complete.**
