# nju-power-watch 体面谢幕实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 njupower.top 域名有效期内，把站点改造成"体面谢幕"形态：首页告别页 + 功能页常驻关闭横幅 + 整站黑白色调纪念 + README/about.md 关闭声明，并补全域名到期引导。

**Architecture:** 黑白纪念走「全局 CSS 滤镜」路线（用户选定），新建 `docs/css/shutdown.css` 只含一行 `filter: grayscale(100%)`，5 个页面统一 `<link>` 引用，不改任何现有 CSS；功能页常驻横幅由新建 `docs/js/shutdown-banner.js` 注入（独立于黑白样式，因首页不需要横幅脚本但需要黑白样式）；首页告别页为静态 HTML 区块（时间线 + FAQ 折叠 `<details>` + 数据指引 + 归档声明），不引入框架。

**Tech Stack:** 静态 HTML + vanilla JS（站点既有技术栈）+ GitHub Pages

**Spec:** `docs/superpowers/specs/2026-08-09-project-shutdown-design.md`

**关键决策（自 spec 提取）:**
- D12 整站黑白色调：`html { filter: grayscale(100%); }`，覆盖首页 + 4 功能页（「关于」是首页 modal，随首页自动黑白）
- D13 图表黑白：全局滤镜为主；多系列图表（building-view 分布图）额外配灰阶色板 + 线型区分，作"双重保障"
- 首页布局：顶部关闭横幅 → 统计条（保留）→ 功能卡片（保留）→ 底部完整告别区块
- 功能页横幅：常驻不可关闭；黑白样式独立成 `shutdown.css`（首页不加载 banner 脚本）
- 域名到期引导：告别页 + README 标注「到期后访问 GitHub 归档仓库」
- push 纪律：所有 commit 仅本地；**push 前必须获得用户批准**

**涉及文件：**

| 文件 | 动作 |
|---|---|
| `docs/css/shutdown.css` | 新建（黑白滤镜） |
| `docs/js/shutdown-banner.js` | 新建（功能页横幅注入） |
| `docs/index.html` | 改造：黑白引用 + hero 变告别横幅 + 底部完整告别区块 |
| `docs/room-view.html` | 加 css 引用 + 横幅脚本 + 图表灰阶 |
| `docs/building-view.html` | 同上 |
| `docs/campus-view.html` | 同上 |
| `docs/room-detail.html` | 同上 |
| `README.md` | 顶部插入关闭声明 |
| `docs/about.md` | 功能更新列表顶部追加"项目谢幕"段落 |

---

### Task 1: 创建 `docs/css/shutdown.css`（整站黑白滤镜）

**Files:**
- Create: `docs/css/shutdown.css`

- [ ] **Step 1: 创建样式文件**

```bash
mkdir -p /Users/macbook/Program/dorm_public/docs/css
```

写入 `/Users/macbook/Program/dorm_public/docs/css/shutdown.css`：

```css
/* 整站黑白纪念：epay 配额限制致项目谢幕后，全站以黑白色调作为纪念基调 */
html {
  filter: grayscale(100%);
}
```

- [ ] **Step 2: 验证内容**

Run: `cat /Users/macbook/Program/dorm_public/docs/css/shutdown.css`
Expected: 恰好两行注释 + `html { filter: grayscale(100%); }` 一条规则。

- [ ] **Step 3: Commit**

```bash
git add docs/css/shutdown.css
git commit -m "feat: add global black-white filter for shutdown memorial (D12)"
```

---

### Task 2: 创建 `docs/js/shutdown-banner.js`（功能页常驻横幅）

**Files:**
- Create: `docs/js/shutdown-banner.js`

- [ ] **Step 1: 编写脚本**

写入 `/Users/macbook/Program/dorm_public/docs/js/shutdown-banner.js`：

```js
/* 功能页常驻关闭横幅：服务已停止提示，常驻不可关闭（D9）
 * 在 body 顶部（topnav 之前）注入一条横幅；不提供关闭按钮。
 */
(function () {
  'use strict';

  function injectBanner() {
    const banner = document.createElement('div');
    banner.id = 'shutdown-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = '⚠️ 本服务已停止维护 · 历史数据仅供查看 · 数据截至 2026-08-08';
    Object.assign(banner.style, {
      position: 'relative',
      zIndex: '99',
      background: '#1a1a1a',
      color: '#e5e5e5',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      letterSpacing: '0.02em'
    });
    document.body.insertBefore(banner, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
```

