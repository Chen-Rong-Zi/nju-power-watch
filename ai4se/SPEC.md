# NJU 宿舍电费监控系统 — 综合设计文档 (SPEC.md)

> **项目名称**: NJU 宿舍电费监控系统（NJU Dorm Electricity Monitor）  
> **生成日期**: 2026-06-01  
> **状态**: 已批准  
> **在线地址**: [njupower.top](https://njupower.top)  
> **源代码**: [github.com/Chen-Rong-Zi/nju-power-watch](https://github.com/Chen-Rong-Zi/nju-power-watch)

---

## 一、问题陈述

### 1.1 要解决什么问题？

南京大学学生在使用宿舍电费查询系统时，面临以下痛点：

1. **半夜突然停电** — 需要手动登录 epay.nju.edu.cn 查电费，无法预知余额将耗尽的时间
2. **缺乏用电感知** — 对"度"这个单位没有直观概念，不知道自己的用电量是高是低
3. **数据分散** — 每次都要重复登录，无法便捷地追踪历史用电趋势
4. **对比缺失** — 不知道自己与同楼栋其他宿舍的用电量对比情况
5. **被动响应** — 没有主动预警机制，只能等停电后才后知后觉

### 1.2 目标用户是谁？

| 用户角色 | 描述 | 主要场景 |
|---------|------|---------|
| **宿舍学生** | 南京大学在校住宿生 | 日常查看个人电费余额、用电趋势、充值建议 |
| **楼栋管理员** | 对整栋楼用电情况感兴趣的学生/宿管 | 查看楼栋排行榜、楼层分布热力图 |
| **校区管理员** | 关注宏观用电趋势的管理人员 | 查看校区对比、整体用电统计 |
| **系统管理员** | 维护自动化采集流程的开发者 | 配置 GitHub Actions、处理 Cookie 过期 |

### 1.3 为什么值得做？

- **用户基数大**：覆盖南大4个校区、106栋楼、16,644个房间
- **零运维成本**：GitHub Pages + GitHub Actions 静态托管，无需服务器
- **自动化**：每日自动采集，无需人工干预
- **隐私安全**：公开数据去除学号等敏感信息
- **趣味化**：将抽象"度"转化为"iPhone充电次数"等直观类比

---

## 二、用户故事

### P1 — 核心功能（必须有）

| ID | 用户故事 | Acceptance Criteria | 优先级 | 依赖 |
|----|---------|-------------------|--------|------|
| US1 | **智能预警系统** — 作为宿舍学生，我希望收到智能低电量预警，以便提前充值避免停电 | ①余额<10kWh显示红色预警 ②预测3天内耗尽显示橙色 ③预测7天内耗尽显示黄色 ④异常消耗检测（突然尖峰/下降）⑤预警列表可筛选 ⑥点击查看详情 | P1 | 无 |
| US2 | **楼栋用电排行榜** — 作为学生，我希望看到自己房间在楼栋中的用电排名，以了解相对消耗水平 | ①Top10高消耗 ②Top10节能 ③Top10低余额 ④Top10突发增长 ⑤支持7/30天切换 ⑥柱状图可视化 ⑦点击查看详情 | P1 | 无 |
| US3 | **楼层用电热力图** — 作为楼栋管理员，我希望看到按楼层分布的用电情况，以识别异常楼层 | ①从房间名提取楼层号 ②计算楼层均耗 ③绿→黄→红色映射 ④2D色块图 ⑤hover显示详情 ⑥点击展开楼层房间列表 | P1 | 无 |
| US4 | **每日自动采集** — 作为系统管理员，我希望电费数据每日自动采集，以便前端始终展示最新数据 | ①GitHub Action定时触发 ②所有房间写入JSON ③Cookie过期时有明确错误 | P1 | 001-daily-data-pipeline |

### P2 — 增强功能（应该有）

| ID | 用户故事 | Acceptance Criteria | 优先级 | 依赖 |
|----|---------|-------------------|--------|------|
| US5 | **多房间趋势对比** — 我希望选择2-5个房间对比用电趋势，以分析差异 | ①选择2-5房间 ②多折线图 ③差异统计 ④图例开关 | P2 | US2 |
| US6 | **智能充值建议** — 我希望获得智能充值建议，以合理规划电费预算 | ①预测耗尽天数 ②季节性因素 ③输入目标天数→建议金额 ④反向计算 ⑤显示在房间详情页 | P2 | US1 |
| US7 | **用电模式识别** — 我希望看到用电模式分析，以了解用电习惯 | ①工作日vs周末对比 ②空房间检测 ③异常尖峰检测 ④特征标签（高能耗/节能/夜间活跃）⑤雷达图 | P2 | 无 |
| US8 | **耗电量分布图表** — 我希望看到楼栋内的耗电量分布，以了解整体用电结构 | ①交互式直方图 ②自动分布拟合（正态/双峰/对数正态/Gamma）③BIC模型选择 ④用户房间百分位标注 ⑤hover累计统计 ⑥点击高亮柱 | P2 | 002-data-analysis-features |

### P3 — 高级功能（有更好）

| ID | 用户故事 | Acceptance Criteria | 优先级 | 依赖 |
|----|---------|-------------------|--------|------|
| US9 | **校区仪表盘** — 作为校区管理员，我希望查看宏观用电统计，以监控整体能耗 | ①校区对比 ②楼栋排名 ③趋势分析 ④多级钻取 ⑤显示总消耗/均耗/预警数 | P3 | US2, US3 |
| US10 | **电费成本预测** — 作为预算学生，我希望预测月度电费，以规划开支 | ①输入电价 ②月度成本预测 ③学期总成本 ④月度趋势图 ⑤节能建议 | P3 | US6 |
| US11 | **异常预警订阅** — 我希望订阅房间预警，以接收异常通知 | ①订阅房间 ②异常时生成预警 ③Web推送通知 ④订阅管理 ⑤预警历史 ⑥可配置阈值 | P3 | US1 |
| US12 | **节能挑战与成就** — 我希望获得节能徽章，以激励减少用电 | ①"节能达人"徽章 ②"预警专家"徽章 ③"对比冠军"徽章 ④挑战赛 ⑤排行榜 | P3 | US2, US7 |

### INVEST 原则符合性

- **Independent**: 每个 US 可独立实现和测试
- **Negotiable**: 范围可调整（P1/P2/P3 分层）
- **Valuable**: 每项对用户都有明确价值
- **Estimable**: 每个都有明确的 Acceptance Criteria
- **Small**: 每个可在 1-2 周内完成
- **Testable**: 每个都有独立的测试场景

---

## 三、功能规约

### 3.1 数据采集模块

| 项目 | 描述 |
|------|------|
| **输入** | `config/room_ids.txt`（房间ID列表）、Cookie 认证信息 |
| **行为** | 通过 GitHub Actions 每日 UTC 0:00 触发，使用 aiohttp 并发查询 epay.nju.edu.cn API，并发数 24 |
| **输出** | 原始 JSON 文件：`database/{campus}/{building}/{room_name}/{YYYYMMDD}.json` |
| **边界条件** | 0 个房间 → 跳过不执行；超过 500 房间 → 仍在 30 分钟内完成 |
| **错误处理** | Cookie 过期 → 失败并通知；网络错误 → 重试 3 次；部分失败 → Rollback 整个批次 |

### 3.2 数据聚合模块

| 项目 | 描述 |
|------|------|
| **输入** | 原始 JSON 文件的 `balance_history` |
| **行为** | 读取所有房间的历史数据，计算当前余额、7日/30日均耗、趋势、最大/最小值 |
| **输出** | `{campus}/{building}/summary.json`、`{building}/rooms/{room_name}.json`、`overview.json`（分层聚合） |
| **边界条件** | 无数据房间 → balance_history 为空；房间数 0 → 生成空 summary |
| **错误处理** | JSON 解析失败 → 跳过该文件，记录日志 |

### 3.3 房间发现模块（Scan Mode）

| 项目 | 描述 |
|------|------|
| **输入** | `--scan START END` 区间参数、Cookie |
| **行为** | 遍历指定 ID 区间，按 (校区, 楼栋, 房间名) 去重，输出有效 ID 列表 |
| **输出** | `config/room_ids.txt`（ID 列表，每行一个） |
| **边界条件** | ID 区间为 1-99999；START > END → 报错退出 |
| **错误处理** | 网络错误 → 无限重试（只有"房间不存在"和"解析失败"为永久错误） |
| **增量优化** | 扫描时加载已有 ID 跳过，减少网络请求 |

### 3.4 前端数据服务模块

| 项目 | 描述 |
|------|------|
| **输入** | 静态 JSON 文件（`overview.json`、`summary.json`、`rooms/{name}.json`） |
| **行为** | 按需加载、IndexedDB 缓存、分层聚合（校区→楼栋→房间） |
| **输出** | 结构化数据：`{ totalConsumption, roomCount, roomsWithData, buildings[], dataCompleteness }` |
| **边界条件** | 缓存命中 → 零网络请求；无某日数据 → `dataCompleteness < 100%` |
| **错误处理** | 数据文件不存在 → 返回 `null`；加载失败 → 降级显示 |

### 3.5 耗电分布分析模块

| 项目 | 描述 |
|------|------|
| **输入** | 房间耗电量数组 `[consumption1, consumption2, ...]` |
| **行为** | Sturges 公式分箱 → 直方图计数 → 4种分布拟合（正态/对数正态/Gamma/双峰EM）→ BIC 模型选择 |
| **输出** | `{ bestFit, allFits[], histogram }` + 百分位排名 |
| **边界条件** | <5个数据点 → 不显示分布图；全为 0 → 跳过分布拟合 |
| **错误处理** | EM 算法不收敛 → 回退到初始参数；BIC 为 Infinity → 排除该模型 |

### 3.6 日期完整性模块

| 项目 | 描述 |
|------|------|
| **输入** | 日期类型（`today`/`yesterday`/`week`/`YYYYMMDD`） |
| **行为** | 将日期类型转换为具体日期字符串，按日期精确匹配数据，不再基于数组位置 |
| **输出** | 匹配条目的 consumption 值，或 `null`（无数据） |
| **边界条件** | 指定日期无数据 → 返回 `null`（不 fallback 到最新日期） |
| **错误处理** | 无数据时调用方显示"--"或"暂无该日期数据" |

### 3.7 自动回退日期模块

| 项目 | 描述 |
|------|------|
| **输入** | 校区名、楼栋名（可选）、目标日期 |
| **行为** | 检查目标日期覆盖度（>50%房间有数据），否则向前搜索最多7天找第一个覆盖度>50%的日期 |
| **输出** | `{ date: 'YYYYMMDD', formattedDate: 'MM-DD', coverage: 0.95 }` 或 `null` |
| **边界条件** | 7天内无可用日期 → 返回 `null`；所有房间都有数据 → 不触发回退 |
| **错误处理** | 校区名不存在 → 返回 `null` |

### 3.8 房间 ID 映射模块

| 项目 | 描述 |
|------|------|
| **输入** | `config/room_ids.json`（房间名→ID映射） |
| **行为** | 数据主键从 `room_id` 改为 `room_name`；`room_id` 仅作为 API 查询参数；映射文件记录历史 ID 便于追踪变更 |
| **输出** | `{ campus: { building: { room_name: { current_id, previous_ids[] } } } }` |
| **边界条件** | room_id 被重新分配 → previous_ids 记录旧 ID；新房间 → 新建条目 |
| **错误处理** | 无映射文件 → 正常查询不受影响 |

---

## 四、非功能性需求

### 4.1 性能

| 需求 | 指标 | 测量方式 |
|------|------|---------|
| 每日采集完成时间 | ≤30分钟（500房间，并发24） | GitHub Actions 运行日志 |
| 页面初始加载 | <2秒（宽带）/ <3秒（3G） | Lighthouse / 开发者工具 Network 面板 |
| Summary 文件大小 | <500KB（所有房间） | `wc -c` |
| 月存储增长 | <10MB（压缩归档后） | Git 仓库大小监控 |
| 前端计算耗时 | <100ms（单次分析） | `console.time()` |
| 楼栋并发加载 | O(1) 轮次（30+楼栋并行加载，并发上限6） | Network 面板瀑布图 |

### 4.2 安全

| 需求 | 说明 |
|------|------|
| 凭据保护 | Cookie 仅通过 GitHub Secrets 存储，永不提交到仓库 |
| 隐私保护 | 原始数据 JSON 移除 `学号`、`id`、`宿舍ID` 等敏感字段 |
| 数据校验 | 所有 JSON 文件写入前做 schema 校验 |
| 无后端 | 纯静态前端，无数据库/服务器攻击面 |

### 4.3 可用性

| 需求 | 说明 |
|------|------|
| 浏览器支持 | Chrome、Firefox、Safari、Edge（不要求 IE11） |
| 移动端适配 | CSS 响应式设计，支持手机浏览器 |
| 离线体验 | IndexedDB 缓存二次访问数据，秒开 |
| 数据完整性 | 日期缺失时显示"--"和数据完整度百分比 |
| 自动回退 | 今日数据不可用时自动回退到最近有数据的日期（带 banner 通知） |

### 4.4 可观测性

| 需求 | 说明 |
|------|------|
| 运行日志 | GitHub Actions 记录每次采集的成功/失败计数 |
| 失败通知 | GitHub Actions 自动邮件通知 |
| 数据覆盖度 | 校区页面显示 `数据完整度: X/Y 间 (Z%)` |
| 缓存状态 | 前端显示缓存命中/未命中状态 |
| 异常标记 | 低完整度楼栋用警告色标注（<90% 黄, <50% 红） |

### 4.5 可维护性

| 需求 | 说明 |
|------|------|
| 数据归档 | 每日 JSON 30天后压缩为月度 tar.gz；月度归档 365天后删除 |
| 数据迁移 | `migrate_room_ids.py` 支持从 room_id 主键迁移到 room_name 主键 |
| 映射更新 | `update_mapping.py` 单独维护 room_id 映射关系 |
| 代码结构 | 前端模块化（data-service.js, distribution-analyzer.js 独立文件） |

---

## 五、系统架构

### 5.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  数据采集层    │───>│  数据处理层      │───>│  数据存储层        │  │
│  │              │    │                  │    │                   │  │
│  │ nju_electric_ │    │ aggregate_data.py│    │ database/         │  │
│  │ query.py     │    │ generate_*.py    │    │ ├── 仙林校区/      │  │
│  │ update_mapping│    │ migrate_room_ids │    │ │   └── 19幢/      │  │
│  │ .py          │    │ .py              │    │ │       └── 1613/  │  │
│  └──────┬───────┘    └──────────────────┘    │ │           └── ... │  │
│         │                                     │ └── summaries/     │  │
│         ▼                                     │     ├── overview.  │  │
│  ┌─────────────────────────────────────────┐  │     │   json       │  │
│  │  GitHub Actions                         │  │     ├── campuses/  │  │
│  │  ├── daily-query.yml (每天 UTC 0:00)   │  │     └── ...       │  │
│  │  ├── weekly-room-discovery.yml (每周一) │  │     config/        │  │
│  │  └── manual-trigger (workflow_dispatch) │  │     ├── room_ids   │  │
│  └─────────────────────────────────────────┘  │     │   .txt      │  │
│                                               │     └── room_ids   │  │
│  ┌─────────────────────────────────────────┐  │         .json     │  │
│  │  GitHub Pages (docs/)                   │  └───────────────────┘  │
│  │  ├── index.html (首页导航)              │                         │
│  │  ├── room-view.html (个人房间视角)      │                         │
│  │  ├── building-view.html (楼栋视角)      │                         │
│  │  ├── campus-view.html (校区视角)        │                         │
│  │  ├── js/                               │                         │
│  │  │   ├── data-service.js               │                         │
│  │  │   ├── distribution-analyzer.js       │                         │
│  │  │   └── indexeddb-service.js           │                         │
│  │  └── css/style.css                     │                         │
│  └─────────────────────────────────────────┘                         │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 组件职责

| 组件 | 技术 | 职责 |
|------|------|------|
| **nju_electric_query.py** | Python + aiohttp | 查询 API、扫描 ID、解析 HTML |
| **aggregate_data.py** | Python + asyncio | 聚合原始数据为分层 summaries |
| **generate_index.py** | Python | 生成房间索引文件 |
| **generate_building_details.py** | Python | 生成楼栋详情文件 |
| **update_mapping.py** | Python | 维护 room_id 映射文件 |
| **migrate_room_ids.py** | Python | 一次性数据迁移脚本 |
| **GitHub Actions** | YAML | 自动化编排、定时触发 |
| **data-service.js** | JavaScript ES6+ | 前端数据加载、缓存、分析 |
| **distribution-analyzer.js** | JavaScript ES6+ | 统计分析引擎 |
| **indexeddb-service.js** | JavaScript | IndexedDB 缓存层 |

### 5.3 数据流

```
Collection:  config/room_ids.txt → nju_electric_query.py → Daily JSON files
                ↓
Aggregation: Daily JSON files → aggregate_data.py → Hierarchical summaries
                ↓
Storage:     Summaries cached in IndexedDB (frontend) / JSON files (Git)
                ↓
Visualization: Campus-View ↔ Building-View ↔ Room-View (SPA navigation)
                ↓
Analysis:    DistributionAnalyzer.analyze() → Distribution chart + stats
```

### 5.4 外部依赖

| 依赖 | 用途 | 替代方案 |
|------|------|---------|
| epay.nju.edu.cn | 电费数据源 | 无（数据唯一来源） |
| GitHub Actions | 自动化任务执行 | 自建 CI（需服务器） |
| GitHub Pages | 静态页面托管 | Vercel / Cloudflare Pages |
| GitHub Secrets | 凭据管理 | 无（GitHub 特有） |
| Chart.js 4.x | 图表渲染（折线图、柱状图） | ECharts / D3.js |
| chartjs-plugin-annotation 3.x | 图表标注（均值线、区间框） | 自定义 Canvas 标注 |
| aiohttp / aiofiles | Python 异步 HTTP 和文件 IO | requests + threading |
| IndexedDB | 前端离线缓存 | localStorage / Cache API |

---

## 六、数据模型

### 6.1 主要实体

#### 6.1.1 Daily Electricity Record（原始数据）

```
路径: database/{campus}/{building}/{room_name}/{YYYYMMDD}.json
主键: (campus, building, room_name, date)

{
  "校区": "仙林校区",      // string, 非空
  "楼栋": "19幢",          // string, 非空
  "房间": "1613",          // string, 非空
  "剩余电量": "125.50度",   // string, 格式 "{number}度", number > 0
  "学号": "",              // string, 可选（已去除敏感信息）
  "success": true,         // boolean, 必须为 true
  "timestamp": "2026-05-15T02:00:00Z"  // ISO8601
}
```

#### 6.1.2 Room Summary（房间汇总）

```
路径: database/summaries/campuses/{campus}/buildings/{building}/rooms/{room_name}.json
主键: (campus, building, room_name)

{
  "room_name": "1613",
  "campus": "仙林校区",
  "building": "19幢",
  "current_balance": 125.50,         // float, >= 0
  "balance_history": {
    "20260515": 125.50,              // date → balance
    "20260514": 130.20
  },
  "last_updated": "20260515"
}
```

#### 6.1.3 Building Summary（楼栋汇总）

```
路径: database/summaries/campuses/{campus}/buildings/{building}/summary.json

{
  "building": "19幢",
  "campus": "仙林校区",
  "total_rooms": 50,
  "rooms": {
    "1613": {
      "current_balance": 125.50,
      "last_updated": "20260515"
    }
  }
}
```

#### 6.1.4 Campus Summary（校区汇总）

```
路径: database/summaries/campuses/{campus}/summary.json

{
  "campus": "仙林校区",
  "total_rooms": 800,
  "buildings": {
    "19幢": {
      "total_rooms": 50,
      "roomCount": 48,
      "avg_consumption": 15.3
    }
  }
}
```

#### 6.1.5 Overview（总览）

```
路径: database/summaries/overview.json

{
  "total_rooms": 16644,
  "total_buildings": 106,
  "campuses": {
    "仙林校区": { "total_rooms": 800, "total_buildings": 30 }
  }
}
```

#### 6.1.6 Room ID Mapping（ID 映射）

```
路径: config/room_ids.json

{
  "仙林校区": {
    "19幢": {
      "1613": {
        "current_id": "53463",
        "previous_ids": ["100492"]     // 历史 ID（room_id 被重新分配时记录）
      }
    }
  }
}
```

### 6.2 实体关系

```
Room IDs (config/room_ids.txt)
    │
    │ (每日采集)
    ▼
Daily Electricity Records (database/{...}/{...}/{room}/{date}.json)
    │
    ├────────────────────┐
    │ (聚合)             │ (30天后归档)
    ▼                    ▼
Room/Building/Campus    Monthly Archives (database/archives/YYYY-MM.tar.gz)
Summaries                    │
(database/summaries/)        │ (365天后删除)
    │                        ▼
    │                    (Deletion)
    │
    └────── 前端读取并缓存至 IndexedDB ──────→ 用户可视化
```

### 6.3 约束

| 约束类型 | 规则 |
|---------|------|
| 唯一性 | `(campus, building, room_name)` 唯一标识一个房间 |
| 完整性 | `success` 必须为 `true` 才能写入文件 |
| 原子性 | 每日采集全有或全无（部分失败则 rollback） |
| 一致性 | `current_balance` ≥ `min_30d` ≤ `max_30d` |
| 引用完整性 | `room_ids.json` 的 current_id 必须指向 API 可查询的 ID |
| 历史完整性 | `balance_history` 保留所有日期的余额记录（无上限） |

---

## 七、API 设计

### 7.1 外部 API（epay.nju.edu.cn）

| 端点 | 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|------|
| `/epay/h5/nju/electric/charge` | GET | `id={room_id}` | HTML | 查询房间电费信息 |
| `/epay/h5/nju/login` | POST | `username`, `password`, `captcha` | JSON | 登录获取 Cookie |

### 7.2 内部接口（前端 DataService）

| 方法 | 输入 | 输出 | 缓存 |
|------|------|------|------|
| `getOverview()` | 无 | `{ total_rooms, campuses[] }` | 是 |
| `getCampusStatistics(campus)` | `campus: string` | `{ totalConsumption, buildings[] }` | 是 |
| `getBuildingDetails(campus, building)` | `campus, building` | `{ rooms: { [name]: RoomData } }` | 是 |
| `getRoomHistory(campus, building, room)` | `campus, building, room` | `{ history: [], dailyConsumption, avgConsumption }` | 是 |
| `getBuildingConsumptionRankingFast(campus, building, date)` | `campus, building, date?` | `{ data: [], noDataRooms[], roomsWithData }` | 是 |
| `getCampusConsumption(campus, date, callback)` | `campus, date, progressCb` | `{ totalConsumption, roomCount, buildings[], dataCompleteness }` | 是 |
| `getCampusWideRanking(campus, date)` | `campus, date` | `{ topRooms[], bottomRooms[] }` | 是 |
| `findLatestDateWithData(campus, building?, date)` | `campus, building?, date` | `{ date, formattedDate, coverage } | null` | 否 |
| `calculateBeatPercentage(campus, building, roomName, date)` | `campus, building, room, date` | `{ beatBuildingPercent, beatCampusPercent }` | 是 |

### 7.3 内部接口（DistributionAnalyzer）

| 方法 | 输入 | 输出 |
|------|------|------|
| `buildHistogram(values, binCount?)` | `number[]` | `{ bins, edges, counts, densities, cumulativeCounts, cumulativePercent }` |
| `analyze(values)` | `number[]` | `{ bestFit, allFits[], histogram }` |
| `computePercentile(values, target)` | `number[], number` | `{ percentile, rank, total }` |
| `fitCurveAtBinTops(fit, histogram)` | `fit, histogram` | `number[]`（柱顶拟合值） |
| `getDistributionAnnotations(fit, histogram)` | `fit, histogram` | Chart.js annotation 配置对象 |

### 7.4 错误码

| 场景 | 错误码/状态 | 处理方式 |
|------|-----------|---------|
| Cookie 过期 | `auth_failed` | GitHub Action 失败，邮件通知 |
| 房间不存在 | `room_not_found` | 跳过（scan 模式为永久错误） |
| 网络超时 | `timeout` | 重试（scan 模式无限重试） |
| 数据解析失败 | `parse_error` | 打印 HTML 调试信息，跳过 |
| HTTP 错误 | `http_error` | 重试 |
| 指定日期无数据 | 返回 `null` | 前端显示"--" |
| 数据完整度低 | `<50% roomsWithData` | 自动触发回退日期 |

---

## 八、技术选型与理由

### 8.1 后端 / 数据处理

| 技术 | 选型 | 理由 |
|------|------|------|
| **Python 3.11** | 语言 | 现有脚本已用 Python，生态成熟，aiohttp 异步支持好 |
| **aiohttp** | HTTP 客户端 | 支持高并发查询（24并发），已有脚本使用 |
| **aiofiles** | 异步文件 IO | 与 asyncio 事件循环兼容 |
| **asyncio** | 并发框架 | Python 标准库，无需额外依赖 |
| **GitHub Actions** | CI/CD | 零成本，与 GitHub 仓库深度集成，支持 Schedule 和 Secrets |
| **无后端服务器** | 架构 | 纯静态 + 自动化采集，零运维成本 |

### 8.2 前端

| 技术 | 选型 | 理由 |
|------|------|------|
| **Vanilla JavaScript ES6+** | 核心语言 | 零构建工具，直接浏览器运行，简单可靠 |
| **Chart.js 4.x** | 图表库 | 已经使用，轻量（60KB gzipped），折线/柱状图表现好 |
| **chartjs-plugin-annotation 3.x** | 图表标注 | 支持均值线、区间框、标签等标注功能 |
| **IndexedDB** | 客户端缓存 | 容量大（>localStorage），结构化数据存储，支持异步 |
| **CSS3 + CSS Variables** | 样式 | 原生能力足够，响应式设计，暗色主题支持 |
| **HTML5 History API** | 路由 | SPA 式导航，URL 参数驱动页面状态 |

### 8.3 存储

| 技术 | 选型 | 理由 |
|------|------|------|
| **JSON 文件 + Git** | 主存储 | 版本控制自带备份，支持回滚，零额外成本 |
| **tar.gz 归档** | 冷存储 | 30天后压缩，节省空间，可恢复 |
| **IndexedDB** | 前端缓存 | 二次访问秒开，离线可用 |

### 8.4 设计系统

> **前端采用自定义设计系统**，未使用现成的 Open Design 系统（如 Ant Design / Material Design），原因：
>
> 1. **轻量化**：项目为纯静态 HTML/CSS/JS，无构建工具，引入重量级 UI 框架会增加加载时间和复杂度
> 2. **定制化**：应用为数据监控仪表盘风格，需要深色主题、数据卡片、排行榜等特定组件
> 3. **一致性**：全身定制 CSS Variables 体系（`--fg`, `--bg`, `--surface`, `--accent`, `--radius` 等），全局样式统一
> 4. **品牌调性**：目标用户为大学生，设计风格为科技感 + 可读性 + 趣味性，与现成设计系统的企业风格不匹配
>
> 如果未来需要引入设计系统，推荐 **Ant Design** 的 Dashboard 变体，原因：
> - 数据可视化场景支持好
> - 暗色主题成熟
> - 移动端适配完善

### 8.5 部署

| 层 | 平台 | 理由 |
|----|------|------|
| **静态页面** | GitHub Pages | 零成本，支持自定义域名（njupower.top），CDN 加速 |
| **自动化任务** | GitHub Actions | 零成本，2000分钟/月免费额度，支持 Secrets 管理 |
| **域名** | 自定义域名 | njupower.top 绑定了 GitHub Pages |

---

## 九、验收标准

### 9.1 数据采集

| 标准 ID | 描述 | 验证方法 |
|---------|------|---------|
| AC-001 | GitHub Action 每日 UTC 0:00 自动触发 | 检查 Actions 运行记录 |
| AC-002 | 500 个房间采集在 30 分钟内完成 | Actions 日志耗时 |
| AC-003 | Cookie 过期时失败并邮件通知 | 手动过期的 Cookie |
| AC-004 | 任何房间失败则 rollback 全批次 | 检查数据库目录无部分写入 |
| AC-005 | 原始数据无学号/敏感信息 | 检查 JSON 内容 |
| AC-006 | 网络错误重试 3 次后仍失败则 rollback | 模拟网络断连 |
| AC-007 | 扫描模式跳过已有 ID | 首次和二次扫描的 count 差异 |
| AC-008 | 扫描模式对网络错误无限重试 | 模拟网络波动 |

### 9.2 数据存储

| 标准 ID | 描述 | 验证方法 |
|---------|------|---------|
| AC-009 | 30天前的数据自动压缩为月度 tar.gz | 检查 archives 目录 |
| AC-010 | 月度归档包含 manifest.json（checksum） | 检查归档内容 |
| AC-011 | 365天前的归档自动删除 | 检查归档目录日期 |
| AC-012 | Summary 文件 <500KB | `wc -c` 测量 |
| AC-013 | 月存储增长 <10MB | Git 仓库大小监控 |

### 9.3 前端功能

| 标准 ID | 描述 | 验证方法 |
|---------|------|---------|
| AC-014 | 校区页面展示数据完整度 X/Y (Z%) | 查看"数据完整度"提示 |
| AC-015 | 低完整度楼栋（<90%）有警告色标注 | 查看楼栋卡片颜色 |
| AC-016 | 指定日期无数据时显示"--"而非错误数据 | 选择无数据日期 |
| AC-017 | 今日数据不可用时自动回退到最近有数据日期 | 选择今日（无数据时） |
| AC-018 | 回退时显示可关闭的 banner 通知 | 检查 banner 组件 |
| AC-019 | 楼栋排行榜末尾显示"暂无数据"房间 | 选择部分房间无数据的日期 |
| AC-020 | 分布图表显示直方图 + 拟合曲线 | 打开楼栋分布图 |
| AC-021 | 分布图表 hover 显示累计统计 | hover 条形柱 |
| AC-022 | 分布图表点击柱显示区间详情 | 点击条形柱 |
| AC-023 | 分布图自动选择最优分布类型（BIC） | 查看分布类型标签 |
| AC-024 | 用户房间在分布图上用竖线标记 + 百分位 | 配置用户房间后查看 |
| AC-025 | 正确显示楼栋内排名百分比 | room-view.html 位次卡片 |
| AC-026 | 30+楼栋并行加载（非串行） | 观察 Network 瀑布图 |
| AC-027 | 第二次访问秒开（IndexedDB 缓存） | 清缓存后首次 vs 二次 |

### 9.4 数据完整性

| 标准 ID | 描述 | 验证方法 |
|---------|------|------|
| AC-028 | `_calculateConsumptionFromHistory` 精确匹配日期 | 测试 today/yesterday/week |
| AC-029 | 不基于数组位置取最新数据 | 提供有缺失日期的历史数据 |
| AC-030 | 指定日期无数据返回 `null`，不 fallback | 选择未来日期 |
| AC-031 | data-service 无 fallback 逻辑 | 代码审查 |

### 9.5 迁移验收

| 标准 ID | 描述 | 验证方法 |
|---------|------|------|
| AC-032 | 目录从 `{room}-{id}` 改为 `{room}` | `ls` 检查目录名 |
| AC-033 | JSON 无 `id`/`宿舍ID` 字段 | 检查原始数据 |
| AC-034 | Summary key 从 room_id 改为 room_name | 检查 summary.json |
| AC-035 | `config/room_ids.json` 包含正确映射 | 检查映射文件 |
| AC-036 | 同名房间数据正确合并（按日期去重） | 检查 balance_history |

---

## 十、风险与未决问题

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓释措施 |
|------|------|------|---------|
| **Cookie 频繁过期** | 采集完全中断 | 中 | 自动登录脚本 + 邮件通知；建立了手动更新流程 |
| **epay 网站改版** | 解析逻辑失效 | 中 | parse_html 隔离了解析逻辑，改版时只需修改该函数 |
| **GitHub Actions 政策变更** | 自动化失效 | 低 | 工作流 YAML 定义保持简单，可迁移至其他 CI |
| **数据量超限** | 仓库过大 | 中 | 30天归档 + 365天删除策略 |
| **GitHub Pages 限制** | 无法部署 | 低 | 单文件<100MB，总仓库<1GB 限制不易触发 |
| **前端性能瓶颈（16K+房间）** | 加载缓慢 | 中 | 分层聚合 + IndexedDB 缓存 + 渐进加载 |
| **room_id 重新分配** | 数据错乱 | 中 | 映射文件记录历史 ID，migration 脚本合并数据 |
| **EM 算法不收敛** | 分布拟合失败 | 低 | 限制最大迭代次数 + 回退到简单分布 |

### 10.2 业务风险

| 风险 | 影响 | 概率 | 缓释措施 |
|------|------|------|---------|
| **用户隐私泄露** | 法律/声誉 | 低 | 严格去除学号，仅保留电量数据 |
| **数据错误导用户** | 信任下降 | 中 | 数据校验 + 完整度标注 + 数据更新时间标注 |
| **系统无人维护** | 逐渐失效 | 中 | 详细文档 + 自动化测试 + 简化运维（只更新 Cookie） |
| **用户不理解数据** | 低使用率 | 中 | 耗电类比（iPhone充电等）使数据易懂 |

### 10.3 未决问题

| 问题 | 状态 | 备注 |
|------|------|------|
| Cookie 准确有效期多长？ | 待验证 | 需要长期观察，目前假设≥7天 |
| epay API 是否有频率限制？ | 待验证 | 目前 24 并发工作正常，批量扫描时可能需要降低并发 |
| 是否需要支持用户登录？ | 延期 | 当前无用户系统，所有房间数据公开可见 |
| 是否需要 WebSocket 实时推送？ | 延期 | 目前每日采集一次，无需实时更新 |
| 是否需要多语言支持？ | 否 | 目标用户为南大学生，仅需中文 |
| 是否需要导出功能？ | 延期 | CSV/Excel 导出为未来扩展项 |
| index.html（首页导航）与各视图的集成方式？ | 待确认 | 目前是独立页面 + URL 参数导航 |
| ECharts 是否已实际集成？ | 待确认 | spec 中提及但前端实际使用了 Chart.js + distribution-analyzer.js |

---

## 十一、项目结构与文件索引

```
./
├── nju_electric_query.py          # 核心采集脚本（查询 + 扫描模式）
├── list_room_ids.py               # 楼栋房间统计脚本
├── scripts/
│   ├── aggregate_data.py          # 数据聚合（生成分层 summaries）
│   ├── generate_index.py          # 房间索引生成
│   ├── generate_building_details.py  # 楼栋详情生成
│   ├── extract_room_ids.py        # ID 提取（优先从映射文件）
│   ├── update_mapping.py          # Room ID 映射更新
│   ├── migrate_room_ids.py        # 数据迁移（room_id → room_name）
│   ├── query_by_name.py           # 按房间名查询
│   ├── query_by_room.py           # 按房间号查询
│   ├── rollback_failed_run.py     # 回滚失败批次
│   └── serve_docs.py              # 本地文档服务器
├── config/
│   ├── room_ids.txt               # 采集 ID 列表
│   └── room_ids.json              # 房间名→ID 映射 + 历史
├── database/                       # 数据目录
│   ├── {campus}/{building}/{room}/{date}.json
│   ├── summaries/overview.json
│   ├── summaries/campuses/{campus}/summary.json
│   ├── summaries/campuses/{campus}/buildings/{building}/summary.json
│   ├── summaries/campuses/{campus}/buildings/{building}/rooms/{room}.json
│   └── archives/{YYYY-MM}.tar.gz
├── docs/                           # 前端静态页面
│   ├── index.html                  # 首页导航
│   ├── room-view.html              # 个人房间视角
│   ├── building-view.html          # 楼栋视角
│   ├── campus-view.html            # 校区视角
│   ├── css/style.css               # 全局样式
│   └── js/
│       ├── data-service.js         # 数据服务层
│       ├── distribution-analyzer.js # 统计分析引擎
│       └── indexeddb-service.js    # IndexedDB 缓存
├── .github/workflows/
│   ├── daily-query.yml             # 每日采集（UTC 0:00）
│   └── weekly-room-discovery.yml   # 每周扫描（周一）
├── specs/                           # 原始规格文档
│   ├── 001-daily-data-pipeline/
│   │   ├── spec.md                 # 原始 pipeline spec
│   │   ├── data-model.md           # 数据模型
│   │   ├── plan.md / tasks.md      # 实施计划
│   │   └── ...
│   └── 002-data-analysis-features/
│       ├── spec.md                 # 分析功能 spec
│       ├── plan.md / tasks.md      # 实施计划
│       └── ...
├── docs/superpowers/specs/          # 后续设计文档
│   ├── 2026-05-27-room-id-refactor-design.md
│   ├── 2026-05-28-parallel-building-loading-design.md
│   └── 2026-05-30-date-data-integrity-design.md
├── docs/superpowers/plans/          # 后续实施计划
│   ├── 2026-05-27-room-id-refactor.md
│   ├── 2026-05-28-distribution-chart.md
│   ├── 2026-05-28-layout-and-annotations.md
│   ├── 2026-05-28-parallel-building-loading.md
│   ├── 2026-05-29-date-data-integrity.md
│   ├── 2026-05-30-auto-fallback-date.md
│   ├── 2026-05-30-room-discovery.md
│   ├── 2026-05-30-scan-retry.md
│   └── 2026-05-31-load-existing-ids.md
├── AGENTS.md                        # Agent 开发指南
├── CLAUDE.md                        # Claude 交互上下文
└── README.md                        # 项目介绍
```

---

## 附录 A：功能与实现对照

| 功能 | 对应章节 | 实现状态 | 关键文件 |
|------|---------|---------|---------|
| 每日自动采集 | 3.1 | ✅ 已完成 | `nju_electric_query.py`, `.github/workflows/daily-query.yml` |
| 数据聚合 | 3.2 | ✅ 已完成 | `scripts/aggregate_data.py` |
| 房间扫描发现 | 3.3 | ✅ 已完成 | `nju_electric_query.py --scan`, `.github/workflows/weekly-room-discovery.yml` |
| ID 映射管理 | 3.8 | ✅ 已完成 | `config/room_ids.json`, `scripts/update_mapping.py` |
| 数据迁移 | — | ✅ 已完成 | `scripts/migrate_room_ids.py` |
| 数据完整性 | 3.6 | ✅ 已完成 | `docs/js/data-service.js` |
| 自动日期回退 | 3.7 | ✅ 已完成 | `docs/js/data-service.js`, `docs/building-view.html`, `docs/campus-view.html` |
| 耗电分布分析 | 3.5 | ✅ 已完成 | `docs/js/distribution-analyzer.js`, `docs/building-view.html` |
| 并行楼栋加载 | 4.1 | ✅ 已完成 | `docs/js/data-service.js` |
| 布局与标注 | — | ✅ 已完成 | `docs/js/distribution-analyzer.js`, `docs/building-view.html` |
| 智能预警系统 | US1 | ⬜ Pending（spec 定义） | 待实现 |
| 楼栋排行榜 | US2 | ⬜ Pending（spec 定义） | 待实现 |
| 楼层热力图 | US3 | ⬜ Pending（spec 定义） | 待实现 |
| 多房间对比 | US5 | ⬜ Pending（spec 定义） | 待实现 |
| 充值建议 | US6 | ⬜ Pending（spec 定义） | 待实现 |
| 模式识别 | US7 | ⬜ Pending（spec 定义） | 待实现 |
| 校区仪表盘 | US9 | ⬜ Pending（spec 定义） | 待实现 |
| 成本预测 | US10 | ⬜ Pending（spec 定义） | 待实现 |
| 预警订阅 | US11 | ⬜ Pending（spec 定义） | 待实现 |
| 成就系统 | US12 | ⬜ Pending（spec 定义） | 待实现 |

## 附录 B：关键决策记录

| 决策 ID | 日期 | 决定 | 理由 |
|--------|------|------|------|
| ADR-001 | 2026-05-15 | 使用 JSON 文件 + Git 而非数据库 | 零运维成本，版本控制天然备份 |
| ADR-002 | 2026-05-15 | 弃用 pandas/numpy，纯 Python + asyncio | 降低依赖复杂度，数据量级不需要 DataFrame |
| ADR-003 | 2026-05-17 | 前端无框架（Vanilla JS） | 零构建，直接浏览器运行，简单可靠 |
| ADR-004 | 2026-05-27 | room_name 取代 room_id 作为主键 | room_id 可能被重新分配导致数据错乱 |
| ADR-005 | 2026-05-28 | 使用 Chart.js + annotation plugin 而非 ECharts | ECharts 体积大（300KB），现有需求 Chart.js 满足 |
| ADR-006 | 2026-05-29 | 严格日期匹配，移除所有 fallback 逻辑 | 避免误导用户显示非指定日期数据 |
| ADR-007 | 2026-05-30 | BIC 而非 AIC 选择分布模型 | BIC 对参数数量惩罚更强，避免过拟合 |
| ADR-008 | 2026-05-30 | 自动回退日期（覆盖度>50%） | 今日数据不可用时优化体验，同时保持数据诚实 |

---

---

## 附录 C：设计宪法（Constitution）

摘自 `.specify/memory/constitution.md` v1.1.0

| 原则 | 核心要求 |
|------|---------|
| **I. 数据-业务分离** | 采集/处理/展示严格分层，独立部署和测试 |
| **II. 静态前端架构** | 纯 HTML/CSS/JS，无服务器依赖，file:// 协议可用 |
| **III. 测试驱动开发** | 非 negotiable，先测试后代码，Red-Green-Refactor |
| **IV. 数据质量与完整性** | 入口校验、缺失数据明确处理、输出含数据来源 |
| **V. 渐进增强** | 先可视化后预测、简单图表先于复杂分析、不阻塞依赖 |
| **VI. 性能优先** | 初始加载 <2s (3G)、交互 <100ms、大数据集懒加载/分页 |
| **VII. 用户行为驱动分解** | 复杂功能按工作流拆分，预计算 vs 按需计算分离 |
| **VIII. 高效前端架构** | DOM 批量操作、事件防抖、计算缓存、图表懒加载 |

## 附录 D：技术研究记录

摘自 `specs/001-daily-data-pipeline/research.md`，解决 6 个技术未知项的决策记录。

| 研究主题 | 决策 | 关键收益 |
|---------|------|---------|
| GitHub Actions 定时任务 | Cron + workflow_dispatch | 自动 + 手动控制 |
| 原子文件操作 | 临时目录 → 原子 move | 全有或全无一致性 |
| 时序数据聚合 | 增量滚动窗口 | 高效更新 |
| 月度归档格式 | tar.gz + 目录结构 | 标准、可压缩、可浏览 |
| Secrets 管理 | 单 JSON Secret | 简单、安全 |
| Cookie 验证 | 预检测试查询 | 快速失败、清晰错误 |

## 附录 E：数据契约（JSON Schema）

摘自 `specs/001-daily-data-pipeline/contracts/`

| Schema | 文件位置 | 验证对象 |
|--------|---------|---------|
| **daily-record.schema.json** | `contracts/daily-record.schema.json` | 每日原始数据 JSON，8 个必填字段（id, 校区, 楼栋, 房间, 宿舍ID, 剩余电量, timestamp, success） |
| **summary.schema.json** | `contracts/summary.schema.json` | 聚合摘要 JSON，4 个必填字段（generated_at, total_rooms, query_success_rate, rooms），room_summary 含 10 个必填统计字段 |
| **archive-manifest.schema.json** | `contracts/archive-manifest.schema.json` | 归档清单 JSON，5 个必填字段（archive_month, created_at, total_files, total_rooms, checksum:sha256） |

所有 schema 使用 `additionalProperties: false` 确保严格验证。

## 附录 F：从 git 历史恢复的已删除文档

以下文档在 git 历史中被删除，但通过提交 `b2e05bc31b` 恢复。它们记录了项目早期的架构决策和性能分析。

### F.1 并发数评估报告（concurrency-analysis.md）

| 并发数 | 预计耗时（60K房间） | 风险评估 |
|--------|-------------------|---------|
| 10 | 2 小时 | 低 |
| 20 | 1 小时 | 中 |
| **30（推荐）** | **50 分钟** | **中** |
| 50 | 30 分钟 | 高 |

**最终建议**: 并发数 30，超时 120 分钟，重试 3 次，指数退避。

### F.2 大规模部署总结（deployment-summary.md）

| 指标 | 值 |
|------|-----|
| 月成本（公开仓库） | **$0** ✅ |
| 查询目标 | 60,000 房间/天 |
| 数据量 | ~120MB/月（压缩后） |
| 维护时间 | ~20 分钟/月 |
| 成功率目标 | >95% |

### F.3 GitHub Actions 长期使用指南（github-actions-guide.md）

**关键结论**: 公开仓库 = 完全免费 + 无限制。私有仓库需 ~$252-258/月。

| 仓库类型 | 免费分钟/月 | 适合本项目 |
|---------|------------|----------|
| **公开仓库** | **∞ 无限制** | **✅ 强烈推荐** |
| 私有仓库 (Free) | 2,000 分钟 | ❌ 不够用 |
| 私有仓库 (Pro) | 3,000 分钟 | ❌ 不够用 |

## 附录 G：测试验证报告

摘自 `docs/test-reports/2026-05-18.md`（已删除的测试报告，从 git 提交 `84103762eb` 恢复）。

### 2026-05-18 测试结果

| 测试套件 | 测试数 | 通过 | 失败 |
|---------|--------|------|------|
| Suite 1: 首页 | 4 | 4 | 0 |
| Suite 2: 预警中心 | 3 | 3 | 0 |
| Suite 3: 排行榜 | 4 | 4 | 0 |
| Suite 4: 仪表盘 | 2 | 2 | 0 |
| Suite 5: 导航 | 2 | 2 | 0 |
| **合计** | **16** | **16** | **0** |

**环境**: Chromium (Playwright MCP), URL: http://localhost:8000/index.html  
**期间修复**: `docs/js/utils/analytics.js`（null 字节损坏）、`docs/js/utils/notifications.js`（JSON.parse 语法错误）

---

> **文档版本**: 3.0（完整版）  
> **最后更新**: 2026-06-01  
> **来源**: 由 git 历史中的 30+ 份文档汇总而成，包括 specs/、docs/superpowers/specs/、docs/superpowers/plans/、.opencode/plans/、.specify/memory/、docs/（含已删除的 concurrency-analysis.md、deployment-summary.md、github-actions-guide.md），以及从 njupower.top 验证的已部署页面结构和功能

---

# 后续功能 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement remaining 6 user stories (US3 Floor Heatmap, US5 Multi-Room Comparison, US7 Pattern Recognition, US10 Cost Prediction, US11 Alert Subscription, US12 Achievement System) as per the SPEC above.

**Architecture:** All features are pure client-side enhancements. US3 creates a new heatmap visualization module on building-view.html. US5 creates a new comparison page. US7/US10 extend room-view.html with new analysis sections. US11/US12 build on localStorage + IndexedDB for persistence. No backend changes needed.

**Tech Stack:** Chart.js 4.4.0 (existing), chartjs-plugin-annotation 3.0.1 (existing), Vanilla JavaScript ES6+, IndexedDB (existing), localStorage.

---

## File Structure

| File | Responsibility | Plan |
|------|---------------|------|
| `docs/js/heatmap-view.js` | **Create** — Floor heatmap rendering engine | US3 |
| `docs/building-view.html` | **Modify** — Add heatmap section + JS integration | US3 |
| `docs/comparison-view.html` | **Create** — Multi-room trend comparison page | US5 |
| `docs/js/comparison-service.js` | **Create** — Comparison data loading + chart rendering | US5 |
| `docs/js/pattern-analyzer.js` | **Create** — Weekday/weekend, anomaly detection, room labeling | US7 |
| `docs/room-view.html` | **Modify** — Add pattern display section + cost prediction card | US7, US10 |
| `docs/js/alert-service.js` | **Create** — Alert subscription + detection + notification | US11 |
| `docs/js/achievement-system.js` | **Create** — Badge/challenge engine | US12 |
| `docs/index.html` | **Modify** — Add alert/achievement dashboard sections | US11, US12 |

---

## Chunk 1: 楼层热力图 — Floor Heatmap (US3)

**Spec ref:** US3 — P1, no dependencies.

**Approach:** Build a 2D grid heatmap where each cell represents a room, arranged by floor (rows) and room number (columns). Green→yellow→red mapping based on consumption percentiles. New `heatmap-view.js` module handles rendering. Heatmap section added to building-view.html after the distribution chart.

### Task 1.1: Create heatmap-view.js

**Files:**
- Create: `docs/js/heatmap-view.js`

- [ ] **Step 1: Write the file with core heatmap rendering**

```javascript
/**
 * 楼层耗电热力图
 * 2D 网格热力图，每格代表一个房间，按楼层排列
 */
const HeatmapView = {

  // 能耗色阶（绿 → 黄 → 红）
  COLOR_SCALE: [
    { percent: 0.0, color: '#d1fae5' },  // 深绿
    { percent: 0.2, color: '#a7f3d0' },
    { percent: 0.4, color: '#6ee7b7' },
    { percent: 0.6, color: '#fde68a' },  // 黄
    { percent: 0.8, color: '#fca5a5' },  // 橙红
    { percent: 1.0, color: '#ef4444' },  // 红
  ],

  /**
   * 从房间名提取楼层号
   * 规则: 房间号首位数字为楼层（如 "910" → 9, "4A211" → 4）
   */
  extractFloor(roomName) {
    if (!roomName || typeof roomName !== 'string') return null;
    const match = roomName.match(/^(\d)/);
    return match ? parseInt(match[1], 10) : null;
  },

  /**
   * 排序房间号用于网格排列（按数字部分排序）
   */
  sortRooms(roomNames) {
    return [...roomNames].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  },

  /**
   * 构建楼层分组数据
   * @param {Array<{roomName: string, consumption: number}>} rankings
   * @returns {Map<number, {rooms: string[], consumption: number, avgConsumption: number}>}
   */
  groupByFloor(rankings) {
    const floors = new Map();
    for (const item of rankings) {
      const floor = this.extractFloor(item.roomName);
      if (floor === null) continue;
      if (!floors.has(floor)) {
        floors.set(floor, { rooms: [], totalConsumption: 0 });
      }
      const f = floors.get(floor);
      f.rooms.push(item.roomName);
      f.totalConsumption += item.consumption || 0;
    }
    // 计算楼层均耗
    for (const [floor, data] of floors) {
      data.avgConsumption = data.rooms.length > 0
        ? data.totalConsumption / data.rooms.length
        : 0;
    }
    return floors;
  },

  /**
   * 获取能耗百分位的颜色
   */
  getColorForPercentile(percentile) {
    for (const step of this.COLOR_SCALE) {
      if (percentile <= step.percent) return step.color;
    }
    return this.COLOR_SCALE[this.COLOR_SCALE.length - 1].color;
  },

  /**
   * 渲染热力图
   * @param {HTMLElement} container - 挂载容器
   * @param {Array<{roomName: string, consumption: number}>} rankings - 房间排行数据
   * @param {string} [userRoom] - 用户房间名（可选，高亮用户房间）
   */
  render(container, rankings, userRoom) {
    if (!container) return;
    if (!rankings || rankings.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">暂无数据</div>';
      return;
    }

    const floors = this.groupByFloor(rankings);
    if (floors.size === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">无法识别楼层信息</div>';
      return;
    }

    // 计算最大耗电量用于百分位
    const consumptions = rankings.map(r => r.consumption).filter(v => v > 0);
    const sortedCons = [...consumptions].sort((a, b) => a - b);

    // 构建最大值边界（排除极端值）
    const p95 = sortedCons[Math.floor(sortedCons.length * 0.95)] || sortedCons[sortedCons.length - 1] || 1;

    // 构建房间耗电量映射
    const consumptionMap = new Map();
    for (const r of rankings) {
      consumptionMap.set(r.roomName, r.consumption);
    }

    // 楼层排序（从高到低）
    const sortedFloors = [...floors.keys()].sort((a, b) => b - a);

    let html = '<div class="heatmap-grid">';

    for (const floor of sortedFloors) {
      const floorData = floors.get(floor);
      const sortedRooms = this.sortRooms(floorData.rooms);

      html += `<div class="heatmap-row">`;
      html += `<div class="heatmap-floor-label">${floor} 楼</div>`;
      html += `<div class="heatmap-rooms">`;

      for (const roomName of sortedRooms) {
        const consumption = consumptionMap.get(roomName) || 0;
        const percentile = Math.min(consumption / p95, 1);
        const color = this.getColorForPercentile(percentile);
        const isUser = roomName === userRoom;

        html += `<div class="heatmap-cell${isUser ? ' user-room' : ''}" 
          style="background: ${color};"
          data-room="${roomName}"
          data-consumption="${consumption.toFixed(2)}"
          data-floor="${floor}"
          title="${roomName}: ${consumption.toFixed(2)} 度${isUser ? ' (您的房间)' : ''}">
          <span class="heatmap-room-name">${roomName}</span>
        </div>`;
      }

      html += '</div></div>';
    }

    html += '</div>';

    // 统计信息
    const totalRooms = rankings.length;
    const avgConsumption = consumptions.reduce((s, v) => s + v, 0) / (consumptions.length || 1);

    html += `<div class="heatmap-stats">
      <span>共 ${floors.size} 层 · ${totalRooms} 间 · 均耗 ${avgConsumption.toFixed(2)} 度/间</span>
    </div>`;

    container.innerHTML = html;

    // 绑定点击事件
    container.querySelectorAll('.heatmap-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const room = cell.dataset.room;
        const consumption = cell.dataset.consumption;
        const floor = cell.dataset.floor;
        const detail = container.querySelector('.heatmap-detail') || document.createElement('div');
        detail.className = 'heatmap-detail';
        detail.innerHTML = `<strong>${room}</strong> (${floor}楼) · 日耗电 <strong>${consumption}</strong> 度`;
        detail.style.cssText = 'margin-top:12px;padding:12px;background:color-mix(in oklch, var(--accent) 8%, transparent);border-radius:8px;font-size:14px;text-align:center;';
        container.appendChild(detail);
      });
    });

    return { floors: sortedFloors.length, rooms: totalRooms, avgConsumption };
  }
};
```

- [ ] **Step 2: Verify file was created**

Read the file and confirm `HeatmapView` object with all methods exists.

- [ ] **Step 3: Commit**

```bash
git add docs/js/heatmap-view.js
git commit -m "feat: add HeatmapView module for floor electricity heatmap"
```

---

### Task 1.2: Add heatmap HTML and CSS to building-view.html

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add heatmap CSS**

Insert before `</style>`:

```css
    /* 楼层热力图 */
    .heatmap-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 24px;
    }
    .heatmap-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .heatmap-title {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }
    .heatmap-subtitle {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }
    .heatmap-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .heatmap-legend-bar {
      display: flex;
      height: 12px;
      border-radius: 6px;
      overflow: hidden;
      width: 120px;
    }
    .heatmap-legend-bar span {
      flex: 1;
    }
    .heatmap-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .heatmap-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .heatmap-floor-label {
      width: 40px;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-align: right;
      flex-shrink: 0;
    }
    .heatmap-rooms {
      display: flex;
      gap: 3px;
      flex-wrap: wrap;
    }
    .heatmap-cell {
      width: 48px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      font-size: 10px;
      font-weight: 500;
      color: #1e293b;
      position: relative;
    }
    .heatmap-cell:hover {
      transform: scale(1.15);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 2;
    }
    .heatmap-cell.user-room {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
    .heatmap-cell .heatmap-room-name {
      pointer-events: none;
    }
    .heatmap-stats {
      margin-top: 16px;
      font-size: 13px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 640px) {
      .heatmap-cell { width: 36px; height: 28px; font-size: 8px; }
      .heatmap-floor-label { width: 30px; font-size: 10px; }
    }
```

- [ ] **Step 2: Add heatmap card HTML**

Insert after the dist-card `</div>` closing tag, before `</main>`:

```html
    <!-- 楼层热力图 -->
    <div class="heatmap-card" id="heatmap-card" style="display: none;">
      <div class="heatmap-header">
        <div>
          <h2 class="heatmap-title">楼层耗电热力图</h2>
          <div class="heatmap-subtitle" id="heatmap-subtitle">各楼层房间耗电分布</div>
        </div>
        <div class="heatmap-legend">
          <span>低</span>
          <div class="heatmap-legend-bar">
            <span style="background: #d1fae5;"></span>
            <span style="background: #6ee7b7;"></span>
            <span style="background: #fde68a;"></span>
            <span style="background: #fca5a5;"></span>
            <span style="background: #ef4444;"></span>
          </div>
          <span>高</span>
        </div>
      </div>
      <div id="heatmap-container"></div>
    </div>
```

- [ ] **Step 3: Add script tag**

Insert after `distribution-analyzer.js` script tag:

```html
<script src="js/heatmap-view.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: add heatmap card HTML and CSS to building view"
```

---

### Task 1.3: Integrate heatmap into building-view data flow

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add heatmap rendering function**

Insert inside the `<script>` tag, after `hideDistributionChart` function:

```javascript

    // ==================== 楼层热力图 ====================

    function renderHeatmap(rankings) {
      const card = document.getElementById('heatmap-card');
      if (!rankings || rankings.length < 5) {
        card.style.display = 'none';
        return;
      }
      card.style.display = 'block';
      document.getElementById('heatmap-subtitle').textContent =
        `基于 ${rankings.length} 个房间的${getDateDisplayText(state.date)}数据`;

      const container = document.getElementById('heatmap-container');
      const userRoom = state.userConfig && state.userConfig.building === state.building
        ? state.userConfig.roomName : null;
      HeatmapView.render(container, rankings, userRoom);
    }

    function hideHeatmap() {
      document.getElementById('heatmap-card').style.display = 'none';
    }
```

- [ ] **Step 2: Wire into displayRanking**

In `displayRanking`, after `renderDistributionChart(rankings);`:

```javascript
      // 渲染楼层热力图
      renderHeatmap(rankings);
```

- [ ] **Step 3: Wire into cleanup functions**

In `hideBuildingTrend`:
```javascript
      hideDistributionChart();
      hideHeatmap();
```

In `showNoDataState` and `showEmptyState`:
```javascript
      hideHeatmap();
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: integrate floor heatmap into building view data flow"
```

---

### Task 1.4: Test the heatmap

**Files:**
- Tests: `tests/`

- [ ] **Step 1: Start local server**

```bash
cd docs && python3 -m http.server 8000
```

- [ ] **Step 2: Manual verification**

Open http://localhost:8000/building-view.html and:
1. Select a campus+building → heatmap card appears below distribution chart
2. Verify floors are displayed from top to bottom
3. Verify room colors reflect consumption percentiles
4. Hover a room cell → scale effect
5. Click a room cell → detail text appears below
6. If user room is configured and in this building → accent outline
7. Resize to mobile width → cells shrink

- [ ] **Step 3: Fix any issues, then commit**

```bash
git add -u
git commit -m "fix: polish heatmap rendering and edge cases"
```

---

## Chunk 2: 多房间趋势对比 — Multi-Room Comparison (US5)

**Spec ref:** US5 — P2, depends on US2 (reuse ranking UI patterns).

**Approach:** Create standalone comparison page `comparison-view.html`. User selects 2-5 rooms, line chart shows consumption trend overlay. New `comparison-service.js` handles multi-room data loading + chart rendering.

### Task 2.1: Create comparison-service.js

**Files:**
- Create: `docs/js/comparison-service.js`

- [ ] **Step 1: Write core comparison module**

```javascript
/**
 * 多房间趋势对比服务
 * 支持选择2-5个房间，叠加显示耗电趋势
 */
const ComparisonService = {

  MAX_ROOMS: 5,
  MIN_ROOMS: 2,

  COLORS: [
    'oklch(55% 0.20 25)',    // 红
    'oklch(55% 0.18 120)',   // 绿
    'oklch(55% 0.18 260)',   // 蓝
    'oklch(55% 0.18 35)',    // 橙
    'oklch(50% 0.12 300)',   // 紫
  ],

  /**
   * 加载多个房间的历史数据
   * @param {Array<{campus: string, building: string, room: string}>} rooms
   * @returns {Promise<Array<{room: string, campus: string, building: string, data: Array<{date: string, balance: number, consumption: number}>, error?: string}>>}
   */
  async loadRooms(rooms) {
    const results = [];
    for (const room of rooms) {
      try {
        const data = await DataService.getRoomHistory(room.campus, room.building, room.room);
        results.push({
          room: room.room,
          campus: room.campus,
          building: room.building,
          data: data.history || []
        });
      } catch (e) {
        results.push({
          room: room.room,
          campus: room.campus,
          building: room.building,
          data: [],
          error: '加载失败: ' + e.message
        });
      }
    }
    return results;
  },

  /**
   * 渲染对比图表
   * @param {HTMLCanvasElement} canvas
   * @param {Array} roomDataList - loadRooms 的返回值
   * @param {Chart|null} existingChart - 已有的 Chart 实例（用于销毁）
   * @returns {Chart}
   */
  renderChart(canvas, roomDataList, existingChart) {
    if (existingChart) {
      existingChart.destroy();
    }

    // 收集所有日期，对齐时间轴
    const allDates = new Set();
    for (const rd of roomDataList) {
      for (const item of rd.data || []) {
        if (item.date) allDates.add(item.date);
      }
    }
    const sortedDates = [...allDates].sort();

    // 构建数据集
    const datasets = roomDataList.map((rd, i) => {
      const dateMap = new Map();
      for (const item of rd.data || []) {
        if (item.date && item.consumption !== undefined) {
          dateMap.set(item.date, item.consumption);
        }
      }
      return {
        label: rd.room,
        data: sortedDates.map(d => dateMap.has(d) ? dateMap.get(d) : null),
        borderColor: this.COLORS[i % this.COLORS.length],
        backgroundColor: this.COLORS[i % this.COLORS.length] + '20',
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: false,
        tension: 0.2,
        fill: false,
      };
    });

    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: sortedDates.map(d => `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)}`),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { size: 12 },
              boxWidth: 14,
              padding: 16,
              usePointStyle: true,
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f1f5f9',
            bodyColor: '#f1f5f9',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 11 }, maxTicksLimit: 15 }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#334155', drawBorder: false },
            ticks: { color: '#94a3b8', font: { size: 11 } },
            title: {
              display: true,
              text: '日耗电量 (度)',
              color: '#94a3b8',
              font: { size: 12 }
            }
          }
        }
      }
    });
  },

  /**
   * 计算对比统计数据
   */
  computeStats(roomDataList) {
    return roomDataList.map(rd => {
      const consumptions = (rd.data || [])
        .map(d => d.consumption)
        .filter(v => v != null && v > 0);
      const avg = consumptions.length > 0
        ? consumptions.reduce((s, v) => s + v, 0) / consumptions.length
        : 0;
      return {
        room: rd.room,
        avgConsumption: avg,
        maxConsumption: Math.max(...consumptions, 0),
        minConsumption: Math.min(...consumptions, Infinity),
        dataPoints: consumptions.length,
        latestBalance: rd.data && rd.data.length > 0
          ? rd.data[rd.data.length - 1].balance || 0
          : 0
      };
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/comparison-service.js
git commit -m "feat: add ComparisonService for multi-room trend comparison"
```

