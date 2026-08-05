# 前端适配分段扫描数据不全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端适配后端爬虫分段扫描导致的"数据部分存在"场景，消除因数据缺口导致的误导性展示

**Architecture:** ① 校区级 fallback 判断从抽样改为基于 `generated_at` 时间戳 ② 新增扫描进度提示横幅 ③ 消耗量计算中日期缺口返回 null 而不是跨日累计 ④ 平均消耗量标注元数据

**Tech Stack:** JavaScript ES6+ (frontend), 静态 JSON 数据文件

---

## File Structure

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `docs/js/data-service.js` | 修改 | 8 处修改：校区 fallback、阈值、辅助函数、4 处消耗计算、avgConsumption 返回结构 |
| `docs/campus-view.html` | 修改 | 新增扫描横幅 CSS + HTML + JS 逻辑 |
| `docs/building-view.html` | 修改 | 新增扫描横幅 CSS + HTML + JS 逻辑 + 1 处消耗计算修复 |

---

### Task 1: 添加 `_isConsecutiveDates` 辅助方法

**Files:**
- Modify: `docs/js/data-service.js` (在 `_calculateConsumptionFromHistory` 方法附近，~L1430)

- [ ] **Step 1: 在 DataService 对象中新增 `_isConsecutiveDates` 方法**

在 `_calculateConsumptionFromHistory` 方法之前添加：

```javascript
  /**
   * 检查两个日期（YYYYMMDD）是否连续（相邻日期）
   * @private
   */
  _isConsecutiveDates(currDate, prevDate) {
    const curr = new Date(parseInt(currDate.substring(0, 4)),
                          parseInt(currDate.substring(4, 6)) - 1,
                          parseInt(currDate.substring(6, 8)));
    const prev = new Date(parseInt(prevDate.substring(0, 4)),
                          parseInt(prevDate.substring(4, 6)) - 1,
                          parseInt(prevDate.substring(6, 8)));
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
    return Math.round(diffDays) === 1;
  },
```

- [ ] **Step 2: 验证文件语法正确**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('docs/js/data-service.js','utf8');eval(s.slice(0,s.indexOf('//# sourceURL')));console.log('ok')"` 或手动检查语法

---

### Task 2: 修复 `getRoomHistory` 消耗计算日期连续性

**Files:**
- Modify: `docs/js/data-service.js:489-494`

- [ ] **Step 1: 修改 getRoomHistory 中的消耗计算循环**

修改前：
```javascript
        // 计算每日消耗
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          curr.consumption = Math.max(0, prev.electricity - curr.electricity);
        }
```

修改后：
```javascript
        // 计算每日消耗（日期不连续时返回 null，不跨日累计）
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          if (!this._isConsecutiveDates(curr.date, prev.date)) {
            curr.consumption = null;
          } else {
            curr.consumption = Math.max(0, prev.electricity - curr.electricity);
          }
        }
```

---

### Task 3: 修复 `batchGetRoomHistory` 消耗计算日期连续性

**Files:**
- Modify: `docs/js/data-service.js:607-610`

- [ ] **Step 1: 修改 batchGetRoomHistory 中的消耗计算循环**

修改前：
```javascript
          // 计算每日消耗
          for (let j = 1; j < history.length; j++) {
            const prev = history[j - 1];
            const curr = history[j];
            curr.consumption = Math.max(0, prev.electricity - curr.electricity);
          }
```

修改后：
```javascript
          // 计算每日消耗（日期不连续时返回 null，不跨日累计）
          for (let j = 1; j < history.length; j++) {
            const prev = history[j - 1];
            const curr = history[j];
            if (!this._isConsecutiveDates(curr.date, prev.date)) {
              curr.consumption = null;
            } else {
              curr.consumption = Math.max(0, prev.electricity - curr.electricity);
            }
          }
```

---

### Task 4: 修复 `getCampusConsumptionTrend` 消耗计算日期连续性

**Files:**
- Modify: `docs/js/data-service.js:1816-1821`

- [ ] **Step 1: 修改 getCampusConsumptionTrend 中的消耗计算**

