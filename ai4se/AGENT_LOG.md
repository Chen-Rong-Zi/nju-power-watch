# AGENT_LOG.md — Superpowers 协作过程日志

> 按时间顺序记录关键节点，每条包含：时间戳与任务编号、触发的 Superpowers 技能、关键 prompt/context 配置、subagent 输出片段、人工干预、学到的教训。

---

## T1 — 2026-05-15 项目初始化与数据管道

**技能**: 无（纯 Claude 交互）

**关键 prompt**: "实现每日自动查询南京大学宿舍电费并推送至 GitHub"

**产出**:
- `8b405eeb40` init repo
- `ae20577979` feat: implement daily data pipeline with GitHub Actions automation

**人工干预**: 无（此阶段为跨机器探索期，用户在另一台 Linux 机器上独立完成）（curl 探索 epay API、Cookie 提取、Playwright MCP 自动化），项目迁移至 MacBook 后 git 历史重建。AI 基础设施的 session 数据绑定在本地文件系统，无法跨机器共享。

---

## T2 — 2026-05-16 前端可视化初版

**技能**: 无（纯 Claude 交互）

**关键 prompt**: "添加静态前端展示电费数据"

**产出**:
- `b2e05bc31b` feat: add static frontend UI for electricity data visualization
- `d0d77d39e5` add database/summaries
- `ba0a429b78` update async read/write nju_electricity_query.py

**人工干预**: AI 生成的 GitHub Actions workflow 配置有多处错误：1) 缺少 `permissions: contents: write` 导致 push 失败；2) 文件写入用了同步 `open()` 而非 `aiofiles`，在 async 函数中会阻塞事件循环；3) workflow 文件路径写错（`.github/workflow/` 少了 `s`）。用户逐个手动修复，共 3 次 commit（`bd1e003b3a`, `7cbd06695b`, `fc10f4fe4a`）。AI 对 CI 环境与本地环境的差异缺乏意识。

**学到的教训**: GitHub Actions 的 write permissions 和 async file I/O 需要显式配置，AI 不会自动考虑 CI 环境与本地环境的差异。

---

## T3 — 2026-05-17 OpenCode /speckit 122-task 实施

**技能**: OpenCode speckit（specify → plan → tasks → implement → test）

**关键 prompt**: `/speckit.implement` 002-data-analysis-features

**产出**:
- `84103762eb` feat: complete data analysis features implementation (122 tasks)
- 13 个 Phase：预警中心、排行榜、热力图、仪表盘等

**人工干预**:
- **ECharts 文件截断**: AI 下载的 `echarts.min.js` 只有 44 行（完整应为 ~100K 行），导致页面白屏。用户手动用 curl 重新下载完整文件。推测原因是 AI 下载时网络中断或文件写入被截断。
- **null byte 导致语法错误**: `app.js` 第 578 行出现 `\0` 字节，导致 `JSON.parse` 解析失败。AI 连续修复了 4+ 个文件，每个文件都有 null byte 污染。这是 AI 文件写入工具的特有缺陷——生成的文件中混入了不可见字符。
- **rankings 排序方向反了**: "节能模范"排行榜应该按耗电从低到高排序，但 AI 实现为从高到低，导致最耗电的房间显示在"节能模范"榜首。用户手动修正排序逻辑。

**学到的教训**: AI 一次性实现 122 个 task 会导致大量 bug，应该分阶段验证。null byte 问题是 AI 文件写入的特有缺陷。

---

## T4 — 2026-05-18 消费视角重构（3 次架构迭代）

**技能**: OpenCode speckit

**关键 prompt**: `/speckit.implement` 003-consumption-perspective-refactor

**产出**: 3 次迭代（48→39→49 tasks）
- 初版：后端 Python 预计算 consumption JSON → ❌ 架构问题
- 修正：前端计算 + IndexedDB 缓存 → ✅
- 补充：导航重设计 + 更多 US → ✅