---

### Task 2.2: Create comparison-view.html

**Files:**
- Create: `docs/comparison-view.html`

- [ ] **Step 1: Write the comparison page**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>多房间对比 · 电费监控</title>
  <link rel="stylesheet" href="css/style.css">
  <style>
    :root {
      --bg: oklch(97% 0.003 250);
      --surface: oklch(100% 0 0);
      --fg: oklch(20% 0.015 250);
      --muted: oklch(50% 0.012 250);
      --border: oklch(90% 0.006 250);
      --accent: oklch(55% 0.15 160);
      --warning: oklch(65% 0.18 50);
      --danger: oklch(55% 0.20 25);
      --success: oklch(60% 0.14 145);
      --font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      --font-body: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
      --font-mono: 'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, monospace;
      --radius: 12px;
      --radius-lg: 20px;
      --shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03);
    }
    body {
      margin: 0; padding: 0;
      background: var(--bg); color: var(--fg);
      font-family: var(--font-body);
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1100px; margin: 0 auto; padding: 24px;
    }
    .page-title {
      font-family: var(--font-display);
      font-size: 24px; font-weight: 600;
      margin: 0 0 8px;
    }
    .page-subtitle {
      font-size: 14px; color: var(--muted);
      margin-bottom: 24px;
    }
    .room-selector {
      display: flex; gap: 12px; flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .room-select-group {
      flex: 1; min-width: 200px;
    }
    .room-select-group label {
      display: block; font-size: 12px; font-weight: 600;
      color: var(--muted); margin-bottom: 4px;
    }
    .room-select-group select {
      width: 100%; padding: 8px 12px;
      border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--fg);
      font-size: 14px;
    }
    .room-select-group .remove-btn {
      margin-top: 4px; font-size: 12px;
      color: var(--danger); cursor: pointer;
      background: none; border: none;
    }
    .btn-add {
      padding: 8px 16px; border: 1px dashed var(--border);
      border-radius: 8px; background: transparent;
      color: var(--muted); cursor: pointer;
      font-size: 13px; align-self: flex-end;
    }
    .btn-add:hover { color: var(--fg); border-color: var(--muted); }
    .btn-compare {
      padding: 10px 24px; border: none; border-radius: 8px;
      background: var(--accent); color: #fff;
      font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .btn-compare:hover { filter: brightness(1.1); }
    .btn-compare:disabled { opacity: 0.5; cursor: not-allowed; }
    .chart-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 24px;
      margin-bottom: 24px;
    }
    .chart-container {
      position: relative; height: 400px;
    }
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-top: 16px;
    }
    .stat-card {
      background: color-mix(in oklch, var(--bg) 60%, transparent);
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px;
    }
    .stat-room {
      font-size: 14px; font-weight: 600; margin-bottom: 8px;
    }
    .stat-row {
      display: flex; justify-content: space-between;
      font-size: 13px; margin-bottom: 4px;
    }
    .stat-row .label { color: var(--muted); }
    .stat-row .value { font-weight: 600; font-family: var(--font-mono); }
    .error-state {
      text-align: center; padding: 60px 24px; color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="page-title">📊 多房间趋势对比</h1>
    <p class="page-subtitle">选择 2-5 个房间，对比分析用电趋势</p>

    <div class="room-selector" id="room-selector">
      <!-- 动态渲染 -->
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <button class="btn-compare" id="btn-compare" disabled>开始对比</button>
    </div>

    <div class="chart-card" id="chart-card" style="display: none;">
      <div class="chart-container">
        <canvas id="comparison-chart"></canvas>
      </div>
      <div class="stats-grid" id="stats-grid"></div>
    </div>

    <div class="error-state" id="error-state" style="display: none;"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="js/indexeddb-service.js"></script>
  <script src="js/data-service.js"></script>
  <script src="js/comparison-service.js"></script>
  <script>
    // State
    let chartInstance = null;
    let selectedRooms = [];
    let allRoomsCache = null;

    // 初始化
    document.addEventListener('DOMContentLoaded', async () => {
      await DataService.initDB();
      // 初始化一个房间选择器
      selectedRooms = [{ campus: '', building: '', room: '' }];
      renderSelectors();
    });

    async function getAllRooms() {
      if (allRoomsCache) return allRoomsCache;
      const overview = await DataService.getOverview();
      const rooms = [];
      for (const campus of overview.campuses || []) {
        const campusStats = await DataService.getCampusStatistics(campus);
        for (const building of campusStats.buildings || []) {
          const buildingDetails = await DataService.getBuildingDetails(campus, building.name || building);
          for (const [roomName] of Object.entries(buildingDetails.rooms || {})) {
            rooms.push({ campus, building: building.name || building, room: roomName });
          }
        }
      }
      allRoomsCache = rooms;
      return rooms;
    }

    async function renderSelectors() {
      const container = document.getElementById('room-selector');
      const allRooms = await getAllRooms();

      // 构建校区/楼栋/房间级联菜单数据
      const campuses = [...new Set(allRooms.map(r => r.campus))];

      let html = '';
      for (let i = 0; i < selectedRooms.length; i++) {
        const sel = selectedRooms[i];
        const buildings = sel.campus
          ? [...new Set(allRooms.filter(r => r.campus === sel.campus).map(r => r.building))]
          : [];
        const rooms = sel.building
          ? allRooms.filter(r => r.campus === sel.campus && r.building === sel.building).map(r => r.room)
          : [];

        html += `<div class="room-select-group">
          <label>房间 ${i + 1}</label>
          <select class="sel-campus" data-idx="${i}">
            <option value="">选择校区</option>
            ${campuses.map(c => `<option value="${c}"${c === sel.campus ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
          <select class="sel-building" data-idx="${i}"${!sel.campus ? ' disabled' : ''}>
            <option value="">选择楼栋</option>
            ${buildings.map(b => `<option value="${b}"${b === sel.building ? ' selected' : ''}>${b}</option>`).join('')}
          </select>
          <select class="sel-room" data-idx="${i}"${!sel.building ? ' disabled' : ''}>
            <option value="">选择房间</option>
            ${rooms.map(r => `<option value="${r}"${r === sel.room ? ' selected' : ''}>${r}</option>`).join('')}
          </select>
          ${selectedRooms.length > 1 ? `<button class="remove-btn" data-idx="${i}">移除</button>` : ''}
        </div>`;
      }

      if (selectedRooms.length < ComparisonService.MAX_ROOMS) {
        html += `<button class="btn-add" id="btn-add-room">+ 添加房间</button>`;
      }

      container.innerHTML = html;

      // 绑定事件
      container.querySelectorAll('.sel-campus').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          selectedRooms[idx].campus = e.target.value;
          selectedRooms[idx].building = '';
          selectedRooms[idx].room = '';
          renderSelectors();
        });
      });
      container.querySelectorAll('.sel-building').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          selectedRooms[idx].building = e.target.value;
          selectedRooms[idx].room = '';
          renderSelectors();
        });
      });
      container.querySelectorAll('.sel-room').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          selectedRooms[idx].room = e.target.value;
          updateCompareButton();
        });
      });
      container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          selectedRooms.splice(idx, 1);
          renderSelectors();
        });
      });
      const addBtn = document.getElementById('btn-add-room');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          selectedRooms.push({ campus: '', building: '', room: '' });
          renderSelectors();
        });
      }
      updateCompareButton();
    }

    function updateCompareButton() {
      const valid = selectedRooms.filter(r => r.campus && r.building && r.room);
      const btn = document.getElementById('btn-compare');
      btn.disabled = valid.length < ComparisonService.MIN_ROOMS;
    }

    document.getElementById('btn-compare').addEventListener('click', async () => {
      const valid = selectedRooms.filter(r => r.campus && r.building && r.room);
      if (valid.length < 2) return;

      document.getElementById('chart-card').style.display = 'none';
      document.getElementById('error-state').style.display = 'none';

      const rooms = await ComparisonService.loadRooms(valid);
      const errors = rooms.filter(r => r.error);
      if (errors.length > 0) {
        const errorState = document.getElementById('error-state');
        errorState.style.display = 'block';
        errorState.innerHTML = `加载失败: ${errors.map(e => `${e.room}: ${e.error}`).join('<br>')}`;
        return;
      }

      const canvas = document.getElementById('comparison-chart');
      chartInstance = ComparisonService.renderChart(canvas, rooms, chartInstance);

      const stats = ComparisonService.computeStats(rooms);
      const statsGrid = document.getElementById('stats-grid');
      statsGrid.innerHTML = stats.map((s, i) => `
        <div class="stat-card">
          <div class="stat-room" style="color: ${ComparisonService.COLORS[i % ComparisonService.COLORS.length]}">
            ${s.room}
          </div>
          <div class="stat-row"><span class="label">日均消耗</span><span class="value">${s.avgConsumption.toFixed(2)} 度</span></div>
          <div class="stat-row"><span class="label">最高日耗</span><span class="value">${s.maxConsumption.toFixed(2)} 度</span></div>
          <div class="stat-row"><span class="label">最低日耗</span><span class="value">${s.minConsumption.toFixed(2)} 度</span></div>
          <div class="stat-row"><span class="label">数据天数</span><span class="value">${s.dataPoints} 天</span></div>
        </div>
      `).join('');

      document.getElementById('chart-card').style.display = 'block';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Add link to nav bars**

In `docs/index.html`, add a "多房间对比" link in the navigation:

```html
<a href="comparison-view.html">多房间对比</a>
```

- [ ] **Step 3: Verify page loads**

Start local server and open http://localhost:8000/comparison-view.html. Confirm:
1. Room selector renders
2. Campus→building→room cascading works
3. Can add/remove room selectors
4. "开始对比" button enables when ≥2 rooms selected

- [ ] **Step 4: Commit**

```bash
git add docs/comparison-view.html docs/js/comparison-service.js
git commit -m "feat: add multi-room trend comparison page"
```

---

## Chunk 3: 用电模式识别 (US7) + 电费成本预测 (US10)

**Spec ref:** US7 — P2, US10 — P3 (depends on US6 prediction algorithm which already exists).

**Approach:** New `pattern-analyzer.js` module for weekday/weekend analysis, anomaly detection, and room labeling. Cost prediction extends the existing recharge section in room-view.html.

### Task 3.1: Create pattern-analyzer.js

**Files:**
- Create: `docs/js/pattern-analyzer.js`

- [ ] **Step 1: Write pattern analysis module**

```javascript
/**
 * 用电模式识别器
 * 工作日晚周末对比、空房间检测、异常尖峰、特征标签
 */
const PatternAnalyzer = {

  /**
   * 分析用电模式
   * @param {Array<{date: string, consumption: number, balance: number}>} history
   * @returns {{
   *   weekdayAvg: number, weekendAvg: number,
   *   isEmpty: boolean, anomalies: Array<{date: string, consumption: number}>,
   *   tags: string[], radarData: object
   * }}
   */
  analyze(history) {
    if (!history || history.length < 7) {
      return {
        weekdayAvg: 0, weekendAvg: 0, isEmpty: false,
        anomalies: [], tags: [], radarData: null
      };
    }

    // 解析每日数据
    const daily = history.map(d => {
      const dateStr = d.date || '';
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      const date = new Date(year, month, day);
      return {
        date: dateStr,
        dayOfWeek: date.getDay(), // 0=Sun, 6=Sat
        consumption: d.consumption || 0,
        balance: d.balance || 0
      };
    });

    // 工作日 vs 周末
    const weekdayConsumptions = daily.filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= 5).map(d => d.consumption);
    const weekendConsumptions = daily.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6).map(d => d.consumption);

    const weekdayAvg = weekdayConsumptions.length > 0
      ? weekdayConsumptions.reduce((s, v) => s + v, 0) / weekdayConsumptions.length
      : 0;
    const weekendAvg = weekendConsumptions.length > 0
      ? weekendConsumptions.reduce((s, v) => s + v, 0) / weekendConsumptions.length
      : 0;

    // 空房间检测（连续低消耗）
    const recent7 = daily.slice(-7);
    const isEmpty = recent7.length >= 7 && recent7.every(d => d.consumption < 0.5);

    // 异常尖峰检测（Z-score > 2）
    const consumptions = daily.map(d => d.consumption).filter(v => v > 0);
    const mean = consumptions.reduce((s, v) => s + v, 0) / consumptions.length;
    const std = Math.sqrt(consumptions.reduce((s, v) => s + (v - mean) ** 2, 0) / consumptions.length) || 1;
    const anomalies = daily.filter(d => d.consumption > 0 && d.consumption > mean + 2 * std);

    // 特征标签
    const tags = [];
    if (isEmpty) tags.push('空房间');
    if (weekendAvg > weekdayAvg * 1.3) tags.push('周末活跃');
    if (weekdayAvg > weekendAvg * 1.3) tags.push('工作日活跃');
    if (mean < 2) tags.push('节能先锋');
    if (mean > 8) tags.push('高能耗');
    if (anomalies.length >= 2) tags.push('波动较大');

    // 雷达图数据（用于显示使用特征）
    const radarData = {
      labels: ['工作日耗电', '周末耗电', '稳定性', '节能度', '规律性'],
      scores: [
        Math.min(weekdayAvg / 10, 100),
        Math.min(weekendAvg / 10, 100),
        Math.max(0, 100 - anomalies.length * 20),
        Math.max(0, 100 - (mean / 15) * 100),
        Math.max(0, 100 - (std / mean || 1) * 50)
      ]
    };

    return {
      weekdayAvg, weekendAvg, isEmpty, anomalies,
      tags, radarData
    };
  },

  /**
   * 预测电费成本
   * @param {Array} history - 用电历史
   * @param {number} pricePerKwh - 电价（元/度）
   * @returns {{ monthlyCost: number, semesterCost: number, monthlyTrend: Array<{month: string, cost: number}> }}
   */
  predictCost(history, pricePerKwh = 0.5) {
    if (!history || history.length < 7) {
      return { monthlyCost: 0, semesterCost: 0, monthlyTrend: [] };
    }

    // 按月份聚合
    const monthlyData = {};
    for (const d of history) {
      const month = d.date ? d.date.slice(0, 6) : '';
      if (!month) continue;
      if (!monthlyData[month]) monthlyData[month] = { totalConsumption: 0, days: 0 };
      monthlyData[month].totalConsumption += d.consumption || 0;
      monthlyData[month].days += 1;
    }

    // 月度趋势
    const sortedMonths = Object.keys(monthlyData).sort();
    const monthlyTrend = sortedMonths.map(m => {
      const data = monthlyData[m];
      const projectedMonth = data.days > 0
        ? (data.totalConsumption / data.days) * 30
        : 0;
      return {
        month: `${m.slice(0, 4)}-${m.slice(4, 6)}`,
        cost: projectedMonth * pricePerKwh
      };
    });

    // 最近月度成本
    const lastMonth = monthlyTrend[monthlyTrend.length - 1];
    const monthlyCost = lastMonth ? lastMonth.cost : 0;

    // 学期成本（4个月）
    const semesterCost = monthlyCost * 4;

    return { monthlyCost, semesterCost, monthlyTrend };
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/pattern-analyzer.js
git commit -m "feat: add PatternAnalyzer for usage pattern recognition and cost prediction"
```

---

### Task 3.2: Integrate pattern display into room-view.html

**Files:**
- Modify: `docs/room-view.html`

- [ ] **Step 1: Add pattern and cost section HTML**

Insert after the recharge section (line ~820), before `</main>`:

```html
    <!-- 用电模式 -->
    <section class="pattern-section" id="pattern-section" style="display: none;">
      <h2 class="section-title">📈 用电模式</h2>
      <div class="pattern-tags" id="pattern-tags"></div>
      <div class="pattern-grid">
        <div class="pattern-card">
          <div class="pattern-label">工作日均耗</div>
          <div class="pattern-value" id="pattern-weekday">--</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-label">周末均耗</div>
          <div class="pattern-value" id="pattern-weekend">--</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-label">异常天数</div>
          <div class="pattern-value" id="pattern-anomalies">--</div>
        </div>
        <div class="pattern-card">
          <div class="pattern-label">空房间</div>
          <div class="pattern-value" id="pattern-empty">--</div>
        </div>
      </div>
      <div class="pattern-chart-container" id="pattern-chart-container" style="display: none;">
        <canvas id="pattern-radar-chart" width="200" height="200"></canvas>
      </div>
    </section>

    <!-- 成本预测 -->
    <section class="cost-section" id="cost-section" style="display: none;">
      <h2 class="section-title">💰 电费预测</h2>
      <div class="cost-input-row">
        <label>电价（元/度）</label>
        <input type="number" class="cost-input" id="cost-price" value="0.5" min="0.1" max="2" step="0.1">
        <button class="btn btn-primary" id="btn-calc-cost" style="padding: 6px 16px; font-size: 13px;">计算</button>
      </div>
      <div class="cost-grid" id="cost-grid" style="display: none;">
        <div class="cost-card">
          <div class="cost-label">月度预估</div>
          <div class="cost-value" id="cost-monthly">--</div>
        </div>
        <div class="cost-card">
          <div class="cost-label">学期预估（4月）</div>
          <div class="cost-value" id="cost-semester">--</div>
        </div>
        <div class="cost-card" style="grid-column: 1 / -1;">
          <div class="cost-label">节能建议</div>
          <div class="cost-tip" id="cost-tip"></div>
        </div>
      </div>
      <div class="cost-chart-container" style="height: 200px; margin-top: 16px; display: none;" id="cost-chart-container">
        <canvas id="cost-chart"></canvas>
      </div>
    </section>
```

- [ ] **Step 2: Add pattern/cost CSS**

Insert before `</style>`:

```css
    /* 用电模式 */
    .pattern-section {
      margin-top: 32px;
    }
    .pattern-tags {
      display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;
    }
    .pattern-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 12px; border-radius: 20px;
      font-size: 13px; font-weight: 500;
      background: color-mix(in oklch, var(--accent) 12%, transparent);
      color: var(--accent);
    }
    .pattern-tag.empty { background: color-mix(in oklch, var(--muted) 12%, transparent); color: var(--muted); }
    .pattern-tag.high { background: color-mix(in oklch, var(--danger) 12%, transparent); color: var(--danger); }
    .pattern-tag.weekend { background: color-mix(in oklch, var(--warning) 12%, transparent); color: var(--warning); }
    .pattern-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;
    }
    .pattern-card {
      background: color-mix(in oklch, var(--bg) 60%, transparent);
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px;
    }
    .pattern-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .pattern-value { font-size: 16px; font-weight: 600; font-family: var(--font-mono); }
    .pattern-chart-container {
      width: 200px; margin: 0 auto;
    }
    /* 成本预测 */
    .cost-section { margin-top: 32px; }
    .cost-input-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    }
    .cost-input-row label { font-size: 14px; color: var(--muted); }
    .cost-input {
      width: 80px; padding: 6px 10px; border: 1px solid var(--border);
      border-radius: 6px; background: var(--surface); color: var(--fg);
      font-size: 14px; font-family: var(--font-mono);
    }
    .cost-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;
    }
    .cost-card {
      background: color-mix(in oklch, var(--bg) 60%, transparent);
      border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px;
    }
    .cost-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .cost-value { font-size: 18px; font-weight: 600; font-family: var(--font-mono); }
    .cost-tip { font-size: 14px; color: var(--muted); line-height: 1.6; }
    .cost-chart-container { position: relative; height: 200px; }