修改前（L1816-1821）：
```javascript
        for (let i = 1; i < dates.length; i++) {
          const date = dates[i];
          const prev = bh[dates[i - 1]];
          const curr = bh[date];
          // 消耗 = max(0, 前日余额 - 当日余额)，充值或不变记为0
          const cons = prev > curr ? prev - curr : 0;
          allDateSet.add(date);

          if (!dailyConsumption[date]) dailyConsumption[date] = {};
          // 使用楼栋名+房间名作为唯一key，避免不同楼栋同名房间被覆盖
          const uniqueKey = `${bd.name}_${roomName}`;
          if (!dailyConsumption[date][uniqueKey]) {
            dailyConsumption[date][uniqueKey] = cons;
          }
        }
```

修改后：
```javascript
        for (let i = 1; i < dates.length; i++) {
          const date = dates[i];
          const prevDate = dates[i - 1];
          const prev = bh[prevDate];
          const curr = bh[date];
          // 日期不连续时跳过，不跨日累计
          if (!this._isConsecutiveDates(date, prevDate)) continue;
          // 消耗 = max(0, 前日余额 - 当日余额)，充值或不变记为0
          const cons = prev > curr ? prev - curr : 0;
          allDateSet.add(date);

          if (!dailyConsumption[date]) dailyConsumption[date] = {};
          // 使用楼栋名+房间名作为唯一key，避免不同楼栋同名房间被覆盖
          const uniqueKey = `${bd.name}_${roomName}`;
          if (!dailyConsumption[date][uniqueKey]) {
            dailyConsumption[date][uniqueKey] = cons;
          }
        }
```

---

### Task 5: 修复 `getBuildingConsumptionTrend` 消耗计算日期连续性

**Files:**
- Modify: `docs/js/data-service.js:1889-1893`

- [ ] **Step 1: 修改 getBuildingConsumptionTrend 中的消耗计算**

修改前（L1889-1893）：
```javascript
      for (let i = 1; i < dates.length; i++) {
        const date = dates[i];
        const prev = bh[dates[i - 1]];
        const curr = bh[date];
        const cons = prev > curr ? prev - curr : 0;
        allDateSet.add(date);

        if (!dailyConsumption[date]) dailyConsumption[date] = {};
        if (!dailyConsumption[date][roomName]) {
          dailyConsumption[date][roomName] = cons;
        }
      }
```

修改后：
```javascript
      for (let i = 1; i < dates.length; i++) {
        const date = dates[i];
        const prevDate = dates[i - 1];
        const prev = bh[prevDate];
        const curr = bh[date];
        // 日期不连续时跳过，不跨日累计
        if (!this._isConsecutiveDates(date, prevDate)) continue;
        const cons = prev > curr ? prev - curr : 0;
        allDateSet.add(date);

        if (!dailyConsumption[date]) dailyConsumption[date] = {};
        if (!dailyConsumption[date][roomName]) {
          dailyConsumption[date][roomName] = cons;
        }
      }
```

---

### Task 6: 修复 `_calculateConsumptionFromHistory` 日期连续性（单日 + week 分支）

**Files:**
- Modify: `docs/js/data-service.js:1460-1481`

- [ ] **Step 1: 修改 week 分支（L1460-1470），日期不连续时跳过该对**

修改前：
```javascript
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
```

修改后：
```javascript
      let totalConsumption = 0;
      let count = 0;
      for (let i = 1; i < validDates.length; i++) {
        const prevDate = validDates[i - 1];
        const currDate = validDates[i];
        // 日期不连续时跳过该对，不纳入平均计算
        if (!this._isConsecutiveDates(currDate, prevDate)) continue;
        const prevBalance = balanceHistory[prevDate];
        const currBalance = balanceHistory[currDate];
        if (prevBalance > currBalance) {
          totalConsumption += prevBalance - currBalance;
          count++;
        }
      }
      return count > 0 ? totalConsumption / count : 0;
```

