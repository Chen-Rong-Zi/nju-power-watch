# NJU 宿舍电费监控系统 — 后续功能综合实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成所有剩余 P1/P2/P3 用户故事（US1 预警、US3 热力图、US5 对比、US7 模式识别、US10 成本预测、US11 预警订阅、US12 成就系统），修复 20 个跳过的测试，恢复 CI/CD 工作流。

**Architecture:** 所有新功能均为纯客户端增强，零后端变更。US3 新增独立 heatmap-view.js 模块。US5 新增独立 comparison-view.html 页面 + comparison-service.js。US7+US10 新增 pattern-analyzer.js 模块嵌入 room-view.html。US11+US12 基于 localStorage+IndexedDB 持久化。US1 增强现有 room-view.html 预警功能。测试修复针对 aggregate_data.py 异步重构更新已有测试套件。

**Tech Stack:** Chart.js 4.4.0 (existing), chartjs-plugin-annotation 3.0.1 (existing), Vanilla JavaScript ES6+, IndexedDB (existing), localStorage, Python 3.11 + aiohttp + aiofiles, pytest + pytest-asyncio.

**Spec reference:** `/Users/macbook/Program/ai4se/SPEC.md`（完整综合设计文档，包含所有功能的完成代码参考）

---

## Scope Check

本计划覆盖 **6 个独立用户故事 + 测试修复 + CI/CD 恢复**，分属无共享状态的独立子系统：

| 子系统 | 类型 | 可并行 |
|--------|------|--------|
| **Chunk 0:** 基础设施（测试修复 + CI/CD） | 基础 | ✅ 可与其他 Chunk 并行 |
| **Chunk 1:** US3 楼层热力图 | 前端模块 | ✅ 可并行 |
| **Chunk 2:** US5 多房间趋势对比 | 独立页面 | ✅ 可并行 |
| **Chunk 3:** US7+US10 模式识别+成本预测 | 前端模块 | ✅ 可并行 |
| **Chunk 4:** US11+US12 预警订阅+成就系统 | 前端模块 | ✅ 可并行 |
| **Chunk 5:** US1 智能预警增强 | 前端增强 | ❌ 依赖 Chunk 4 的 AlertService |

每个 Chunk 产出可独立工作、可测试的软件。执行时 Chunk 0-4 可完全并行，Chunk 5 须在 Chunk 4 之后执行。

---

## File Structure

| File | Action | Responsibility | Chunk |
|------|--------|---------------|-------|
| `tests/unit/test_aggregate_data.py` | **Modify** | 重写为测试异步 process_room / generate_hierarchical_summaries | C0 |
| `tests/integration/test_aggregation_workflow.py` | **Modify** | 修复集成测试夹具和数据格式 | C0 |
| `tests/integration/test_cleanup_workflow.py` | **Modify** | 修复集成测试夹具 | C0 |
| `tests/integration/test_daily_workflow.py` | **Modify** | 修复集成测试夹具 | C0 |
| `.github/workflows/daily-query.yml` | **Create** | 每日 UTC 0:00 自动采集 | C0 |
| `.github/workflows/weekly-room-discovery.yml` | **Create** | 每周一扫描新房间 | C0 |
| `docs/js/heatmap-view.js` | **Create** | 楼层热力图 2D 网格渲染引擎 | C1 |
| `docs/building-view.html` | **Modify** | 增加热力图区块 + JS 集成 + CSS | C1 |
| `docs/js/comparison-service.js` | **Create** | 多房间对比数据加载 + Chart.js 多线图 | C2 |
| `docs/comparison-view.html` | **Create** | 多房间趋势对比独立页面（级联选择器+图表+统计） | C2 |
| `docs/index.html` | **Modify** | 增加对比页导航链接 | C2 |
| `docs/js/pattern-analyzer.js` | **Create** | 工作日晚周末对比、Z-score 异常检测、特征标签、成本预测 | C3 |
| `docs/room-view.html` | **Modify** | 增加模式分析区块 + 成本预测卡片 + CSS | C3 |
| `docs/js/alert-service.js` | **Create** | 预警订阅管理 + DataService 余额监控 + 浏览器 Notification | C4 |
| `docs/js/achievement-system.js` | **Create** | badge/challenge 引擎 + localStorage 排行榜 | C4 |
| `docs/index.html` | **Modify** | 增加预警面板 + 成就展示区 + 访问追踪 | C4 |
| `docs/room-view.html` | **Modify** | 增加层级预警指示器 + 订阅按钮 + 异常尖峰列表 | C5 |

---

## Chunk 0: Infrastructure & Foundation

**Goal:** 修复 20 个跳过的测试，恢复 CI/CD 工作流，恢复 GitHub Actions 自动化。

