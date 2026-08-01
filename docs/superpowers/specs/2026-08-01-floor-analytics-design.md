# 楼层耗电分析设计文档

> **日期**: 2026-08-01
> **状态**: 已定稿
> **关联**: 楼栋视角 (building-view.html) 增加楼层分析功能

## 概述

在楼栋页面中增加楼层维度的耗电分析，在现有房间排行榜之上增加楼层聚合层，支持多选楼层对比、下钻查看各楼层房间排行。

## 文件结构

```
dorm_public/
├── docs/
│   ├── js/
│   │   ├── floor-utils.js         # 楼层提取引擎
│   │   ├── floor-analytics.js     # 楼层聚合计算
│   │   └── floor-view.js          # 楼层指示器 UI + 交互
│   └── building-view.html         # 集成楼层功能
└── config/
    └── floor_map.json             # 手动楼层映射
```

## 模块设计

### 1. floor-utils.js — 楼层提取引擎

**功能**：从房间名中提取楼层号，支持规则解析和手动映射覆盖。

**配置格式** (`config/floor_map.json`)：

```json
{
  "仙林校区": {
    "19幢": {
      "manual": {
        "19栋第1层101": 1,
        "19栋第1层102": 1
      },
      "mode": "auto"
    },
    "4幢": {
      "mode": "auto"
    }
  }
}
```

- `mode: "auto"`：该楼栋所有房间走规则解析
- `mode: "manual"`：仅使用手动映射，不在 manual 中的房间标记为 unknown
- `manual`：房间名 → 楼层号的映射对象

**规则解析优先级**：

1. 检查手动映射表（`config/floor_map.json` 中的 `manual`）
2. 正则匹配 "第X层" 模式 — `19栋第2层201` → 2, `19栋第16层1613` → 16
3. 字母后首数字 — `4A101` → 1, `4A211` → 2
4. 中文前缀后首数字 — `戊504` → 5
5. 纯数字或无法识别 → `null`（标记为 unknown）

**API**：

```javascript
async function loadFloorMap()
// 加载 config/floor_map.json，缓存到内存
// fetch 失败时返回空对象 {}，不抛出异常，走纯规则解析

function extractFloor(roomName, campus, building, floorMap)
// 提取单房间楼层号
// floorMap 传 null 或 {} 时跳过手动映射，仅走规则
// 返回楼层号（number）或 null（无法识别）

function groupRoomsByFloor(roomNames, campus, building, floorMap)
// 同步函数，对每个房间调用 extractFloor 进行分组
// 返回 { 1: ['room1', ...], 2: [...], unknown: [...] }
```

### 2. floor-analytics.js — 楼层聚合计算

**功能**：在排行榜数据基础上，按楼层聚合统计。

**API**：

```javascript
function calculateFloorStats(rankings, floorGroups)
// 输入: rankings = [{ roomName, consumption, balance, campus, building }, ...]
//       floorGroups = { 1: ['101', '102', ...], 2: [...], unknown: [...] }
// 输出: {
//   floors: {
//     1: { roomCount: 20, rooms: ['101', ...], totalConsumption: 45.2,
//          avgConsumption: 2.26, maxConsumption: 5.1, minConsumption: 1.2 },
//     2: { ... },
//     unknown: { roomCount: 3, rooms: [...] }
//   },
//   sortedFloors: [1, 2, 3, ...]  // 按楼层号排序
// }

function getFloorComparisonData(floorStats, selectedFloors)
// 生成楼层对比图表数据
// 输出: { labels: ['1层', '2层', ...], consumption: [45.2, 52.1, ...], ... }

function getFilteredRankings(rankings, floorGroups, selectedFloors)
// 根据选中楼层过滤排行榜
// selectedFloors = null 时返回全部 rankings（不过滤）
// 选中楼层不包含 unknown 时，unknown 房间不显示
// 输出: 过滤后的 rankings 数组
```

### 3. floor-view.js — 楼层指示器 UI

**功能**：渲染左侧楼层指示器、处理多选交互、联动内容刷新。

**核心交互**：

```
┌── 60px ──┐  ┌─────────── 内容区 ──────────────────────────┐
│          │  │  统计摘要: [总消耗] [房间数] [均耗] [最高]    │
│  ● 全部   │  │                                              │
│  │       │  │  ┌─ 楼层耗电对比 ─────────────────────────┐  │
│  ● 1层   │  │  │  ████ 1层                              │  │
│  ● 2层   │  │  │  ████████ 2层                          │  │
│  ● 3层   │  │  │  ██████████ 3层                        │  │
│  ○ 4层   │  │  │  ████ 4层                              │  │
│  ○ 5层   │  │  └────────────────────────────────────────┘  │
│          │  │                                              │
│          │  │  ┌─ 耗电量排行榜 ──────────────────────────┐  │
│          │  │  │  1. 301  5.10度  3层                    │  │
│          │  │  │  2. 302  4.82度  3层                    │  │
│          │  │  │  3. 201  4.35度  2层                    │  │
│          │  │  │  ...                                    │  │
│          │  │  └────────────────────────────────────────┘  │
└──────────┘  └──────────────────────────────────────────────┘
```

