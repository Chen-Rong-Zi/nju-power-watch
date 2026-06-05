# AGENT_LOG.md — Superpowers 协作过程日志

> 按时间顺序记录关键节点，每条包含：时间戳与任务编号、触发的 Superpowers 技能、关键 prompt/context 配置、subagent 输出片段、人工干预、学到的教训。

---

## T1 — 2026-05-15 项目初始化与数据管道

**技能**: 无（纯 Claude 交互）

**关键 prompt**: "实现每日自动查询南京大学宿舍电费并推送至 GitHub"

**产出**:
- `8b405eeb40` init repo
- `ae20577979` feat: implement daily data pipeline with GitHub Actions automation

**人工干预**: 无

**学到的教训**: 最早的项目探索在另一台 Linux 机器上完成（curl 探索 epay API、Cookie 提取、Playwright MCP 自动化），项目迁移至 MacBook 后 git 历史重建。AI 基础设施的 session 数据绑定在本地文件系统，无法跨机器共享。

---

## T2 — 2026-05-16 前端可视化初版

**技能**: 无（纯 Claude 交互）

**关键 prompt**: "添加静态前端展示电费数据"

**产出**:
- `b2e05bc31b` feat: add static frontend UI for electricity data visualization
- `d0d77d39e5` add database/summaries
- `ba0a429b78` update async read/write nju_electricity_query.py

**人工干预**: 发现 GitHub Actions workflow 配置错误，手动修复多次（`7cbd06695b`, `bd1e003b3a`）

**学到的教训**: GitHub Actions 的 write permissions 和 async file I/O 需要显式配置，AI 不会自动考虑 CI 环境与本地环境的差异。

---

## T3 — 2026-05-17 OpenCode /speckit 122-task 实施

**技能**: OpenCode speckit（specify → plan → tasks → implement → test）

**关键 prompt**: `/speckit.implement` 002-data-analysis-features

**产出**:
- `84103762eb` feat: complete data analysis features implementation (122 tasks)
- 13 个 Phase：预警中心、排行榜、热力图、仪表盘等

**人工干预**: 
- 发现 ECharts 文件截断（下载的 echarts.min.js 只有 44 行），手动重下
- 发现 null byte 导致语法错误（`app.js` 第 578 行 `\0` 字节），连续修复 4+ 个文件
- 发现 rankings 排序方向反了

**学到的教训**: AI 一次性实现 122 个 task 会导致大量 bug，应该分阶段验证。null byte 问题是 AI 文件写入的特有缺陷。

---

## T4 — 2026-05-18 消费视角重构（3 次架构迭代）

**技能**: OpenCode speckit

**关键 prompt**: `/speckit.implement` 003-consumption-perspective-refactor

**产出**: 3 次迭代（48→39→49 tasks）
- 初版：后端 Python 预计算 consumption JSON → ❌ 架构问题
- 修正：前端计算 + IndexedDB 缓存 → ✅
- 补充：导航重设计 + 更多 US → ✅

**人工干预**: 用户发现后端预计算导致数据重复存储（balance 和 consumption 并存），提出改为纯前端计算。AI 随后提出 `consumption-calculator.js` 从 balance_history 实时计算。

**学到的教训**: 这是项目关键转折点——确立了"前端计算优先"的架构原则。后端预计算虽然简单，但会导致数据冗余和架构僵化。后续所有前端模块都遵循前端计算 + IndexedDB 缓存的模式。

---

## T5 — 2026-05-25 校区页面真实消耗数据 + IndexedDB 缓存

**技能**: 无（纯 Claude 交互）

**产出**:
- `1783af59d8` feat: 校区页面真实消耗数据 + 跨页面缓存共享
- `a2a110eaaf` refactor: 缓存系统协议至IndexedDB

**人工干预**: 发现校区趋势图启动失败、data-service.js 语法错误

**学到的教训**: 从 localStorage 迁移到 IndexedDB 时，需要处理异步 API 的差异。localStorage 是同步的，IndexedDB 是异步的，所有读取操作都需要 await。

