# 四个修复：Workflow 互斥 · 楼栋分页 · about.md 排序 · 提交合并

## 概述

修复四个独立问题：
1. Query 和 Scan 两个 workflow 同时运行会触发 epay 限流，需要互斥
2. 楼栋页面排行榜的"暂无该日期数据"房间混入每一页底部，应只显示在最后几页
3. about.md 的"功能更新"时间顺序应改为最新在上
4. Query workflow 每个批次产生两个提交，合并为一个提交

## 修改文件

- `.github/workflows/daily-query.yml` — 增加 concurrency 组 + 合并批次提交
- `.github/workflows/room-id-scan.yml` — 增加 concurrency 组
- `docs/building-view.html` — 修复分页逻辑 + 楼层筛选过滤无数据房间
- `docs/js/floor-analytics.js` — 新增按楼层过滤房间数组的辅助函数
- `docs/about.md` — 重排功能更新时间顺序

---

## 修复一：Workflow 互斥

### 方案

在两个 workflow 顶层（`permissions` 之前）都增加相同名称的 concurrency 组：

```yaml
concurrency:
  group: epay-access
  cancel-in-progress: false
  queue:
    max: 6
```

### 行为分析

- GitHub Actions 的 concurrency 组是仓库全局的，跨 workflow 生效
- Query 的 4 个链式批次共享 `epay-access` 组，Scan 也共享同一组
- `cancel-in-progress: false`：不取消正在运行的 run
- `queue: max: 6`：组内允许多个 run 排队，**排队中的 run 也不会被新 run 取消**

### 关键行为：默认队列会误伤 pending 的 Query 批次，需显式加大队列

GitHub Actions 默认每个 concurrency 组只保留**一个运行中 + 一个排队**，新 run 加入时**旧的排队 run 会被取消**。Query 批次链在每批结束触发下一批时，下一批必然短暂处于 pending 状态——若此刻 Scan 加入，默认队列会取消这个 pending 的 Query 批次。因此共享组显式声明 `queue: max: 6`，让 Query 批次与 Scan 全部排队、顺序执行、互不取消。

```
Query Batch 1 运行中 → Scan 触发 → 进入队列（不取消任何 run）
Query Batch 1 完成 → Query Batch 2 进入队列（按加入顺序排在 Scan 前或后）
各 run 按队列顺序依次执行，Query 批次永不中断
```

### 设计取舍：Query 永不取消，Scan 排队执行

- **Query 永不取消** ✅：`queue: max: 6` 使组内所有 run 排队互不取消；Query 批次链顺序执行，即使 Scan 加入也仅排队，不打断 Query
- **Scan 排队执行** ✅：Scan 与 Query 共享同一组，绝不与 Query 重叠执行（限流保护）；排队等待而非被取消，最终总会执行
- **限流保护达成**：Query 和 Scan 绝不重叠 ✅
- **可接受**：正常定时调度下（Query 06:00 CST、Scan 21:00 CST）两者相隔 15 小时，永不冲突；concurrency 仅是手动触发的安全网
- 用户已确认接受"Scan 可以被取消、Query 永不取消"；`queue: max` 进一步让 Scan 也排队执行（不取消），行为更优

---

## 修复二：楼栋排行榜分页

### 根因

`docs/building-view.html` 的 `renderCurrentPage()`（约 line 2799）用**单一滑动窗口**遍历（有效房间 + 无数据房间拼接的虚拟列表）：

```javascript
const totalItems = displayRankings.length + noDataRooms.length;
const totalPages = Math.ceil(totalItems / state.itemsPerPage);
const startIdx = (state.currentPage - 1) * state.itemsPerPage;
const endIdx = startIdx + state.itemsPerPage;
const pageRankings = displayRankings.slice(startIdx, endIdx);
const noDataStartIdx = Math.max(0, startIdx - displayRankings.length);
const noDataEndIdx = Math.min(noDataRooms.length, endIdx - displayRankings.length);
const pageNoDataRooms = noDataRooms.slice(noDataStartIdx, noDataEndIdx);
```

**问题**：当某页的有效房间数不足 `itemsPerPage` 时（限流事件期间大部分房间无数据，或楼层筛选后有效房间骤减），无数据房间会补进当前页，导致无数据房间出现在数据页底部。

### 修复方案

#### 1. 分页分离

有效房间独占前面的页，无数据房间独占后面的页：

```javascript
const dataPages = Math.ceil(displayRankings.length / state.itemsPerPage);
const noDataPages = noDataRooms.length > 0
  ? Math.ceil(noDataRooms.length / state.itemsPerPage)
  : 0;
const totalPages = Math.max(1, dataPages + noDataPages);
state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));

let pageRankings = [];
let pageNoDataRooms = [];

if (state.currentPage <= dataPages) {
  // 数据页：只显示有效房间
  const start = (state.currentPage - 1) * state.itemsPerPage;
  pageRankings = displayRankings.slice(start, start + state.itemsPerPage);
} else {
  // 无数据页：只显示无数据房间
  const noDataPage = state.currentPage - dataPages;
  const start = (noDataPage - 1) * state.itemsPerPage;
  pageNoDataRooms = noDataRooms.slice(start, start + state.itemsPerPage);
}
```

效果：数据页绝不混入无数据房间，无数据房间只出现在最后几页。

