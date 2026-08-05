# 前端适配分段扫描数据不全 设计文档

> **Goal:** 前端适配后端爬虫分段扫描导致的"数据部分存在"场景，消除因数据缺口导致的误导性展示
>
> **Architecture:** ① 校区级 fallback 判断从抽样改为基于 `generated_at` 时间戳 ② 新增扫描进度提示横幅 ③ 消耗量计算中日期缺口返回 null 而不是跨日累计
>
> **Tech Stack:** JavaScript ES6+ (frontend), 静态 JSON 数据文件

---

## 问题分析

### 背景

后端爬虫改为链式批次调度（rate-limiting-v3），将 17,349 间房分 4 批依次查询，每批独立 GitHub Action workflow run：

```
批 1: rooms[0:4338]  →  批 2: rooms[4338:8675]  →  批 3: rooms[8675:13013]  →  批 4: rooms[13013:]
```

每批完成后运行聚合脚本，更新 `database/summaries/` 下的摘要文件，然后触发下一批。

这意味着在任意时刻，数据库中的摘要数据可能只包含部分房间的今日数据。

### 已知问题

1. **校区级 fallback 判断抽样不准**：`_checkDateCoverage` 在校区级只抽样前 5 栋楼，在分段扫描下可能错误触发或不触发 fallback
2. **无扫描进度提示**：用户看到部分数据时无法区分"扫描进行中"和"数据确实只有这些"
3. **消耗量计算跨日累计**：日期不连续时，余额差被当作单日消耗展示，实际是多日累计

---

## 设计方案

### 模块 1：校区级 Fallback 判断重构

#### 当前行为

`_checkDateCoverage` 在校区级（`buildingName` 为 null 时）只加载前 5 栋楼的数据计算覆盖率，阈值 ≥50% 才认为日期有效。

#### 新逻辑

改为读取 `database/summaries/overview.json` 的 `generated_at` 字段判断：

```
generated_at (UTC+0) → +8h → CST 日期
├── CST 日期 = 今天 → 不触发 fallback（return null）
└── CST 日期 < 今天 → 向前搜索 7 天，找到第一个 generated_at 日期匹配的日期
    ├── 找到 → 返回该日期作为 fallback
    └── 未找到 → return null（无数据状态）
```

#### 修改点

**`data-service.js` — `_checkDateCoverage` 校区分支（约 L192-221）**

替换为：

```javascript
} else {
  // Campus-wide: use generated_at from overview.json
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
  const targetCompact = compactDate;

  // If generated_at date matches target date, coverage is sufficient
  return generatedCompact === targetCompact ? 1.0 : 0;
}
```

**阈值修改**：`findLatestDateWithData` 中的判断阈值从 `>= 0.5` 改为 `> 0`，同时适用于校区级和楼栋级：
- 校区级：基于 `generated_at` 匹配（二值：1.0 或 0），不涉及阈值判断
- 楼栋级：原来要求 ≥50% 房间有数据，改为只要有任何房间有数据（`> 0`）即认为该日期有效

#### 楼栋级

楼栋级 `_checkDateCoverage` 维持现有逻辑不变：逐个房间检查 `balance_history` 中是否有目标日期记录。

---

### 模块 2：扫描进度提示横幅

#### 数据来源

`database/.batch_run_summary.json`，由后端链式工作流维护：

```json
{
  "date": "2026-08-04",
  "total_batches": 4,
  "batches": {
    "1": { "success": 4330, "failed": 8 },
    "2": { "success": 4335, "failed": 2 }
  },
  "cumulative": { "success": 8665, "failed": 10 }
}
```

- 文件存在 → 扫描进行中
- 文件不存在 → 扫描已完成（或未开始）

#### 交互设计

在页面顶部（与 fallback banner 同级）显示：

```
[数据扫描中] 数据扫描中 (2/4 批已完成) — 今日扫描完成后数据自动更新
```

- 点击关闭按钮可 dismiss（存 sessionStorage，独立 key `scanningBannerDismissed`）
- 扫描进行中时，**不触发 fallback**（即使 coverage 看起来低）
- 校区页面和楼栋页面均需显示

#### 扫描中与 Fallback 的交互