**Spec ref:** 无（基础设施修复）

**Approach:** (1) 重写 `test_aggregate_data.py` 测试当前异步 API，(2) 修复三个集成测试文件的夹具问题，(3) 从零创建 GitHub Actions 工作流。

**Dependencies:** 无。**可与其他所有 Chunk 并行执行。**

---

### Task 0.1: Rewrite aggregate_data unit tests

**Goal:** 将 `tests/unit/test_aggregate_data.py` 从测试旧同步 pandas API 重写为测试当前异步 `process_room()`、`generate_hierarchical_summaries()`、`merge_room_data()` 函数。

**Files:**
- Modify: `tests/unit/test_aggregate_data.py`（全部重写）
- Reference: `scripts/aggregate_data.py`（当前实际代码，417 行异步实现）
- Reference: `tests/unit/conftest.py`（7 个现有 fixtures 中 temp_database 可用）

**Key implementation points:**
- 删除 `pytestmark = pytest.mark.skip(...)` 行（第 12 行）
- 移除所有 pandas/numpy 导入和依赖
- 使用 `@pytest.mark.asyncio` 装饰所有测试方法
- `TestProcessRoom` → 调用 `await process_room(room_dir, asyncio.Semaphore(10))`，验证返回 dict 包含 `room_name`, `campus`, `building`, `current_balance`, `balance_history`, `last_updated`
- `TestRoomStatistics` → 验证统计字段正确性（current_balance 为最新、balance_history 排序、空目录返回 None）
- `TestGenerateSummaries` → 调用 `await generate_hierarchical_summaries(database_dir, output_dir, merge_existing=True)`，验证 overview.json 的 `total_rooms`, `total_buildings`, `campuses` 字段
- `temp_database` fixture 已创建正确目录树 `(campus)/(building)/(room_name)/(date).json`

- [ ] **Step 1: Read current files**

```bash
cd /Users/macbook/Program/dorm_public && cat tests/unit/test_aggregate_data.py && echo "===== SCRIPTS =====" && cat scripts/aggregate_data.py
```

Understand the current async API signatures (`process_room`, `process_all_rooms`, `generate_hierarchical_summaries`, `merge_room_data`).

- [ ] **Step 2: Delete skip mark and rewrite TestProcessRoom**

Remove skip line. Write 3 tests for `process_room()`:

```python
@pytest.mark.asyncio
async def test_process_room_loads_daily_records(self, temp_database):
    """process_room should return balance_history with 10 entries."""
    ...
    result = await process_room(room_dir, semaphore)
    assert result["room_name"] == "1613"
    assert len(result["balance_history"]) == 10

@pytest.mark.asyncio
async def test_process_room_empty_dir_returns_none(self, temp_database):
    ...
    result = await process_room(room_dir, semaphore)
    assert result is None

@pytest.mark.asyncio
async def test_process_room_filters_failed_queries(self, temp_database):
    ...
    assert len(result["balance_history"]) == 1  # only success
```

- [ ] **Step 3: Run to verify tests fail**

```bash
cd /Users/macbook/Program/dorm_public && python -m pytest tests/unit/test_aggregate_data.py::TestProcessRoom -v
```

Expected: FAIL — old function names no longer exist.

- [ ] **Step 4: Rewrite TestRoomStatistics**

3 tests verifying `current_balance` is most recent value, `balance_history` keys are chronologically sorted, partial data (< 30 days) still works.

- [ ] **Step 5: Rewrite TestGenerateSummaries**

3 tests for `generate_hierarchical_summaries()`:
- Verify overview.json output structure
- Verify file size < 500KB with 50 rooms × 30 days
- Verify metadata fields (`generated_at`, `total_rooms`, `campuses`)

- [ ] **Step 6: Run all tests against current code**

```bash
cd /Users/macbook/Program/dorm_public && python -m pytest tests/unit/test_aggregate_data.py -v
```

Expected: All ~9 tests PASS. Adjust assertions to match actual async API behavior if needed.

