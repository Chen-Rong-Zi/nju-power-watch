# 色彩流失死亡效果（v2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 v1「断电闪断」入场动画重写为「色彩流失」：页面彩色在 ~1.5s 内连续渐变到黑白（无闪白、无黑屏），顶部常驻横幅同步淡入后不淡出，随后灰烬飘落。

**Architecture:** 三个文件协同，4 个页面 HTML 不动。
- `docs/css/shutdown.css`：删除 v1 的 `#shutdown-flash` overlay 与 flicker keyframes；新增 `html.draining`（显式起始态 + transition 1.5s）与 `html.grayscale`（终点态，含亮度轻垂，源码顺序在 `.draining` 之后）。
- `docs/js/shutdown-banner.js`：横幅改注入到 `nav.topnav` 内部顶部（随现有 sticky 导航常驻视口顶部），初始 `opacity: 0` + transition，文案加「⚡ 电量耗尽」。
- `docs/js/shutdown-flash.js`：删除 overlay 时间轴；新增 `runDrain()`（加 `.draining` → 300ms 后横幅淡入 + 加 `.grayscale` → 等 1600ms → 移除 `.draining`）、`showBanner()`、`finalizeStatic()` 兜底；保留灰烬模块、session 去重、reduced-motion 分支。

**Tech Stack:** vanilla JS（IIFE，`var`/function 风格，与 shutdown-flash.js 现状一致）、纯 CSS `transition`/`@keyframes`、`sessionStorage`。无新依赖。测试：`node --check` + 浏览器 E2E（无 JS 测试框架）。

---

## Task 1: shutdown.css — 移除 flash 样式，添加色彩流失过渡

**Files:**
- Modify: `docs/css/shutdown.css`

**背景**：v1 的 `#shutdown-flash` overlay、`.flash`/`.reveal`、`@keyframes shutdown-flash-flicker` 是"闪白 + 黑屏"动画的样式，v2 已弃用，必须删除。新增的 `html.draining` 是色彩流失的过渡起始态。

- [ ] **Step 1: 替换文件顶部（删除 flash 样式，添加 drain 样式）**

把 `docs/css/shutdown.css` 开头（第 1-36 行：文件头注释、`html.grayscale`、`#shutdown-flash` 三组、flicker keyframes）整体替换为：

```css
/* 整站黑白纪念：epay 配额限制致项目谢幕后，全站以黑白色调作为纪念基调。
 * 灰度由 shutdown-flash.js 动态施加（html.grayscale）；
 * 首次访问经 html.draining 过渡（色彩流失 ~1.5s），无 JS 时由 <noscript> 静态兜底。
 */

/* 色彩流失过渡起始态（由 shutdown-flash.js 临时施加，动画结束后移除以避免重载重播）。
 * 注意：必须位于 html.grayscale 之前——两者并存时靠源码顺序让 .grayscale 的终点 filter 生效。 */
html.draining {
  filter: grayscale(0%) brightness(100%);
  transition: filter 1.5s ease-out;
}

/* 整站黑白纪念态：流失动画终点与静态兜底共用（含轻微亮度下垂，模拟电量耗尽） */
html.grayscale {
  filter: grayscale(100%) brightness(0.92);
}
```

保留文件其余部分（灰烬容器 `#ash-container`、`.ash-particle`、`@keyframes ash-fall`、`.paused`）**原样不动**。

- [ ] **Step 2: 验证删除与新增**

```bash
grep -n "shutdown-flash\|flicker" docs/css/shutdown.css
```
Expected: 无输出（flash 样式已全删）。

```bash
grep -n "html.draining\|html.grayscale" docs/css/shutdown.css
```
Expected: 两行都出现，且 `html.grayscale` 位于 `html.draining` 之后。

- [ ] **Step 3: Commit**