| 状态 | 行为 |
|------|------|
| 扫描进行中（文件存在） | 显示扫描横幅，不触发 fallback，正常展示已有数据 |
| 扫描已完成（文件不存在） | 无横幅，走正常 fallback 判断逻辑 |
| 扫描已结束但无数据 | 无横幅，走正常 fallback 判断逻辑 |

#### 修改点

**`campus-view.html` 和 `building-view.html`：**

1. 页面加载时异步 fetch `this.DATABASE_PATH + '/.batch_run_summary.json'`（非阻塞，不 await）
2. 如果返回 200 → 解析 JSON，显示扫描横幅
3. 如果返回 404 → 文件不存在，不显示横幅
4. 网络错误（非 404）静默降级，不中断页面加载
5. 扫描横幅显示期间，`findLatestDateWithData` 调用跳过（不触发 fallback）

---

### 模块 3：消耗量计算 — 日期缺口处理

#### 问题

当前所有消耗计算都使用 `相邻记录余额差`，不检查日期是否连续：

```javascript
curr.consumption = Math.max(0, prev.electricity - curr.electricity);
```

如果日期不连续（如 08-01 → 08-03 中间缺 08-02），跨多日的余额下降被当作"当日消耗"展示。

#### 修复原则

**日期不连续时返回 `null`，不跨日估算，不误导。**

#### 修改位置（共 6 处）

所有 6 处统一增加日期连续性检查。新增 `DataService._isConsecutiveDates` 方法（作为 `DataService` 的方法）：

```javascript
// 辅助函数：检查两个日期是否连续（相邻日期）
_isConsecutiveDates(currDate, prevDate) {
  const curr = new Date(parseInt(currDate.substring(0, 4)),
                        parseInt(currDate.substring(4, 6)) - 1,
                        parseInt(currDate.substring(6, 8)));
  const prev = new Date(parseInt(prevDate.substring(0, 4)),
                        parseInt(prevDate.substring(4, 6)) - 1,
                        parseInt(prevDate.substring(6, 8)));
  const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays) === 1; // 使用 Math.round 避免夏令时边缘情况
}
```

| # | 文件 | 位置 | 修改 |
|---|------|------|------|
| 1 | `data-service.js` | `getRoomHistory` L489-494 | 循环中增加 `this._isConsecutiveDates` 检查 |
| 2 | `data-service.js` | `batchGetRoomHistory` L607-610 | 同上 |
| 3 | `data-service.js` | `getCampusConsumptionTrend` L1816-1821 | 同上 |
| 4 | `data-service.js` | `getBuildingConsumptionTrend` L1889-1893 | 同上 |
| 5 | `data-service.js` | `_calculateConsumptionFromHistory` L1473-1481 | 取 `dates[targetIdx-1]` 后检查日期连续性 |
| 5b | `data-service.js` | `_calculateConsumptionFromHistory` week 分支 L1460-1470 | 日期不连续时跳过该对，不纳入平均计算 |
| 6 | `building-view.html` | `calculateConsumption` | 取 `history.find` 结果后检查前一条记录日期 |

#### 影响范围

| 图表/展示 | 数据来源 | 受影响？ |
|-----------|----------|----------|
| 房间页趋势图（room-view） | `getRoomHistory` → #1 | ✅ 修复后覆盖 |
| 房间详情面板（room-detail） | `getRoomHistory` → #1 | ✅ 修复后覆盖 |
| 楼栋详情面板（building-view detail） | `getRoomHistory` → #1 | ✅ 修复后覆盖 |
| 校区趋势图（campus-view） | `getCampusConsumptionTrend` → #3 | ✅ 修复后覆盖 |
| 楼栋趋势图（building-view） | `getBuildingConsumptionTrend` → #4 | ✅ 修复后覆盖 |
| 校区仪表盘（campus-view） | `getCampusConsumption` → #5 | ✅ 修复后覆盖 |
| 全校排名（campus-view） | `getCampusWideRanking` → #5 | ✅ 修复后覆盖 |
| 楼栋排行榜（building-view） | `calculateConsumption` → #6 | ✅ 修复后覆盖 |
| 楼栋排名缓存（building-view） | `batchGetRoomHistory` → #2 | ✅ 修复后覆盖 |
| 楼栋详情 SV G 趋势图 | `d.electricity`（余额） | 不涉及消耗量，无影响 |
| 分布图（building-view） | `rankings[].consumption` | 来自 #2/#6，间接覆盖 |