- [ ] **Step 7: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add tests/unit/test_aggregate_data.py && \
git commit -m "test: rewrite aggregate_data unit tests for async room_name-based API"
```

---

### Task 0.2: Fix integration tests

**Goal:** 修复三个跳过的集成测试文件（共 12 个测试），恢复端到端工作流验证。

**Files:**
- Modify: `tests/integration/test_aggregation_workflow.py`
- Modify: `tests/integration/test_cleanup_workflow.py`
- Modify: `tests/integration/test_daily_workflow.py`

**Key implementation points:**
- 所有三个文件：删除 `pytestmark = pytest.mark.skip(...)` 行
- `test_aggregation_workflow.py`: 替换 `temp_database` fixture 为 `tmp_path` 内联创建目录；同步→异步转换；使用 `process_all_rooms`/`generate_hierarchical_summaries` 代替旧函数；测试 100 房间性能 (< 30s)
- `test_cleanup_workflow.py`: 使用 `tmp_path` 创建混合新旧文件；测试归档创建→验证→删除完整流程
- `test_daily_workflow.py`: 使用 `tmp_path` 创建隔离目录；mock aiohttp 响应；测试 cookie 验证→查询→保存→失败回滚流程

- [ ] **Step 1: Fix each integration test file (one by one)**

For each file: read → delete skip marker → replace fixture → rewrite for async → test.

- [ ] **Step 2: Run fixed tests**

```bash
cd /Users/macbook/Program/dorm_public && python -m pytest tests/integration/ -v
```

Expected: All 12 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add tests/integration/ && \
git commit -m "test: fix integration tests for async room_name-based API"
```

---

### Task 0.3: Restore CI/CD workflows

**Goal:** 创建 GitHub Actions 工作流，恢复每日自动采集和每周房间扫描。

**Files:**
- Create: `.github/workflows/daily-query.yml`
- Create: `.github/workflows/weekly-room-discovery.yml`

**Key implementation points:**
- `daily-query.yml`: cron `0 0 * * *` + `workflow_dispatch`；Python 3.11；pip install aiohttp aiofiles；从 secrets.COOKIE_JSON 加载 cookie；运行查询+聚合；git commit+push
- `weekly-room-discovery.yml`: cron `0 2 * * 1` + `workflow_dispatch`；扫描 1-99999 区间
- 注意：两个工作流都需要 `git config user.name` 和 `user.email` 以便提交

- [ ] **Step 1: Create daily-query.yml**

```yaml
name: Daily Electricity Query

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  query:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install aiohttp aiofiles
      - name: Run query
        env:
          COOKIE_JSON: ${{ secrets.COOKIE_JSON }}
        run: |
          echo "$COOKIE_JSON" > /tmp/cookie.json
          python3 nju_electric_query.py -f /tmp/cookie.json $(cat config/room_ids.txt)
      - name: Aggregate data
        run: python3 scripts/aggregate_data.py
      - name: Commit and push
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add -A
          git diff --cached --quiet || git commit -m "chore: update electricity summaries for $(date +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Create weekly-room-discovery.yml**

```yaml
name: Weekly Room Discovery

on:
  schedule:
    - cron: '0 2 * * 1'
  workflow_dispatch:

jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install aiohttp aiofiles
      - name: Scan for new rooms
        env:
          COOKIE_JSON: ${{ secrets.COOKIE_JSON }}
        run: |
          echo "$COOKIE_JSON" > /tmp/cookie.json
          python3 nju_electric_query.py --scan 1 99999 -f /tmp/cookie.json
      - name: Commit and push
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add -A
          git diff --cached --quiet || git commit -m "chore: update room IDs via weekly discovery"
          git push
```

- [ ] **Step 3: Verify YAML syntax**

```bash
cd /Users/macbook/Program/dorm_public && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily-query.yml')); yaml.safe_load(open('.github/workflows/weekly-room-discovery.yml')); print('YAML OK')"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add .github/workflows/ && \
git commit -m "ci: restore daily query and weekly room discovery workflows"
```

---

## Chunk 1: US3 楼层热力图 — Floor Heatmap

**Goal:** 在 building-view.html 分布图下方增加楼层耗电热力图，2D 网格按楼层+房间号排列，绿→黄→红色阶映射。

**Spec ref:** US3 — P1，无依赖。**可与其他 Chunk 完全并行。**

**Approach:** 新建 `heatmap-view.js` 模块提供 `HeatmapView` 对象。核心方法：`extractFloor(roomName)` 从房间号首位提取楼层，`groupByFloor(rankings)` 按楼层分组并计算均耗，`render(container, rankings, userRoom)` 渲染完整 2D 网格热力图。P95 排除极端值。用户房间有 accent outline 高亮。点击 cell 显示详情。集成到 building-view.html 分布图下方。

**Full code reference:** SPEC.md `## Chunk 1: 楼层热力图 — Floor Heatmap (US3)` lines 896-1341（包含完整 JS/CSS/HTML 代码）

---

### Task 1.1: Create heatmap-view.js