- [ ] **Step 2: 语法校验**

Run: `node --check /Users/macbook/Program/dorm_public/docs/js/shutdown-banner.js`
Expected: 无输出，退出码 0。

- [ ] **Step 3: Commit**

```bash
git add docs/js/shutdown-banner.js
git commit -m "feat: add persistent shutdown banner injection for functional pages (D9)"
```

---

### Task 3: 4 个功能页接入黑白样式 + 横幅脚本

**Files:**
- Modify: `docs/room-view.html`
- Modify: `docs/building-view.html`
- Modify: `docs/campus-view.html`
- Modify: `docs/room-detail.html`

- [ ] **Step 1: 为每个功能页 `<head>` 加 css 引用**

在每个文件的 `</style>` 之后、`</head>` 之前，插入：

```html
  <link rel="stylesheet" href="css/shutdown.css">
```

逐文件编辑（`room-view.html` / `building-view.html` / `campus-view.html` / `room-detail.html` 均适用）。

- [ ] **Step 2: 为每个功能页 `</body>` 前加横幅脚本**

- `room-view.html` / `building-view.html` / `campus-view.html`：在 `<script src="js/about-modal.js"></script>` 之后、`</body>` 之前插入：

```html
  <script src="js/shutdown-banner.js"></script>
```

- `room-detail.html`（无 about-modal）：在其最后一个 `</script>` 之后、`</body>` 之前插入：

```html
  <script src="js/shutdown-banner.js"></script>
```

- [ ] **Step 3: 验证引用齐全**

Run:

```bash
cd /Users/macbook/Program/dorm_public/docs
grep -l 'css/shutdown.css' room-view.html building-view.html campus-view.html room-detail.html | wc -l
grep -l 'js/shutdown-banner.js' room-view.html building-view.html campus-view.html room-detail.html | wc -l
```

Expected: 两个输出均为 `4`。

- [ ] **Step 4: Commit**

```bash
git add docs/room-view.html docs/building-view.html docs/campus-view.html docs/room-detail.html
git commit -m "feat: wire shutdown.css and shutdown-banner.js into 4 functional pages"
```

---

### Task 4: 首页告别页改造（docs/index.html）

**Files:**
- Modify: `docs/index.html`

本节完成三处改动：(a) `<head>` 加黑白样式引用；(b) hero 区改为"顶部关闭横幅 + 讣告 + 查看完整告别"；(c) `</main>` 前新增底部完整告别区块 `#farewell`（含讣告正文、A4 时间线、B2 FAQ、B1+B3、C3+C2）。

- [ ] **Step 1: `<head>` 加黑白样式引用**

在 `</style>` 之后、`</head>` 之前插入：

```html
  <link rel="stylesheet" href="css/shutdown.css">
```

- [ ] **Step 2: 替换 hero 区为告别横幅**

将现有 hero 区块（`<!-- Hero -->` 注释到对应 `</section>`）整体替换为：

```html
    <!-- 告别横幅（替换原 Hero） -->
    <section class="hero">
      <div class="hero-badge">
        <span>⚫</span>
        <span>服务已停止 · 2026.05 – 2026.08</span>
      </div>
      <h1 class="hero-title">南京大学电费监控系统</h1>
      <p class="hero-subtitle">因 epay 查询接口实施配额限制、数据采集无法继续，本站于 2026 年 8 月停止更新。感谢三个月的陪伴。</p>
      <div class="hero-actions">
        <a href="#farewell" class="btn btn-primary">查看完整告别 ↓</a>
        <a href="room-view.html" class="btn btn-secondary">浏览历史数据</a>
      </div>

      <!-- 用户状态卡片（保留：已配置房间的用户可直达历史数据） -->
      <div class="status-card" id="status-card">
        <div class="status-header">
          <div class="status-icon not-configured" id="status-icon">🏠</div>
          <div>
            <h3 class="status-title" id="status-title">--</h3>
            <p class="status-subtitle" id="status-subtitle">--</p>
          </div>
        </div>
        <div class="status-actions" id="status-actions">
          <!-- 动态填充 -->
        </div>
      </div>
    </section>
```

说明：原 hero 中的 `hero-badge`（"每日更新"）、`hero-title`、`hero-subtitle` 被替换；`status-card` 及其 `checkUserConfig()` 逻辑原样保留（D2「功能页保留可用」）；`btn` 样式已存在于 CSS 中，无需新增。

- [ ] **Step 3: 在 `</main>` 前新增完整告别区块**