```

- [ ] **Step 3: Add pattern/cost JS integration**

Insert after `updateRechargeOptions` and before `updateChart`:

```javascript

    // ==================== 用电模式 ====================
    function updatePatternDisplay(history) {
      const section = document.getElementById('pattern-section');
      if (!history || history.length < 7) { section.style.display = 'none'; return; }
      section.style.display = 'block';

      const result = PatternAnalyzer.analyze(history);

      // 标签
      const tagsEl = document.getElementById('pattern-tags');
      tagsEl.innerHTML = result.tags.map(t => {
        let cls = 'pattern-tag';
        if (t.includes('空房间')) cls += ' empty';
        else if (t.includes('高能耗')) cls += ' high';
        else if (t.includes('周末') || t.includes('工作')) cls += ' weekend';
        return `<span class="${cls}">${t}</span>`;
      }).join('');

      document.getElementById('pattern-weekday').textContent = result.weekdayAvg.toFixed(2) + ' 度';
      document.getElementById('pattern-weekend').textContent = result.weekendAvg.toFixed(2) + ' 度';
      document.getElementById('pattern-anomalies').textContent = result.anomalies.length + ' 天';
      document.getElementById('pattern-empty').textContent = result.isEmpty ? '是' : '否';

      // 雷达图
      if (result.radarData) {
        const radarContainer = document.getElementById('pattern-chart-container');
        radarContainer.style.display = 'block';
        const ctx = document.getElementById('pattern-radar-chart').getContext('2d');
        if (window._radarChart) window._radarChart.destroy();
        window._radarChart = new Chart(ctx, {
          type: 'radar',
          data: {
            labels: result.radarData.labels,
            datasets: [{
              label: '用电特征',
              data: result.radarData.scores,
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              borderColor: 'rgba(99, 102, 241, 0.8)',
              pointBackgroundColor: 'rgba(99, 102, 241, 0.8)',
              pointRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
              r: {
                beginAtZero: true, max: 100,
                ticks: { display: false },
                grid: { color: '#334155' },
                pointLabels: { color: '#94a3b8', font: { size: 11 } }
              }
            }
          }
        });
      }
    }

    // ==================== 成本预测 ====================
    function updateCostPrediction(history) {
      const section = document.getElementById('cost-section');
      if (!history || history.length < 7) { section.style.display = 'none'; return; }
      section.style.display = 'block';
    }

    document.getElementById('btn-calc-cost').addEventListener('click', () => {
      const price = parseFloat(document.getElementById('cost-price').value) || 0.5;
      const history = mockData.map(d => ({ date: d.date, consumption: d.consumption, balance: d.balance }));
      const result = PatternAnalyzer.predictCost(history, price);

      document.getElementById('cost-grid').style.display = 'grid';
      document.getElementById('cost-monthly').textContent = result.monthlyCost.toFixed(2) + ' 元';
      document.getElementById('cost-semester').textContent = result.semesterCost.toFixed(2) + ' 元';

      // 节能建议
      const avgConsumption = history.reduce((s, d) => s + d.consumption, 0) / history.length;
      let tip = '';
      if (avgConsumption > 8) tip = '您的用电量较高，建议减少空调使用时长，设置温度26°C以上';
      else if (avgConsumption > 5) tip = '用电量中等，随手关灯、减少待机能耗可以进一步节省';
      else tip = '用电量较低，继续保持！';
      document.getElementById('cost-tip').textContent = tip;

      // 月度趋势图
      const costChartContainer = document.getElementById('cost-chart-container');
      if (result.monthlyTrend.length > 0) {
        costChartContainer.style.display = 'block';
        const ctx = document.getElementById('cost-chart').getContext('2d');
        if (window._costChart) window._costChart.destroy();
        window._costChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: result.monthlyTrend.map(m => m.month),
            datasets: [{
              label: '月度电费',
              data: result.monthlyTrend.map(m => m.cost),
              backgroundColor: 'rgba(99, 102, 241, 0.5)',
              borderColor: 'rgba(99, 102, 241, 0.8)',
              borderWidth: 1,
              borderRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
              y: {
                beginAtZero: true, grid: { color: '#334155' },
                ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v + '元' }
              }
            }
          }
        });
      }
    });