**Files:**
- Create: `docs/js/heatmap-view.js`
- Create: `tests/unit/test_heatmap_view.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/unit/test_heatmap_view.py
"""Tests for HeatmapView.extractFloor and groupByFloor logic."""

class TestHeatmapExtractFloor:
    def test_extract_floor_from_room_name_910(self):
        """'910' → 9"""
        assert HeatmapView.extractFloor("910") == 9

    def test_extract_floor_with_letter_4A211(self):
        """'4A211' → 4"""
        assert HeatmapView.extractFloor("4A211") == 4

    def test_extract_floor_empty_string(self):
        assert HeatmapView.extractFloor("") is None

    def test_extract_floor_no_leading_digit(self):
        assert HeatmapView.extractFloor("A123") is None

    def test_extract_floor_single_digit_1(self):
        assert HeatmapView.extractFloor("101") == 1

class TestHeatmapGroupByFloor:
    def test_group_by_floor_creates_correct_groups(self):
        rankings = [
            {"roomName": "910", "consumption": 10},
            {"roomName": "920", "consumption": 5},
            {"roomName": "810", "consumption": 8},
        ]
        floors = HeatmapView.groupByFloor(rankings)
        assert floors.size == 2
        assert 9 in floors.keys()
        assert 8 in floors.keys()
        assert len(floors.get(9).rooms) == 2
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/macbook/Program/dorm_public && python -m pytest tests/unit/test_heatmap_view.py -v
```

Expected: FAIL — `HeatmapView` not defined.

- [ ] **Step 3: Implement heatmap-view.js**

Full code reference: SPEC.md lines 909-1075.

Create object with:
- `COLOR_SCALE` — 6-step green→yellow→red
- `extractFloor(roomName)` → `parseInt(roomName.match(/^(\d)/)[1])` or `null`
- `sortRooms(roomNames)` — sort by numeric part
- `groupByFloor(rankings)` → `Map<floor, {rooms, totalConsumption, avgConsumption}>`
- `getColorForPercentile(percentile)` — iterate COLOR_SCALE
- `render(container, rankings, userRoom)` — full DOM rendering with click handlers

- [ ] **Step 4: Verify tests pass**

```bash
cd /Users/macbook/Program/dorm_public && python -m pytest tests/unit/test_heatmap_view.py -v
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/js/heatmap-view.js tests/unit/test_heatmap_view.py && \
git commit -m "feat: add HeatmapView module for floor electricity heatmap"
```

---

### Task 1.2: Integrate into building-view.html

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add heatmap CSS**

Insert before `</style>`:

CSS for `.heatmap-card`, `.heatmap-header`, `.heatmap-title`, `.heatmap-legend`, `.heatmap-legend-bar`, `.heatmap-grid`, `.heatmap-row`, `.heatmap-floor-label`, `.heatmap-rooms`, `.heatmap-cell`, `.heatmap-cell:hover`, `.heatmap-cell.user-room`, `.heatmap-stats`, and `@media (max-width: 640px)` responsive sizing.

Full CSS reference: SPEC.md lines 1100-1201.

- [ ] **Step 2: Add heatmap card HTML**

Insert after dist-card `</div>`, before `</main>`:

```html
<div class="heatmap-card" id="heatmap-card" style="display: none;">
  <div class="heatmap-header">
    <div>
      <h2 class="heatmap-title">楼层耗电热力图</h2>
      <div class="heatmap-subtitle" id="heatmap-subtitle">各楼层房间耗电分布</div>
    </div>
    <div class="heatmap-legend">
      <span>低</span>
      <div class="heatmap-legend-bar">
        <span style="background:#d1fae5;"></span>
        <span style="background:#6ee7b7;"></span>
        <span style="background:#fde68a;"></span>
        <span style="background:#fca5a5;"></span>
        <span style="background:#ef4444;"></span>
      </div>
      <span>高</span>
    </div>
  </div>
  <div id="heatmap-container"></div>
</div>
```

Full HTML reference: SPEC.md lines 1208-1229.

- [ ] **Step 3: Add script tag**

After `distribution-analyzer.js`: `<script src="js/heatmap-view.js"></script>`

- [ ] **Step 4: Add rendering JS**

Inside `<script>`, add `renderHeatmap(rankings)` and `hideHeatmap()`. Wire into `displayRanking()` after `renderDistributionChart()`. Wire into cleanup functions.

Full JS reference: SPEC.md lines 1258-1303.

- [ ] **Step 5: Manual verification**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Open `http://localhost:8000/building-view.html` → select campus+building → verify heatmap card appears, floor rows sorted top-to-bottom, cell colors reflect consumption, hover scale effect, click shows detail, user room highlighted, mobile responsive.