- [ ] **Step 2: 修改单日分支（L1473-1481），取 dates[targetIdx-1] 后检查日期连续性**

修改前：
```javascript
    // 按日期查找
    const targetIdx = dates.indexOf(targetDate);
    if (targetIdx === -1 || targetIdx === 0) return null;

    // 计算消耗量：前一天余额 - 当天余额
    const prevBalance = balanceHistory[dates[targetIdx - 1]];
    const currBalance = balanceHistory[dates[targetIdx]];

    return prevBalance > currBalance ? prevBalance - currBalance : 0;
```

修改后：
```javascript
    // 按日期查找
    const targetIdx = dates.indexOf(targetDate);
    if (targetIdx === -1 || targetIdx === 0) return null;

    const prevDate = dates[targetIdx - 1];
    // 日期不连续时返回 null，不跨日累计
    if (!this._isConsecutiveDates(targetDate, prevDate)) return null;

    // 计算消耗量：前一天余额 - 当天余额
    const prevBalance = balanceHistory[prevDate];
    const currBalance = balanceHistory[targetDate];

    return prevBalance > currBalance ? prevBalance - currBalance : 0;
```

---

### Task 7: 修复 `building-view.html` 中 `calculateConsumption` 日期连续性

**Files:**
- Modify: `docs/building-view.html:2478-2520`

- [ ] **Step 1: 修改 `calculateConsumption` 函数，`today/yesterday` 分支增加日期连续性检查**

修改前（L2496-2497）：
```javascript
        const targetDate = toCompactDate(now);
        const target = history.find(h => h.date === targetDate);
        return target?.consumption ?? null;
```

修改后需要找到前一条记录并检查日期连续性。由于 `history` 数组中的 `consumption` 字段已经在 `getRoomHistory`（Task 2）中修复了日期连续性，`history.find` 返回的 `target.consumption` 已经正确（null 或不连续时为 null）。所以此处的 `target?.consumption ?? null` 已经能正确处理——但仅当 `consumption` 字段已经正确设置。

然而，`building-view.html` 的 `calculateConsumption` 函数在 `today/yesterday` 分支中直接使用 `history.find(h => h.date === targetDate)` 然后返回 `target?.consumption`。既然 Task 2 已经在 `getRoomHistory` 中设置了 `consumption` 为 null 当日期不连续时，这个函数已经自动受益。

但是，还有 `week` 分支（L2500-2516）和自定义日期分支（L2519-2520）需要处理。`week` 分支使用 `consumption || 0`，会把 null 当作 0。自定义日期分支直接返回 `target?.consumption ?? null`。

所以实际上 `today/yesterday` 和自定义日期分支无需修改（已从 Task 2 受益）。但 `week` 分支需要修改，当 `consumption` 为 null 时不应该加到 sum 中。

修改前（L2514-2515）：
```javascript
        const sum = weekData.reduce((s, h) => s + (h.consumption || 0), 0);
        return sum / weekData.length;
```

修改后：
```javascript
        const validData = weekData.filter(h => h.consumption !== null && h.consumption !== undefined);
        if (validData.length === 0) return null;
        const sum = validData.reduce((s, h) => s + h.consumption, 0);
        return sum / validData.length;
```

---

### Task 8: 重构校区级 `_checkDateCoverage` 为基于 `generated_at`

**Files:**
- Modify: `docs/js/data-service.js:192-221`

- [ ] **Step 1: 替换 `_checkDateCoverage` 的校区级分支（else 块）**

修改前（L192-221，整个 else 块）：
```javascript
    } else {
      // Check campus-wide (sample a few buildings for performance)
      const campusStats = await this.getCampusStatistics(campusName);
      if (!campusStats || !campusStats.buildingDetails) return 0;

      let totalRooms = 0;
      let roomsWithData = 0;

      // Sample up to 5 buildings for quick check
      const sampleBuildings = campusStats.buildingDetails.slice(0, 5);

      for (const bd of sampleBuildings) {
        const details = await this.getBuildingDetails(campusName, bd.name);
        if (!details || !details.rooms) continue;

        for (const roomName in details.rooms) {
          totalRooms++;
          const bh = details.rooms[roomName].balance_history;
          if (bh && bh[compactDate] !== undefined) {
            const dates = Object.keys(bh).sort();
            const idx = dates.indexOf(compactDate);
            if (idx > 0) {
              roomsWithData++;
            }
          }
        }
      }

      return totalRooms > 0 ? roomsWithData / totalRooms : 0;
    }
```

