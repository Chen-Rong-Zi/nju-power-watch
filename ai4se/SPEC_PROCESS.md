# SPEC_PROCESS.md — 与 Superpowers 协作过程记录

> 本文档客观记录项目设计与实施过程中与 AI Superpowers 系统的协作过程，包括 brainstorming 关键节点、迭代轮次、决策采纳/拒绝记录，以及反思。

---

## 一、总体时间线

```
May 14-15 ─── [另一台 Linux 机器] 最早的 Claude 交互：curl 探索 epay API、Cookie 提取、
             │   Playwright MCP 自动化、nju_electric_query.py 初版（同步→异步转换）、
             │   批量查询 + 文件输出
May 16   ─── 项目迁移至本机（MacBook）；git 历史重建、room_id 查找
May 17   ─── [OpenCode /speckit.implement] 002-data-analysis-features（122 tasks, ECharts 5.x）
            ├── Phase 1-2: Setup + Foundational utilities
            ├── Phase 3: US1 Warning System (10 tasks) ✅
            ├── Phase 4: US2 Rankings (12 tasks) ✅
            ├── Phase 5-6: US3 Heatmap + Comparison (20 tasks) ✅
            ├── Phase 7-13: Dashboard + Polish + ... (74 tasks) ✅
            └── Bug 修复：null byte 损坏、ECharts 截断、rankings 排序错误
May 18   ─── [OpenCode /speckit.*] 003-consumption-perspective-refactor（48→39→49 tasks）
            ├── Architecture change: 后端预计算 → 前端计算+缓存
            ├── 新增 consumption-calculator.js, user-config.js, animated-loader.js
            ├── 重构 campus-view.js, building-view.js, room-view.js
            └── Test: 16/16 通过 (Playwright MCP)
May 19   ─── [OpenCode] Bug fixes: room 个性化修复、rankings 排序修复
May 25   ─── [Claude] Bug fix: building-view 中无数据时 TypeError
May 26   ─── [Claude] 数据分析 spec 002 checklists 完成
May 27   ─── [Superpowers] brainstormsession[1]: room_id 重构设计 + 实施（11 tasks）
May 28   ─── [Superpowers] brainstormsession[2]: 分布图表（原型展示 3 方案）
          ─── [Superpowers] brainstormsession[3]: 布局调整+分布标注设计
May 29   ─── [Superpowers] brainstormsession[4]: 数据完整度+自动回退日期（含版本回退）
May 30   ─── [Superpowers] brainstormsession[5]: 房间扫描+重试+已加载ID
May 31   ─── 综合 SPEC 文档合成（Claude 会话超限→新 session 恢复）
Jun 01   ─── PLAN 输出, SPEC_PROCESS 记录
```

> **数据来源**: 本机 `.claude/projects/` + `.claude/history.jsonl` + `.claude/tasks/`（共 17+ 个 JSONL 会话文件），以及从另一台 Linux 机器导入的 `projects.tar.gz`（含 3 份 dorm-query 会话 + ~20 份其他会话，跨越 May 14-Jun 01）

---

## 〇、项目早期（May 14-25）— 从跨机器探索到 OpenCode /speckit 时代

在 Superpowers 引入之前，项目经历了两段不同的开发阶段：先在某台 Linux 机器上完成了核心查询脚本的探索和初版，随后迁移至本机进行 feature 开发。

### 0.0 跨机器探索期（May 14-15）

项目最初在另一台 Linux 机器（hostname: rongzi）上启动。该阶段的 Claude 会话记录了最原始的探索过程（共 3 份 JSONL，~2.9MB）：