**人工干预**: 用户审查初版方案后发现：后端 Python 预计算 consumption JSON 会导致 balance 和 consumption 数据重复存储，且每次前端架构调整都需要重新运行 Python 脚本生成 JSON。用户明确要求改为纯前端计算——`consumption-calculator.js` 从已有的 `balance_history` 实时计算消耗量，结果缓存在 IndexedDB 中。AI 接受后重新设计了整个数据流。这是项目最关键的架构决策转折点。

**学到的教训**: 这是项目关键转折点——确立了"前端计算优先"的架构原则。后端预计算虽然简单，但会导致数据冗余和架构僵化。后续所有前端模块都遵循前端计算 + IndexedDB 缓存的模式。

---

## T5 — 2026-05-25 校区页面真实消耗数据 + IndexedDB 缓存

**技能**: 无（纯 Claude 交互）

**产出**:
- `1783af59d8` feat: 校区页面真实消耗数据 + 跨页面缓存共享
- `a2a110eaaf` refactor: 缓存系统协议至IndexedDB

**人工干预**: 校区页面切换时趋势图不渲染。排查发现 `getCampusConsumptionTrend` 中有语法错误（缺少闭合括号），且趋势图初始化逻辑在页面加载时没有被调用。用户逐个修复后提交（`34e5b73866`, `c8250006b9`）。此外从 localStorage 迁移到 IndexedDB 时，AI 多处遗漏了 `await`，导致异步读取返回 Promise 而非实际数据。

**学到的教训**: 从 localStorage 迁移到 IndexedDB 时，需要处理异步 API 的差异。localStorage 是同步的，IndexedDB 是异步的，所有读取操作都需要 await。

---

## T6 — 2026-05-26 耗电量类比 + 排行榜百分比

**技能**: 无（纯 Claude 交互）

**产出**:
- `f463bb6e71` feat: 耗电量直观类比功能（度→小米SU7/Optimus/DeepSeek）
- `4ead3889e8` → `b4db5b6fe5` Add campus-wide ranking and room ranking percentage features

**人工干预**:
- **CodeRabbit PR review**: AI 提交 PR 后，CodeRabbit 自动审查发现多处问题：1) `calculateBeatPercentage` 函数缺少 fallback 数据源，当缓存为空时直接 crash；2) `getBuildingConsumptionRankingFast` 调用时日期格式错误（传了 `YYYY-MM-DD` 但函数期望 `today`/`yesterday` 或 `YYYYMMDD`）；3) 多处 dead code 未清理。用户根据 review 逐个修复（`b4db5b6fe5`, `a314ed7a1f`, `8c440ac4f4`, `189c547caa`）。
- **苏州校区电费解析错误**: 缴费系统对苏州校区的 HTML 渲染不同——苏州校区同时显示"剩余电量"（度）和"剩余余额"（元），非苏州校区只显示"剩余电量"（实际是余额，单位元）。AI 的正则统一提取第一个"剩余电量"，导致苏州校区数据错误。用户手动修正 `parse_html()` 函数，根据校区名称区分提取逻辑（`74e4f1442f`）。

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