修改后：
```javascript
    } else {
      // Campus-wide: use generated_at from overview.json
      try {
        const overview = await this.getOverview();
        if (!overview || !overview.generated_at) return 0;

        // generated_at is UTC+0, convert to CST (+8h)
        // Append 'Z' to ensure consistent UTC parsing across browsers
        const generatedDate = new Date(overview.generated_at + 'Z');
        generatedDate.setUTCHours(generatedDate.getUTCHours() + 8);
        // Use UTC methods to avoid local timezone interference
        const year = generatedDate.getUTCFullYear();
        const month = String(generatedDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(generatedDate.getUTCDate()).padStart(2, '0');
        const generatedCompact = `${year}${month}${day}`;

        // If generated_at date matches target date, coverage is sufficient
        return generatedCompact === compactDate ? 1.0 : 0;
      } catch (error) {
        console.warn('Failed to get overview.json, falling back to coverage=0', error);
        return 0;
      }
    }
```

---

### Task 9: 修改 `findLatestDateWithData` 阈值

**Files:**
- Modify: `docs/js/data-service.js:138,151`

- [ ] **Step 1: 将两处 `>= 0.5` 阈值改为 `> 0`**

修改第 1 处（L138）：
```javascript
    if (originalCoverage >= 0.5) {
```
改为：
```javascript
    if (originalCoverage > 0) {
```

修改第 2 处（L151）：
```javascript
      if (coverage >= 0.5) {
```
改为：
```javascript
      if (coverage > 0) {
```

---

### Task 10: 重构 `calculateAvgConsumption` 返回结构体

**Files:**
- Modify: `docs/js/data-service.js:539-546`（方法定义）
- Modify: `docs/js/data-service.js:505`（调用方 A）
- Modify: `docs/js/data-service.js:618`（调用方 B）

- [ ] **Step 1: 修改 `calculateAvgConsumption` 方法**

修改前：
```javascript
  calculateAvgConsumption(history) {
    if (history.length < 2) return 0;

    const consumptions = history.slice(1).map(h => h.consumption).filter(c => c > 0);
    if (consumptions.length === 0) return 0;

    return consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  },
```

修改后：
```javascript
  calculateAvgConsumption(history) {
    if (history.length < 2) return { avg: 0, daysWithData: 0, totalDays: Math.max(0, history.length - 1) };

    const consumptions = history.slice(1).map(h => h.consumption).filter(c => c > 0);
    if (consumptions.length === 0) return { avg: 0, daysWithData: 0, totalDays: Math.max(0, history.length - 1) };

    return {
      avg: consumptions.reduce((a, b) => a + b, 0) / consumptions.length,
      daysWithData: consumptions.length,
      totalDays: Math.max(0, history.length - 1)
    };
  },
```

- [ ] **Step 2: 修改调用方 A — `getRoomHistory`（L505）**

修改前：
```javascript
        avgConsumption: this.calculateAvgConsumption(history)
```

修改后：
```javascript
        const avgResult = this.calculateAvgConsumption(history);
        // ...avgConsumption stays at line 505
        // 注意：上面两行需要与现有代码合并
```

实际修改（L504-505）：
```javascript
        dailyConsumption: todayEntry?.consumption ?? null,
        avgConsumption: this.calculateAvgConsumption(history)
```

改为：
```javascript
        dailyConsumption: todayEntry?.consumption ?? null,
        ...(() => { const r = this.calculateAvgConsumption(history); return { avgConsumption: r.avg, avgConsumptionMeta: { daysWithData: r.daysWithData, totalDays: r.totalDays } }; })()
```