在功能卡片 `</section>` 之后、`</main>` 之前插入：

```html
    <!-- 完整告别区块 -->
    <section class="farewell" id="farewell">
      <h2 class="section-title">完整告别</h2>

      <!-- 讣告正文 -->
      <div class="farewell-card">
        <p>2026 年 5 月至 2026 年 8 月，这个小小的电费监控站陪同学们走过了三个月。</p>
        <p>我们为每天 14:00 的全校电费采集努力过：从登录验证码、滑块，到查询接口一次次限流升级，都一一适配。但 epay 查询接口的配额限制最终让大规模采集无法继续——2026 年 8 月 8 日之后，数据停止了更新。</p>
        <p>感谢每一位使用过 njupower.top、提过 issue、报过 bug、在比喻招募里贡献脑洞的同学。是你们让这个大作业，变成了一个真正被用起来的项目。</p>
        <p>数据不会消失：历史数据仍可浏览至域名到期，也完整保留在 GitHub 归档仓库中。想继续查电费的同学，可以试试 <a href="https://github.com/Nanxzi/nju_electric_monitor">nju_electric_monitor</a>。</p>
        <p class="farewell-sign">再见，感谢陪伴。—— 荣子</p>
      </div>

      <!-- A4 项目时间线 -->
      <div class="farewell-card">
        <h3>项目时间线</h3>
        <ul class="timeline">
          <li><b>2026.05</b> 项目启动 · 校园集市首次宣传，每日 14:00 自动采集全校电费</li>
          <li><b>2026.06</b> 数据可视化增强 · 趋势图表、余额预警、充值建议</li>
          <li><b>2026.07</b> 楼层分析上线 · 按楼层对比耗电差异</li>
          <li><b>2026.08</b> 限流与谢幕 · epay 实施查询配额限制，数据采集停止（数据截至 08-08）</li>
        </ul>
      </div>

      <!-- B2 FAQ -->
      <div class="farewell-card">
        <h3>常见问题</h3>
        <details class="faq"><summary>数据还能看吗？</summary><p>可以。历史数据仍可在各视角页面浏览，直至域名到期。</p></details>
        <details class="faq"><summary>为什么停止服务？</summary><p>epay 查询接口实施配额限制，单轮采集成功率低于 90%，大规模采集不可持续。</p></details>
        <details class="faq"><summary>怎么找我的房间？</summary><p>通过上方「我的房间」卡片配置房间号，即可查看该房间的历史数据。</p></details>
        <details class="faq"><summary>原始数据在哪里？</summary><p>完整历史数据保留在 <a href="https://github.com/Chen-Rong-Zi/nju-power-watch">GitHub 归档仓库</a>，可 <code>git clone</code> 获取（<code>database/summaries/</code> 及 <code>database/</code> 目录）。</p></details>
        <details class="faq"><summary>想继续查电费怎么办？</summary><p>可试用 <a href="https://github.com/Nanxzi/nju_electric_monitor">nju_electric_monitor</a>（单房间查询与可视化，需注册 GitHub 账号）。</p></details>
      </div>

      <!-- B1 数据指引 + B3 后继项目 -->
      <div class="farewell-card">
        <h3>数据与后继</h3>
        <p>历史数据仍可浏览至域名到期；<b>域名到期后</b>，请通过 <a href="https://github.com/Chen-Rong-Zi/nju-power-watch">GitHub 归档仓库</a> 获取源码与数据（可 <code>git clone</code>）。</p>
        <p>如需继续查询电费，可试用 <a href="https://github.com/Nanxzi/nju_electric_monitor">nju_electric_monitor</a>（单房间查询与可视化，需注册 GitHub 账号）。</p>
      </div>

      <!-- C3 归档声明 + C2 数据冻结标注 -->
      <div class="farewell-card">
        <h3>归档声明</h3>
        <p>本项目源码已归档（read-only），仓库地址：<a href="https://github.com/Chen-Rong-Zi/nju-power-watch">Chen-Rong-Zi/nju-power-watch</a>。</p>
        <p>数据截至 <b>2026-08-08</b>，之后不再更新。</p>
      </div>
    </section>
```

- [ ] **Step 4: 在 `<style>` 块内追加告别区块样式**

在现有 `<style>` 块的 `/* 页脚 */` 规则之前（`.pagefoot` 之前）追加：

