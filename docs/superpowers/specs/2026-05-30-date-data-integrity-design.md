# 日期数据完整性修改设计文档

> **Goal:** 确保所有数据获取都基于具体日期，移除基于数组位置的"最新数据"fallback 逻辑

> **Architecture:** 统一将 'today'/'yesterday'/'week' 转换为具体日期，在 history 数组中按日期匹配；移除 data-service.js 中的 fallback 逻辑；在校区页面显示数据完整度

> **Tech Stack:** JavaScript ES6+ (frontend), 静态 JSON 数据文件

---

## 问题分析

### 当前问题

1. **基于数组位置取数据**：`today`/`yesterday`/`week` 使用 `history[history.length - 1]`、`.slice(-7)` 等方式取数据，而非匹配实际日期
2. **fallback 逻辑**：当指定日期无数据时，自动使用最新可用日期的数据，造成误导

### 影响范围

| 文件 | 函数 | 问题类型 |
|------|------|----------|
| data-service.js:386 | `getRoomHistory` | dailyConsumption 基于数组最后元素 |
| data-service.js:413-419 | `getConsumptionByDate` | today/yesterday/week 基于数组位置 |
| data-service.js:692 | `getBuildingConsumptionRankingFast` | fallback 到最新日期 |
| data-service.js:737-748 | `getBuildingConsumptionFromRoomCache` | fallback 到最新可用日期 |
| data-service.js:1298-1307 | `_calculateConsumptionFromHistory` | today/yesterday/week 基于数组位置 |
| data-service.js:2170-2187 | `_calculateConsumptionFromHistoryArray` | today/yesterday/week 基于数组位置 |
| building-view.html:1946-1955 | `calculateConsumption` | today/yesterday/week 基于数组位置 |

---

## 设计方案

### 1. 统一日期匹配策略

**today/yesterday**：转换为具体日期字符串（YYYYMMDD），在 history 中查找匹配

**week**：计算最近7天的日期范围，筛选该范围内的数据计算平均值

### 2. 移除 fallback 逻辑

指定日期无数据时返回 `null`，由调用方决定如何处理（如加入 noDataRooms 列表）

### 3. 校区页面展示

- 无数据楼栋显示 "--" 并标注"暂无该日期数据"
- 顶部显示数据完整度：X/Y 间有数据

---

## 修改任务

### Task 1: 修改 `_calculateConsumptionFromHistoryArray` 方法

**文件:** `docs/js/data-service.js:2166-2195`

**当前代码:**
```javascript
_calculateConsumptionFromHistoryArray(history, dateType, compactDate) {
  if (!Array.isArray(history) || history.length === 0) return null;

  if (dateType === 'today') {
    const latest = history[history.length - 1];
    return latest?.consumption !== undefined && latest.consumption !== null
      ? latest.consumption
      : null;
  }

  if (dateType === 'yesterday') {
    const yesterday = history[history.length - 2];
    return yesterday?.consumption !== undefined && yesterday.consumption !== null
      ? yesterday.consumption
      : null;
  }

  if (dateType === 'week') {
    const weekWindow = history.slice(-7);
    if (weekWindow.length === 0) return null;
    return weekWindow.reduce((sum, item) => sum + (item.consumption ?? 0), 0) / weekWindow.length;
  }

  const targetEntry = history.find(item =>
    item.date === compactDate || item.formattedDate === dateType
  );
  return targetEntry?.consumption !== undefined && targetEntry.consumption !== null
    ? targetEntry.consumption
    : null;
}
```