```

- [ ] **Step 4: Wire updatePatternDisplay into updateUI**

In the `updateUI` function, add at the end (before `updateChart`):

```javascript
      // 用电模式
      updatePatternDisplay(mockData);
      updateCostPrediction(mockData);
```

- [ ] **Step 5: Add script tags**

Add after `data-service.js`:

```html
<script src="js/pattern-analyzer.js"></script>
```

- [ ] **Step 6: Commit**

```bash
git add docs/room-view.html docs/js/pattern-analyzer.js
git commit -m "feat: add usage pattern recognition and cost prediction to room view"
```

---

## Chunk 4: 预警订阅 (US11) + 节能成就系统 (US12)

**Spec ref:** US11 — P3, depends on US1; US12 — P3, depends on US2, US7.

**Approach:** Both use localStorage for persistence (no backend). Alert subscription monitors room balance and consumption patterns. Achievement system awards badges based on usage history.

### Task 4.1: Create alert-service.js

**Files:**
- Create: `docs/js/alert-service.js`

- [ ] **Step 1: Write alert subscription module**

```javascript
/**
 * 预警订阅服务
 * 基于 localStorage 持久化的预警订阅系统
 */
const AlertService = {
  STORAGE_KEY: 'alert_subscriptions',

  /** 获取所有订阅 */
  getSubscriptions() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  /** 保存订阅列表 */
  _save(subscriptions) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(subscriptions));
  },

  /** 添加订阅 */
  subscribe(room) {
    const subs = this.getSubscriptions();
    if (subs.some(s => s.room === room.room && s.building === room.building && s.campus === room.campus)) {
      return false; // 已存在
    }
    subs.push({
      ...room,
      createdAt: new Date().toISOString(),
      thresholds: {
        lowBalance: 10,
        daysRemaining: 3,
        anomalyDetection: true
      }
    });
    this._save(subs);
    return true;
  },

  /** 取消订阅 */
  unsubscribe(room) {
    const subs = this.getSubscriptions().filter(s =>
      !(s.room === room.room && s.building === room.building && s.campus === room.campus)
    );
    this._save(subs);
  },

  /** 检查订阅房间的状态，返回预警列表 */
  async checkAlerts() {
    const subs = this.getSubscriptions();
    const alerts = [];
    for (const sub of subs) {
      try {
        const history = await DataService.getRoomHistory(sub.campus, sub.building, sub.room);
        const data = history.history || [];
        if (data.length === 0) continue;

        const latest = data[data.length - 1];
        const balance = latest.balance || 0;
        const recentConsumptions = data.slice(-7).map(d => d.consumption || 0);
        const avgConsumption = recentConsumptions.length > 0
          ? recentConsumptions.reduce((s, v) => s + v, 0) / recentConsumptions.length
          : 0;
        const daysRemaining = avgConsumption > 0 ? Math.floor(balance / avgConsumption) : 999;

        // 低余额预警
        if (balance < sub.thresholds.lowBalance) {
          alerts.push({
            type: 'danger',
            room: sub.room, building: sub.building, campus: sub.campus,
            message: `${sub.room} 余额不足 (${balance.toFixed(1)}度)`,
            balance, daysRemaining
          });
        }

        // 即将耗尽预警
        if (daysRemaining <= sub.thresholds.daysRemaining && daysRemaining > 0) {
          alerts.push({
            type: 'warning',
            room: sub.room, building: sub.building, campus: sub.campus,
            message: `${sub.room} 预计 ${daysRemaining} 天后耗尽`,
            balance, daysRemaining
          });
        }

        // 异常检测
        if (sub.thresholds.anomalyDetection && recentConsumptions.length >= 3) {
          const mean = recentConsumptions.reduce((s, v) => s + v, 0) / recentConsumptions.length;
          const std = Math.sqrt(recentConsumptions.reduce((s, v) => s + (v - mean) ** 2, 0) / recentConsumptions.length) || 1;
          const last = recentConsumptions[recentConsumptions.length - 1];
          if (last > mean + 2 * std) {
            alerts.push({
              type: 'info',
              room: sub.room, building: sub.building, campus: sub.campus,
              message: `${sub.room} 检测到异常用电尖峰 (${last.toFixed(1)}度)`,
              balance, daysRemaining
            });
          }
        }
      } catch (e) {
        alerts.push({
          type: 'error',
          room: sub.room, building: sub.building, campus: sub.campus,
          message: `${sub.room} 数据加载失败`,
          balance: 0, daysRemaining: 0
        });
      }
    }
    return alerts;
  },

  /** 请求浏览器通知权限并发送通知 */
  async notifyUser(alert) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(`⚡ 电费预警 - ${alert.room}`, {
        body: alert.message,
        icon: '/favicon.ico'
      });
    } else if (Notification.permission !== 'denied') {
      await Notification.requestPermission();
    }
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/alert-service.js
git commit -m "feat: add AlertService for room alert subscription and monitoring"
```

---

### Task 4.2: Create achievement-system.js

**Files:**
- Create: `docs/js/achievement-system.js`

- [ ] **Step 1: Write achievement engine**

```javascript
/**
 * 节能成就系统
 * 基于 localStorage 持久化成就/徽章
 */