```css
    /* 完整告别区块 */
    .farewell {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }
    .farewell-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 28px 32px;
      margin-bottom: 24px;
      box-shadow: var(--shadow);
      line-height: 1.7;
    }
    .farewell-card h3 {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 16px;
    }
    .farewell-card p {
      margin: 0 0 12px;
    }
    .farewell-card a {
      color: var(--fg);
      text-decoration: underline;
    }
    .farewell-card code {
      font-family: var(--font-mono);
      font-size: 13px;
      background: var(--border);
      padding: 1px 5px;
      border-radius: 4px;
    }
    .farewell-sign {
      margin-top: 20px;
      font-weight: 600;
      text-align: right;
      color: var(--fg);
    }
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .timeline li {
      position: relative;
      padding: 0 0 14px 24px;
      border-left: 1px solid var(--border);
      color: var(--fg);
    }
    .timeline li::before {
      content: '';
      position: absolute;
      left: -5px;
      top: 6px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--fg);
    }
    .timeline li b {
      margin-right: 8px;
    }
    details.faq {
      border-top: 1px solid var(--border);
      padding: 12px 0;
    }
    details.faq summary {
      cursor: pointer;
      font-weight: 500;
      color: var(--fg);
    }
    details.faq p {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
```

- [ ] **Step 5: 验证改动**

Run:

```bash
cd /Users/macbook/Program/dorm_public/docs
grep -c 'css/shutdown.css' index.html
grep -c 'id="farewell"' index.html
grep -c '服务已停止' index.html
grep -c 'nju_electric_monitor' index.html
```

Expected: `1` / `1` / `1`（横幅文案）/ `2`（讣告 + 数据与后继各一处，另有 FAQ 一处→ `3`，见下方说明）。

说明：`nju_electric_monitor` 出现在讣告（1）+ FAQ 想继续查电费（2）+ 数据与后继（3）三处，故预期 `3`。若为 `2`，检查 Step 3 是否漏了 FAQ 那处。

再验证 HTML 结构闭合：

Run: `python3 -c "from html.parser import HTMLParser; p=HTMLParser(); p.feed(open('index.html').read()); print('HTML parse OK')"`
Expected: `HTML parse OK`（HTMLParser 不抛异常即通过）。

- [ ] **Step 6: Commit**

```bash
git add docs/index.html
git commit -m "feat: transform homepage into farewell page (banner + full farewell section)"
```

---

### Task 5: 图表灰阶色板（D13 双重保障）

**Files:**
- Modify: `docs/room-view.html`
- Modify: `docs/room-detail.html`
- Modify: `docs/building-view.html`
- Modify: `docs/campus-view.html`
- Modify: `docs/js/distribution-analyzer.js`（分布图标注绘制颜色，与 building-view 图例一致）

说明：全局滤镜已把所有图表压灰（主机制）。本任务把图表配色显式改为灰阶，保证**多系列**在黑白下仍可分辨（深灰线 + 浅灰填充 + 虚线区分），避免色相不同但亮度相近的系列在灰度下"糊成一团"。

> **注（执行期修正）**：building-view 的分布图标注（μ/σ/中位数/众数/峰线及其填充）绘制在 `js/distribution-analyzer.js`，building-view.html 的图例色板必须与其一致，另有 hover 强调、选中标注、备用清空路径及 FAB box-shadow 含彩色。故在步骤 1-3 基础上补充步骤 1b：将 `distribution-analyzer.js` 中 `#818cf8→#4b5563`、`#6366f1→#374151`、`#f472b6→#111827`、`#ec4899→#1f2937`、`#38bdf8→#6b7280`、`rgba(99,102,241,α)→rgba(107,114,128,α)`、`rgba(220,100,80,α)/rgba(80,100,220,α)→rgba(107,114,128,α)`，并同步 building-view.html 图例/hover/标注/备用路径及 line 1269 box-shadow。

- [ ] **Step 1: room-view.html 与 room-detail.html（单系列余额趋势）**

两文件的趋势图配置（`borderColor: '#10b981'`、`backgroundColor: 'rgba(16, 185, 129, 0.1)'`）改为深灰：

`room-view.html` 与 `room-detail.html` 各自：

```diff
-            borderColor: '#10b981',
-            backgroundColor: 'rgba(16, 185, 129, 0.1)',
+            borderColor: '#374151',
+            backgroundColor: 'rgba(55, 65, 81, 0.1)',
```

- [ ] **Step 2: campus-view.html**

两处：趋势图（indigo → 深灰）+ 楼栋柱状图（绿色渐变 → 灰阶渐变）：

