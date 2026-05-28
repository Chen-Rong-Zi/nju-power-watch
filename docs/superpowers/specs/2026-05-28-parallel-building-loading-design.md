# Parallel Building Loading for Campus Ranking

## Summary

Optimize `calculateBeatPercentage()` in room-view.html to load multiple buildings' consumption data concurrently instead of sequentially, reducing wait time when computing campus-wide ranking percentages.

## Motivation

When the user opens room-view.html, `calculateBeatPercentage()` loads consumption data for every building in the campus (30+ buildings) to compute what percentage of rooms the user beats. Currently, buildings are loaded one-by-one (`for...of` + `await`), creating a waterfall that takes O(n) sequential network round-trips. The goal is to reduce this to O(1) round-trips by loading buildings in parallel with a concurrency limit.

## Design

### Scope

Single file change: `docs/js/data-service.js`. No changes to `room-view.html` or any other file.

### Component: `_poolTasks(taskFactories, concurrency)`

A new generic method on the `DataService` object that executes a list of zero-argument async functions with a concurrency limit.

**Signature:**
```javascript
async _poolTasks(taskFactories, concurrency = 6)
```

**Input:**
- `taskFactories`: `Array<() => Promise<any>>` — each element is a thunk (zero-arg function) that returns a promise
- `concurrency`: `number` — max number of tasks running simultaneously (default 6)

**Behavior:**
- Starts up to `concurrency` tasks immediately
- Each time a task completes, starts the next pending task
- Tasks that reject do not stop other tasks (matching current try/catch behavior)

**Output:**
- Returns `Array<{status: 'fulfilled', value: any} | {status: 'rejected', reason: any}>` in the same order as `taskFactories`
- This is the `Promise.allSettled` format, but applied incrementally with concurrency control

**Implementation:**
- Reuses the scheduling pattern from the existing `poolRoomHistory()` method (lines 457-551), generalized to accept arbitrary task factories instead of room names + fetch logic
- Uses a simple index-based dispatcher with a `Set` of active promises

### Change: `calculateBeatPercentage()`

**Current flow (lines 2273-2293):**
```
for each building in campus:
    if building is user's own building:
        use pre-loaded currentBuildingStats
    else:
        await _getBuildingConsumptionStats(building)  // SERIAL
    accumulate counts
```

**New flow:**
```
// Own building: unchanged, loaded first (enables room consumption extraction)
currentBuildingStats = await _getBuildingConsumptionStats(ownBuilding)

// Other buildings: parallel with concurrency limit
otherBuildingTasks = otherBuildings.map(
    b => () => _getBuildingConsumptionStats(campusName, b.name, date, compactDate)
)
results = await _poolTasks(otherBuildingTasks, 6)

// Accumulate: own building + each other building result
for each result:
    if fulfilled: accumulate counts (as before)
    if rejected: warn and skip (as before)
```

**Key detail — own building handled separately:**
- `currentBuildingStats` is still loaded first (synchronously awaited) because the user's own room consumption is extracted from it — that value is needed before we can do the `_countLessThan` comparison for all other buildings
- Since `currentBuildingStats` is already cached in `_buildingConsumptionStatsCache` by this point, the await resolves instantly on subsequent calls

### Concurrency limit: 6

- Matches typical browser's per-origin connection pool limit (~6)
- Prevents connection contention when loading 30+ buildings
- If some buildings already have cached stats (via `_buildingConsumptionStatsCache`), their promise resolves instantly anyway — the pool dispatches them at full speed without occupying network connections

### Error handling

Unchanged from current behavior: if a building's stats fail to load, it is skipped with `console.warn`. The `_poolTasks` method catches rejections internally so one failure does not block other buildings.

### Testing

- Verify that `loadRankingData()` in room-view.html still displays correct `beatBuildingPercent` and `beatCampusPercent`
- Verify that all buildings (including edge cases like single-building campus) are counted correctly
- Verify that a failure in one building's stats does not affect other buildings' data