- **API 逆向** — 使用 curl 手动探索 epay.nju.edu.cn 的电费查询接口，验证 Cookie 认证方式，发现 `JSESSIONID`、`MOD_AUTH_CAS`、`_ga` 等关键 Cookie 字段
- **Playwright MCP 自动化** — 首次配置 `@playwright/mcp` 实现浏览器自动化，但发现 MCP 不适合此场景（需要频繁的脚本级查询）
- **正则解析方案** — 从 HTML 中的 `this.check = {...}` JS 片段提取楼栋、房间、余额等信息，使用 `re.search(r'this\.check\s*=\s*({.*?})', html)` 匹配
- **异步化改造** — 用户要求从同步脚本改为 async 批量查询（`python3 nju_electric_query.py 53463 53464 53465`），AI 实现 `aiohttp` 方案，使用 `asyncio.as_completed` 实现并发 + 逐结果更新进度
- **日志输出** — 按楼栋名分文件输出（`4幢_20260515.log`），支持 `-d` 指定目录

> 此阶段会话存放在 `/tmp/projects/projects/-home-rongzi-Project-dorm-query/50035d6a...jsonl`（1262 行，~2.9MB），是项目最早的 AI 协作记录。

### 0.1 OpenCode /speckit 时代（May 17-25）

项目迁移至本机后，使用 OpenCode 的 **Speckit** 框架（`.specify/` 目录下的脚本体系）进行特征开发。该框架提供了完整的规范→计划→任务→实现→测试工作流：

```
/speckit.specify → /speckit.plan → /speckit.tasks → /speckit.implement → /speckit.test → /speckit.checklist
```

### 0.2 最初的特征实现（May 17）

最初使用 `/speckit.implement` 命令一次性实现了 002-data-analysis-features 的 **122 个任务**，分 13 个 Phase：

| Phase | 内容 | Task 数 |
|-------|------|---------|
| 1 | Setup（目录+引入 ECharts） | 6 |
| 2 | Foundational Utilities（analytics, predictions, notifications） | 6 |
| 3 | US1 Warning System（预警模块 + 页面） | 10 |
| 4 | US2 Rankings（排行榜模块 + 页面） | 12 |
| 5-6 | US3 Heatmap + Comparison | 20 |
| 7-10 | Dashboard + 更多 US | ~48 |
| 11-13 | Polish + 跨功能 | ~20 |

**关键 Bug 修复（speckit 时代）：**
- **ECharts 文件截断** — 下载的 echarts.min.js 只有 44 行，需重下
- **null byte 导致语法错误** — `app.js` 第 578 行有 `\0` 字节导致 `JSON.parse` 解析失败（连续修复 4+ 个文件）
- **rankings 排序错误** — "节能模范"排序方向反了（应该高→低，实际低→高）

### 0.3 消费视角重构（May 18）— 重大架构变更

003-consumption-perspective-refactor 经历了 **3 次架构迭代**：

| 迭代 | 时间 | 架构 | 任务数 | 结果 |
|------|------|------|--------|------|
| 初版 | May 18 11:07 | 后端 Python 预计算 consumption JSON | 48 | ❌ 架构问题 |
| 修正 | May 18 13:11 | 前端计算 + IndexedDB 缓存 | 39 | ✅ 通过 |
| 补充 | May 18 16:13 | 增加导航重设计 + 更多 US | 49 | ✅ 通过 |

**架构变更原因**：用户发现后端预计算 consumption JSON 文件会导致数据重复存储（balance 和 consumption 并存），且每次架构调整都需要重新生成 JSON。AI 提出改为纯前端计算——`consumption-calculator.js` 从 balance_history 实时计算 consumption，使用 IndexedDB 缓存结果。

> 这次架构变更是整个项目中的关键转折点，影响了后续所有前端模块的设计思路（前端计算优先）。

**测试结果：16/16 Playwright 测试通过**
```
Suite 1: 首页        ✅ 4/4
Suite 2: 预警中心    ✅ 3/3
Suite 3: 排行榜      ✅ 4/4
Suite 4: 仪表盘      ✅ 2/2
Suite 5: 导航        ✅ 2/2
```

### 0.4 后续 Bug 修复（May 19-25）

- **room 个性化修复**（May 19）：`saveUserRoom()` 需要 `roomName` 字段但 `predictionData` 可能为 null
- **building-view TypeError**（May 25）：`showNoDataState` 中 `no-data-text` 元素缺少 `id` 属性