```diff
-      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
-      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
+      gradient.addColorStop(0, 'rgba(55, 65, 81, 0.3)');
+      gradient.addColorStop(1, 'rgba(55, 65, 81, 0.01)');
```

```diff
-            borderColor: '#6366f1',
+            borderColor: '#374151',
```

```diff
-            pointBackgroundColor: '#6366f1',
+            pointBackgroundColor: '#374151',
```

```diff
-            backgroundColor: buildings.map((_, i) => `rgba(16, 185, 129, ${1 - i * 0.08})`),
+            backgroundColor: buildings.map((_, i) => `rgba(55, 65, 81, ${1 - i * 0.08})`),
```

- [ ] **Step 3: building-view.html（含多系列分布图）**

三处：

趋势图（indigo → 深灰）：

```diff
-      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
-      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
+      gradient.addColorStop(0, 'rgba(55, 65, 81, 0.3)');
+      gradient.addColorStop(1, 'rgba(55, 65, 81, 0.01)');
```

```diff
-            borderColor: '#6366f1',
-            pointBackgroundColor: '#6366f1',
+            borderColor: '#374151',
+            pointBackgroundColor: '#374151',
```

分布图（多系列：bars 用中灰、拟合线用深灰、用户标注线用近黑虚线）：

```diff
-              backgroundColor: histogram.counts.map(() => 'rgba(99, 102, 241, 0.35)'),
-              borderColor: histogram.counts.map(() => 'rgba(99, 102, 241, 0.7)'),
+              backgroundColor: histogram.counts.map(() => 'rgba(107, 114, 128, 0.35)'),
+              borderColor: histogram.counts.map(() => 'rgba(107, 114, 128, 0.7)'),
```

```diff
-              borderColor: 'oklch(65% 0.18 25)',
+              borderColor: '#374151',
```

```diff
-              pointBackgroundColor: 'oklch(65% 0.18 25)',
+              pointBackgroundColor: '#374151',
```

用户标注线（粉色 → 近黑虚线，保留既有 `borderDash: [6, 3]`）：

```diff
-              borderColor: '#f472b6',
+              borderColor: '#111827',
```

```diff
-                backgroundColor: '#ec4899',
+                backgroundColor: '#1f2937',
```

- [ ] **Step 4: 验证无残留彩色图表色**

Run:

```bash
cd /Users/macbook/Program/dorm_public/docs
grep -rn "'#10b981'\|'#6366f1'\|'#f472b6'\|'#ec4899'\|'oklch(65% 0.18 25)\|rgba(16, 185, 129\|rgba(99, 102, 241" room-view.html building-view.html campus-view.html room-detail.html
```

Expected: 无输出（或仅剩注释/非图表上下文中的说明性文本）。

- [ ] **Step 5: Commit**

```bash
git add docs/room-view.html docs/building-view.html docs/campus-view.html docs/room-detail.html
git commit -m "feat: grayscale chart palettes for black-white readability (D13)"
```

---

### Task 6: README.md 顶部关闭声明

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在标题后插入关闭声明**

在 `README.md` 第一行 `# ⚡ NJU 宿舍电费监控系统` 之后、`> 帮助南京大学...` 之前插入：

```markdown
> ## ⚠️ 项目已停止维护（2026-08）
>
> 因 epay 查询接口实施配额限制、数据采集无法继续，本项目于 2026 年 8 月停止维护并归档。
> 对抗过程详见 [docs/about.md](docs/about.md)。
>
> - 🌐 在线站点将保留至域名到期（历史数据只读，供查看）；域名到期后请通过本仓库访问（源码 + 数据可 `git clone`）
> - 📦 历史数据与源码保留在本仓库（已归档 · read-only），可 `git clone` 获取
> - 🔄 如需继续查询电费，可试用 [nju_electric_monitor](https://github.com/Nanxzi/nju_electric_monitor)（单房间查询与可视化，需注册 GitHub 账号）
```

- [ ] **Step 2: 验证**

Run: `head -12 /Users/macbook/Program/dorm_public/README.md`
Expected: 第 1 行标题，第 3-9 行为新增 blockquote 关闭声明（含 `⚠️ 项目已停止维护（2026-08）`）。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add shutdown notice to README top"
```

---

### Task 7: docs/about.md 追加"项目谢幕"段落

**Files:**
- Modify: `docs/about.md`

- [ ] **Step 1: 在功能更新列表顶部插入谢幕段落**

在 `## 🚀 功能更新` 之后、`### 📅 2026 年 8 月 · 限流事件` 之前插入：

