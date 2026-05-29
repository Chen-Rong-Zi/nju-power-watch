# Auto-Switch to Latest Available Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When today's data is unavailable, automatically display the most recent date where the majority of rooms have data, while keeping `?date=today` in URL and showing a dismissible banner notification.

**Architecture:** Add a data availability check that finds the latest date with >50% room coverage. Both building and campus pages will use this to fallback to available data. A banner component informs users of the fallback. Trend charts remain independent.

**Tech Stack:** JavaScript ES6+ (frontend), static JSON data files

---

## File Structure

| File | Purpose |
|------|---------|
| `docs/js/data-service.js` | Add `findLatestDateWithData()` method |
| `docs/building-view.html` | Add fallback logic + banner component |
| `docs/campus-view.html` | Add fallback logic + banner component |

---

### Task 1: Add `findLatestDateWithData()` to data-service.js

**Files:**
- Modify: `docs/js/data-service.js`

- [ ] **Step 1: Add the new method after `_dateToCompact()`**

Find the `_dateToCompact()` method (around line 255), then add the new method after it:

```javascript
/**
 * Find the latest date where majority of rooms have data
 * @param {string} campusName - Campus name
 * @param {string|null} buildingName - Building name (null for campus-wide check)
 * @param {string} originalDate - Original target date ('today', 'yesterday', or YYYYMMDD)
 * @param {number} maxDaysBack - Maximum days to look back (default 7)
 * @returns {Promise<Object|null>} { date: 'YYYYMMDD', formattedDate: 'MM-DD', coverage: 0.95 } or null
 */
async findLatestDateWithData(campusName, buildingName = null, originalDate = 'today', maxDaysBack = 7) {
  // Get the original target date
  const targetDate = this._formatDateCompact(originalDate);

  // Check if original date has data
  const originalCoverage = await this._checkDateCoverage(campusName, buildingName, targetDate);
  if (originalCoverage >= 0.5) {
    return null; // Original date has sufficient data, no fallback needed
  }

  // Look for fallback dates
  const today = new Date();
  if (originalDate === 'today' || originalDate === 'yesterday') {
    const baseDate = new Date(today);
    if (originalDate === 'yesterday') {
      baseDate.setDate(baseDate.getDate() - 1);
    }
  }

  // Search backwards from the target date
  const baseDateObj = this._compactToDate(targetDate);

  for (let i = 1; i <= maxDaysBack; i++) {
    const checkDateObj = new Date(baseDateObj);
    checkDateObj.setDate(checkDateObj.getDate() - i);
    const checkDate = this._dateToCompact(checkDateObj);

    const coverage = await this._checkDateCoverage(campusName, buildingName, checkDate);
    if (coverage >= 0.5) {
      const month = checkDate.substring(4, 6);
      const day = checkDate.substring(6, 8);
      return {
        date: checkDate,
        formattedDate: `${month}-${day}`,
        coverage: coverage
      };
    }
  }

  return null; // No suitable fallback found
},

/**
 * Check what percentage of rooms have data for a specific date
 * @private
 */
async _checkDateCoverage(campusName, buildingName, compactDate) {
  if (buildingName) {
    // Check single building
    const details = await this.getBuildingDetails(campusName, buildingName);
    if (!details || !details.rooms) return 0;

    let roomsWithData = 0;
    let totalRooms = 0;

    for (const roomName in details.rooms) {
      totalRooms++;
      const bh = details.rooms[roomName].balance_history;
      if (bh && bh[compactDate] !== undefined) {
        // Need previous day too for consumption calculation
        const dates = Object.keys(bh).sort();
        const idx = dates.indexOf(compactDate);
        if (idx > 0) {
          roomsWithData++;
        }
      }
    }

    return totalRooms > 0 ? roomsWithData / totalRooms : 0;
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
},

/**
 * Convert compact date string to Date object
 * @private
 */
_compactToDate(compactDate) {
  const year = parseInt(compactDate.substring(0, 4));
  const month = parseInt(compactDate.substring(4, 6)) - 1;
  const day = parseInt(compactDate.substring(6, 8));
  return new Date(year, month, day);
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/data-service.js
git commit -m "feat(data): add findLatestDateWithData for auto-fallback

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add banner component CSS styles to building-view.html

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add banner CSS after existing `.empty-state` styles**

Find the `.empty-state` CSS block (around line 620), add after it:

```css
    /* Fallback Banner */
    .fallback-banner {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.08) 100%);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      animation: slideDown 0.3s ease-out;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fallback-banner-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .fallback-banner-icon {
      font-size: 20px;
      line-height: 1;
    }
    .fallback-banner-text {
      font-size: 14px;
      color: var(--fg);
    }
    .fallback-banner-text strong {
      color: var(--accent);
      font-weight: 600;
    }
    .fallback-banner-dismiss {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      font-size: 18px;
      line-height: 1;
      opacity: 0.6;
      transition: opacity 0.2s;
    }
    .fallback-banner-dismiss:hover {
      opacity: 1;
    }