> **注意**：这个时期的代码大量使用 **ECharts 5.x** 和 SPA 路由（`#/warnings`, `#/rankings`），这些在后来（May 27+）被完全替换为 **Chart.js** 和独立页面。目前仓库中已无 ECharts 和 SPA 路由的痕迹。跨机器探索期的初版脚本（`nju_electric_query.py`）在迁移后持续迭代，保留了核心查询逻辑，但存储结构从 room_id 目录改为 room_name 目录。

---

## 二、Brainstorming 关键节点与智能体追问

### 2.1 节点 1（May 27）— room_id 主键重构

**初始设想：** 用户想"清理重复 ID"

**AI 追问 1：** "当前数据模型以 room_id 为核心 key，但 room_id 是缴费系统的动态 ID。同一个物理房间可能在不同时期分配到不同的 ID，而一个 ID 也可能被重新分配给别的房间。你想彻底解决这个问题，还是只是清理现有重复？"

**用户回应：** 彻底解决，用房间名做主键

**AI 追问 2：** "Query flow 怎么改？现在脚本按 room_id 目录遍历。改成按房间名后，是在查询时从映射文件读取 current_id，还是直接用房间名查？"

**用户回应：** 按目前的方式用 room_id 查，但存储用房间名做目录

**AI 追问 3（关键转向）：** "映射文件由谁来维护？我建议在 `aggregate_data.py` 聚合时检测 ID 变更并更新映射，这样聚合脚本同时负责映射维护。"

**用户判定：** ❌ **推翻**。用户认为职责应该分离，映射维护应有单独脚本。

> **影响：** 这导致设计了 `scripts/update_mapping.py` 这个独立维护脚本，`nju_electric_query.py` 只做查询和存储，不关心 ID 变更。

**AI 追问 4：** "同一天有多个文件时保留哪个？合并策略是 latest wins 还是其它？"

**用户回应：** 最新 ID 的数据优先

---

### 2.2 节点 2（May 28）— 分布图表设计

**初始设想：** 显示楼栋耗电分布的直方图

**AI 追问 1：** "这个功能涉及图表和可视化，有些问题用浏览器展示 mockup 会更直观。我要不要启动本地页面展示三种分布图表布局方案？"

**用户回应：** 同意

**AI 展示：** 三种布局方案（在浏览器中预览）：
- **A: 直方图 + 拟合曲线** — 直方图展示实际分布，叠加分布拟合曲线
- **B: ECDF** — 经验累积分布曲线
- **C: 直方图 + ECDF 组合** — 信息最全面但占空间大

**用户选择：** A（直方图 + 拟合曲线）

**AI 追问 2：** "对几种分布类型分别拟合？建议 4 种：正态分布、对数正态分布、Gamma 分布、双峰分布（EM 算法）。用 BIC 选择最优模型。"

**用户回应：** ✅ 采纳

**AI 追问 3（设计迭代）：** "分布标注怎么设计？正态分布显示 ±1σ/±2σ/±3σ 区间，对数正态显示中位数和四分位，Gamma 显示均值/众数/偏态，双峰显示两个峰的 μ₁/μ₂ 和权重比例。这样可以吗？"

**用户回应：** ✅ 采纳，但要求标签更亮更显眼（后续实现中发现标注颜色在浅色背景对比度不够，用户要求修复）

---

### 2.3 节点 3（May 28）— 布局调整 + 分布标注

**AI 追问 1：** "当前 building-view.html 布局是：用户排名卡片 → 趋势图 → 排行榜。我建议改为：统计摘要 → 分布图表 → 趋势图 → 排行榜，同时删除冗余的用户排名卡片。这样可以吗？"

**用户回应：** ✅ 采纳

**AI 追问 2（标注设计迭代）：** "标注样式一致性问题：所有标注使用半透明背景不遮挡直方图，线条使用虚线区分，标注文字简洁放在统计卡片中。这样可以吗？"

**用户回应：** ✅ 采纳