```markdown
### 📅 2026 年 8 月 · 项目谢幕

> ⚫ 因 epay 查询接口实施配额限制、数据采集无法继续，本项目于 2026 年 8 月停止维护并归档。历史数据保留至域名到期，源码与数据可在归档仓库 `git clone` 获取。如需继续查询电费，可试用 [nju_electric_monitor](https://github.com/Nanxzi/nju_electric_monitor)。

**完整对抗史**：

- **最初 · 2026.05**：校园集市首次宣传，每日 14:00 自动采集全校电费，默认并发 24，一次跑完全校宿舍。
- **对抗一 · 登录验证码 / 滑块**：auth.nju 登录页出现验证码并升级为滑块。项目集成云码验证码识别 API，2026 年 7 月进一步集成 NJUlogin 适配滑块登录流程。直到项目结束，登录始终成功。
- **对抗二 · 查询限流**：epay 查询接口开始限流（RateLimitedError）。历经多轮迭代：v1 分批查询 + 自动恢复 + 请求间隔（#23，后因故 revert 重做）；v2 单批次 + 1 并发 + 0.5s 间隔（#25）；并发数 24 → 10 → 1；工作流超时上限 130 → 360 → 480 分钟。2026-08-04 epay 更新限流机制，原有方法全部失效，数据采集中断约 48 小时，适配后恢复。
- **终局 · 查询配额限制**：epay 对单会话查询次数实施配额限制，超过阈值后返回「错误查询房间信息失败」（HTTP 层 502）。全校约 1.7 万房间规模下，单轮成功率骤降至 37.3%（4338 间中仅 1619 间成功），低于 90% 可靠性阈值，大规模采集不可持续，项目遂停止服务。
```

- [ ] **Step 2: 验证**

Run: `grep -n "项目谢幕\|完整对抗史\|查询配额限制" /Users/macbook/Program/dorm_public/docs/about.md | head -5`
Expected: 前几行依次命中"项目谢幕 / 完整对抗史 / 查询配额限制（终局）"。

- [ ] **Step 3: Commit**

```bash
git add docs/about.md
git commit -m "docs: add project farewell section with full epay arms-race history to about.md"
```

---

### Task 8: 本地验证与汇报

**Files:**
- Test: 全站（本地 HTTP 服务 + 浏览器）

- [ ] **Step 1: 启动本地服务**

Run:

```bash
cd /Users/macbook/Program/dorm_public/docs
python3 -m http.server 8642 &
sleep 1
curl -s -o /dev/null -w '%{http_code}' http://localhost:8642/index.html
```

Expected: `200`。

- [ ] **Step 2: 浏览器验证首页告别页**

用浏览器（Playwright 可用则用之；否则 curl 抽查内容）访问 `http://localhost:8642/index.html`，确认：
1. 页面整体呈黑白色调（`html` 计算样式 `filter: grayscale(100%)`）
2. 顶部横幅显示 `⚫ 服务已停止 · 2026.05 – 2026.08`
3. 「查看完整告别 ↓」按钮存在，点击滚动到 `#farewell`
4. `#farewell` 区块含讣告、时间线、FAQ（`<details>` 可展开）、数据与后继、归档声明
5. 统计条与功能卡片仍显示

- [ ] **Step 3: 浏览器验证功能页横幅**

访问 `http://localhost:8642/room-view.html`（及 building-view / campus-view / room-detail），确认：
1. 页面整体黑白
2. body 顶部出现常驻横幅 `⚠️ 本服务已停止维护 · 历史数据仅供查看 · 数据截至 2026-08-08`，且无关闭按钮
3. 图表渲染正常、呈灰阶（趋势线为深灰）

- [ ] **Step 4: 停止本地服务**

Run: `kill %1 2>/dev/null || true`

- [ ] **Step 5: 全量回归确认**

Run:

```bash
cd /Users/macbook/Program/dorm_public
git log --oneline -8
git status --short
```

Expected: 7 个新 commit（Task 1-7 各一个），工作树干净。

- [ ] **Step 6: 汇报并询问 push/PR**

向用户汇报：7 个本地 commit 的内容、验证结论，并说明按纪律**未 push**；询问是否 push 到 `docs/2026-08-09-project-shutdown` 分支 / 是否创建 PR。push 须用户批准后执行（D11）。