**人工干预**:
- **推翻映射维护职责合并**: AI 建议"在 `aggregate_data.py` 聚合时检测 ID 变更并更新映射"，理由是减少文件数量。用户明确推翻："职责应该分离。`nju_electric_query.py` 只做查询和存储，不关心 ID 变更。聚合脚本也不该管映射。维护映射应该用单独的脚本。"最终设计了独立的 `scripts/update_mapping.py`。这个决策影响了后续所有脚本的边界划分。
- **确认存储策略**: AI 追问"同一天有多个文件时保留哪个"，用户指定"最新 ID 的数据优先"，这决定了 `save_result()` 的覆盖策略。

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
- **标注颜色对比度不足**: 实现后发现分布标注文字在浅色背景上几乎看不见（字号 10px，颜色 `#666`），用户要求"标签更亮更显眼"。修复：字号 10px→14px，颜色改为高对比度，chart height 320px→400px（`0a39277d88`）。
- **Chart.js Proxy 死循环（3 轮 debug）**: 用户点击直方图柱子后页面卡死。AI 第一轮诊断以为是事件冒泡问题，加了 `stopPropagation` 无效；第二轮怀疑是 Chart.js 的 `onClick` 回调问题；第三轮才定位到根因——代码中 `{...chart.data.datasets[0].data}` 对 Proxy 对象做 spread 会触发 setter 循环。修复：改用直接属性赋值 `chart.data.datasets[0].data = newData`。AI 对 Chart.js 内部 Proxy 机制有认知盲区，这是模型层面的不足。
- **histogram 坐标类型不匹配**: 直方图 x-axis 是 categorical（标签如 "2.5"），但分布标注（均值线、σ 区间）使用数值坐标，导致标注画在错误位置。AI 用 `chartjs-plugin-annotation` 无法解决（该插件要求 numerical axis），最终改用 `afterDraw` 钩子直接在 canvas 上手绘标注线。
- **切换楼栋时图表不隐藏**: `onBuildingChange` 事件处理中没有调用分布图表的隐藏函数，导致切换楼栋后旧图表残留在页面上。

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

**人工干预**:
- **推翻"纯诚实"方案**: AI 最初建议"在 data-service 中增加严格日期匹配，移除所有 fallback，特定日期没有数据就显示'--'"。用户认可数据诚实性原则，但指出："这样会影响用户体验——每次打开都显示无数据怎么办？"AI 随后提出补偿方案：自动搜索最近 7 天内第一个覆盖度 > 50% 的日期，用可关闭的 banner 通知用户实际显示的日期。用户采纳。
- **banner 不显示覆盖度百分比**: AI 初版 banner 显示"05-29 的数据（覆盖度 87%）"，用户要求简化为"今日数据暂无，显示 05-29 的数据"，因为覆盖度百分比信息对普通用户没有意义。

**学到的教训**: AI 倾向于"最诚实的方案"（无数据就显示无数据），但忽略了用户体验。需要平衡数据诚实性和可用性。

---

## T10 — 2026-05-30 房间ID扫描模式

**技能**: **superpowers:brainstorming** → **superpowers:writing-plans** → **superpowers:executing-plans**

**关键 prompt**: "添加扫描模式发现所有有效房间ID"