**后续迭代（实现中发现的问题）：**
1. ❌ **Infinite recursion on click** — 用户点击柱后触发无限递归，AI 诊断发现是因 Chart.js Proxy 对象 spread 导致 setter 循环。修复：用直接属性赋值替代 object spread
2. ❌ **Text too small and dim** — 标注文字太小看不清。修复：chart height 320px→400px，字号 10px→14px
3. ❌ **Charts not hiding when switching buildings** — `onBuildingChange` 没有调用图表隐藏函数

> 该轮实现了从 spec→plan→implementation→PR 的完整流程，但暴露了 AI 生成的 Chart.js 代码对 Proxy 对象不敏感的问题。

---

### 2.4 节点 4（May 29）— 数据完整度 + 日期回退

**AI 追问 1：** "数据完整度怎么定义？是按该栋楼有数据房间数/总房间数，还是按该校区有数据楼栋数/总楼栋数？"

**用户回应：** 按房间维度，有数据房间/总房间

**AI 追问 2（日期回退方案）：** "今日数据不可用时，我建议自动回退到最近有数据的日期，但保留 `?date=today` 在 URL 中，用一个可关闭的 banner 提示用户实际显示的是哪天的数据。"

**用户确认：** ✅ 采纳。回退条件是覆盖度 < 50% 房间有数据，最多向前搜索 7 天

**AI 追问 3：** "回退逻辑放在 data-service.js 还是页面层面？我推荐在 data-service.js 中统一处理，这样楼栋和校区页面都可以复用。"

**用户回应：** ✅ 采纳

---

## 三、关键迭代轮次（3+ 轮对话节选）

### 迭代 1：room_id 重构 - 职责分离决策

```
AI: "映射文件由谁来维护？我建议在 aggregate_data.py 聚合时检测 ID 变更并更新映射。"
USER: [推翻] "职责应该分离。nju_electric_query.py 只做查询和存储，不关心 ID 变更。
      聚合脚本也不该管映射。维护映射应该用单独的脚本。"

→ 决策：新增 scripts/update_mapping.py，nju_electric_query.py 不再保留 id/宿舍ID 字段
```

### 迭代 2：分布图表 - 从 spec 到调试修复

```
AI: 展示 3 种布局方案（A/B/C），用户选 A
→ 实现完成后用户发现标注拖尾不对
AI: 诊断出 histogram x-axis 是 categorical 类型（标签如 "2.5"），
    但 annotation 使用了数值坐标
→ 修复：改用 afterDraw 插件绘制标注，绕过坐标类型匹配问题

→ 又发现点击柱 infinite recursion
AI: 诊断出 Chart.js Proxy spread 问题
→ 修复：直接属性赋值代替 spread
```

### 迭代 3：日期完整性 - 设计改进

```
AI: "我建议在 data-service 中增加严格日期匹配，移除所有 fallback，
    这样数据更诚实。只有当特定日期没有数据时才显示'--'。"
USER: "同意。但这样会影响用户体验 — 每次打开都显示无数据怎么办？"
AI: "那我设计自动回退日期方案：今日无数据时自动搜索最近 7 天找第一个覆盖度 > 50% 的日期，
    用 banner 通知用户实际显示的日期。"
USER: ✅ 采纳

→ 注意：这个迭代中用户修正了 AI 的原始方案（单纯去掉 fallback 而没有补偿措施），
   AI 随后提出了更好的补偿方案（回退 + banner）
```

---

## 四、AI 建议的采纳与推翻记录

### 采纳的建议