```bash
git add docs/css/shutdown.css
git commit -m "refactor: replace flash overlay styles with color-drain transition in shutdown.css

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: shutdown-banner.js — 顶部常驻 + 淡入准备 + 文案

**Files:**
- Modify: `docs/js/shutdown-banner.js`

**背景**：v1 横幅 `position: relative` 注入 body 顶部，会随页面滚动消失。v2 要求常驻视口顶部。各页面的 `nav.topnav` 已是 `position: sticky; top: 0`，因此把横幅注入到 nav 内部顶部（作为 nav 第一个子元素），它就会随 sticky 导航一起常驻视口顶部——零重叠、无需 body padding、不动 4 页 HTML。初始 `opacity: 0` 由 shutdown-flash.js 在色彩流失时置 1。

- [ ] **Step 1: 整体替换文件内容**

```js
/* 功能页常驻关闭横幅：服务已停止提示，常驻不可关闭（D9 / D15 改造）
 * 注入到 .topnav 内部顶部：随现有 sticky 导航一起常驻视口顶部。
 * 初始透明度 0，由 shutdown-flash.js 在色彩流失动画时置 1（淡入后常驻）。
 */
(function () {
  'use strict';

  function injectBanner() {
    const banner = document.createElement('div');
    banner.id = 'shutdown-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = '⚡ 电量耗尽 · 本服务已停止维护 · 数据截至 2026-08-08';
    Object.assign(banner.style, {
      zIndex: '99',
      background: '#1a1a1a',
      color: '#e5e5e5',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      letterSpacing: '0.02em',
      opacity: '0',
      transition: 'opacity 0.4s ease-out'
    });

    // 注入到 sticky 导航内部顶部：随导航常驻视口顶部，避免滚动时被 nav 遮挡
    const nav = document.querySelector('nav.topnav');
    if (nav) {
      nav.insertBefore(banner, nav.firstChild);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
```

注意：`const`/箭头风格保留（该文件原本就是 `const` 风格）；`position` 不再设置（默认 static，在 nav 内部随 nav 一起 sticky）。

- [ ] **Step 2: 语法检查**

```bash
node --check docs/js/shutdown-banner.js
```
Expected: 无输出（退出码 0）。

- [ ] **Step 3: Commit**

```bash
git add docs/js/shutdown-banner.js
git commit -m "feat: make shutdown banner persistent at top of sticky nav (D15)

Injects into nav.topnav so it rides the existing sticky navigation and
stays at the viewport top while scrolling; starts at opacity 0 and is
faded in by shutdown-flash.js. Adds the power-drained copy.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: shutdown-flash.js — 重写为色彩流失时间轴

**Files:**
- Modify: `docs/js/shutdown-flash.js`（整体重写）

**背景**：v1 的 overlay 时间轴（flash→black→reveal）已废弃。v2 改为：`html.draining` 设显式起始态 + transition → 300ms 后横幅淡入并加 `html.grayscale` 触发渐变 → 等 1600ms → 移除 `.draining`（避免重载重播）。保留灰烬模块、session 去重、reduced-motion 分支；新增 `finalizeStatic()` 统一兜底（瞬间黑白 + 横幅 + 灰烬）。注意：reduced-motion 分支**不**启动灰烬（与规格一致）。

- [ ] **Step 1: 整体替换文件内容**

```js
/* 色彩流失动画 + 灰烬氛围 + 常驻顶部横幅（D15）
 * 进入页面时：彩色 → ~1.5s 连续渐变到黑白（色彩流失，无闪白无黑屏），
 * 顶部横幅同步淡入并常驻；随后灰烬飘落。
 * session 内只播一次（sessionStorage 标记）；reduced-motion / JS 失败时兜底为静态黑白 + 横幅。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shutdown_flash_played';
  var DRAIN_MS = 1500;    // 与 shutdown.css 中 html.draining 的 transition 时长一致
  var BANNER_DELAY = 300; // 流失开始后横幅淡入的延迟

  // ---- 可测的纯逻辑 ----
  function shouldPlay(store) {
    return store.getItem(STORAGE_KEY) !== '1';
  }
  function markPlayed(store) {
    if (!store) return;
    try { store.setItem(STORAGE_KEY, '1'); } catch (e) { /* 隐私模式等，忽略 */ }
  }
  // 常驻灰度：html.grayscale（流失终点与静态兜底共用）
  function applyGrayscale() {
    document.documentElement.classList.add('grayscale');
  }

  // ---- 顶部横幅（由 shutdown-banner.js 注入）----
  function showBanner() {
    var banner = document.getElementById('shutdown-banner');
    if (banner) banner.style.opacity = '1';
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- 灰烬氛围 ----
  var ASH_COUNT = 25; // 中等密度 20-30
  var ashContainer = null;

  function createAshParticle() {
    var p = document.createElement('div');
    p.className = 'ash-particle';
    var size = 2 + Math.random() * 4;          // 2-6px
    var duration = 8 + Math.random() * 12;     // 8-20s
    var delay = -(Math.random() * 20);         // 负延迟：立即处于动画中途，避免同帧齐下
    var drift = (Math.random() * 60 - 30);     // -30 ~ 30px 水平漂移
    var opacity = 0.3 + Math.random() * 0.2;   // 0.3-0.5
    p.style.left = (Math.random() * 100) + '%';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.animationDuration = duration + 's';
    p.style.animationDelay = delay + 's';
    p.style.setProperty('--ash-drift', drift.toFixed(1) + 'px');
    p.style.setProperty('--ash-opacity', opacity.toFixed(2));
    return p;
  }

  function startAsh() {
    if (ashContainer || document.getElementById('ash-container')) return;
    ashContainer = document.createElement('div');
    ashContainer.id = 'ash-container';
    ashContainer.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < ASH_COUNT; i++) {
      ashContainer.appendChild(createAshParticle());
    }
    document.body.appendChild(ashContainer);

    // 后台暂停
    document.addEventListener('visibilitychange', function () {
      if (!ashContainer) return;
      if (document.hidden) {
        ashContainer.classList.add('paused');
      } else {
        ashContainer.classList.remove('paused');
      }
    });
  }

  // ---- 色彩流失时间轴 ----
  // html.draining 设显式起始态 + transition；异步间隔后再加 html.grayscale 触发渐变。
  // 结束移除 .draining：去掉 transition，保证 reload/再次访问瞬间切换、不重播动画。
  function runDrain() {
    var root = document.documentElement;
    root.classList.add('draining');
    return wait(BANNER_DELAY)
      .then(function () {
        showBanner();                    // 横幅淡入（CSS transition 0.4s）
        root.classList.add('grayscale'); // 触发 filter 1.5s 渐变
        return wait(DRAIN_MS + 100);     // 等动画结束（+余量）
      })
      .then(function () {
        root.classList.remove('draining');
      });
  }

  // ---- 兜底：瞬间黑白 + 横幅 + 灰烬 ----
  function finalizeStatic() {
    applyGrayscale();
    showBanner();
    startAsh();
  }

  // ---- 主入口 ----
  function initDeathEffect() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // reduced-motion：完全跳过动画与灰烬（尊重系统设置），横幅直接可见
    if (prefersReduced) {
      applyGrayscale();
      showBanner();
      return;
    }

    // session 已有标记：跳过动画，保留横幅与灰烬
    if (store && !shouldPlay(store)) {
      finalizeStatic();
      return;
    }

    try {
      runDrain()
        .then(function () {
          markPlayed(store);
          startAsh();
        })
        .catch(function () {
          finalizeStatic();
          markPlayed(store);
        });
    } catch (e) {
      finalizeStatic();
      markPlayed(store);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeathEffect);
  } else {
    initDeathEffect();
  }
})();
```

- [ ] **Step 2: 语法检查**

```bash
node --check docs/js/shutdown-flash.js
```
Expected: 无输出（退出码 0）。

- [ ] **Step 3: Commit**

```bash
git add docs/js/shutdown-flash.js
git commit -m "refactor: rewrite shutdown-flash.js to color-drain timeline (D15)

Replaces the v1 flash/blackout overlay timeline with a smooth grayscale
drain (html.draining + html.grayscale), banner fade-in coordination, and
a unified finalizeStatic fallback. Keeps ash, session dedup, and
reduced-motion handling.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 端到端验证（浏览器 E2E + pytest 回归）

**Files:** 无预期改动（发现缺陷才改）

**背景**：无 JS 测试框架；用浏览器 E2E 验证 4 个页面上的真实表现，pytest 做 Python 回归。4 个页面 HTML 已引入两个脚本、无需改动；`<noscript>` 静态灰度兜底已存在。

- [ ] **Step 1: 启动本地服务器并验证 index.html 首次访问（色彩流失 + 横幅 + 灰烬）**

```bash
cd docs && python3 -m http.server 8000
```
另开浏览器访问 `http://localhost:8000/index.html`（首次访问，无 session 标记），Expected：
- 页面先以彩色渲染
- ~1.5s 内 `document.documentElement` 的 `filter` 从 `grayscale(0%)` 平滑过渡到 `grayscale(100%) brightness(0.92)`（可 evaluate 抓取多帧验证连续渐变，无瞬间跳变、无白闪、无黑屏）
- 顶部横幅（`#shutdown-banner`，在 `nav.topnav` 内部）在流失开始 ~0.3s 后淡入，之后**不淡出**
- 滚动页面：`#shutdown-banner` 的 `getBoundingClientRect().top` 恒为 0（常驻视口顶部），且不与 `.topnav` 重叠错位
- 流失结束后灰烬（`#ash-container` 下 180 片 `.ash-particle`）存在

- [ ] **Step 2: 验证 session 去重（同 session 内跳页不再播动画）**

同一浏览器标签页/session 内导航到 `campus-view.html`、`building-view.html`、`room-view.html`，Expected：页面直接黑白（无 1.5s 渐变、无色彩瞬间）、横幅已可见、灰烬存在。

- [ ] **Step 3: 验证新 session 重播**

新开浏览器上下文（无 session 标记）再访问 `index.html`，Expected：完整色彩流失动画重新播放一次。

- [ ] **Step 4: 验证 reduced-motion**

用 CDP `Emulation.setEmulatedMedia` 设置 `prefers-reduced-motion: reduce` 后重新加载，Expected：瞬间黑白（无渐变）、横幅可见、**无灰烬**、无动画。

- [ ] **Step 5: 验证 noscript 兜底**

禁用 JS（或临时移除脚本引用）加载页面，Expected：`<noscript>` 静态灰度生效（页面黑白、无横幅、无灰烬）。

- [ ] **Step 6: pytest 回归**

```bash
source venv/bin/activate && pytest -q
```
Expected: `41 passed, 21 skipped`（与 v1 基线一致，本次前端改动不影响 Python 测试）。

- [ ] **Step 7: 若发现缺陷则修复并提交**

如 E2E 发现布局/时序问题（如横幅与 topnav 重叠、渐变跳变、灰烬异常），修复对应文件（优先 CSS/JS），然后重复相关验证步骤并提交修复 commit。若无缺陷，本任务无需提交。

---

## 自查记录（writing-plans self-review）

- **规格覆盖**：§2 色彩流失 → Task 1 + Task 3；§3 常驻顶部横幅 → Task 2 + Task 3；§4 灰烬 → Task 3 保留模块；§5 降级表（首次/再次/reduced-motion/兜底）→ Task 3 `initDeathEffect` 三分支 + Task 4 验证；§6 可访问性（role=status、aria-hidden、无闪烁）→ Task 2/3 保留；§7 文件清单 → Task 1/2/3/4。无遗漏。
- **占位符扫描**：无 TBD/TODO；所有步骤含完整代码与命令。
- **类型/命名一致**：`STORAGE_KEY`、`DRAIN_MS`、`BANNER_DELAY`、`showBanner`、`runDrain`、`finalizeStatic` 在 Task 2/3 间引用一致；`html.draining`/`html.grayscale` 类名在 Task 1/3 一致；`shutdown-banner` id 在 Task 2/3 一致。
- **与规格的一处实施精化**：规格 §3 写的是 `position: fixed` + body padding 补偿；本计划改为「注入到 `nav.topnav` 内部顶部、随已有 sticky 导航常驻」——可见结果一致（横幅始终在视口最顶部），但避免了两条 sticky 栏在滚动时重叠、且无需 body padding hack、无需改 4 页 HTML。此精化已在 Task 2 背景中说明。