```

- [ ] **Step 2: Add banner HTML after selector-bar**

Find `<div class="selector-bar">` closing tag, add after it (around line 1113):

```html
    <!-- Fallback Banner -->
    <div class="fallback-banner" id="fallback-banner" style="display: none;">
      <div class="fallback-banner-content">
        <span class="fallback-banner-icon">⚠️</span>
        <span class="fallback-banner-text" id="fallback-banner-text"></span>
      </div>
      <button class="fallback-banner-dismiss" onclick="dismissFallbackBanner()" title="关闭">×</button>
    </div>
```

- [ ] **Step 3: Add banner JavaScript functions**

Find the script section, add these functions before `setupEventListeners()`:

```javascript
    // ==================== Fallback Banner ====================
    let fallbackInfo = null;

    function showFallbackBanner(fallback) {
      if (!fallback) return;
      const banner = document.getElementById('fallback-banner');
      const text = document.getElementById('fallback-banner-text');
      const coveragePercent = Math.round(fallback.coverage * 100);
      text.innerHTML = `今日数据暂无，显示 <strong>${fallback.formattedDate}</strong> 的数据（覆盖 ${coveragePercent}% 房间）`;
      banner.style.display = 'flex';
      fallbackInfo = fallback;
    }

    function hideFallbackBanner() {
      const banner = document.getElementById('fallback-banner');
      banner.style.display = 'none';
      fallbackInfo = null;
    }

    function dismissFallbackBanner() {
      hideFallbackBanner();
      sessionStorage.setItem('fallbackBannerDismissed', 'true');
    }

    function checkAndShowFallback(campus, building, originalDate) {
      // Reset dismissal state on new page load
      if (!sessionStorage.getItem('fallbackBannerDismissed')) {
        hideFallbackBanner();
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "feat(building): add fallback banner UI component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Integrate fallback logic into building-view.html loadRanking()

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Modify loadRanking() to check for fallback**

Find the `async function loadRanking()` function (around line 1541). Replace the beginning of the function:

**Before:**
```javascript
    async function loadRanking() {
      // 增加loadId，用于取消旧请求
      const thisLoadId = ++state.currentLoadId;
      const cacheKey = `${state.campus}/${state.building}/${state.date}`;
```

**After:**
```javascript
    async function loadRanking() {
      // 增加loadId，用于取消旧请求
      const thisLoadId = ++state.currentLoadId;
      const cacheKey = `${state.campus}/${state.building}/${state.date}`;

      // Reset fallback banner on fresh load
      if (!sessionStorage.getItem('fallbackBannerDismissed')) {
        hideFallbackBanner();
      }
```

- [ ] **Step 2: Add fallback check before loading data**

Find the section where data loading begins. Add fallback check after cache check:

```javascript
      // Check if we need fallback for today/yesterday
      let effectiveDate = state.date;
      if (state.date === 'today' || state.date === 'yesterday') {
        const fallback = await DataService.findLatestDateWithData(
          state.campus,
          state.building,
          state.date
        );
        if (fallback) {
          effectiveDate = fallback.date;
          state.fallbackDate = fallback;
          // Show banner (will be hidden if dismissed this session)
          if (!sessionStorage.getItem('fallbackBannerDismissed')) {
            showFallbackBanner(fallback);
          }
        } else {
          state.fallbackDate = null;
          hideFallbackBanner();
        }
      } else {
        state.fallbackDate = null;
        hideFallbackBanner();
      }

      const rankings = await DataService.getBuildingConsumptionRankingFast(
        state.campus,
        state.building,
        effectiveDate === 'today' ? null : effectiveDate,
        null,
        true
      );
```

- [ ] **Step 3: Update cacheKey to use effective date**

Modify the cache key and ranking call:

```javascript
      // Use effective date for cache key if fallback is active
      const effectiveCacheKey = state.fallbackDate
        ? `${state.campus}/${state.building}/${state.fallbackDate.date}`
        : cacheKey;

      const cached = consumptionCache.get(effectiveCacheKey);
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "feat(building): integrate auto-fallback in loadRanking

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add banner component to campus-view.html

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: Add banner CSS (same as building-view)**

Find the `.empty-state` CSS block or similar, add after it:

```css
    /* Fallback Banner */
    .fallback-banner {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.08) 100%);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      animation: slideDown 0.3s ease-out;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fallback-banner-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .fallback-banner-icon {
      font-size: 20px;
      line-height: 1;
    }
    .fallback-banner-text {
      font-size: 14px;
      color: var(--fg);
    }
    .fallback-banner-text strong {
      color: var(--accent);
      font-weight: 600;
    }
    .fallback-banner-dismiss {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      font-size: 18px;
      line-height: 1;
      opacity: 0.6;
      transition: opacity 0.2s;
    }
    .fallback-banner-dismiss:hover {
      opacity: 1;
    }
```

- [ ] **Step 2: Add banner HTML after date-selector**

Find the date-selector div, add banner after it:

```html
    <!-- Fallback Banner -->
    <div class="fallback-banner" id="fallback-banner" style="display: none;">
      <div class="fallback-banner-content">
        <span class="fallback-banner-icon">⚠️</span>
        <span class="fallback-banner-text" id="fallback-banner-text"></span>
      </div>
      <button class="fallback-banner-dismiss" onclick="dismissFallbackBanner()" title="关闭">×</button>
    </div>
```

- [ ] **Step 3: Add banner JavaScript functions**

Add to the script section:

```javascript
    // ==================== Fallback Banner ====================
    let fallbackInfo = null;

    function showFallbackBanner(fallback) {
      if (!fallback) return;
      const banner = document.getElementById('fallback-banner');
      const text = document.getElementById('fallback-banner-text');
      const coveragePercent = Math.round(fallback.coverage * 100);
      text.innerHTML = `今日数据暂无，显示 <strong>${fallback.formattedDate}</strong> 的数据（覆盖 ${coveragePercent}% 房间）`;
      banner.style.display = 'flex';
      fallbackInfo = fallback;
    }

    function hideFallbackBanner() {
      const banner = document.getElementById('fallback-banner');
      banner.style.display = 'none';
      fallbackInfo = null;
    }

    function dismissFallbackBanner() {
      hideFallbackBanner();
      sessionStorage.setItem('fallbackBannerDismissed', 'true');
    }
```

- [ ] **Step 4: Commit**

```bash
git add docs/campus-view.html
git commit -m "feat(campus): add fallback banner UI component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Integrate fallback logic into campus-view.html

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: Modify loadCampusData to check for fallback**

Find the main data loading function and add fallback check:

```javascript
    async function loadCampusData(campus, date) {
      if (thisLoad.cancelled) return;

      // Reset fallback banner on fresh load
      if (!sessionStorage.getItem('fallbackBannerDismissed')) {
        hideFallbackBanner();
      }

      // Check if we need fallback for today/yesterday
      let effectiveDate = date;
      if (date === 'today' || date === 'yesterday') {
        const fallback = await DataService.findLatestDateWithData(
          campus,
          null, // campus-wide check
          date
        );
        if (fallback) {
          effectiveDate = fallback.date;
          fallbackInfo = fallback;
          if (!sessionStorage.getItem('fallbackBannerDismissed')) {
            showFallbackBanner(fallback);
          }
        } else {
          fallbackInfo = null;
          hideFallbackBanner();
        }
      } else {
        fallbackInfo = null;
        hideFallbackBanner();
      }

      // Load data with effective date
      campusConsumption = await DataService.getCampusConsumption(
        campus,
        effectiveDate,
        (loaded, total, partial) => {
          if (thisLoad.cancelled) return;
          updateDashboardWithPartialData(partial, loaded, total);
        },
        false
      );
```

- [ ] **Step 2: Commit**

```bash
git add docs/campus-view.html
git commit -m "feat(campus): integrate auto-fallback in loadCampusData

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Test the implementation

**Files:**
- Test: Manual browser testing

- [ ] **Step 1: Start local server**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8899
```

- [ ] **Step 2: Test building page fallback**

1. Open http://localhost:8899/building-view.html
2. Select 苏州校区 → 科创大厦B
3. Click "今日" - should show fallback banner with yesterday's data
4. Click X to dismiss banner, refresh page - banner should not show again in session
5. Click "昨日" - should show normal data (no fallback)

- [ ] **Step 3: Test campus page fallback**

1. Open http://localhost:8899/campus-view.html
2. Select 苏州校区 with "今日"
3. Should show fallback banner if today's data unavailable
4. Trend chart should show all historical data regardless

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: auto-switch to latest available date when today's data unavailable

- Add findLatestDateWithData() method to check data availability
- Add dismissible banner notification for fallback mode
- Keep original date in URL, show fallback data
- Auto-dismiss banner on refresh if data becomes available

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