**产出**:
- `290f799106` feat: 房间ID扫描模式与错误处理优化 (#9)

**人工干预**:
- **确认不同 ID 可指向同一房间**: 用户询问"扫描模式有没有考虑到不同的 ID 可能指向相同的房间？"AI 分析后发现 `scan_room_ids` 中已有去重逻辑（`seen_rooms` 用 `(校区, 楼栋, 房间名)` 作 key），但存在隐患：先扫描到的旧 ID 会被保留，新的有效 ID 反而被丢弃，且没有日志记录重复情况。用户了解后未要求立即修改，但标记为后续需要优化的点。
- **要求 start_id 和 end_id 为必填参数**: AI 初版扫描模式有默认区间，用户认为不应该有默认值（避免误操作扫描全量），要求改为必填参数（`8e2811d998`）。

---

## T11 — 2026-05-29 修正负余额解析 + 高对比度颜色

**技能**: 无（纯 Claude 交互）

**产出**:
- `c07b65c078` fix: fix parsing negative balance error from epay.nju
- `0a39277d88` fix: high-contrast text colors and last-bin room filtering

**人工干预**: 缴费系统在房间余额为负数时返回如 `-12.5度`，但 AI 的正则 `(-?[\d.]+度)` 初版只匹配正数（没有 `-?`），导致负余额房间解析失败显示无数据。用户发现后要求修复：负余额统一替换为 0（`normalize_value` 函数）。另外分布图表最后一档（bin）的房间被遗漏显示，是因为直方图 bin 边界计算用了 `<` 而非 `<=`，用户也一并要求修复（`0a39277d88`）。

**学到的教训**: 外部系统的数据可能包含负数、null、异常值等边界情况，正则和解析逻辑需要防御性编程。

---

## T12 — 2026-06-01 MIT License + Docker 部署

**技能**: 无（纯 Claude 交互）

**产出**:
- `186259ddfe` docs: add MIT license
- `4baa4bc945` feat: add Docker deployment config (multi-stage Nginx + dev-mode Python)

**人工干预**: 无（Nginx 生产模式 + Python 开发模式）是静态前端+脚本工具类项目的标准部署方案。

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

**人工干预**: 用户发现校区页面仪表盘"今日总耗电: 46020度"与趋势图表 05-29 的值 42817.6度不一致，差值约 3202度。AI 最初误判为 IndexedDB 缓存过期导致（因为 dashboard 使用缓存而 trend 不使用），但清除 IndexedDB 后问题依旧。用户坚持排查，AI 才逐层深入：比较两个函数的房间数（9543 vs 8629，差 908间），最终定位到 `getCampusConsumptionTrend` 中 `dailyConsumption[date][roomName]` 用 roomName 作 key 导致跨楼栋同名房间被覆盖。用户通过浏览器 evaluate 直接调用两个函数对比数据，用精确的数值差异推动 AI 缩小排查范围。

---

## T14 — 2026-06-03 ROOM_NOT_FOUND 错误检测

**技能**: **superpowers:brainstorming** → 直接实现

**关键 prompt**: "当 API 返回包含'房间查询失败'的错误页面时，识别为房间不存在错误"

**产出**:
- `3e2c4f84c8` feat: detect room not found error from API response

**人工干预**: 用户在扫描大量房间 ID 时发现，部分 ID 返回的页面标题是"错误"、内容为"房间查询失败！"，但 HTTP 状态码仍是 200。AI 的 `query_single_with_retry` 只检查了 HTTP 状态码和登录重定向，没有检测 HTML 内容中的错误提示，导致这些无效 ID 被误判为"解析失败"并反复重试（最多 5 次指数退避）。用户提供了错误页面的 HTML 源码，要求 AI 专门识别这种情况并报出"该 ID 不存在"的错误，且不应重试（因为是永久性错误）。

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

**人工干预**:
- **选择分散执行而非顺序执行**: AI 问"顺序执行还是分散在不同日期？"，用户选择 B（分散在不同日期），因为电费查询服务可能限制每天的查询数量，分散执行可以避免触发限流。
- **选择 4 个区间**: AI 提出 4/10/20 区间方案，用户选择 4 个区间（每个 50000 ID），平衡了扫描粒度和执行频率。
- **code review 发现数据丢失风险**: 用户主动触发 code review（`/superpowers:requesting-code-review`），subagent 发现关键问题——多个 scan part 通过 `workflow_dispatch` 快速连续触发时，checkout 拿到的是旧版本 `room_ids.txt`，而 `scan_room_ids()` 用 `"w"` 模式写入会截断文件，导致前一个 part 发现的 ID 被覆盖丢失。修复：在每个 workflow 的 checkout 后添加 `git pull --rebase origin ${{ github.ref_name }}`。

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

**人工干预**: 用户明确要求不再用 localStorage 的 `ANIMATION_SHOWN_KEY` 追踪动画是否已播放，而是检查 IndexedDB 中排名缓存（如 key `"仙林校区.4幢.耗电排序"`）是否存在来判断。用户的理由是：localStorage 中的动画状态与实际数据缓存无关，当用户清除 localStorage 后即使 IndexedDB 有缓存动画也会重新播放，这是不一致的。AI 理解后简化了设计——移除 5 个 localStorage 辅助函数，利用控制流自然推导：缓存命中路径提前 return 跳过动画，未命中路径 `hasAnimationShown = false` 播放动画。

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