- [ ] **Step 6: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/building-view.html && \
git commit -m "feat: integrate floor heatmap into building view"
```

---

## Chunk 2: US5 多房间趋势对比 — Multi-Room Comparison

**Goal:** 创建独立对比页面，支持选择 2-5 个房间，折线图叠加显示耗电趋势，附带统计卡片。

**Spec ref:** US5 — P2，可独立交付。**可与其他 Chunk 完全并行。**

**Approach:** 新建 `comparison-service.js`（数据加载+图表渲染） + `comparison-view.html`（级联校区→楼栋→房间选择器 + Chart.js 多线图 + 统计卡片）。复用现有 DataService API。

**Full code reference:** SPEC.md `## Chunk 2: 多房间趋势对比 — Multi-Room Comparison (US5)` lines 1344-1863

---

### Task 2.1: Create comparison-service.js

**Files:**
- Create: `docs/js/comparison-service.js`

- [ ] **Step 1: Implement ComparisonService**

Object with:
- `MAX_ROOMS: 5`, `MIN_ROOMS: 2` — 常量
- `COLORS` — 5 oklch 颜色数组（红、绿、蓝、橙、紫）
- `async loadRooms(rooms)` — 串行加载多房间历史数据，捕获每个房间的错误
- `renderChart(canvas, roomDataList, existingChart)` — 时间轴对齐 + 多 datasets Chart.js 折线图
- `computeStats(roomDataList)` — 每个房间的 avg/max/min consumption、dataPoints、latestBalance

Full code reference: SPEC.md lines 1358-1524.

- [ ] **Step 2: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/js/comparison-service.js && \
git commit -m "feat: add ComparisonService for multi-room trend comparison"
```

---

### Task 2.2: Create comparison-view.html

**Files:**
- Create: `docs/comparison-view.html`
- Modify: `docs/index.html`

- [ ] **Step 1: Create comparison page**

Full HTML reference: SPEC.md lines 1543-1838.

Page structure:
- `<head>` — CSS variables (same oklch palette), page styles for selector/chart/stats/error-state
- `<body>` — title, subtitle, room-selector (cascading dropdowns), compare button, chart-card (canvas + stats-grid), error-state
- CDN scripts: Chart.js 4.4.0 → indexeddb-service.js → data-service.js → comparison-service.js
- Inline script: cascading selector logic (campus→building→room), add/remove room buttons, compare button handler calling ComparisonService.loadRooms→renderChart→computeStats

- [ ] **Step 2: Add navigation link**

In `docs/index.html` navigation, insert:

```html
<a href="comparison-view.html">多房间对比</a>
```

- [ ] **Step 3: Manual verification**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Open `http://localhost:8000/comparison-view.html`:
1. Campus→building→room cascading works
2. Can add up to 5 room selectors
3. Can remove selectors (min 1)
4. "开始对比" enables when ≥2 rooms fully selected
5. Multi-line chart renders with legend
6. Stats cards show per-room comparison

- [ ] **Step 4: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/comparison-view.html docs/index.html && \
git commit -m "feat: add multi-room trend comparison page with cascading selector"
```

---

## Chunk 3: US7 用电模式识别 + US10 电费成本预测

**Goal:** 在 room-view.html 中增加用电模式分析（工作日/周末对比、空房间检测、Z-score 异常尖峰、特征标签、雷达图）和电费成本预测（月度/学期预估、月度趋势图）。

**Spec ref:** US7 — P2, US10 — P3。**可与其他 Chunk 完全并行。**

**Approach:** 新建 `pattern-analyzer.js` 提供 `PatternAnalyzer`。analyze() 解析历史数据返回模式分析结果。predictCost() 基于月均耗和电价计算成本。集成到 room-view.html 趋势图下方的卡片区块。

**Full code reference:** SPEC.md `## Chunk 3: 用电模式识别 (US7) + 电费成本预测 (US10)` lines 1866-2296

---

### Task 3.1: Create pattern-analyzer.js

**Files:**
- Create: `docs/js/pattern-analyzer.js`

- [ ] **Step 1: Implement PatternAnalyzer**

`PatternAnalyzer.analyze(history)`:
- 解析每天日期 → 计算 weekday (1-5) / weekend (0,6) 分类
- 空房间检测：最近 7 天全部 consumption < 0.5
- 异常尖峰：Z-score > 2
- 特征标签逻辑：空房间/周末活跃/工作日活跃/节能先锋/高能耗/波动较大
- 雷达图 5 维度分数：工作日耗电/周末耗电/稳定性/节能度/规律性

`PatternAnalyzer.predictCost(history, pricePerKwh = 0.5)`:
- 按月聚合 consumption
- 投影整月消耗 → 月度成本
- 学期成本 = 月度成本 × 4
- 月度趋势图数据

Full code reference: SPEC.md lines 1884-2009.

