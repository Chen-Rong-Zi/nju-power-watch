# 四个修复实现计划：Workflow 互斥 · 楼栋分页 · about.md 排序 · 提交合并

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划已确定使用 subagent-driven-development 执行。

**Goal:** 修复 4 个独立问题——Query/Scan workflow 互斥（限流保护，Query 不可取消）、楼栋排行榜分页（无数据房间只出现在最后几页）、about.md 功能更新时间倒序、Query 批次提交合并为一次。

**Architecture:** ① 两个 workflow 顶层共享 `concurrency: group: epay-access, cancel-in-progress: false, queue: {max: 6}` 实现全局互斥（组内多个 run 排队、互不取消；Query 批次与 Scan 顺序执行、绝不重叠，Query 永不取消）；② 分页计算抽取为 `docs/js/floor-analytics.js` 的纯函数 `computePageSlices`（数据房间独占前面页、无数据房间独占后面页），`renderCurrentPage` 调用它并同步 `state.totalPages`；楼层筛选新增 `filterRoomsByFloors` 同时过滤有效房间与无数据房间；③ about.md 各月份条目倒序（最新在上）；④ daily-query.yml 重排步骤，把 batch summary 更新提前，合并为一次提交、一次 push。

**Tech Stack:** GitHub Actions (YAML)、vanilla JavaScript (浏览器)、Node.js 内置 test runner（`node --test`）、Markdown。

---

### Task 1: 添加 concurrency 组（Query/Scan workflow 互斥）

**Files:**
- Modify: `.github/workflows/daily-query.yml`（在 `permissions:` 前插入）
- Modify: `.github/workflows/room-id-scan.yml`（在 `permissions:` 前插入）

- [ ] **Step 1: 在 daily-query.yml 顶部添加 concurrency 块**

在 `.github/workflows/daily-query.yml` 的 `on:` 块结束（第 18 行 `        type: string`）之后、`permissions:`（第 19 行）之前，插入：

```yaml
concurrency:
  group: epay-access
  cancel-in-progress: false
  queue:
    max: 6

permissions:
```

即结果应为（`permissions:` 前新增 5 行，注意 `permissions:` 前多一个空行）：

```yaml
on:
  schedule:
    - cron: '0 22 * * *'   # 06:00 UTC+8 daily
  workflow_dispatch:
    inputs:
      batch_index:
        description: 'Current batch index (starts at 1)'
        required: false
        default: '1'
        type: string
      total_batches:
        description: 'Total number of batches'
        required: false
        default: '4'
        type: string

concurrency:
  group: epay-access
  cancel-in-progress: false
  queue:
    max: 6

permissions:
  contents: write
  actions: write
  issues: write
```

- [ ] **Step 2: 在 room-id-scan.yml 顶部添加相同的 concurrency 块**

在 `.github/workflows/room-id-scan.yml` 的 `on:` 块结束（第 11 行 `        default: 'scan_progress.json'`）之后、`permissions:`（第 13 行）之前，插入相同的块：

```yaml
concurrency:
  group: epay-access
  cancel-in-progress: false
  queue:
    max: 6

permissions:
```

- [ ] **Step 3: 验证 YAML 语法**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily-query.yml')); yaml.safe_load(open('.github/workflows/room-id-scan.yml')); print('YAML OK')"
```

预期：`YAML OK`（若系统未装 PyYAML，改为 `git diff` 自查：两个文件都在 `permissions:` 前新增了相同的 3 行 concurrency 块）。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/daily-query.yml .github/workflows/room-id-scan.yml
git commit -m "ci: add shared epay-access concurrency group to query and scan workflows"
```