const AchievementSystem = {
  STORAGE_KEY: 'achievements',

  BADGES: [
    { id: 'energy_saver', name: '节能达人', icon: '🌱',
      desc: '日均耗电 < 2 度持续 30 天',
      check: (history) => {
        const recent = history.slice(-30);
        return recent.length >= 30 && recent.every(d => (d.consumption || 0) < 2);
      }
    },
    { id: 'warning_expert', name: '预警专家', icon: '⚠️',
      desc: '成功在余额低于5度前充值',
      check: () => false // 手动触发
    },
    { id: 'comparison_champion', name: '对比冠军', icon: '🏆',
      desc: '耗电量低于楼栋平均',
      check: (history, stats) => {
        if (!stats || !stats.buildingAvg) return false;
        const avg = history.reduce((s, d) => s + (d.consumption || 0), 0) / history.length;
        return avg < stats.buildingAvg;
      }
    },
    { id: 'watcher', name: '忠实观察者', icon: '👀',
      desc: '连续查看电费数据 7 天',
      check: () => {
        const visits = JSON.parse(localStorage.getItem('visit_dates') || '[]');
        const uniqueDays = [...new Set(visits)].length;
        return uniqueDays >= 7;
      }
    },
    { id: 'saving_challenge', name: '节约挑战', icon: '🏅',
      desc: '本月耗电比上月减少 20%',
      check: (history) => {
        if (history.length < 60) return false;
        const half = Math.floor(history.length / 2);
        const firstHalf = history.slice(0, half).reduce((s, d) => s + (d.consumption || 0), 0);
        const secondHalf = history.slice(-half).reduce((s, d) => s + (d.consumption || 0), 0);
        return secondHalf < firstHalf * 0.8;
      }
    }
  ],

  /** 获取已获得的徽章 */
  getEarned() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  /** 检查并颁发徽章 */
  async checkAndAward(roomConfig, history, stats) {
    const earned = this.getEarned();
    const newBadges = [];
    for (const badge of this.BADGES) {
      if (earned.some(e => e.id === badge.id)) continue;
      let result = false;
      try {
        result = badge.check(history, stats);
      } catch { /* skip */ }
      if (result) {
        const record = { id: badge.id, earnedAt: new Date().toISOString(), room: roomConfig };
        earned.push(record);
        newBadges.push(badge);
      }
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(earned));
    return newBadges;
  },

  /** 获取排行榜分数（基于徽章数量） */
  getLeaderboard() {
    const earned = this.getEarned();
    const counts = {};
    for (const e of earned) {
      const key = `${e.room?.campus || ''}.${e.room?.building || ''}.${e.room?.room || ''}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/achievement-system.js
git commit -m "feat: add AchievementSystem for energy saving badges and challenges"
```

---

### Task 4.3: Integrate into index.html dashboard

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Add alert and achievement dashboard sections**

Add after the feature cards section, before `</main>`:

```html
    <!-- 预警列表 -->
    <section class="dashboard-section" id="alert-section" style="display: none;">
      <h2 class="section-title">🔔 预警列表 <span class="alert-count" id="alert-count"></span></h2>
      <div id="alert-list"></div>
    </section>

    <!-- 成就展示 -->
    <section class="dashboard-section" id="achievement-section" style="display: none;">
      <h2 class="section-title">🏅 我的成就</h2>
      <div class="badge-grid" id="badge-grid"></div>
    </section>
```

- [ ] **Step 2: Add alert/achievement CSS**

Insert before `</style>`:

```css
    .dashboard-section { max-width: 1200px; margin: 0 auto; padding: 0 24px 40px; }
    .section-title { font-family: var(--font-display); font-size: 20px; font-weight: 600; margin-bottom: 16px; }
    .alert-count {
      display: inline-block; padding: 2px 10px; border-radius: 20px;
      font-size: 13px; font-weight: 500;
    }
    .alert-item {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 18px; border-radius: var(--radius);
      margin-bottom: 8px; border: 1px solid var(--border);
      background: var(--surface);
    }
    .alert-item.danger { border-left: 4px solid var(--danger); }
    .alert-item.warning { border-left: 4px solid var(--warning); }
    .alert-item.info { border-left: 4px solid var(--accent); }
    .alert-icon { font-size: 20px; }
    .alert-content { flex: 1; }
    .alert-room { font-weight: 600; font-size: 14px; }
    .alert-msg { font-size: 13px; color: var(--muted); }
    .badge-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;
    }
    .badge-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 20px; text-align: center;
      transition: transform 0.15s;
    }
    .badge-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
    .badge-card .badge-icon { font-size: 32px; margin-bottom: 8px; }
    .badge-card .badge-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .badge-card .badge-desc { font-size: 12px; color: var(--muted); }
    .badge-card.earned { border-color: var(--accent); }
    .badge-card.locked { opacity: 0.5; }
```

- [ ] **Step 3: Add alert/achievement JS at end of page**

Insert before `</body>`:

```html
  <script src="js/alert-service.js"></script>
  <script src="js/achievement-system.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      await DataService.initDB();

      // 加载预警
      const subs = AlertService.getSubscriptions();
      if (subs.length > 0) {
        const alerts = await AlertService.checkAlerts();
        if (alerts.length > 0) {
          document.getElementById('alert-section').style.display = 'block';
          document.getElementById('alert-count').textContent = `(${alerts.length})`;
          document.getElementById('alert-list').innerHTML = alerts.map(a => `
            <div class="alert-item ${a.type}">
              <div class="alert-icon">${a.type === 'danger' ? '🔴' : a.type === 'warning' ? '🟡' : '🔵'}</div>
              <div class="alert-content">
                <div class="alert-room">${a.room} · ${a.building}</div>
                <div class="alert-msg">${a.message}</div>
              </div>
              <span style="font-size:12px;color:var(--muted);">${a.daysRemaining > 0 ? a.daysRemaining + '天' : ''}</span>
            </div>
          `).join('');

          // 尝试浏览器通知（只通知最严重的）
          if (alerts.some(a => a.type === 'danger')) {
            await AlertService.notifyUser(alerts.find(a => a.type === 'danger'));
          }
        }
      }

      // 加载成就
      const earned = AchievementSystem.getEarned();
      const grid = document.getElementById('badge-grid');
      if (earned.length > 0) {
        document.getElementById('achievement-section').style.display = 'block';
      }
      grid.innerHTML = AchievementSystem.BADGES.map(b => {
        const isEarned = earned.some(e => e.id === b.id);
        return `<div class="badge-card ${isEarned ? 'earned' : 'locked'}">
          <div class="badge-icon">${isEarned ? b.icon : '🔒'}</div>
          <div class="badge-name">${isEarned ? b.name : '???'}</div>
          <div class="badge-desc">${isEarned ? b.desc : '尚未获得'}</div>
        </div>`;
      }).join('');
    });

    // 记录访问日期
    (function trackVisit() {
      const visits = JSON.parse(localStorage.getItem('visit_dates') || '[]');
      visits.push(new Date().toISOString().slice(0, 10));
      localStorage.setItem('visit_dates', JSON.stringify(visits));
    })();
  </script>
```

- [ ] **Step 4: Commit**

```bash
git add docs/index.html
git commit -m "feat: add alert dashboard and achievement display to homepage"
```

---

## Plan Review Notes

**Chunk boundaries:**
- Chunk 1 (US3): Independent heatmap module, no external dependencies. Build on existing building-view.html.
- Chunk 2 (US5): New standalone page, depends only on DataService which is already loaded.
- Chunk 3 (US7+US10): Extends room-view.html, depends on PatternAnalyzer which is created in same chunk.
- Chunk 4 (US11+US12): New modules with localStorage persistence, depend on DataService for data.

**Missing pieces to verify before execution:**
1. Confirm that `DataService.getRoomHistory` returns `{ history: Array<{date, balance, consumption}> }` — used by all chunks
2. Confirm building-view.html already has `<script src="js/chartjs-plugin-annotation">` — required for distribution chart
3. Test that `ComparisonService.loadRooms` handles rooms with no historical data gracefully