- [ ] **Step 2: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/js/pattern-analyzer.js && \
git commit -m "feat: add PatternAnalyzer for usage pattern recognition and cost prediction"
```

---

### Task 3.2: Integrate into room-view.html

**Files:**
- Modify: `docs/room-view.html`

- [ ] **Step 1: Add pattern/cost HTML sections**

Insert before `</main>`:
- `.pattern-section` — pattern-tags container + 4 cards (weekdayAvg/weekendAvg/anomalies/isEmpty) + radar chart canvas
- `.cost-section` — price input + "计算" button + 3 result cards (monthly/semester/tip) + cost trend chart canvas

Full HTML reference: SPEC.md lines 2030-2083.

- [ ] **Step 2: Add CSS**

Insert before `</style>`: styles for `.pattern-section`, `.pattern-tags`, `.pattern-tag` (with .empty/.high/.weekend variants), `.pattern-grid`, `.pattern-card`, `.pattern-chart-container`, `.cost-section`, `.cost-input-row`, `.cost-grid`, `.cost-card`, `.cost-tip`, `.cost-chart-container`.

Full CSS reference: SPEC.md lines 2090-2143.

- [ ] **Step 3: Add JS integration**

Inside `<script>` block:
- `updatePatternDisplay(history)` — calls PatternAnalyzer.analyze() → renders tags (colored badges) + 4 metric cards + radar chart (Chart.js type: 'radar')
- `updateCostPrediction(history)` — shows section
- `btn-calc-cost` click handler — calls PatternAnalyzer.predictCost() → renders monthlyCost/semesterCost with tip + cost trend bar chart (Chart.js type: 'bar')
- Wire `updatePatternDisplay` + `updateCostPrediction` into `updateUI()` after existing sections

Full JS reference: SPEC.md lines 2150-2281.

- [ ] **Step 4: Add script tag**

After `data-service.js`:

```html
<script src="js/pattern-analyzer.js"></script>
```

- [ ] **Step 5: Manual verification**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Open `http://localhost:8000/room-view.html`, configure a room with >7 days data:
1. Pattern section appears with colored tag badges
2. 4 metric cards show correct values
3. Radar chart renders with 5 dimensions
4. Cost section: enter 0.5, click "计算"
5. Monthly/semester cost displayed
6. Cost trend bar chart renders
7. If <7 days data, both sections hidden

- [ ] **Step 6: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/room-view.html && \
git commit -m "feat: add usage pattern recognition and cost prediction to room view"
```

---

## Chunk 4: US11 异常预警订阅 + US12 节能成就系统

**Goal:** 创建基于 localStorage 持久化的预警订阅和成就徽章系统，集成到 index.html 首页面板。

**Spec ref:** US11 — P3, US12 — P3。**可与其他 Chunk 完全并行。**

**Approach:** 两个独立模块。`AlertService` 管理房间订阅、调用 DataService 检查余额和异常、浏览器 Notification API。`AchievementSystem` 管理 5 个徽章的检测和颁发、排行榜。两者集成到 index.html 首页底部面板。

**Full code reference:** SPEC.md `## Chunk 4: 预警订阅 (US11) + 节能成就系统 (US12)` lines 2300-2687

---

### Task 4.1: Create alert-service.js

**Files:**
- Create: `docs/js/alert-service.js`

- [ ] **Step 1: Implement AlertService**

Object with:
- `STORAGE_KEY: 'alert_subscriptions'`
- `getSubscriptions()` — JSON.parse(localStorage)
- `_save(subs)` — JSON.stringify → localStorage
- `subscribe(room)` — check duplicate, push with `{...room, createdAt, thresholds}`
- `unsubscribe(room)` — filter out by campus/building/room match
- `async checkAlerts()` — iterate subs, call `DataService.getRoomHistory()`, check:
  - Low balance: balance < 10kWh → type 'danger'
  - Depleting soon: daysRemaining ≤ 3 → type 'warning'
  - Anomaly: Z-score > 2 on last 7 days → type 'info'
- `async notifyUser(alert)` — `new Notification()` via browser API

Full code reference: SPEC.md lines 2318-2438.

- [ ] **Step 2: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/js/alert-service.js && \
git commit -m "feat: add AlertService for room alert subscription and monitoring"
```

---

### Task 4.2: Create achievement-system.js

**Files:**
- Create: `docs/js/achievement-system.js`

- [ ] **Step 1: Implement AchievementSystem**

Object with:
- `STORAGE_KEY: 'achievements'`
- `BADGES` — array of 5 badge definitions:
  1. `energy_saver` (节能达人): 30 天日均 < 2 度
  2. `warning_expert` (预警专家): 手动触发
  3. `comparison_champion` (对比冠军): 低于楼栋平均
  4. `watcher` (忠实观察者): 7 天连续访问
  5. `saving_challenge` (节约挑战): 后半月比前半月减少 20%
- `getEarned()` — localStorage read
- `async checkAndAward(roomConfig, history, stats)` — check each badge, award new ones
- `getLeaderboard()` — count badges per room → sorted array

Full code reference: SPEC.md lines 2462-2546.

- [ ] **Step 2: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/js/achievement-system.js && \
git commit -m "feat: add AchievementSystem for energy saving badges and challenges"
```

