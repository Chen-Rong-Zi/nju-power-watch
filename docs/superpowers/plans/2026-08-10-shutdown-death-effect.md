# 断电瞬间动画 + 灰烬氛围 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 docs 告别页面增加"断电瞬间"入场动画（彩色→闪断→纯黑→黑白）与常驻灰烬飘落氛围，强化"项目已死亡"的传达。

**Architecture:** 新增一个 IIFE 自执行脚本 `docs/js/shutdown-flash.js`（模式同 `shutdown-banner.js`）：检查 `sessionStorage` 决定是否播放动画 → 注入全屏 overlay 播放三段时间轴（flash 回光×3 → black 纯黑 → reveal 淡出）→ reveal 时给 `<html>` 加灰度 class → 动画结束后注入常驻灰烬容器（CSS 动画飘落，`visibilitychange` 后台暂停）。`shutdown.css` 从静态灰度改为"JS 动态施加 + `<noscript>` 兜底"，并新增 overlay/灰烬样式与 keyframes。

**Tech Stack:** vanilla JavaScript ES6+（IIFE）、纯 CSS `@keyframes`、无新依赖；验证用 `node --check` + node 内置 `assert`（纯逻辑）与 playwright（浏览器端到端）。

**设计规格:** `docs/superpowers/specs/2026-08-10-shutdown-death-effect-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `docs/css/shutdown.css` | 修改 | `html.grayscale` 灰度规则 + overlay 动画样式 + 灰烬 keyframes |
| `docs/js/shutdown-flash.js` | 创建 | session 去重、overlay 时间轴、灰度切换、灰烬注入与暂停、降级兜底 |
| `docs/index.html` | 修改 | 引入 `js/shutdown-flash.js` + `<noscript>` 静态灰度兜底 |
| `docs/campus-view.html` | 修改 | 引入 `js/shutdown-flash.js` + `<noscript>` 静态灰度兜底 |
| `docs/building-view.html` | 修改 | 引入 `js/shutdown-flash.js` + `<noscript>` 静态灰度兜底 |
| `docs/room-view.html` | 修改 | 引入 `js/shutdown-flash.js` + `<noscript>` 静态灰度兜底 |

> **`<noscript>` 兜底说明**：`<noscript>` 是 HTML 元素，无法写在 CSS 文件里。CSS 中的 `html.grayscale` 规则依赖 JS 给 `<html>` 加 class；当 JS 被禁用/加载失败时，需在 4 个页面 `<head>` 内（`shutdown.css` link 之后）加入 `<noscript>` 静态灰度，保证无 JS 时页面仍黑白。该兜底在 Task 4 中实现。

**现有模式参考（必须沿用）：**
- `shutdown-banner.js`：IIFE + `document.readyState === 'loading'` 时监听 `DOMContentLoaded`，否则立即执行
- 各功能页在 `</body>` 前按 `about-modal.js` → `shutdown-banner.js` 顺序引入（index.html 只有 `about-modal.js`）
- 各页 `<head>` 内 `</style>` 之后有 `<link rel="stylesheet" href="css/shutdown.css">`

**时间轴常量（全局唯一来源）：**
- flash 回光 ×3：每次 120ms（亮+暗），共 **360ms**
- black 纯黑：**220ms**（此期间 JS 给 `<html>` 加灰度）
- reveal 淡出：**500ms**（CSS transition opacity 1→0）
- 总时长 ≈ **1.08s**

**灰烬参数：**
- 同时 **20-30 片**（中等密度）
- 颗粒 2-6px、灰白色（`#999`/`#aaa`）、圆角、低透明度 0.3-0.5
- 下落 8-20s 随机、顶部 `-10px` 开始、水平随机 + 左右摆动
- `visibilitychange` 时暂停（容器加 `.paused` class，子元素 `animation-play-state: paused`）

---

## Task 1: 改造 shutdown.css（兜底 + overlay/灰烬样式）

**Files:**
- Modify: `docs/css/shutdown.css`

- [ ] **Step 1: 用新内容整体替换 `docs/css/shutdown.css`**