| 建议 | 来源 | 理由 |
|------|------|------|
| 用 room_name 替代 room_id 做主键 | 节点 1 | 解决 room_id 重分配导致的数据错乱 |
| 保留历史 ID（previous_ids） | 节点 1 | 追溯 ID 变更历史 |
| BIC 选择最优分布模型 | 节点 2 | 比 AIC 对参数数量惩罚更强，避免过拟合 |
| chartjs-plugin-annotation | 节点 2 | 折线图标注均值线、标准差区间 |
| 直方图+拟合曲线方案 | 节点 2 | 兼顾直观性和统计信息 |
| 分布标注系统（σ区间/IQR/峰位） | 节点 3 | 自动根据最优分布显示不同统计特征 |
| EM 算法处理双峰分布 | 节点 2 | Bimodal 房间耗电分布有物理意义（有人/无人宿舍混合） |
| 自动回退日期 + banner | 节点 4 | 今日无数据时不影响查看，banner 保持数据诚实 |
| 独立脚本维护映射 | 节点 2 | 职责分离，单一职责 |
| 前端并发加载（O(1) 轮次） | 后续设计 | 避免 30+ 楼栋串行加载的性能问题 |

### 推翻/修正的建议

| 被推翻的建议 | 修正 | 原因 |
|------------|------|------|
| 映射维护放入 aggregate_data.py | 独立 update_mapping.py | 职责分离，聚合脚本不应该管映射维护 |
| 纯前端 localStorage 存储订阅数据 | 保留，但要求下线时数据不丢失 | 确认 localStorage 在静态页面方案中可用 |
| 直接去掉 fallback 不做补偿 | 回退 + banner | 用户认为单纯去掉 fallback 太粗糙 |
| 用 ECharts 实现分布图表 | Chart.js + annotation plugin | ECharts 体积大（300KB），现有需求 Chart.js 满足 |
| 提交时不做审查直接 PR | 加 code review 环节 | 用户代码审查发现过 dead code 和 bug |

---

## 五、Superpowers 反思

### 做得好的地方

1. **层层递进的追问** — AI 不是一次性给出完整设计，而是先理解问题、再问关键点、最后给出方案。如 room_id 重构中先确认"彻底解决还是清理"，再确认 query flow，再确认映射维护。

2. **可视化原型能力** — 分布图表设计中，AI 用本地浏览器展示 3 种布局方案的 mockup，让用户直观选择而非想象描述。这比纯文本讨论效率高得多。

3. **方案对比** — 在涉及技术选型时（如 ECharts vs Chart.js、聚合脚本 vs 独立映射维护），AI 会列出完整对比表，让用户从维度上选择。

4. **迭代包容性** — AI 不坚持自己的原始方案。当用户推翻映射维护应放在聚合脚本的建议时，AI 立即重新设计调用链，没有辩解。

5. **事后自动 code review** — 部分 session 结束后，AI 会自动触发 requesting-code-review 技能，让 subagent 检查刚完成的代码。在布局调整实现中发现了 dead code。

### 让人不满的地方

1. **Chart.js Proxy 对象的认知盲区** — AI 多次写出 `{...chart.data.datasets[0].data}` 这种会触发 Proxy setter 死循环的代码。这是 AI 模型对运行时对象代理语义理解的固有缺陷。**最终 debug 花了 3 轮 iteration。**

2. **分步呈现效率问题** — AI 严格遵守"逐段呈现并等待确认"的流程，但对于已经明确的项目（如"楼栋排行榜应该按耗电降序排列"这种常识性问题），也非要问一遍"这样可以吗"。**导致 session 被拖长 30-50%。**

3. **技能选择过重** — 每次切换工作类型（如从 brainstorming → writing-plans → executing-plans），AI 都会重新加载整个 skill base。记录显示 `Base directory for this skill:` 在 76 条 user message 中出现了约 40 次，大量重复加载同一技能。

4. **频繁被中断** — 记录中有 10+ 处 `[Request interrupted by user]`。原因是 AI 在执行任务前经常做一些用户没有要求的多余步骤（如自动创建 git worktree、自动提交、自动读不相关文件）。**用户不得不多次手动打断**。

5. **不保留前期 session 记忆** — 每次新 session 开始时，AI 会重新探索整个项目，重复已经解决的问题。比如 test_aggregate_data.py 的跳过标记，在 room_id 重构 session 中就已经标记为"后面修"，但后续 session 中没有修复，累积到 20 个跳过测试。