**楼层对比图**：使用 Chart.js 柱状图，位置在耗电分布图（`#dist-card`）之后、趋势图（`#trend-card`）之前。选中楼层时柱子高亮，未选中楼层半透明。

**API**：

```javascript
function renderFloorIndicator(floorStats, container, onToggle)
// 渲染左侧楼层指示器 DOM（细线 + 节点 + 标签）
// onToggle 是回调函数，由 building-view.html 传入

function renderFloorChart(floorStats, container, selectedFloors)
// 渲染楼层对比柱状图，使用 Chart.js

function updateContent(selectedFloors, state)
// 联动刷新：统计摘要 + 对比图 + 排行榜
// 通过 state 对象访问全局状态
```

**状态约定**：
- `selectedFloors = null`：全部楼层，不触发过滤，排行榜与现有一致
- `selectedFloors = Set([1, 2, 3])`：选中 1、2、3 层
- `selectedFloors = Set()`（空集）：所有楼层取消选中，显示空内容（提示"请选择楼层"）

**行为规则**：

| 操作 | 行为 |
|------|------|
| 选择楼栋 | 提取楼层 → 渲染指示器 → 默认 selectedFloors = null（全部选中） |
| 点击楼层节点 | toggle 选中/取消 → 刷新内容区 |
| 点击"全部楼层" | 全部选中 → 恢复 selectedFloors = null / 全部取消 |
| 逐一取消所有楼层 | selectedFloors 变为空 Set → 显示空内容提示 |
| 切换日期 | 重新计算 → 保持楼层选中状态不变 |
| 切换楼栋 | 重置 selectedFloors = null → 重新提取 |
| 未知楼层 | 显示在指示器底部，节点标记为 "?" |

### 4. building-view.html 集成

**新增依赖**（在页面底部，现有 script 标签之后）：

```html
<script src="js/floor-utils.js"></script>
<script src="js/floor-analytics.js"></script>
<script src="js/floor-view.js"></script>
```

**DOM 改动**：

- `.main` 的布局改为 `display: flex`
- 新增左侧 60px 的 `.floor-side` 容器（由 floor-view.js 动态填充）
- 现有所有内容（选择器栏、回退横幅、统计行、分布卡片、趋势卡片、排行榜卡片）包裹在 `<div class="content-area">` 中作为右侧内容区
- 在分布图（`#dist-card`）之后、趋势图（`#trend-card`）之前新增楼层对比图容器

**state 新增字段**：

```javascript
const state = {
  // ... 现有字段
  selectedFloors: null,     // null = 全部楼层，Set = 选中楼层集合
  floorStats: null,         // 楼层聚合统计
  floorGroups: null,        // 房间 → 楼层映射
  floorMap: null,           // 楼层映射配置（加载后的 floor_map.json）
};
```

**floor-view.js 与页面状态交互方式**：
- `floor-view.js` 不直接读写页面 `state` 变量
- 通过传入的回调函数和参数进行通信：`onToggle(floor)` 回调修改 `state` 并触发刷新
- `updateContent(selectedFloors)` 通过 `state` 对象访问排行榜数据

**数据流**：

```
1. onBuildingChange()
   → state.currentLoadId++  (取消旧请求)
   → loadRanking() 计算所有房间消耗量
   → 从 buildingSummary.rooms 获取 roomNames = Object.keys(roomMap)
   → floorMap = await loadFloorMap()  // fetch 失败返回 {}
   → floorGroups = groupRoomsByFloor(roomNames, campus, building, floorMap)
   → floorStats = calculateFloorStats(allRankings, floorGroups)
   → renderFloorIndicator(floorStats, container, onToggle)
   → renderFloorChart(floorStats, chartContainer, null)

2. 日期切换
   → state.currentLoadId++
   → loadRanking() 重新计算消耗量
   → 复用现有的 floorGroups（楼层分组不变，只重新计算消耗量）
   → 更新 floorStats
   → 保持 state.selectedFloors 不变
   → 刷新指示器 + 图表 + 内容

3. 用户点击楼层节点
   → onFloorToggle(floor)
     → 更新 state.selectedFloors
     → updateHighlight()
     → renderFloorChart(floorStats, chartContainer, selectedFloors)
     → 刷新统计摘要（计算 filtered 版本）
     → 过滤排行榜（getFilteredRankings + renderCurrentPage）

4. 页面加载 / 空状态
   → 未选择楼栋时，.floor-side 隐藏或显示 "请选择楼栋"
   → 选择楼栋后才渲染楼层指示器
```

## 未覆盖的边界情况

- **单层楼栋**：只有 1 个楼层时，楼层指示器不显示，维持现有视图
- **所有房间 unknown**：无法提取任何楼层，楼层指示器显示"未知"节点，提示用户配置映射
- **部分房间 unknown**：显示在指示器底部，排行榜中标注为 "?"
- **楼层号不连续**（如只有 1 层和 3 层）：按实际楼层号显示，不填充缺失楼层
- **楼层映射文件不存在/加载失败**：`loadFloorMap()` 返回空对象 `{}`，完全走规则解析
- **映射文件中的校区/楼栋键缺失**：`extractFloor` 回退到规则解析，不抛出异常
- **空 Set 状态**：用户逐一取消所有楼层时，显示"请选择楼层"提示，不崩溃