---

## 文件修改清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `docs/js/data-service.js` | 修改 | 5 处消耗计算修复 + 1 处校区 fallback + 1 处阈值 + 1 处辅助函数 + 1 处 avgConsumption 标注 |
| `docs/campus-view.html` | 修改 | 新增扫描横幅渲染 + 异步 fetch 逻辑 |
| `docs/building-view.html` | 修改 | 新增扫描横幅渲染 + 异步 fetch 逻辑 + 1 处消耗计算修复 |

---

### 模块 4：平均消耗量标注

`calculateAvgConsumption` 当前返回纯数值，未反映数据基础天数。修改为返回结构体：

```javascript
// 修改前
calculateAvgConsumption(history) {
  const consumptions = history.slice(1).map(h => h.consumption).filter(c => c > 0);
  if (consumptions.length === 0) return 0;
  return consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
}

// 修改后
calculateAvgConsumption(history) {
  const consumptions = history.slice(1).map(h => h.consumption).filter(c => c > 0);
  if (consumptions.length === 0) return { avg: 0, daysWithData: 0, totalDays: Math.max(0, history.length - 1) };
  return {
    avg: consumptions.reduce((a, b) => a + b, 0) / consumptions.length,
    daysWithData: consumptions.length,
    totalDays: Math.max(0, history.length - 1)
  };
}
```

调用方（如 `getRoomHistory`、`campus-view.html` 等）相应更新，展示"日均消耗（基于 X/Y 天有数据）"。

---

### 模块 5：`batch_run_summary.json` 格式契约

前端解析时做基本校验，不符合预期格式时静默降级（视为无扫描进行中）。

```json
{
  "date": "2026-08-04",           // string, date of the scan
  "total_batches": 4,             // number, total batches planned
  "batches": {                    // object, key = batch number (string)
    "1": { "success": 4330, "failed": 8 }
  },
  "cumulative": {                 // object, cumulative stats
    "success": 8665,
    "failed": 10
  }
}
```

前端校验规则：`total_batches` 存在且 > 0、`batches` 非空、`cumulative` 存在。不符合时静默降级。

---

## 边界情况

| 场景 | 预期行为 |
|------|----------|
| 分段扫描中，第 1 批完成 | 校区：generated_at=今天 → 不 fallback，显示扫描横幅和数据 |
| 分段扫描中，第 2 批刚触发 | 同上，横幅更新为 2/4 批 |
| 所有批次完成 | 无横幅，generated_at=今天，正常显示 |
| 今天没有批次运行 | generated_at=昨天 → fallback 到昨天 |
| 今天没有数据，昨天也没有 | 搜索 7 天，都无数据 → 显示无数据状态 |
| 房间数据不连续（缺中间日期） | 消耗计算返回 null，图表显示 0.00，不跨日累计 |
| 新房间，只有 1 条记录 | 无法计算消耗，返回 null |
| batch_run_summary.json 404 | 视为无扫描进行中，走正常 fallback 逻辑 |
| batch_run_summary.json 解析失败 | 视为无扫描进行中，走正常 fallback 逻辑 |

---

## 测试验证

### 测试场景

1. **校区 fallback**：mock overview.json 的 generated_at 为昨天，验证校区页面 fallback 到昨天
2. **校区不 fallback**：mock generated_at 为今天，验证不触发 fallback
3. **扫描横幅**：mock batch_run_summary.json 存在，验证扫描横幅显示和进度更新
4. **扫描横幅消失**：batch_run_summary.json 404，验证无横幅
5. **日期缺口消耗计算**：构造 balance_history 包含 08-01、08-03（缺 08-02），验证 08-03 消耗为 null
6. **连续日期消耗计算**：构造 08-01、08-02 连续日期，验证消耗正常计算
7. **楼栋级 fallback 不变**：验证楼栋页面仍然按房间检查覆盖率