# Parallel Building Loading for Campus Ranking

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load multiple buildings' consumption data concurrently in `calculateBeatPercentage()` instead of sequentially, reducing campus ranking computation time.

**Architecture:** Add a generic `_poolTasks(taskFactories, concurrency)` method to DataService (reusing the `poolRoomHistory` scheduling pattern), then replace the `for...of` loop in `calculateBeatPercentage()` with a parallel pool dispatch. Own building stats are still loaded first (needed for room consumption extraction); only the other buildings are parallelized with concurrency=6.

**Tech Stack:** Vanilla JS (ES2020+), static JSON files via `fetch()`, IndexedDB + sessionStorage + in-memory caching.

**Spec:** `docs/superpowers/specs/2026-05-28-parallel-building-loading-design.md`

---

### Task 1: Add `_poolTasks()` to DataService

**Files:**
- Modify: `docs/js/data-service.js` (after `streamRoomHistory()` / `poolRoomHistory()`, around line 565)
- Test: manual verification in browser (no JS test framework exists)

- [ ] **Step 1: Read the existing `poolRoomHistory()` to understand the scheduling pattern**

Read `docs/js/data-service.js` lines 457-551 to understand the concurrent pool pattern.

- [ ] **Step 2: Add `_poolTasks()` method to DataService**

Insert after line 565 (after `streamRoomHistory`). The method:

```javascript
/**
 * 通用异步任务并发池
 * 以 concurrency 上限并行执行一组零参异步函数
 * @param {Array<() => Promise>} taskFactories
 * @param {number} concurrency 并发上限（默认6）
 * @returns {Promise<Array<{status: string, value?: any, reason?: Error}>>}
 */
async _poolTasks(taskFactories, concurrency = 6) {
  const results = new Array(taskFactories.length);
  let nextIndex = 0;
  let completed = 0;
  const total = taskFactories.length;

  return new Promise((resolve) => {
    if (total === 0) { resolve(results); return; }

    const startNext = () => {
      if (nextIndex >= total) return;
      const idx = nextIndex++;
      const task = taskFactories[idx];

      Promise.resolve().then(() => task()).then(
        (value) => {
          results[idx] = { status: 'fulfilled', value };
        },
        (reason) => {
          results[idx] = { status: 'rejected', reason };
        }
      ).finally(() => {
        completed++;
        if (completed < total) {
          startNext();
        } else {
          resolve(results);
        }
      });
    };

    const initialCount = Math.min(concurrency, total);
    for (let i = 0; i < initialCount; i++) {
      startNext();
    }
  });
}
```

- [ ] **Step 3: Run ruff to check for syntax errors**

```bash
cd /Users/macbook/Program/dorm_public/.worktrees/parallel-building-loading
ruff check docs/js/data-service.js --select=F,E
```
Expected: no errors (this is JS, ruff only checks Python — this is a no-op sanity step)

- [ ] **Step 4: Commit**

```bash
git add docs/js/data-service.js
git commit -m "feat: add generic _poolTasks concurrent task pool to DataService"
```

---

### Task 2: Convert `calculateBeatPercentage()` loop to parallel

**Files:**
- Modify: `docs/js/data-service.js` (lines 2273-2293, the `for...of` loop)

- [ ] **Step 1: Read the current `calculateBeatPercentage()` loop**

Re-read lines 2268-2293 to verify the exact code to modify.

- [ ] **Step 2: Replace the serial `for...of` loop with parallel dispatch**

**Current code (lines 2268-2293):**
```javascript
let buildingRoomCount = 0;
let buildingBeaten = 0;
let campusRoomCount = 0;
let campusBeaten = 0;

for (const building of campusStats.buildingDetails) {
  try {
    const stats = building.name === buildingName
      ? currentBuildingStats
      : await this._getBuildingConsumptionStats(campusName, building.name, date, compactDate);
    const beatenInBuilding = this._countLessThan(stats.consumptions, currentRoomConsumption);

    if (building.name === buildingName) {
      const excludesCurrentRoom = this._hasRoomConsumptionInStats(stats, roomName);
      buildingRoomCount = Math.max(0, stats.roomCount - (excludesCurrentRoom ? 1 : 0));
      buildingBeaten = beatenInBuilding;
      campusRoomCount += buildingRoomCount;
      campusBeaten += beatenInBuilding;
    } else {
      campusRoomCount += stats.roomCount;
      campusBeaten += beatenInBuilding;
    }
  } catch (error) {
    console.warn(`跳过楼栋 ${building.name}:`, error);
  }
}
```

**Replace with:**
```javascript
let buildingRoomCount = 0;
let buildingBeaten = 0;
let campusRoomCount = 0;
let campusBeaten = 0;

const otherBuildings = campusStats.buildingDetails.filter(
  b => b.name !== buildingName
);

const results = otherBuildings.length > 0
  ? await this._poolTasks(
      otherBuildings.map(b => () =>
        this._getBuildingConsumptionStats(campusName, b.name, date, compactDate)
      ),
      6
    )
  : [];

for (let i = 0; i < results.length; i++) {
  const building = otherBuildings[i];
  if (results[i].status === 'rejected') {
    console.warn(`跳过楼栋 ${building.name}:`, results[i].reason);
    continue;
  }
  const stats = results[i].value;
  const beatenInBuilding = this._countLessThan(stats.consumptions, currentRoomConsumption);
  campusRoomCount += stats.roomCount;
  campusBeaten += beatenInBuilding;
}

// Own building: use pre-loaded stats
{
  const stats = currentBuildingStats;
  const beatenInBuilding = this._countLessThan(stats.consumptions, currentRoomConsumption);
  const excludesCurrentRoom = this._hasRoomConsumptionInStats(stats, roomName);
  buildingRoomCount = Math.max(0, stats.roomCount - (excludesCurrentRoom ? 1 : 0));
  buildingBeaten = beatenInBuilding;
  campusRoomCount += buildingRoomCount;
  campusBeaten += beatenInBuilding;
}
```

- [ ] **Step 3: Verify code correctness by re-reading the modified function**

Read the full `calculateBeatPercentage()` (lines 2223-2310) to ensure the modification integrates correctly — variable declarations at top, early exits unchanged, result construction at bottom unchanged.

- [ ] **Step 4: Run ruff to check for syntax errors**

```bash
ruff check docs/js/data-service.js --select=F,E
```
Expected: no Python-relevant errors (no-op check, JS file)

- [ ] **Step 5: Commit**

```bash
git add docs/js/data-service.js
git commit -m "perf: parallelize other building loading in calculateBeatPercentage"
```

---

### Task 3: Verify in browser

- [ ] **Step 1: Serve docs directory and open room-view.html**

```bash
cd /Users/macbook/Program/dorm_public/.worktrees/parallel-building-loading
python3 -m http.server 8080 --directory docs
```
Open `http://localhost:8080/room-view.html` in browser, configure a room, and verify:
  - Ranking card shows the correct `beatBuildingPercent` and `beatCampusPercent`
  - No console errors related to ranking calculation
  - Network tab shows multiple building requests happening concurrently (not waterfall)

- [ ] **Step 2: Verify edge case — single-building campus**

If possible, test with a campus that has only 1 building. The `otherBuildings` filter should produce an empty array, `_poolTasks([], 6)` returns `[]`, and only the own-building block executes.

- [ ] **Step 3: Verify cache behavior**

Second load of the same room should hit the `_beatPercentageCache` and `_buildingConsumptionStatsCache`, resulting in zero network requests.