6. **跨机器 session 无感知** — 项目在不同机器之间迁移（Linux→MacBook）后，AI 对之前另一台机器上的会话完全没有记忆，需要重新进行项目结构和代码探索。这暴露了当前 agent 基础设施的局限性——session 数据绑定在本地文件系统，无法跨机器共享。

---

## 六、冷启动验证（自我验证）

### 6.1 验证过程

按照课程要求（§4.5），在 SPEC.md + PLAN.md 产出后，使用 **第二个不同的 AI agent**、在新 session 中仅凭这两份文档尝试实现 1-2 个 task，以客观评估规约质量。

- **主开发 agent**: Claude Code（本机，Superpowers 技能栈）
- **冷启动 agent**: Claude Code subagent（全新独立 session，不导入 history/memory，不使用 Superpowers 技能）
- **提供给 agent 的材料**: `SPEC.md` + `PLAN.md`，无额外口头解释
- **指定 task**: PLAN Chunk 0.1（重写 aggregate_data 单元测试）— 此 task 不涉及前端页面兼容或部署环境，适合验证规约的清晰度
- **执行环境**: 独立 git worktree（`/tmp/cold-start-verify`），与主工作区完全隔离

### 6.2 冷启动发现的问题

| # | 冷启动 agent 的疑问/发现 | 暴露的 spec/plan 缺陷 | 修订 |
|---|------------------------|---------------------|------|
| 1 | PLAN 中 `assert result["room_name"] == "1613"` 但实际代码 `process_room` 返回 `room_dir.name`，即目录名 `"19栋第16层1613"` | PLAN 中的断言示例与实际 API 行为不一致——写 spec 时假设 `room_name` 是短名，但代码返回的是完整目录名 | PLAN 中补充 `room_name` 的取值来源说明：`room_name = room_dir.name`（即 Path 最后一级目录名） |
| 2 | PLAN 要求验证 `overview.json` 中的 `total_buildings` 字段，但实际代码不生成该顶层字段——楼栋数嵌套在 `campuses[name]["buildings_count"]` | PLAN 中的数据模型与实际 `generate_hierarchical_summaries` 输出结构不一致 | PLAN 中修正 overview.json 结构描述，补充完整的嵌套字段路径 |
| 3 | PLAN 提到"验证 `balance_history` 键按时间排序"，但 `process_room` 返回普通 dict，排序依赖 Python 3.7+ 插入顺序 | PLAN 对 `balance_history` 的"排序"语义未明确定义——是返回时已排序，还是需要消费者自己排序 | PLAN 中明确：`balance_history` 是 dict，键为 YYYYMMDD 字符串，插入顺序与 glob 排序一致，但不保证严格时间序 |
| 4 | `merge_room_data()` 是 `aggregate_data.py` 的公共函数，但 PLAN 的 Task 0.1 步骤中没有为其设计测试 | PLAN 的 step-by-step 指令只覆盖了 3 个测试类，遗漏了 `merge_room_data` | PLAN 中增加 `TestMergeRoomData` 测试类的具体步骤 |
| 5 | "验证文件大小 < 500KB"——但 `generate_hierarchical_summaries` 写多个文件，测试哪个？ | PLAN 的验证标准不够精确——"文件大小"指哪个文件不明确 | PLAN 中明确：验证 `overview.json` 文件大小 < 500KB |

### 6.3 冷启动 agent 与原意不一致的解读

| # | agent 的解读 | 原意 | 原因 |
|---|-------------|------|------|
| 1 | `room_name` 断言值取 `"19栋第16层1613"` | 应为 `"1613"` | PLAN 写断言时假设 fixture 目录名是 `"1613"`，但 `temp_database` fixture 实际创建的是 `"19栋第16层1613"`（模拟真实路径） |
| 2 | 用 `balance_history` 的 key 集合验证代替排序验证 | 应验证排序 | agent 发现无法可靠验证 dict 键的排序（Python 3.7+ 的插入序是 implementation detail），改为验证所有期望日期都存在 |
| 3 | 自行增加 `TestMergeRoomData` 类 | PLAN 未提及 | agent 发现 `merge_room_data` 是公共函数但没有测试覆盖，自主补全。这是合理的——plan 遗漏了该函数的测试 |