---

## T6 — 2026-05-26 耗电量类比 + 排行榜百分比

**技能**: 无（纯 Claude 交互）

**产出**:
- `f463bb6e71` feat: 耗电量直观类比功能（度→小米SU7/Optimus/DeepSeek）
- `4ead3889e8` → `b4db5b6fe5` Add campus-wide ranking and room ranking percentage features

**人工干预**: 
- CodeRabbit review 发现多个问题，手动修复（`b4db5b6fe5`, `a314ed7a1f`, `8c440ac4f4`）
- 苏州校区电费数据解析逻辑错误，手动修正（`74e4f1442f`）

**学到的教训**: AI 生成的代码需要 code review。CodeRabbit 在 PR review 中发现了 dead code 和 bug。苏州校区的余额解析逻辑（"剩余电量" vs "剩余余额"）是特殊 case，AI 不了解业务差异。

---

## T7 — 2026-05-27 room_id 主键重构

**技能**: **superpowers:brainstorming**

**关键 prompt**: "清理重复的 room_id"

**brainstorming 追问链**:
1. AI: "彻底解决还是清理？" → 用户: 彻底解决，用房间名做主键
2. AI: "Query flow 怎么改？" → 用户: 按目前方式用 room_id 查，但存储用房间名
3. AI: "映射维护放入 aggregate_data.py？" → 用户: ❌ **推翻**，职责应该分离
4. AI: "同一天多文件保留哪个？" → 用户: 最新 ID 优先

**产出**:
- `d2b5c5b89f` refactor: migrate backend from room_id to (campus, building, room_name)
- `adc22d2f17` refactor: migrate frontend DataService and IndexedDB from roomId to room_name
- `a4372d8b28` refactor: migrate all frontend views to use room_name instead of roomId

**人工干预**: 推翻 AI 建议——映射维护不应放入聚合脚本，应独立为 `scripts/update_mapping.py`。这是职责分离原则的体现。

**学到的教训**: AI 倾向于把相关逻辑放在一起减少文件数，但这违反单一职责原则。当 AI 提出合并职责时，需要审慎评估。brainstorming 的层层追问机制确实有效——如果没有追问"映射维护由谁做"，可能会产生架构错误。

---

## T8 — 2026-05-28 分布图表设计

**技能**: **superpowers:brainstorming**（含 Visual Companion 浏览器原型）

**关键 prompt**: "显示楼栋耗电分布的直方图"

**brainstorming 追问链**:
1. AI: "要不要启动本地页面展示三种布局方案？" → 用户: 同意
2. AI 展示 3 种方案（A: 直方图+拟合曲线, B: ECDF, C: 组合） → 用户: 选 A
3. AI: "4 种分布拟合（正态/对数正态/Gamma/双峰 EM），用 BIC 选择" → 用户: 采纳