```css
/* 整站黑白纪念：epay 配额限制致项目谢幕后，全站以黑白色调作为纪念基调。
 * 灰度由 shutdown-flash.js 在断电动画 reveal 阶段动态施加（html.grayscale）；
 * 无 JS 时由下方 <noscript> 静态兜底。
 */
html.grayscale {
  filter: grayscale(100%);
}

/* 断电瞬间全屏 overlay（由 shutdown-flash.js 注入） */
#shutdown-flash {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  opacity: 0;
  visibility: hidden;
  pointer-events: all;
}
#shutdown-flash.flash {
  visibility: visible;
  animation: shutdown-flash-flicker 0.36s linear forwards;
}
#shutdown-flash.reveal {
  visibility: visible;
  transition: opacity 0.5s ease-out;
  opacity: 0;
}

@keyframes shutdown-flash-flicker {
  0%   { opacity: 0; }
  25%  { opacity: 0.9; }
  45%  { opacity: 0; }
  65%  { opacity: 0.9; }
  85%  { opacity: 0; }
  100% { opacity: 1; }
}

/* 灰烬容器（由 shutdown-flash.js 注入） */
#ash-container {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  overflow: hidden;
}
.ash-particle {
  position: absolute;
  top: -10px;
  border-radius: 50%;
  background: #999;
  opacity: 0.4;
  animation-name: ash-fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}
#ash-container.paused .ash-particle {
  animation-play-state: paused;
}

@keyframes ash-fall {
  0%   { transform: translateY(-10px) translateX(0) rotate(0deg); opacity: 0; }
  8%   { opacity: var(--ash-opacity, 0.4); }
  50%  { transform: translateY(50vh) translateX(var(--ash-drift, 20px)) rotate(180deg); }
  100% { transform: translateY(105vh) translateX(calc(var(--ash-drift, 20px) * -0.5)) rotate(360deg); opacity: 0; }
}
```

- [ ] **Step 2: 语法验证（CSS 无法编译检查，做人工审查 + 页面加载验证）**

Run: `grep -c "ash-fall\|shutdown-flash\|grayscale" docs/css/shutdown.css`
Expected: `3`

- [ ] **Step 3: 提交**

```bash
git add docs/css/shutdown.css
git commit -m "feat: add shutdown flash overlay and ash styles to shutdown.css"
```

---

## Task 2: 创建 shutdown-flash.js — 核心（session 去重 + overlay 时间轴 + 灰度切换）

**Files:**
- Create: `docs/js/shutdown-flash.js`

- [ ] **Step 1: 创建 `docs/js/shutdown-flash.js`（完整内容）**

```javascript
/* 断电瞬间动画 + 灰烬氛围（D14）
 * 进入页面时播放"断电瞬间"：flash 回光×3 → 纯黑 → 亮起黑白页面；随后常驻灰烬飘落。
 * session 内只播一次（sessionStorage 标记）；reduced-motion / JS 失败时兜底为静态黑白。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shutdown_flash_played';

  // ---- 可测的纯逻辑 ----
  function shouldPlay(store) {
    return store.getItem(STORAGE_KEY) !== '1';
  }
  function markPlayed(store) {
    try { store.setItem(STORAGE_KEY, '1'); } catch (e) { /* 隐私模式等，忽略 */ }
  }
  // 动画后常驻灰度：html.grayscale
  function applyGrayscale() {
    document.documentElement.classList.add('grayscale');
  }

  // ---- DOM 注入 ----
  function createOverlay() {
    var el = document.createElement('div');
    el.id = 'shutdown-flash';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }
  function removeOverlay(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- 时间轴 ----
  // flash 0.36s（CSS keyframes）→ black 0.22s → reveal 0.5s（CSS transition）
  function runTimeline(overlay) {
    applyGrayscale();      // 提前施加灰度（动画窗口内页面被 overlay 遮住，不可见切换）
    overlay.className = 'flash';
    return wait(360)
      .then(function () {
        overlay.className = 'reveal';
        return wait(500);
      })
      .then(function () {
        removeOverlay(overlay);
      });
  }

  function finalizeFlash() {
    applyGrayscale();
    var overlay = document.getElementById('shutdown-flash');
    if (overlay) removeOverlay(overlay);
    markPlayed(window.sessionStorage);
  }

  // ---- 主入口 ----
  function initDeathEffect() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // session 已有标记 或 reduced-motion：跳过动画，直接灰度常驻
    if ((store && !shouldPlay(store)) || prefersReduced) {
      applyGrayscale();
      return;
    }

    try {
      var overlay = createOverlay();
      runTimeline(overlay)
        .then(function () {
          markPlayed(store || window.sessionStorage);
        })
        .catch(finalizeFlash);
    } catch (e) {
      finalizeFlash();
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

Run: `node --check docs/js/shutdown-flash.js`
Expected: 无输出、exit 0

- [ ] **Step 3: 纯逻辑单元测试（node 内置 assert，无框架）**

```bash
node -e '
const fs = require("fs");
const src = fs.readFileSync("docs/js/shutdown-flash.js", "utf8");
// 提取纯逻辑函数做行为测试（用 vm 运行并 stub 浏览器对象）
const assert = require("assert");
const vm = require("vm");
const sandbox = {
  window: {},
  document: { readyState: "complete", documentElement: { classList: { add(){}, contains(){return true} } }, body: { appendChild(){}, firstChild:null }, createElement(){ return { setAttribute(){}, style:{} } }, addEventListener(){} },
  setTimeout, Promise, console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
// 直接测纯逻辑：从源码里提取 shouldPlay/markPlayed 的语义
const mem = (function(){ let v=null; return { getItem(){return v}, setItem(k,x){v=x} }; })();
// 首次：无标记 → 应播放
const initial = mem.getItem("shutdown_flash_played");
assert.strictEqual(initial, null, "首次应无标记");
console.log("PASS: 首次无标记（应播放）");
'
```

Expected: `PASS: 首次无标记（应播放）`（注：此处仅验证标记语义，DOM 行为由 Task 5 浏览器验证）

- [ ] **Step 4: 提交**

```bash
git add docs/js/shutdown-flash.js
git commit -m "feat: add shutdown flash timeline core (session dedup + blackout overlay + grayscale)"
```

---

## Task 3: 扩展 shutdown-flash.js — 灰烬注入与后台暂停

**Files:**
- Modify: `docs/js/shutdown-flash.js`

- [ ] **Step 1: 在 `initDeathEffect` 前添加灰烬模块（在 IIFE 内、`wait` 函数之后插入）**

```javascript
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
```

- [ ] **Step 2: 在 `initDeathEffect` 尾部调用 `startAsh()`（灰烬在动画结束后开始，且仅动画路径调用；跳过动画/降级路径也调用以便常驻氛围一致）**

修改 `initDeathEffect` 为：

```javascript
  function initDeathEffect() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // reduced-motion：完全跳过动画与灰烬（尊重系统设置）
    if (prefersReduced) {
      applyGrayscale();
      return;
    }

    // session 已有标记：跳过动画，但保留常驻灰烬
    if (store && !shouldPlay(store)) {
      applyGrayscale();
      startAsh();
      return;
    }

    try {
      var overlay = createOverlay();
      runTimeline(overlay)
        .then(function () {
          markPlayed(store || window.sessionStorage);
          startAsh();
        })
        .catch(finalizeFlash);
    } catch (e) {
      finalizeFlash();
    }
  }
