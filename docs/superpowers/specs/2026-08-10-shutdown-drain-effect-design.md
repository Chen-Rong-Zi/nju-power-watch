# 色彩流失动画 + 常驻顶部横幅 — 设计文档（v2 迭代）

> 日期：2026-08-10
> 状态：已获用户确认（brainstorming 流程定稿）
> 范围：docs 前端告别页面的死亡感 UI 迭代（v1 断电闪断 → v2 色彩流失）
> 前置：v1 设计 `2026-08-10-shutdown-death-effect-design.md`（已实现并上线）

## 0. 为什么迭代（用户反馈）

v1「断电闪断」动画上线后，用户反馈：

> 「一打开的动画效果完全看不懂，感觉就像是一个 bug」

成因诊断（用户逐项确认）：

1. **闪白太快**：v1 在 0.36s 内闪白 3 次（opacity 0→0.9→0 循环，每段 ~90ms）——这是「渲染故障」的视觉语言，不是「断电」
2. **黑屏无解释**：v1 spec 明确选了「纯黑无文字」，但没有任何解释时，观众无法识别隐喻
3. **无彩色→黑白渐变**：v1 的灰度切换是「藏在遮罩后面瞬间完成」的，观众看不到颜色的流失过程

用户定调：

- 主动画改为「**颜色从彩色渐变到黑白**」（色彩流失），去掉闪白、去掉黑屏
- 配文字横幅：淡入后**不淡出**，常驻在**屏幕最顶部**（视口固定）
- 横幅策略：**改造现有 `#shutdown-banner`**，不新增第二条横幅

## 1. 设计原则

- **可读性 > 隐喻还原**：任何动效必须能被一眼看出「是故意的」
- **平滑连续 = 故意的视觉语言；突兀闪烁 = bug 的视觉语言**（本次迭代的核心教训）
- 保留克制：动画 ≤ ~1.5s，灰烬很高密度但低透明度，不喧宾夺主
- 健壮降级（同 v1）：无论 JS 失败、禁用、还是动画中途报错，页面始终兜底到黑白可用态
- 尊重用户：`prefers-reduced-motion` 完全跳过动画与灰烬
- 零新依赖：vanilla JS + CSS

## 2. 主动画：色彩流失

### 2.1 时间轴（约 1.5s）

| 阶段 | 内容 | 时长 |
|------|------|------|
| 载入 | 页面正常渲染为**彩色** | — |
| 流失 | `filter: grayscale(0% → 100%)` 连续渐变；末尾亮度轻垂 `brightness(92%)` 模拟电量耗尽 | ~1.5s |
| 稳定 | 黑白页面常驻 + 灰烬飘落 | 持续 |

- 无闪白、无黑屏（移除 v1 的 `#shutdown-flash` overlay 与 flicker keyframes）
- 渐变由 CSS `transition` 驱动（GPU 合成，低开销），非 JS 逐帧

### 2.2 实现要点

- **显式起始态**：CSS filter 过渡需要起始与终点都是可插值的显式值。方案：`html.draining` 设置起始态 `filter: grayscale(0%) brightness(100%)` + `transition: filter 1.5s ease-out`；下一帧再加 `html.grayscale`（终点态 `filter: grayscale(100%) brightness(0.92)`）→ transition 驱动渐变
- **transition 防重播**：动画结束后移除 `html.draining`（无 transition 时再加 `grayscale` 是瞬间切换），保证 reload/再次访问不重复播放流失动画
- **终点态与静态态一致**：`html.grayscale` 的 filter 值在动画路径与静态兜底路径最终一致（静态 `noscript` 兜底可仅 `grayscale(100%)`，省略 brightness，保持简单）

### 2.3 Session 去重

- 沿用 v1 的 `sessionStorage` 标记（键 `shutdown_flash_played = '1'`，复用键名）
- 首次访问（本 session）：完整流失动画 + 横幅淡入
- 再次访问（已标记）：直接静态黑白（无 transition）+ 横幅常驻 + 灰烬