**产出**:
- `97a0eb611a` docs: add parallel building loading design spec
- `63d492e27d` perf: parallelize building consumption loading
- `cfcb0e7349` feat: 耗电量分布图表 - 交互式直方图与分布拟合 (#6)

**人工干预**: 
- 标注颜色在浅色背景上对比度不够，要求修复
- 发现 Chart.js Proxy 对象 spread 导致 infinite recursion（3 轮 debug）
- 发现 histogram x-axis 是 categorical 但 annotation 用数值坐标（用 afterDraw 插件绕过）

**学到的教训**: 
1. Visual Companion（浏览器原型）比纯文本讨论效率高，直接看到 mockup 立刻就能选方案
2. AI 对 Chart.js Proxy 对象有认知盲区，`{...chart.data.datasets[0].data}` 会触发 setter 死循环——debug 花了 3 轮
3. AI 对坐标类型匹配问题不敏感，categorical vs numerical axis 的差异在 spec 中不会体现

---

## T9 — 2026-05-29 日期数据完整性与自动回退

**技能**: **superpowers:brainstorming** → **superpowers:writing-plans** → **superpowers:executing-plans**

**关键 prompt**: "今日数据不可用怎么办"

**brainstorming 追问链**:
1. AI: "直接去掉 fallback 不做补偿" → 用户: ❌ 太粗糙
2. AI: "回退到最近有数据日期 + banner 通知" → 用户: ✅ 采纳

**产出**:
- `94a8abe966` feat: 日期数据完整性与自动回退功能 (#7)

**人工干预**: 修正 AI 原始方案——单纯去掉 fallback 没有补偿措施，用户要求加入自动回退机制。

**学到的教训**: AI 倾向于"最诚实的方案"（无数据就显示无数据），但忽略了用户体验。需要平衡数据诚实性和可用性。

---

## T10 — 2026-05-30 房间ID扫描模式

**技能**: **superpowers:brainstorming** → **superpowers:writing-plans** → **superpowers:executing-plans**

**关键 prompt**: "添加扫描模式发现所有有效房间ID"

**产出**:
- `290f799106` feat: 房间ID扫描模式与错误处理优化 (#9)

**人工干预**: 无

**学到的教训**: 扫描模式需要处理多种错误类型（房间不存在、认证失败、网络错误），且不同错误类型的重试策略不同。房间不存在是永久错误不应重试，网络错误应指数退避重试。

---

## T11 — 2026-05-29 修正负余额解析 + 高对比度颜色

**技能**: 无（纯 Claude 交互）

**产出**:
- `c07b65c078` fix: fix parsing negative balance error from epay.nju
- `0a39277d88` fix: high-contrast text colors and last-bin room filtering

**人工干预**: 发现缴费系统返回负数余额，AI 正则不匹配负号

**学到的教训**: 外部系统的数据可能包含负数、null、异常值等边界情况，正则和解析逻辑需要防御性编程。

---

## T12 — 2026-06-01 MIT License + Docker 部署

**技能**: 无（纯 Claude 交互）

**产出**:
- `186259ddfe` docs: add MIT license
- `4baa4bc945` feat: add Docker deployment config (multi-stage Nginx + dev-mode Python)

**人工干预**: 无

**学到的教训**: Docker 多阶段构建（Nginx 生产模式 + Python 开发模式）是静态前端+脚本工具类项目的标准部署方案。

---

## T13 — 2026-06-03 校区趋势图数据不一致修复

**技能**: **superpowers:systematic-debugging**

**关键 prompt**: "校区页面的当日耗电量与趋势图不一致，远大于图表中的数据"

**诊断过程**:
1. Dashboard: 46020度, Trend: 42817.6度
2. 排除 IndexedDB 缓存问题（清除缓存后仍不一致）
3. 比较两个函数的计算路径：`getCampusConsumption` vs `getCampusConsumptionTrend`
4. 发现房间数差异：9543 vs 8629（差 908 间）
5. **根因**：`getCampusConsumptionTrend` 用 `roomName` 作 key，不同楼栋同名房间被去重覆盖

**产出**:
- `0474def4c7` fix: use unique key in getCampusConsumptionTrend to avoid room name collision

**人工干预**: 无

**学到的教训**: 在跨楼栋聚合数据时，`roomName` 不能作为唯一标识——不同楼栋的"101"不是同一个房间。必须使用 `buildingName_roomName` 组合键。这类 bug 隐蔽，只在聚合数据与逐条计算结果对比时才能发现。

---

## T14 — 2026-06-03 ROOM_NOT_FOUND 错误检测

**技能**: **superpowers:brainstorming** → 直接实现

**关键 prompt**: "当 API 返回包含'房间查询失败'的错误页面时，识别为房间不存在错误"

**产出**:
- `3e2c4f84c8` feat: detect room not found error from API response

**人工干预**: 无

**学到的教训**: HTTP 200 不代表业务成功。API 返回的错误页面（HTML 而非 JSON）需要专门检测。此类错误是永久性的，不应重试。

---

## T15 — 2026-06-03 分布式扫描任务

**技能**: **superpowers:brainstorming** → **superpowers:writing-plans** → **superpowers:executing-plans** → **superpowers:requesting-code-review**

**关键 prompt**: "将扫描区间1-200000分为多个action分别扫描"

**brainstorming**: 用户选择 4 个区间，分散在不同日期执行

**产出**:
- 删除 `monthly-room-discovery.yml`
- 创建 `monthly-scan-part-{1,2,3,4}.yml`（分别在 1/8/15/22 号执行）

**code review 发现**: 
- **Critical**: 多个 scan part 通过 workflow_dispatch 快速连续触发时，checkout 可能拿到旧版本导致 `room_ids.txt` 被覆盖
- 修复：在每个 workflow 的 checkout 后添加 `git pull --rebase`

**人工干预**: 无

**学到的教训**: 
1. 多个 workflow 共享同一个输出文件时，必须确保每次执行前拉取最新版本
2. code review 是必要的——这个并发数据丢失问题在 brainstorming 和 writing-plans 阶段都没有被发现
3. `concurrency: group` 只防止同时运行，不保证顺序执行后的数据一致性

---

## T16 — 2026-06-03 动画状态从 localStorage 改为 IndexedDB 缓存判断

**技能**: **superpowers:brainstorming** → **superpowers:writing-plans** → **superpowers:executing-plans**

**关键 prompt**: "检查 IndexedDB 中的缓存是否存在来决定是否显示动画"

**产出**:
- `e6b0460efa` refactor: derive animation state from IndexedDB cache instead of localStorage

**设计**: 移除 5 个 localStorage 辅助函数，利用控制流自然推导——缓存命中路径提前 return，未命中路径 `hasAnimationShown = false` 播放动画。

**人工干预**: 无

**学到的教训**: 当状态可以从已有逻辑的控制流推导时，不需要额外的持久化记录。减少状态源 = 减少不一致的可能性。

---

## 综合教训

### 可复用的 prompt 模式

1. **brainstorming 层层追问**: AI 先确认问题范围，再确认技术路线，最后确认细节。避免一次给出完整设计导致方向错误。
2. **code review 必不可少**: AI 代码的 bug 率远高于人类，review 发现过 dead code、并发数据丢失、Proxy 死循环等问题。
3. **浏览器原型优于文本描述**: 涉及可视化的问题，用 Visual Companion 展示 mockup 比文字讨论效率高数倍。

### 踩坑记录

| 坑 | 描述 | 应对策略 |
|---|---|---|
| Chart.js Proxy 对象 | `{...proxy}` 触发 setter 死循环 | 用直接属性赋值代替 spread |
| null byte 写入 | AI 生成文件含 `\0` 字节 | 写入后立即验证文件完整性 |
| 跨楼栋同名房间 | `roomName` 不唯一，聚合被去重 | 使用 `buildingName_roomName` 组合键 |
| HTTP 200 但业务失败 | API 返回错误页面的 HTML | 在 HTML 中检测错误关键词 |
| Workflow 并发数据丢失 | 多 part checkout 拿到旧版本 | 扫描前 `git pull --rebase` |
| localStorage vs IndexedDB 状态不一致 | 动画状态与实际缓存脱钩 | 从控制流推导状态，不另存记录 |

### AI 协作模式总结

| 方面 | 优势 | 不足 |
|------|------|------|
| brainstorming 追问 | 层层递进，避免方向错误 | 对常识性问题也追问，拖长 session |
| Visual Companion | 直观对比方案，高效决策 | 需要本地服务器，token 消耗大 |
| code review | 发现隐蔽 bug（并发、边界 case） | 需要 subagent 支持，单 session 上下文有限 |
| writing-plans | 步骤清晰，可追踪进度 | 简单改动也走完整流程，效率偏低 |
| executing-plans | 按部就班，不易遗漏 | 频繁切换技能，重复加载 skill base |