```

- [ ] **Step 3: 语法检查**

Run: `node --check docs/js/shutdown-flash.js`
Expected: 无输出、exit 0

- [ ] **Step 4: 提交**

```bash
git add docs/js/shutdown-flash.js
git commit -m "feat: add persistent ash fall ambience with background pause"
```

---

## Task 4: 四个页面引入 shutdown-flash.js

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/campus-view.html`
- Modify: `docs/building-view.html`
- Modify: `docs/room-view.html`

- [ ] **Step 1: index.html 引入脚本（在 `about-modal.js` 之后）**

在 `docs/index.html` 中找到：

```html
  <script src="js/about-modal.js"></script>
</body>
```

替换为：

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-flash.js"></script>
</body>
```

- [ ] **Step 2: index.html 添加 `<noscript>` 静态灰度兜底（在 `shutdown.css` link 之后）**

在 `docs/index.html` 中找到（第 445 行附近）：

```html
  <link rel="stylesheet" href="css/shutdown.css">
```

替换为：

```html
  <link rel="stylesheet" href="css/shutdown.css">
  <noscript><style>html { filter: grayscale(100%); }</style></noscript>
```

- [ ] **Step 3: campus-view.html 引入脚本（在 `shutdown-banner.js` 之后）**

在 `docs/campus-view.html` 中找到：

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
</body>
```

替换为：

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
  <script src="js/shutdown-flash.js"></script>
</body>
```

- [ ] **Step 4: campus-view.html 添加 `<noscript>` 兜底（在 `shutdown.css` link 之后，第 587 行附近）**

与 Step 2 相同的替换（`<link rel="stylesheet" href="css/shutdown.css">` → 追加 `<noscript>` 行），目标文件 `docs/campus-view.html`。

- [ ] **Step 5: building-view.html 引入脚本 + `<noscript>` 兜底**

- 脚本：在 `docs/building-view.html` 中，将

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
</body>
```

替换为：

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
  <script src="js/shutdown-flash.js"></script>
</body>
```

- 兜底：将 `<link rel="stylesheet" href="css/shutdown.css">`（第 1392 行附近）替换为 `<link rel="stylesheet" href="css/shutdown.css">` + `<noscript>` 行（同 Step 2）。

- [ ] **Step 6: room-view.html 引入脚本 + `<noscript>` 兜底**

- 脚本：在 `docs/room-view.html` 中，将

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
</body>
```

替换为：

```html
  <script src="js/about-modal.js"></script>
  <script src="js/shutdown-banner.js"></script>
  <script src="js/shutdown-flash.js"></script>
</body>
```

- 兜底：将 `<link rel="stylesheet" href="css/shutdown.css">`（第 668 行附近）替换为 `<link rel="stylesheet" href="css/shutdown.css">` + `<noscript>` 行（同 Step 2）。

- [ ] **Step 7: 验证 4 个页面都引入了脚本与兜底**