**行为确认（不改代码，仅供理解）：** 两个 workflow 共享仓库级 concurrency 组 `epay-access`。`cancel-in-progress: false` 保证运行中的 run 永不取消；`queue: max: 6` 保证组内多个 run 排队、互不取消（默认 `queue: single` 只保留一个排队，新 run 加入时会取消旧的排队 run——会误伤 pending 的 Query 批次，因此必须加大队列）。Query 批次链在每批结束触发下一批时，下一批短暂处于 pending，此时 Scan 加入也仅排队，不取消任何 Query 批次。Scan 与 Query 顺序执行、绝不重叠。

---

### Task 2: 合并 Query 的批次提交（一次提交 + 一次 push）

**Files:**
- Modify: `.github/workflows/daily-query.yml`

当前步骤顺序（仅列出受影响的）：
```
9.  Generate building details (all batches)
10. Commit and push summaries           ← 提交 database/summaries/，push
11. Update batch run summary            ← 写入 database/batch_run_summary.json
12. Commit batch run summary            ← 提交 batch_run_summary.json，push
13. Trigger next batch
```

目标顺序：
```
9.  Generate building details (all batches)
10. Update batch run summary            ← 提前到提交前
11. Commit summaries and batch summary  ← 合并 10+12 为一步，一次提交一次 push
12. Trigger next batch
```

- [ ] **Step 1: 删除 "Commit and push summaries" 步骤**

删除 `.github/workflows/daily-query.yml` 中整个 `- name: Commit and push summaries` 步骤块（原第 10 步，约 line 150-168，`git add -f database/summaries/` 到 `echo "✓ Summaries committed and pushed"`）。

- [ ] **Step 2: 删除 "Commit batch run summary" 步骤**

删除 `- name: Commit batch run summary` 步骤块（原第 12 步，约 line 210-216，`git add -f database/batch_run_summary.json` 到 `git push`）。

- [ ] **Step 3: 把 "Update batch run summary" 步骤提前**

把 `- name: Update batch run summary` 步骤块（含 `id: batch_summary`，约 line 170-208）整体移动到 "Generate building details (all batches)" 步骤之后、"Trigger next batch" 步骤之前。其内部内容**保持不变**（它依赖 `steps.query.outputs.success_count/failed_count`，仍在 query 步骤之后执行，不受影响）。

- [ ] **Step 4: 新增合并提交步骤**

在 "Update batch run summary" 步骤之后、"Trigger next batch" 步骤之前，新增：

```yaml
      - name: Commit summaries and batch summary
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"

          git add -f database/summaries/ database/batch_run_summary.json

          STAGED_FILES=$(git diff --staged --name-only)
          if [ -z "$STAGED_FILES" ]; then
            echo "No new summaries to commit"
          else
            echo "Files to commit:"
            echo "$STAGED_FILES" | head -10
            echo "... and $(echo "$STAGED_FILES" | wc -l) files total"

            git commit -m "chore: update electricity summaries for $(date +%Y-%m-%d) (batch ${{ inputs.batch_index || '1' }})"
            git push
            echo "✓ Summaries and batch summary committed and pushed"
          fi
```

**注意：** `git add -f` 只执行一次，`git commit`/`git push` 也只执行一次；`database/batch_run_summary.json` 在步骤 3 已被写入，因此会被一起加入本次提交。批次 2-4 读取的是上一批已提交的 `database/batch_run_summary.json`，提交节奏不变。