### 6.4 冷启动产出质量评估

冷启动 agent 最终产出了 **4 个测试类、12 个测试用例**，全部通过。与 PLAN 预期的"3 个测试类、~9 个测试"相比，多出 3 个测试（`TestMergeRoomData`），且修正了 PLAN 中 2 处与实际代码不一致的断言。

**差距来源**：PLAN 的断言示例基于"假设的 API 行为"而非"实际代码验证"。写 PLAN 时未运行实际代码确认 `process_room()` 的返回值格式，导致 `room_name` 和 `overview.json` 结构描述与实现不符。

### 6.5 修订对照

冷启动暴露的最大问题：**PLAN 中的代码示例（断言、API 调用）未与实际代码交叉验证**。修订前后对比：

```diff
  Task 0.1 Step 2:
- assert result["room_name"] == "1613"
+ # room_name = room_dir.name，值为目录名如 "19栋第16层1613"
+ assert "1613" in result["room_name"]

  Task 0.1 Step 5:
- 验证 overview.json 的 total_rooms, total_buildings, campuses 字段
+ 验证 overview.json 的 total_rooms, campuses 字段
+ 注意：楼栋数在 campuses[name]["buildings_count"]，不在顶层

+ Task 0.1 Step 5.5（新增）:
+ TestMergeRoomData: 测试 merge_room_data() 合并历史、更新余额、处理空已有数据
```

### 6.6 反思

冷启动验证证明：
1. **spec 对架构的描述（数据流、组件职责）是充分的**——agent 正确理解了模块边界和函数职责
2. **spec/plan 中的代码示例是最大的风险点**——未与实际代码交叉验证的断言比缺失描述更危险，因为 agent 会信任错误的示例而非正确理解意图
3. **plan 的步骤覆盖度有盲区**——遗漏了 `merge_room_data` 的测试，但 agent 自主补全了

> 后续修订策略：PLAN 中所有断言示例必须先运行实际代码验证后再写入，不再凭记忆编写代码片段。

---

## 七、统计

**Session 规模：** 17+ JSONL 会话文件（本机）+ 3+ JSONL 会话文件（另一台 Linux 机器），横跨 May 14-Jun 01，约 500MB+ 聊天记录

| 工具 | Session 数 | 总大小 | 时间跨度 | 机器 |
|------|-----------|--------|---------|------|
| Claude CLI | ~17 | ~500MB | May 16 - Jun 01 | 本机 MacBook |
| Claude CLI | ~3 | ~3MB | May 14-15 | Linux 机器（跨机器探索期） |
| OpenCode | 2+ | ~80MB | May 17-18 | 本机 MacBook |

**关键产出：**
- 3 份 design spec 文档（room-id-refactor, parallel-building-loading, date-data-integrity）
- 9 份 implementation plan 文档
- 1 份综合 SPEC.md（2702 行）
- 1 份综合 PLAN.md（960 行）
- 1 份冷启动验证报告（本节六）
- 2 份 spec 002 完整实施（122 tasks, ECharts 5.x 时代）
- 1 份 spec 003 重构（39-49 tasks, 前端计算架构）
- 2 个前端浏览器原型交互（Superpowers brainstorming）
- 跨机器探索期成果：nju_electric_query.py 初版（同步→异步）、正则解析方案、Cookie 认证框架

**迭代轮次：**
- 002-data-analysis: 122 tasks, 1-shot 实现（后补 3 次 bug 修复）
- 003-perspective-refactor: 3 次架构迭代（48→39→49 tasks）
- room_id 重构: 5 轮修正
- 分布图表: 5 轮修正 + 浏览器原型
- 布局调整: 3 轮 bug 修复（infinite recursion, 标注颜色, chart 不隐藏）
- 日期完整性: 2 轮设计完善

**采纳率：** AI 提出的主要设计建议约 70% 被采纳，30% 被推翻或要求修改。