---

### Task 4.3: Integrate into index.html

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Add dashboard sections**

Insert before `</main>`:
- Alert section: `#alert-section` with title + `#alert-list`
- Achievement section: `#achievement-section` with title + `#badge-grid`

Full HTML reference: SPEC.md lines 2568-2579.

- [ ] **Step 2: Add CSS**

Insert before `</style>`: `.dashboard-section`, `.alert-item` (with .danger/.warning/.info variants via border-left-color), `.badge-grid`, `.badge-card` (.earned with accent border, .locked with opacity 0.5).

Full CSS reference: SPEC.md lines 2585-2619.

- [ ] **Step 3: Add integration JS**

Insert before `</body>`:

```html
<script src="js/alert-service.js"></script>
<script src="js/achievement-system.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    await DataService.initDB();

    // 预警面板
    const subs = AlertService.getSubscriptions();
    if (subs.length > 0) {
      const alerts = await AlertService.checkAlerts();
      if (alerts.length > 0) {
        document.getElementById('alert-section').style.display = 'block';
        document.getElementById('alert-count').textContent = `(${alerts.length})`;
        document.getElementById('alert-list').innerHTML = alerts.map(a => `
          <div class="alert-item ${a.type}">
            <span>${a.type === 'danger' ? '🔴' : a.type === 'warning' ? '🟡' : '🔵'}</span>
            <div>${a.message}</div>
          </div>`).join('');
        if (alerts.some(a => a.type === 'danger'))
          await AlertService.notifyUser(alerts.find(a => a.type === 'danger'));
      }
    }

    // 成就面板
    const earned = AchievementSystem.getEarned();
    document.getElementById('badge-grid').innerHTML = AchievementSystem.BADGES.map(b => {
      const isEarned = earned.some(e => e.id === b.id);
      return `<div class="badge-card ${isEarned ? 'earned' : 'locked'}">
        <div class="badge-icon">${isEarned ? b.icon : '🔒'}</div>
        <div class="badge-name">${isEarned ? b.name : '???'}</div>
        <div class="badge-desc">${isEarned ? b.desc : '尚未获得'}</div>
      </div>`;
    }).join('');
    if (earned.length > 0) document.getElementById('achievement-section').style.display = 'block';
  });

  // 访问追踪（for 忠实观察者徽章）
  (function trackVisit() {
    const visits = JSON.parse(localStorage.getItem('visit_dates') || '[]');
    visits.push(new Date().toISOString().slice(0, 10));
    localStorage.setItem('visit_dates', JSON.stringify(visits));
  })();
</script>
```

Full JS reference: SPEC.md lines 2625-2679.

- [ ] **Step 4: Manual verification**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`:
1. Alert section shows only if subscriptions exist
2. Alert items styled with colored left border
3. Badge grid shows earned with icon, locked as 🔒
4. Visit date recorded in localStorage
5. Page load triggers alert check

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/index.html && \
git commit -m "feat: add alert dashboard and achievement display to homepage"
```

---

## Chunk 5: US1 智能预警增强 — Smart Warning System

**Goal:** 在 room-view.html 中增强预警显示功能：余额颜色分级指示器（红色<10度/橙色<3天/黄色<7天）、预测耗尽天数、异常消耗尖峰标记、订阅按钮。

**Spec ref:** US1 — P1。**依赖 Chunk 4 的 AlertService 完成。**

**Approach:** 非新建页面，而是在 room-view.html 趋势图下方插入完整预警面板。复用 Chunk 4 的 AlertService 做订阅管理。使用 color-mix CSS 实现分级背景色。

---

### Task 5.1: Enhance warning display in room-view.html

**Files:**
- Modify: `docs/room-view.html`

- [ ] **Step 1: Add enhanced warning CSS**

Insert before `</style>`:

```css
    .warning-section { margin-top: 32px; }
    .warning-level { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid; }
    .warning-level.danger { background: color-mix(in oklch, var(--danger) 10%, transparent); border-color: var(--danger); }
    .warning-level.warning { background: color-mix(in oklch, var(--warning) 10%, transparent); border-color: var(--warning); }
    .warning-level.caution { background: color-mix(in oklch, var(--accent) 10%, transparent); border-color: var(--accent); }
    .warning-level.ok { background: color-mix(in oklch, var(--success) 10%, transparent); border-color: var(--success); }
    .warning-icon { font-size: 24px; }
    .warning-text { flex: 1; }
    .warning-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .warning-desc { font-size: 13px; color: var(--muted); }
    .warning-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-top: 12px; }
    .warning-metric { background: color-mix(in oklch, var(--bg) 60%, transparent); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border); }
    .warning-metric-label { font-size: 11px; color: var(--muted); }
    .warning-metric-value { font-size: 15px; font-weight: 600; font-family: var(--font-mono); }
    .warning-spike { margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 13px; background: color-mix(in oklch, var(--danger) 8%, transparent); border: 1px solid color-mix(in oklch, var(--danger) 20%, transparent); }
    .btn-subscribe { padding: 8px 16px; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-subscribe.active { background: var(--accent); color: #fff; }
    .btn-subscribe.inactive { background: color-mix(in oklch, var(--border) 50%, transparent); color: var(--muted); }
```

- [ ] **Step 2: Add warning card HTML**

Insert before `</main>`:

```html
    <section class="warning-section" id="warning-section" style="display: none;">
      <h2 style="font-size:18px;font-weight:600;margin-bottom:12px;">
        ⚡ 智能预警
        <button class="btn-subscribe inactive" id="btn-sub-alert" style="float:right;">+ 订阅预警</button>
      </h2>
      <div id="warning-level"></div>
      <div class="warning-metrics" id="warning-metrics"></div>
      <div id="warning-spikes"></div>
    </section>
```

- [ ] **Step 3: Add warning JS logic**

Inside `<script>` block, add `updateWarningDisplay(history)`:

Logic:
1. Calculate balance, avgConsumption, daysRemaining
2. Determine level: danger (<10 balance or ≤3 days) / warning (≤7 days) / caution (≤14 days) / ok
3. Render warning-level card with color-coded border + title + description
4. Render 4 metrics: current balance, daily avg, days remaining, data days
5. Z-score anomaly detection on last 7 days → render spike warnings
6. Subscribe button: check existing subscription via `AlertService.getSubscriptions()`, toggle subscribe/unsubscribe

Wire into `updateUI()` after existing sections.

Add `<script src="js/alert-service.js"></script>` after existing script tags.

- [ ] **Step 4: Manual verification**

```bash
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Open `http://localhost:8000/room-view.html`, configure a room:
1. Warning section shows with color-coded level banner
2. 4 metrics grid renders correctly
3. Anomaly spike warnings if applicable
4. Subscribe button toggles active/inactive
5. Subscription persists in localStorage across reload
6. Homepage alert section shows subscribed alerts

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Program/dorm_public && \
git add docs/room-view.html && \
git commit -m "feat: add smart warning system with tiered alerts and subscription"
```

---

## Execution Order

```
           Chunk 0 (Infra: tests + CI/CD)
          /     |     |     |    \
    Chunk 1  Chunk 2  Chunk 3  Chunk 4
    (US3)   (US5)   (US7+10) (US11+12)
                                 |
                              Chunk 5 (US1 — depends on Chunk 4)
```

**Wave 1** (5 agents in parallel):
| Agent | Chunk | Tasks |
|-------|-------|-------|
| Agent A | Chunk 0 | 0.1 → 0.2 → 0.3 (sequential) |
| Agent B | Chunk 1 | 1.1 → 1.2 (sequential) |
| Agent C | Chunk 2 | 2.1 → 2.2 (sequential) |
| Agent D | Chunk 3 | 3.1 → 3.2 (sequential) |
| Agent E | Chunk 4 | 4.1 → 4.2 → 4.3 (sequential) |

**Wave 2** (after Chunk 4 completes):
| Agent F | Chunk 5 | 5.1 (single task) |

---

## Final Verification

After ALL chunks complete:

```bash
# Python tests — expect 39+ all passing, 0 skipped
cd /Users/macbook/Program/dorm_public && python -m pytest tests/ -v

# Lint
cd /Users/macbook/Program/dorm_public && ruff check .

# Frontend verification
cd /Users/macbook/Program/dorm_public/docs && python3 -m http.server 8000
```

Manual checks:
1. `building-view.html` — heatmap renders below distribution chart, click/hover work
2. `comparison-view.html` — multi-room selector works, chart renders with legend, stats accurate
3. `room-view.html` — pattern tags + radar chart + cost prediction + tiered warning banner + subscribe button
4. `index.html` — alert list shows subscribed room alerts, badge grid shows earned/locked states
5. localStorage — `alert_subscriptions` and `achievements` keys persist correctly
6. `.github/workflows/` — both YAML files pass syntax validation