**修改后:**
```javascript
_calculateConsumptionFromHistoryArray(history, dateType, compactDate) {
  if (!Array.isArray(history) || history.length === 0) return null;

  // today/yesterday 转换为具体日期后匹配
  let targetDate = compactDate;

  if (dateType === 'today' || dateType === 'yesterday') {
    targetDate = this._formatDateCompact(dateType);
  }

  if (dateType === 'week') {
    // 计算最近7天的日期范围
    const today = new Date();
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      weekDates.push(this._dateToCompact(d));
    }

    // 筛选该范围内的数据
    const weekData = history.filter(item => weekDates.includes(item.date));
    if (weekData.length === 0) return null;

    const sum = weekData.reduce((total, item) => total + (item.consumption ?? 0), 0);
    return sum / weekData.length;
  }

  // 按日期匹配
  const targetEntry = history.find(item =>
    item.date === targetDate || item.formattedDate === dateType
  );
  return targetEntry?.consumption !== undefined && targetEntry.consumption !== null
    ? targetEntry.consumption
    : null;
}
```

### Task 2: 修改 `_calculateConsumptionFromHistory` 方法

**文件:** `docs/js/data-service.js:1290-1335`

**当前代码:**
```javascript
_calculateConsumptionFromHistory(balanceHistory, dateType, compactDate) {
  if (!balanceHistory) return null;

  const dates = this._getBalanceHistoryDates(balanceHistory);
  if (dates.length === 0) return null;

  // 找到目标日期的索引
  let targetIdx;
  if (dateType === 'today') {
    targetIdx = dates.length - 1;
    // 今天需要至少有两天数据才能计算
    if (targetIdx <= 0) return null;
  } else if (dateType === 'yesterday') {
    targetIdx = dates.length - 2;
    if (targetIdx < 0) return null;
  } else if (dateType === 'week') {
    // 计算最近7天的平均消耗
    const recentDates = dates.slice(-7);
    if (recentDates.length < 2) return null;

    let totalConsumption = 0;
    let count = 0;
    for (let i = 1; i < recentDates.length; i++) {
      const prevBalance = balanceHistory[recentDates[i - 1]];
      const currBalance = balanceHistory[recentDates[i]];
      if (prevBalance > currBalance) {
        totalConsumption += prevBalance - currBalance;
        count++;
      }
    }
    return count > 0 ? totalConsumption / count : 0;
  } else {
    // 自定义日期
    targetIdx = dates.indexOf(compactDate);
    if (targetIdx === -1 || targetIdx === 0) return null;
  }

  if (targetIdx <= 0) return null;

  // 计算消耗量：前一天余额 - 当天余额
  const prevBalance = balanceHistory[dates[targetIdx - 1]];
  const currBalance = balanceHistory[dates[targetIdx]];

  // 只有余额减少才算消耗（充值会导致余额增加）
  return prevBalance > currBalance ? prevBalance - currBalance : 0;
}
```

**修改后:**
```javascript
_calculateConsumptionFromHistory(balanceHistory, dateType, compactDate) {
  if (!balanceHistory) return null;

  const dates = this._getBalanceHistoryDates(balanceHistory);
  if (dates.length === 0) return null;

  // today/yesterday 转换为具体日期
  let targetDate = compactDate;
  if (dateType === 'today' || dateType === 'yesterday') {
    targetDate = this._formatDateCompact(dateType);
  }

  if (dateType === 'week') {
    // 计算最近7天的日期范围
    const today = new Date();
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      weekDates.push(this._dateToCompact(d));
    }

    // 筛选该范围内的日期
    const validDates = dates.filter(d => weekDates.includes(d));
    if (validDates.length < 2) return null;

    let totalConsumption = 0;
    let count = 0;
    for (let i = 1; i < validDates.length; i++) {
      const prevBalance = balanceHistory[validDates[i - 1]];
      const currBalance = balanceHistory[validDates[i]];
      if (prevBalance > currBalance) {
        totalConsumption += prevBalance - currBalance;
        count++;
      }
    }
    return count > 0 ? totalConsumption / count : 0;
  }

  // 按日期查找
  const targetIdx = dates.indexOf(targetDate);
  if (targetIdx === -1 || targetIdx === 0) return null;

  // 计算消耗量：前一天余额 - 当天余额
  const prevBalance = balanceHistory[dates[targetIdx - 1]];
  const currBalance = balanceHistory[dates[targetIdx]];

  return prevBalance > currBalance ? prevBalance - currBalance : 0;
}
```