或者更清晰的方式——拆分为两行变量赋值，但需要确保不破坏外层对象字面量。由于这是在 `const result = { ... }` 中，不能直接写语句。推荐使用 IIFE 方式，或者提前计算：

提前计算方式（在 L497 之后、`const result = {` 之前插入）：
```javascript
      const avgConsumptionResult = this.calculateAvgConsumption(history);
```

然后在 `result` 中：
```javascript
        avgConsumption: avgConsumptionResult.avg,
        avgConsumptionMeta: { daysWithData: avgConsumptionResult.daysWithData, totalDays: avgConsumptionResult.totalDays }
```

- [ ] **Step 3: 修改调用方 B — `batchGetRoomHistory`（L618）**

修改前（L614-618）：
```javascript
        const data = {
          ...rawData,
          history,
          dailyConsumption: history.length > 1 ? history[history.length - 1].consumption : 0,
          avgConsumption: this.calculateAvgConsumption(history)
        };
```

修改后：
```javascript
        const avgConsumptionResult = this.calculateAvgConsumption(history);
        const data = {
          ...rawData,
          history,
          dailyConsumption: history.length > 1 ? history[history.length - 1].consumption : 0,
          avgConsumption: avgConsumptionResult.avg,
          avgConsumptionMeta: { daysWithData: avgConsumptionResult.daysWithData, totalDays: avgConsumptionResult.totalDays }
        };
```

---

### Task 11: 校区页面添加扫描横幅

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: 添加扫描横幅 CSS**

在 fallback banner 的 CSS 块之后（~L375 附近）添加：

```css
    /* Scanning Banner */
    .scanning-banner {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.08) 100%);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      animation: slideDown 0.3s ease-out;
    }
    .scanning-banner-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .scanning-banner-icon {
      font-size: 20px;
      line-height: 1;
    }
    .scanning-banner-text {
      font-size: 14px;
      color: var(--text);
    }
    .scanning-banner-dismiss {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--muted);
      padding: 0 4px;
      line-height: 1;
    }
    .scanning-banner-dismiss:hover {
      color: var(--text);
    }
```

- [ ] **Step 2: 添加扫描横幅 HTML**

在 fallback banner 的 `<div>` 之后（~L589）添加：

```html
    <!-- Scanning Banner -->
    <div class="scanning-banner" id="scanning-banner" style="display: none;">
      <div class="scanning-banner-content">
        <span class="scanning-banner-icon">🔄</span>
        <span class="scanning-banner-text" id="scanning-banner-text"></span>
      </div>
      <button class="scanning-banner-dismiss" onclick="dismissScanningBanner()" title="关闭">×</button>
    </div>
```

- [ ] **Step 3: 添加扫描横幅 JS 逻辑**

在 `dismissFallbackBanner` 函数附近添加：

```javascript
    // ==================== Scanning Banner ====================
    function showScanningBanner(batchProgress, totalBatches) {
      const banner = document.getElementById('scanning-banner');
      const text = document.getElementById('scanning-banner-text');
      text.textContent = `数据扫描中 (${batchProgress}/${totalBatches}批已完成) — 今日扫描完成后数据自动更新`;
      banner.style.display = 'flex';
    }

    function hideScanningBanner() {
      const banner = document.getElementById('scanning-banner');
      banner.style.display = 'none';
    }

    function dismissScanningBanner() {
      hideScanningBanner();
      sessionStorage.setItem('scanningBannerDismissed', 'true');
    }
```

- [ ] **Step 4: 在 `selectCampus` 函数中添加同步 fetch `batch_run_summary.json` 逻辑**

在 `selectCampus` 函数中，fallback 判断之后、加载数据之前，添加扫描横幅检查：