- [ ] **Step 5: 验证 YAML 语法与步骤顺序**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily-query.yml')); print('YAML OK')"
git diff .github/workflows/daily-query.yml
```

预期：`YAML OK`；diff 显示删除了 2 个旧提交步骤、新增 1 个合并提交步骤、`Update batch run summary` 位置提前；`git add -f`、`git commit`、`git push` 在文件中各只出现一次（commit 步骤内）。

- [ ] **Step 6: 提交**

```bash
git add .github/workflows/daily-query.yml
git commit -m "ci: combine summaries and batch summary into a single commit per batch"
```

---

### Task 3: floor-analytics.js 纯函数（filterRoomsByFloors + computePageSlices）TDD

**Files:**
- Modify: `docs/js/floor-analytics.js`
- Create: `tests/js/floor-analytics.test.js`

背景：`docs/js/floor-analytics.js` 是全局脚本（无模块系统），定义 `const FloorAnalytics = {...}`。测试用 `node --test` + `new Function` 捕获对象，不需要任何 npm 依赖。

- [ ] **Step 1: 编写失败的测试**

创建 `tests/js/floor-analytics.test.js`：

```js
// 验证 floor-analytics.js 的纯函数逻辑（filterRoomsByFloors / getFilteredRankings / computePageSlices）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// floor-analytics.js 是全局脚本（无模块系统），用 new Function 捕获其对象
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'js', 'floor-analytics.js'), 'utf8');
const FloorAnalytics = new Function(src + '\n; return FloorAnalytics;')();

const floorGroups = {
  groups: {
    '1': ['101', '102'],
    '2': ['201', '202', '203'],
    '3': ['301'],
  },
  unknown: ['X101', 'X202'],
};

const rankings = [
  { roomName: '101', consumption: 5.0 },
  { roomName: '201', consumption: 3.0 },
  { roomName: 'X101', consumption: 7.0 },
  { roomName: '301', consumption: 2.0 },
  { roomName: '202', consumption: 4.0 },
];

test('filterRoomsByFloors: null 返回全部', () => {
  const out = FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, null);
  assert.equal(out.length, rankings.length);
});

test('filterRoomsByFloors: 空 Set 返回空数组', () => {
  const out = FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, new Set());
  assert.deepEqual(out, []);
});

test('filterRoomsByFloors: 单楼层过滤', () => {
  const out = FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, new Set(['2']));
  assert.deepEqual(out.map(r => r.roomName), ['201', '202']);
});

test('filterRoomsByFloors: unknown 楼层', () => {
  const out = FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, new Set(['unknown']));
  assert.deepEqual(out.map(r => r.roomName), ['X101']);
});

test('filterRoomsByFloors: 多楼层并集', () => {
  const out = FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, new Set(['1', 'unknown']));
  assert.deepEqual(out.map(r => r.roomName), ['101', 'X101']);
});

test('getFilteredRankings 委托 filterRoomsByFloors', () => {
  const out = FloorAnalytics.getFilteredRankings(rankings, floorGroups, new Set(['1']));
  assert.deepEqual(out.map(r => r.roomName), ['101']);
});

// ---- computePageSlices ----
const dataRooms = Array.from({ length: 25 }, (_, i) => ({ roomName: 'D' + (i + 1), consumption: i }));
const noDataRooms = Array.from({ length: 40 }, (_, i) => ({ roomName: 'N' + (i + 1) }));

test('computePageSlices: 数据页不含无数据房间', () => {
  const r = FloorAnalytics.computePageSlices(dataRooms, noDataRooms, 1, 20);
  assert.equal(r.pageRankings.length, 20);
  assert.equal(r.pageNoDataRooms.length, 0);
  assert.equal(r.totalPages, 4); // 25/20→2 数据页 + 40/20→2 无数据页
});

test('computePageSlices: 数据最后一页', () => {
  const r = FloorAnalytics.computePageSlices(dataRooms, noDataRooms, 2, 20);
  assert.equal(r.pageRankings.length, 5);
  assert.equal(r.pageNoDataRooms.length, 0);
});

test('computePageSlices: 无数据第一页', () => {
  const r = FloorAnalytics.computePageSlices(dataRooms, noDataRooms, 3, 20);
  assert.equal(r.pageRankings.length, 0);
  assert.equal(r.pageNoDataRooms.length, 20);
});

test('computePageSlices: 无数据最后一页', () => {
  const r = FloorAnalytics.computePageSlices(dataRooms, noDataRooms, 4, 20);
  assert.equal(r.pageRankings.length, 0);
  assert.equal(r.pageNoDataRooms.length, 20);
});