### Task 3: 修改 `getConsumptionByDate` 方法

**文件:** `docs/js/data-service.js:405-426`

**当前代码:**
```javascript
async getConsumptionByDate(campusName, buildingName, roomName, dateType) {
  const history = await this.getRoomHistory(campusName, buildingName, roomName);
  if (!history || !history.history || history.history.length === 0) {
    return 0;
  }

  const hist = history.history;

  if (dateType === 'today') {
    return hist[hist.length - 1]?.consumption || 0;
  } else if (dateType === 'yesterday') {
    return hist[hist.length - 2]?.consumption || 0;
  } else if (dateType === 'week') {
    const weekData = hist.slice(-7);
    return weekData.reduce((sum, h) => sum + (h.consumption || 0), 0) / 7;
  } else {
    // 特定日期 (YYYY-MM-DD 或 YYYYMMDD)
    const targetDate = dateType.includes('-') ? dateType.replace(/-/g, '') : dateType;
    const found = hist.find(h => h.date === targetDate || h.formattedDate === dateType);
    return found?.consumption || 0;
  }
}
```

**修改后:**
```javascript
async getConsumptionByDate(campusName, buildingName, roomName, dateType) {
  const history = await this.getRoomHistory(campusName, buildingName, roomName);
  if (!history || !history.history || history.history.length === 0) {
    return null;
  }

  const hist = history.history;
  const compactDate = this._formatDateCompact(dateType);

  // 使用统一的方法计算
  return this._calculateConsumptionFromHistoryArray(hist, dateType, compactDate);
}
```

### Task 4: 修改 `getRoomHistory` 中的 dailyConsumption

**文件:** `docs/js/data-service.js:380-391`

**当前代码:**
```javascript
const result = {
  ...data,
  history,
  dailyConsumption: history.length > 1 ?
    history[history.length - 1].consumption : 0,
  avgConsumption: this.calculateAvgConsumption(history)
};
```

**修改后:**
```javascript
// dailyConsumption 改为今日消耗（按日期匹配）
const todayCompact = this._formatDateCompact('today');
const todayEntry = history.find(h => h.date === todayCompact);

const result = {
  ...data,
  history,
  dailyConsumption: todayEntry?.consumption ?? null,
  avgConsumption: this.calculateAvgConsumption(history)
};
```

### Task 5: 移除 `getBuildingConsumptionRankingFast` 的 fallback 逻辑

**文件:** `docs/js/data-service.js:685-702`

**当前代码:**
```javascript
if (roomData && roomData.history && roomData.history.length > 0) {
  // 尝试从历史中找到指定日期的消耗
  const targetEntry = roomData.history.find(h =>
    h.date === targetCompactDate || h.formattedDate === targetDate
  );

  // 如果找到指定日期则用该日期，否则用最新一天
  const entry = targetEntry || roomData.history[roomData.history.length - 1];

  rankings.push({
    roomName,
    consumption: entry?.consumption || 0,
    balance: entry?.electricity || roomInfo.current_balance
  });
}
```

**修改后:**
```javascript
if (roomData && roomData.history && roomData.history.length > 0) {
  // 只获取指定日期的数据，不使用 fallback
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
  }
}
```

### Task 6: 移除 `getBuildingConsumptionFromRoomCache` 的 fallback 逻辑

**文件:** `docs/js/data-service.js:733-758`

**当前代码:**
```javascript
for (const roomName of roomNames) {
  const roomInfo = roomMap[roomName];
  let roomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomName, compactDate);

  // 如果指定日期没有缓存，尝试获取该房间最新的可用日期
  if (!roomCache || roomCache.consumption === undefined) {
    const allRoomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomName);
    if (allRoomCache) {
      // 找到最新的可用日期
      const dates = Object.keys(allRoomCache).sort().reverse();
      if (dates.length > 0) {
        const latestDate = dates[0];
        roomCache = allRoomCache[latestDate];
        usedDate = latestDate;
      }
    }
  }

  if (roomCache && roomCache.consumption !== undefined) {
    rankings.push({
      roomName,
      consumption: roomCache.consumption,
      balance: roomCache.electricity
    });
    cachedCount++;
  }
}
```