**必须同步更新 `state.totalPages`**：`displayRanking()`（约 line 2782）和 `renderCurrentPage()` 都维护 `state.totalPages`，但现有代码只在 `displayRanking` 里用旧公式赋值：

```javascript
state.totalPages = Math.ceil((rankings.length + noDataRooms.length) / state.itemsPerPage); // 旧公式
```

而 `nextPage()`、`goToPage()` 等分页导航读取的是 `state.totalPages`。若不同步更新，会出现 `updatePagination` 显示"N 页"但导航函数认为只有 M 页，导致**无法翻到最后的无数据页**。

修复：在 `renderCurrentPage()` 中把新计算的 `totalPages` 同时赋给 `state.totalPages`：

```javascript
const totalPages = Math.max(1, dataPages + noDataPages);
state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
state.totalPages = totalPages; // 同步更新，供导航函数使用
```

同时删除或忽略 `displayRanking` 中旧的 `state.totalPages` 赋值（新值由 renderCurrentPage 计算），避免两处不一致。

#### 2. 楼层筛选同步过滤 noDataRooms

当前 `onFloorSelectionChange()`（约 line 1844）只过滤有效房间：

```javascript
state.filteredRankings = state.selectedFloors === null ? null : filteredRankings;
```

需要同时过滤 `state.noDataRooms`。

**floor-analytics.js** 新增辅助函数（可被 `getFilteredRankings` 复用）：

```javascript
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
}
```

`getFilteredRankings` 改为调用此函数（传 rankings），`onFloorSelectionChange` 用同一函数过滤 noDataRooms。

**onFloorSelectionChange 修改**：

```javascript
const filteredNoData = state.selectedFloors === null
  ? state.noDataRooms
  : FloorAnalytics.filterRoomsByFloors(state.noDataRooms, state.floorGroups, state.selectedFloors);
state.filteredNoDataRooms = state.selectedFloors === null ? null : filteredNoData;
state.currentPage = 1;
renderCurrentPage();
```

**renderCurrentPage 修改**（line 2800-2801）：

```javascript
const allRankings = state.filteredRankings || state.allRankings || [];
const noDataRooms = state.filteredNoDataRooms || state.noDataRooms || [];
```

**重置筛选状态**：现有代码在加载新数据时会把 `state.filteredRankings = null`（约 line 1971、2028）。需在同一处同步重置 `state.filteredNoDataRooms = null`，否则切换楼栋后残留上一次的楼层无数据过滤。

### 验证

- 不筛选楼层：无数据房间只在最后几页，数据页干净
- 筛选楼层：只显示该楼层的有效房间 + 该楼层的无数据房间（在最后几页）
- 全部无数据（限流期间）：显示为纯无数据页

---

## 修复三：about.md 排序

将"功能更新"（line 16-43）的各月份条目按时间倒序，最新在上：

当前顺序（旧→新）：
```
2026 年 5 月 · 项目启动
2026 年 6 月 · 数据可视化增强
2026 年 7 月 · 体验优化
2026 年 8 月 · 楼层分析上线
2026 年 8 月 · 限流事件
```

改为（新→旧）：
```
### 📅 2026 年 8 月 · 限流事件
### 📅 2026 年 8 月 · 楼层分析上线
### 📅 2026 年 7 月 · 体验优化
### 📅 2026 年 6 月 · 数据可视化增强
### 📅 2026 年 5 月 · 项目启动
```

仅调整 `###` 标题和 `-` 列表的顺序，不修改内容文案。

---

## 修复四：合并 Query 的两次提交

### 现状

`daily-query.yml` 每次批次产生**两个提交、两次 push**：

1. **Commit and push summaries**（line 150-168）：`git add -f database/summaries/` → commit `chore: update electricity summaries for $(date +%Y-%m-%d)` → push
2. **Commit batch run summary**（line 210-216）：`git add -f database/batch_run_summary.json` → commit `chore: update batch run summary for batch N` → push

### 问题

- 两次提交内容强相关（同一批次的结果），语义上应是一个变更
- 每个批次两次 push 增加仓库历史噪音与网络往返

### 修复方案

调整步骤顺序，把 **Update batch run summary** 步骤**提前**到提交步骤之前，然后**一次提交 + 一次 push** 同时带上 `database/summaries/` 和 `database/batch_run_summary.json`。

新步骤顺序（删除原第 10、12 步，新增合并提交步骤）：
1. Query electricity data
2. Rollback on failure（if failure）
3. Generate aggregated summaries (all batches)
4. Generate building details (all batches)
5. **Update batch run summary**（原第 11 步，提前到提交前）
6. **Commit and push summaries + batch summary**（合并原第 10、12 步为一步）
7. Trigger next batch

合并后的提交步骤：

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

### 注意

- "Update batch run summary" 步骤依赖 `steps.query.outputs.success_count/failed_count`，提前后仍在 query 步骤之后，执行不受影响
- 每批次产生**一个**提交、**一次** push；批次数不变（仍为 4）
- 批次 2-4 读取的是上一批次已提交的 `database/batch_run_summary.json`，提交节奏不变，读取逻辑不受影响
- 若某批次 `database/summaries/` 与 `database/batch_run_summary.json` 都无变更（正常不会发生，因为 batch summary 每次都会更新累计值），则跳过提交