## 3. 常驻顶部横幅（改造 `#shutdown-banner`）

- **注入方式不变**：`shutdown-banner.js` 在 body 顶部（topnav 之前）注入，`role="status"`
- **定位**：`position: relative` → **`position: fixed; top: 0; left: 0; right: 0`**，钉在视口顶部，滚动时始终可见
- **淡入**：初始 `opacity: 0` + `transition: opacity 0.4s`；流失动画开始 ~0.3s 后添加 `.visible` 类 → 淡入
- **淡入后不淡出**，常驻
- **文案**：「⚡ 电量耗尽 · 本服务已停止维护 · 数据截至 2026-08-08」（微调可留到实施）
- **布局补偿**：fixed 后脱离文档流，页面顶部（topnav/内容）需加等量 padding-top，避免被横幅遮挡
- **其他场景**：再次访问 / reduced-motion / 兜底 → 横幅直接可见（不播淡入，或瞬时淡入）

## 4. 灰烬（保留 v1 现状）

- 流失稳定后启动约 180 片灰烬飘落（2026-08-10 依用户反馈 25→60→90→180）
- 后台暂停（`visibilitychange` + `.paused`）
- `prefers-reduced-motion` 时完全停用
- `aria-hidden="true"`、`pointer-events: none`，纯视觉装饰

## 5. 降级优先级

| 场景 | 行为 |
|------|------|
| JS 正常 · 首次访问 | 色彩流失动画 → 横幅淡入常驻 → 灰烬 |
| JS 正常 · 再次访问（已标记） | 瞬间黑白 + 横幅常驻（无动画）+ 灰烬 |
| `prefers-reduced-motion` | 跳过动画与灰烬：瞬间黑白 + 横幅常驻 |
| JS 加载失败 / 禁用 | `<noscript>` 静态灰度兜底（无横幅，横幅由 JS 注入） |
| 动画中途 JS 报错 | 兜底：瞬间黑白 + 横幅显示 + 灰烬，不阻塞内容 |

## 6. 可访问性

- 动画与灰烬为纯视觉装饰，`aria-hidden="true"`，不影响屏幕阅读器
- 横幅保留 `role="status"`
- `prefers-reduced-motion`：完全跳过动画与灰烬
- **无闪烁**（移除 v1 闪白）：渐变平滑、低光敏刺激

## 7. 文件改动清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `docs/js/shutdown-flash.js` | **重写** | 删 overlay/flash/black 时间轴，改为 filter 过渡 + 横幅淡入控制 + 灰烬（保留 session 去重、降级、错误兜底） |
| `docs/js/shutdown-banner.js` | **改造** | fixed 顶部定位、淡入支持（`.visible`）、文案加「⚡ 电量耗尽」 |
| `docs/css/shutdown.css` | **改造** | 删 `#shutdown-flash`/flicker 样式；加 drain 过渡、fixed 横幅样式、页面顶部 padding 补偿 |
| 4 个页面 HTML | 无改动 | 两个脚本已引入 |

## 8. 范围边界（YAGNI）

- ❌ 无黑屏阶段、无闪白
- ❌ 不新增第二条横幅（改造现有 `#shutdown-banner`）
- ❌ 无声音
- ❌ 无 Canvas/WebGL 重渲染（纯 CSS transition + 灰烬 keyframes 保留）
- ❌ 不新增用户设置项/关闭开关（session 去重已足够克制）
- ❌ 不改 4 个页面 HTML 结构

## 9. 技术栈约束

- vanilla JavaScript ES6+（IIFE，无框架）
- 纯 CSS `transition`（色彩流失）+ `@keyframes`（灰烬，保留 v1）
- 无新依赖
- 沿用 `shutdown-banner.js` / `shutdown-flash.js` 的注入模式与代码风格