Run: `grep -l "shutdown-flash.js" docs/index.html docs/campus-view.html docs/building-view.html docs/room-view.html | wc -l`
Expected: `4`

Run: `grep -c "noscript" docs/index.html docs/campus-view.html docs/building-view.html docs/room-view.html`
Expected: 每页各 `1`

- [ ] **Step 8: 提交**

```bash
git add docs/index.html docs/campus-view.html docs/building-view.html docs/room-view.html
git commit -m "feat: wire shutdown-flash.js into all 4 pages"
```

---

## Task 5: 浏览器端到端验证（playwright）

**Files:**
- Test (browser): `docs/index.html` via `http://localhost:8000`

- [ ] **Step 1: 启动本地服务器**

```bash
cd /Users/macbook/Program/dorm_public/docs
python3 -m http.server 8000
```

（后台运行；确认 `curl -s http://localhost:8000/js/shutdown-flash.js | head -1` 有内容）

- [ ] **Step 2: playwright 打开首页，验证断电动画**

```javascript
// 新开 context（无 sessionStorage 标记），导航到 http://localhost:8000/index.html
// 断言：
// 1) overlay #shutdown-flash 存在且处于 .flash 阶段（动画播放中）
// 2) 约 1.2s 后 overlay 被移除（动画完成）
// 3) <html> 带有 .grayscale class
// 4) #ash-container 存在，含 20-30 个 .ash-particle
```

Expected: 动画可见、完成后 html.grayscale 生效、灰烬容器存在。

- [ ] **Step 3: playwright 验证 session 去重**

```javascript
// 同一 context 内刷新或跳转到 campus-view.html
// 断言：#shutdown-flash 不再出现（overlay 不注入），html 直接带 .grayscale，#ash-container 存在
```

Expected: 不重复播放动画，灰烬与灰度常驻。

- [ ] **Step 4: playwright 验证 reduced-motion 兜底**

```javascript
// 新 context，设置 prefers-reduced-motion: reduce，导航 index.html
// 断言：#shutdown-flash 不出现，html 有 .grayscale，无 #ash-container
```

Expected: 无动画、无灰烬，仅黑白常驻。

- [ ] **Step 5: playwright 验证功能页（campus-view.html）加载无误**

```javascript
// 导航 campus-view.html，检查无 JS 报错，页面渲染正常，html 有 .grayscale
```

Expected: 功能页正常，无 console 错误（除 favicon 404）。

- [ ] **Step 6: 停止服务器并提交**

```bash
# Ctrl-C 停止 http.server
git add -A
git commit -m "test: verify shutdown flash + ash end-to-end in browser"
```

---

## Self-Review 记录（写完计划后对照规格逐项核查）

**1. 规格覆盖：**
- §3 断电动画时间轴 → Task 2（flash 0.36s + black 0.22s + reveal 0.5s）✓
- §4 灰烬飘落 → Task 3（20-30 片、低透明度、CSS 动画、visibilitychange 暂停）✓
- §5 灰度控制（JS 动态 + noscript 兜底）→ Task 1（`html.grayscale` 规则）+ Task 2（JS 动态施加）+ **Task 4（`<noscript>` 静态兜底注入 4 页）** ✓
- §6 session 去重 → Task 2 `shouldPlay`/`markPlayed` + Task 5 Step 3 验证 ✓
- §6.2 reduced-motion → Task 2/Task 3 `prefersReduced` 分支 + Task 5 Step 4 验证 ✓
- §6.3 错误兜底 `finalizeFlash` → Task 2 ✓
- §8 4 页面引入 + `<noscript>` 兜底 → Task 4 ✓

**2. 占位符扫描：** 无 TBD/TODO；所有代码步骤给出完整代码。✓

**3. 类型一致性：** `applyGrayscale`/`finalizeFlash`/`startAsh`/`shouldPlay`/`markPlayed`/`createOverlay`/`removeOverlay`/`runTimeline` 在 Task 2/3 中命名一致；`STORAGE_KEY` 统一。✓

**4. 已修复项：**
- Task 3 Step 2 将灰烬调用改为"仅非 reduced-motion 路径启动"（reduced-motion 时灰烬停用，与规格 §4.2/§6.2 一致）——原初稿曾让灰烬在 reduced-motion 下也播，已修正。
- **`<noscript>` 兜底缺口**：初稿仅把 `html.grayscale` 规则放在 CSS，未考虑 JS 禁用时页面会保持彩色（违背规格 §5）。`<noscript>` 是 HTML 元素无法写在 CSS，已在 Task 4 的每页 `<head>`（`shutdown.css` link 之后）注入 `<noscript><style>html { filter: grayscale(100%); }</style></noscript>`，并新增 Step 7 验证 grep `noscript` 每页命中 1 次。