```javascript
      // Check scanning status
      try {
        const batchResponse = await fetch(DataService.DATABASE_PATH + '/.batch_run_summary.json');
        if (batchResponse.ok) {
          const batchData = await batchResponse.json();
          if (batchData && typeof batchData.total_batches === 'number' && batchData.total_batches > 0 &&
              batchData.batches && typeof batchData.cumulative === 'object') {
            const batchCount = Object.keys(batchData.batches).length;
            if (batchCount < batchData.total_batches && !sessionStorage.getItem('scanningBannerDismissed')) {
              showScanningBanner(batchCount, batchData.total_batches);
            } else {
              hideScanningBanner();
            }
          } else {
            hideScanningBanner();
          }
        } else {
          hideScanningBanner();
        }
      } catch (e) {
        hideScanningBanner();
      }
```

---

### Task 12: 楼栋页面添加扫描横幅

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: 添加扫描横幅 CSS**

在 fallback banner 的 CSS 块之后（~L630 附近）添加与 Task 11 Step 1 相同的扫描横幅 CSS。

- [ ] **Step 2: 添加扫描横幅 HTML**

在 fallback banner 的 `<div>` 之后（~L1408）添加与 Task 11 Step 2 相同的扫描横幅 HTML。

- [ ] **Step 3: 添加扫描横幅 JS 逻辑**

在 `dismissFallbackBanner` 函数附近添加与 Task 11 Step 3 相同的扫描横幅 JS 函数。

- [ ] **Step 4: 在 `loadBuilding` 函数中添加同步 fetch 逻辑**

在 `loadBuilding` 函数中，fallback 判断之后、加载排行榜数据之前，添加与 Task 11 Step 4 相同的扫描横幅检查逻辑。

---

### Task 13: 最终验证和提交

- [ ] **Step 1: 全局检查所有修改**

```bash
# 确保没有语法错误
node -e "
const fs = require('fs');
const s = fs.readFileSync('docs/js/data-service.js', 'utf8');
// 检查是否所有引用的函数都存在
console.log('Has _isConsecutiveDates:', s.includes('_isConsecutiveDates'));
console.log('Has avgConsumptionMeta:', s.includes('avgConsumptionMeta'));
console.log('Has generated_at:', s.includes('generated_at'));
console.log('Has scanningBannerDismissed:', s.includes('scanningBannerDismissed'));
console.log('File size:', s.length, 'bytes');
"
```

- [ ] **Step 2: 验证 campus-view.html 和 building-view.html 的扫描横幅代码**

```bash
grep -c "scanning-banner" docs/campus-view.html
grep -c "scanning-banner" docs/building-view.html
grep -c "scanningBannerDismissed" docs/campus-view.html
grep -c "scanningBannerDismissed" docs/building-view.html
```

- [ ] **Step 3: 提交所有修改**

```bash
git add docs/js/data-service.js docs/campus-view.html docs/building-view.html
git commit -m "feat: adapt frontend for partial data from segmented batch scanning

- Add _isConsecutiveDates helper for date gap detection
- Fix 6 consumption calculation sites to return null on date gaps
- Replace campus-level fallback with generated_at timestamp check
- Lower fallback threshold from >=0.5 to >0
- Enhance calculateAvgConsumption to return metadata struct
- Add scanning progress banner to campus and building views

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 自检

**1. Spec 覆盖检查：**
- 模块 1（校区级 fallback 重构）：Task 8 ✅
- 模块 1 阈值修改：Task 9 ✅
- 模块 2（扫描横幅）：Task 11 (campus), Task 12 (building) ✅
- 模块 3（消耗计算日期缺口）：Task 1 (helper), Task 2 (getRoomHistory), Task 3 (batchGetRoomHistory), Task 4 (campusTrend), Task 5 (buildingTrend), Task 6 (_calculateConsumptionFromHistory), Task 7 (building-view.html) ✅
- 模块 4（avgConsumption 标注）：Task 10 ✅
- 模块 5（batch_run_summary.json 格式契约）：内嵌在 Task 11/12 的校验逻辑中 ✅

**2. 占位符检查：** 无占位符，所有代码均完整。

**3. 类型一致性检查：** `_isConsecutiveDates` 在所有消费点使用一致的签名（`(currDate, prevDate)`），`calculateAvgConsumption` 返回结构体的 `avg`/`daysWithData`/`totalDays` 字段名在定义和消费点一致。