**修改后:**
```javascript
for (const roomName of roomNames) {
  const roomInfo = roomMap[roomName];
  const roomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomName, compactDate);

  // 只使用指定日期的缓存，不使用 fallback
  if (roomCache && roomCache.consumption !== undefined && roomCache.consumption !== null) {
    rankings.push({
      roomName,
      consumption: roomCache.consumption,
      balance: roomCache.electricity
    });
    cachedCount++;
  }
}
```

### Task 7: 修改 building-view.html 的 `calculateConsumption` 函数

**文件:** `docs/building-view.html:1942-1961`

**当前代码:**
```javascript
function calculateConsumption(history, dateType) {
  if (!history || history.length === 0) return null;

  if (dateType === 'today') {
    const today = history[history.length - 1];
    return today?.consumption ?? null;
  } else if (dateType === 'yesterday') {
    const yesterday = history[history.length - 2];
    return yesterday?.consumption ?? null;
  } else if (dateType === 'week') {
    const weekData = history.slice(-7);
    if (weekData.length === 0) return null;
    const sum = weekData.reduce((s, h) => s + (h.consumption || 0), 0);
    return sum / weekData.length;
  } else {
    // 自定义日期
    const target = history.find(h => h.date === dateType || h.formattedDate === dateType);
    return target?.consumption ?? null;
  }
}
```

**修改后:**
```javascript
function calculateConsumption(history, dateType) {
  if (!history || history.length === 0) return null;

  // 辅助函数：日期转换为 YYYYMMDD
  const toCompactDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  // today/yesterday 转换为具体日期
  if (dateType === 'today' || dateType === 'yesterday') {
    const now = new Date();
    if (dateType === 'yesterday') {
      now.setDate(now.getDate() - 1);
    }
    const targetDate = toCompactDate(now);
    const target = history.find(h => h.date === targetDate);
    return target?.consumption ?? null;
  }

  if (dateType === 'week') {
    // 计算最近7天的日期范围
    const today = new Date();
    const weekDates = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      weekDates.add(toCompactDate(d));
    }

    // 筛选该范围内的数据
    const weekData = history.filter(h => weekDates.has(h.date));
    if (weekData.length === 0) return null;

    const sum = weekData.reduce((s, h) => s + (h.consumption || 0), 0);
    return sum / weekData.length;
  }

  // 自定义日期
  const target = history.find(h => h.date === dateType || h.formattedDate === dateType);
  return target?.consumption ?? null;
}
```

### Task 8: 验证校区页面数据完整度显示（已实现）

**文件:** `docs/campus-view.html`

**状态:** 已实现，无需修改

校区页面已有完整的数据完整度显示逻辑：

1. **顶部统计区域** (line 818-833)：显示 `数据完整度: X/Y 间 (Z%)`
2. **楼栋卡片** (line 1115-1154)：显示每栋楼的完整度百分比，低完整度有警告颜色

`getCampusConsumption` 返回的数据结构包含：
- `roomsWithData`: 有数据的房间数
- `dataCompleteness`: 数据完整度比例
- `buildings[name].roomCount`: 每栋楼有数据的房间数

---

## 测试验证

### 测试场景

1. **today 数据匹配**：选择今日日期，验证只显示有今日数据的房间
2. **yesterday 数据匹配**：选择昨日日期，验证只显示有昨日数据的房间
3. **week 平均值**：验证只计算最近7天日期范围内的数据
4. **无数据房间**：验证不显示在排行榜中，或显示为"暂无数据"
5. **校区页面完整度**：验证正确显示数据完整度百分比

### 边界情况

- 房间数据不连续（缺少某些日期）
- 新房间（数据少于7天）
- 所有房间都没有某日数据
