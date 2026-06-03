# Animation Cache Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage-based animation tracking with IndexedDB ranking cache existence check.

**Architecture:** Remove the 5 localStorage helper functions and derive animation state from whether IndexedDB already has a ranking cache entry for the given campus/building/date. The check naturally happens early in `loadRanking()` when it queries `DataService.getRankingCache()`.

**Tech Stack:** Vanilla JavaScript, IndexedDB (via existing DataService API)

---

### Task 1: Remove localStorage animation helpers

**Files:**
- Modify: `docs/building-view.html:1338-1360`

- [ ] **Step 1: Delete the 5 localStorage animation functions**

Remove these lines (1338-1360):

```javascript
    // 动画展示记录（持久化到 localStorage）
    const ANIMATION_SHOWN_KEY = 'electricity_animation_shown';
    function getAnimationShownSet() {
      try {
        const stored = localStorage.getItem(ANIMATION_SHOWN_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
      } catch {
        return new Set();
      }
    }
    function saveAnimationShownSet(set) {
      try {
        localStorage.setItem(ANIMATION_SHOWN_KEY, JSON.stringify([...set]));
      } catch {}
    }
    function markAnimationShown(cacheKey) {
      const set = getAnimationShownSet();
      set.add(cacheKey);
      saveAnimationShownSet(set);
    }
    function hasAnimationBeenShown(cacheKey) {
      return getAnimationShownSet().has(cacheKey);
    }
```

- [ ] **Step 2: Remove the localStorage-based check at the start of loadRanking**

In `loadRanking()`, remove line 1626:

```javascript
      const hasAnimationShown = hasAnimationBeenShown(cacheKey);
```

- [ ] **Step 3: Remove the markAnimationShown call**

Remove line 1944:

```javascript
      markAnimationShown(effectiveCacheKey);
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "refactor: remove localStorage-based animation tracking helpers"
```

---

### Task 2: Derive animation state from IndexedDB cache check

**Files:**
- Modify: `docs/building-view.html:1622-1670`

- [ ] **Step 1: Move IndexedDB cache check earlier and set hasAnimationShown from it**

Replace the current structure in `loadRanking()`. The key change: check IndexedDB cache early, and if cache exists, set `hasAnimationShown = true` before the rendering path diverges.

Current code flow (simplified):
```
const hasAnimationShown = hasAnimationBeenShown(cacheKey);  // ← removed in Task 1
...
// 1. Check memory cache → return
// 2. Check IndexedDB cache → return
// 3. Load from scratch (with animation if !hasAnimationShown)
```

New code flow:
```
// 1. Check memory cache → set hasAnimationShown = true, return
// 2. Check IndexedDB cache → set hasAnimationShown = true, return
// 3. Load from scratch → hasAnimationShown stays false → play animation
```

In the memory cache hit block (line ~1662), before `return`:

```javascript
      // 1. 先检查内存缓存
      if (consumptionCache.has(effectiveCacheKey)) {
        updateCacheStatus('已缓存', false);
        const cachedData = consumptionCache.get(effectiveCacheKey);
        displayRanking(cachedData.rankings || cachedData, cachedData.noDataRooms || []);
        return;
      }
```

No change needed here — the early return means we never reach the animation code.

In the IndexedDB cache hit block (line ~1669), after the cache is confirmed to exist, the function also returns early. No change needed here either.

The only place that needs `hasAnimationShown` is the fresh-load path. Since we removed the localStorage check, `hasAnimationShown` is now simply `false` when we reach the fresh-load path (because if there was a cache, we would have returned early already).

Add a local variable at the start of the fresh-load section:

```javascript
      // 缓存未命中，需要从原始数据计算
      const hasAnimationShown = false; // Fresh load = play animation
```

Wait — we don't even need this variable. The animation code further down already checks `if (!hasAnimationShown)`. Since we removed the variable declaration, we just need to ensure the code that references `hasAnimationShown` still works.

After removing the old declaration, the only remaining references are in the fresh-load path (lines ~1768, 1826, 1830, 1889, 1947). Since this path is only reached when there's NO cache, `hasAnimationShown` should always be `false`. Replace all remaining `hasAnimationShown` references with `false`, or more simply, just declare it at the start of the fresh-load path.

Actually, the cleanest approach: declare `hasAnimationShown` just before the fresh-load path begins (after both cache checks return), set to `false`:

After line 1742 (`return;` which ends the IndexedDB cache hit block), add:

```javascript
      // 未命中缓存，需要重新加载（播放动画）
      const hasAnimationShown = false;
```

This is the only line needed. All downstream references to `hasAnimationShown` continue to work unchanged.

- [ ] **Step 2: Verify in browser**

Open the building page in the browser:
1. First load of a building (no cache): animation should play
2. Second load (cache exists): no animation
3. Clear IndexedDB, reload: animation should play again

- [ ] **Step 3: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: derive animation state from IndexedDB cache instead of localStorage"
```