test('computePageSlices: 页码越界被钳制到末页', () => {
  const r = FloorAnalytics.computePageSlices(dataRooms, noDataRooms, 99, 20);
  assert.equal(r.totalPages, 4);
  assert.equal(r.pageRankings.length, 0);
  assert.equal(r.pageNoDataRooms.length, 20);
});

test('computePageSlices: 仅无数据房间', () => {
  const r = FloorAnalytics.computePageSlices([], noDataRooms, 1, 20);
  assert.equal(r.pageRankings.length, 0);
  assert.equal(r.pageNoDataRooms.length, 20);
  assert.equal(r.totalPages, 2);
});

test('computePageSlices: 全部为空时 totalPages = 1', () => {
  const r = FloorAnalytics.computePageSlices([], [], 1, 20);
  assert.equal(r.pageRankings.length, 0);
  assert.equal(r.pageNoDataRooms.length, 0);
  assert.equal(r.totalPages, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
node --test tests/js/floor-analytics.test.js
```

预期：`filterRoomsByFloors` / `computePageSlices` 相关测试失败（`TypeError: FloorAnalytics.filterRoomsByFloors is not a function` / `FloorAnalytics.computePageSlices is not a function`）。

- [ ] **Step 3: 实现 filterRoomsByFloors 并让 getFilteredRankings 复用**

在 `docs/js/floor-analytics.js` 的 `getFilteredRankings`（第 65-78 行）前新增 `filterRoomsByFloors`，并把 `getFilteredRankings` 改为委托：

```js
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

  getFilteredRankings(rankings, floorGroups, selectedFloors) {
    return this.filterRoomsByFloors(rankings, floorGroups, selectedFloors);
  },
```

**注意：** `rooms` 参数是含 `roomName` 属性的对象数组（排行榜项或 noDataRooms 对象，两者都有 `roomName`）。原 `getFilteredRankings` 的 `allowedRooms`/`forEach` 逻辑原样搬入 `filterRoomsByFloors`，`getFilteredRankings` 改为一行委托（保持对外接口不变，building-view.html 现有调用不受影响）。

- [ ] **Step 4: 运行测试确认 filterRoomsByFloors 通过**

```bash
node --test tests/js/floor-analytics.test.js
```

预期：`filterRoomsByFloors` 与 `getFilteredRankings` 相关测试通过；`computePageSlices` 相关测试仍失败。

- [ ] **Step 5: 实现 computePageSlices**

在 `floor-analytics.js` 的 `getFilteredRankings` 之后新增：

```js
  computePageSlices(displayRankings, noDataRooms, currentPage, itemsPerPage) {
    const dataPages = Math.ceil(displayRankings.length / itemsPerPage);
    const noDataPages = noDataRooms.length > 0
      ? Math.ceil(noDataRooms.length / itemsPerPage)
      : 0;
    const totalPages = Math.max(1, dataPages + noDataPages);
    const page = Math.max(1, Math.min(currentPage, totalPages));

    let pageRankings = [];
    let pageNoDataRooms = [];

    if (page <= dataPages) {
      const start = (page - 1) * itemsPerPage;
      pageRankings = displayRankings.slice(start, start + itemsPerPage);
    } else {
      const noDataPage = page - dataPages;
      const start = (noDataPage - 1) * itemsPerPage;
      pageNoDataRooms = noDataRooms.slice(start, start + itemsPerPage);
    }

    return { pageRankings, pageNoDataRooms, totalPages };
  },
```

- [ ] **Step 6: 运行测试确认全部通过**

```bash
node --test tests/js/floor-analytics.test.js
```

预期：全部测试通过（`# pass` 等于测试数，0 失败）。

- [ ] **Step 7: 提交**

```bash
git add docs/js/floor-analytics.js tests/js/floor-analytics.test.js
git commit -m "feat: add filterRoomsByFloors and computePageSlices to FloorAnalytics"
```

---

### Task 4: building-view.html 分页分离 + 楼层筛选过滤无数据房间

**Files:**
- Modify: `docs/building-view.html`

背景：`renderCurrentPage()`（约 line 2799-2879）当前用单一滑动窗口分页（无数据房间补进数据页底部）；`displayRanking()`（约 line 2782）用旧公式维护 `state.totalPages`；`onFloorSelectionChange()`（约 line 1844）只过滤有效房间。本任务接入 Task 3 的两个纯函数。

- [ ] **Step 1: renderCurrentPage 改用 computePageSlices 并同步 state.totalPages**

替换 `renderCurrentPage()` 中约 line 2809-2828 的旧分页计算块：

```javascript
      // 根据排序顺序处理有数据房间
      const displayRankings = state.sortDesc ? allRankings : [...allRankings].reverse();

      // 分页计算（包含无数据房间）
      const totalItems = displayRankings.length + noDataRooms.length;
      const totalPages = Math.ceil(totalItems / state.itemsPerPage);
      state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));

      const startIdx = (state.currentPage - 1) * state.itemsPerPage;
      const endIdx = startIdx + state.itemsPerPage;

      // 分离有数据房间的分页
      const pageRankings = displayRankings.slice(
        Math.max(0, startIdx),
        Math.min(displayRankings.length, endIdx)
      );

      // 计算无数据房间的分页（排在有数据房间之后）
      const noDataStartIdx = Math.max(0, startIdx - displayRankings.length);
      const noDataEndIdx = Math.min(noDataRooms.length, endIdx - displayRankings.length);
      const pageNoDataRooms = noDataRooms.slice(noDataStartIdx, noDataEndIdx);
```

替换为：

```javascript
      // 根据排序顺序处理有数据房间
      const displayRankings = state.sortDesc ? allRankings : [...allRankings].reverse();

      // 分页计算：数据房间独占前面的页，无数据房间独占后面的页
      const { pageRankings, pageNoDataRooms, totalPages } =
        FloorAnalytics.computePageSlices(displayRankings, noDataRooms, state.currentPage, state.itemsPerPage);
      state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
      state.totalPages = totalPages; // 同步更新，供 nextPage/goToPage 等导航函数使用
```

**注意：** 保持后面的 `updatePagination(totalPages)`（约 line 2878）不变——它使用局部 `totalPages`。`pageRankings`、`pageNoDataRooms` 两个变量的名字不变，后续渲染代码无需改动。

- [ ] **Step 2: renderCurrentPage 读取过滤后的 noDataRooms**

把 `renderCurrentPage()` 中约 line 2801：

```javascript
      const noDataRooms = state.noDataRooms || [];
```

改为：

```javascript
      const noDataRooms = state.filteredNoDataRooms || state.noDataRooms || [];
```

- [ ] **Step 3: displayRanking 删除旧 state.totalPages 赋值**

删除 `displayRanking()` 中约 line 2782：

```javascript
      state.totalPages = Math.ceil((rankings.length + noDataRooms.length) / state.itemsPerPage);
```

（`state.totalPages` 现在由 `renderCurrentPage` 统一计算赋值，避免两处不一致。）

- [ ] **Step 4: onFloorSelectionChange 同时过滤无数据房间**

在 `onFloorSelectionChange()` 中约 line 1869：

```javascript
      state.filteredRankings = state.selectedFloors === null ? null : filteredRankings;
```

之后插入：

```javascript
      state.filteredNoDataRooms = state.selectedFloors === null
        ? null
        : FloorAnalytics.filterRoomsByFloors(state.noDataRooms, state.floorGroups, state.selectedFloors);
```

该函数后续已有 `state.currentPage = 1;` 和 `renderCurrentPage();`（line 1870-1871），无需改动。

- [ ] **Step 5: 切换校区/楼栋时重置 filteredNoDataRooms**

在 `onCampusChange()` 中约 line 1971 `state.filteredRankings = null;` 之后、以及在 `onBuildingChange()` 中约 line 2028 `state.filteredRankings = null;` 之后，各插入一行：

```javascript
      state.filteredNoDataRooms = null;
```

- [ ] **Step 6: 运行单元测试 + 静态接线检查**

```bash
node --test tests/js/floor-analytics.test.js
```

预期：全部通过（本任务未改动纯函数，回归确认）。

接线检查（确认 4 处引用一致）：

```bash
grep -n "computePageSlices\|filterRoomsByFloors\|filteredNoDataRooms" docs/building-view.html docs/js/floor-analytics.js
```

预期输出包含：`floor-analytics.js` 中 2 个函数定义与 `getFilteredRankings` 委托；`building-view.html` 中 `FloorAnalytics.computePageSlices(...)`（renderCurrentPage）、`FloorAnalytics.filterRoomsByFloors(...)`（onFloorSelectionChange）、`state.filteredNoDataRooms`（赋值 3 处：onFloorSelectionChange / onCampusChange / onBuildingChange，读取 1 处：renderCurrentPage）。

- [ ] **Step 7: 提交**

```bash
git add docs/building-view.html
git commit -m "fix: separate no-data rooms onto trailing pages and filter them by floor"
```

**手工验证（控制器在全部任务完成后执行）：**
1. `cd docs && python3 -m http.server 8005`
2. 打开 `http://localhost:8005/building-view.html`，选择某校区 → 某楼栋（优先选限流事件 8 月 4-5 日有大量无数据房间的日期）
3. 确认：数据页底部**不再**出现"暂无该日期数据"房间；无数据房间只在最后几页
4. 点击 FAB/楼层选择器勾选某楼层 → 确认排行榜只剩该楼层有效房间，其无数据房间也在最后几页；取消勾选恢复全部
5. 切到 8 月 7 日（数据完整）→ 分页正常、无残留的过滤状态

---

### Task 5: about.md 功能更新时间倒序

**Files:**
- Modify: `docs/about.md`

- [ ] **Step 1: 重排 "功能更新" 各月份条目**

当前 `## 🚀 功能更新`（line 16）下顺序为（旧→新）：
```
### 📅 2026 年 5 月 · 项目启动
### 📅 2026 年 6 月 · 数据可视化增强
### 📅 2026 年 7 月 · 体验优化
### 📅 2026 年 8 月 · 楼层分析上线
### 📅 2026 年 8 月 · 限流事件
```

调整为（新→旧）：
```
### 📅 2026 年 8 月 · 限流事件
### 📅 2026 年 8 月 · 楼层分析上线
### 📅 2026 年 7 月 · 体验优化
### 📅 2026 年 6 月 · 数据可视化增强
### 📅 2026 年 5 月 · 项目启动
```

**注意：** 只调整 5 个 `###` 段落的**整块顺序**（标题 + 其 `-` 列表项），不修改任何文案内容。`## 🚀 功能更新` 标题及其下方第一条分割线位置不变。

- [ ] **Step 2: 验证顺序与内容**

```bash
git diff docs/about.md
```

预期：diff 仅表现为各 `###` 段落的整体移动；段落内文案零改动。

- [ ] **Step 3: 提交**

```bash
git add docs/about.md
git commit -m "docs: list feature updates newest-first in about.md"
```

---

## 最终验证（控制器）

1. `node --test tests/js/floor-analytics.test.js` — 全部通过
2. 两个 workflow 均 `python3 -c "import yaml; yaml.safe_load(open('<file>'))"` 通过
3. 浏览器手工验证 building-view.html（见 Task 4 手工验证清单）
4. `git log --oneline` 确认 5 个提交（Task1-5 各一个）
5. 确认 `git push origin master` 前与用户确认（记忆：未经允许不 push）
