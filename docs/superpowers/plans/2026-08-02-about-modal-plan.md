# About Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a closable "about" modal overlay that shares the project story, feature timeline, and community thanks.

**Architecture:** Modal shell created by JS (no inline HTML), content loaded from `about.md` via `fetch()` and rendered with a minimal custom Markdown parser. Each page only needs a nav link and a script include.

**Tech Stack:** Vanilla JavaScript, CSS variables from existing design system.

---

### File Structure

```
docs/
├── about.md                      # CREATE — Markdown content (easy to edit)
├── js/
│   └── about-modal.js            # CREATE — shared JS (modal DOM, markdown render, open/close)
├── index.html                    # MODIFY — nav link + script include
├── room-view.html                # MODIFY — nav link + script include
├── building-view.html            # MODIFY — nav link + script include
├── campus-view.html              # MODIFY — nav link + script include
└── electricity-monitor-index.html# MODIFY — nav link + script include
```

---

### Task 1: Create about.md content

**Files:**
- Create: `docs/about.md`

**Content (Markdown):**

```markdown
# 关于 电费监控系统

南京大学宿舍电费查询工具

大家好，我是 **荣子**。

这个项目最初是软件学院《人工智能驱动软件工程》课程的大作业。今年 5 月，我在校园集市上第一次宣传了它，没想到收到了非常多同学的关注和反馈。

感谢每一位提 issue、报 bug 的同学，你们的帮助让这个项目不断变得更好。

---

## 功能更新

**2026 年 5 月** · 项目启动
在校园集市首次宣传，收到大量反馈，项目正式起步。

**2026 年 6 月** · 房间视角上线
- 电费趋势图表，直观查看余额变化
- 余额预警，低电费时自动提醒
- 充值建议，帮你规划充值时机

**2026 年 7 月** · 校区 & 楼栋视角上线
- 校区视角：全校电费总览，各校区对比
- 楼栋视角：楼栋内各房间耗电量排行榜

**2026 年 8 月** · 楼层分析功能上线
- 按楼层分析耗电差异，帮助识别高楼层 vs 低楼层用电情况
- 灵感来自校园集市上关于"高楼层更耗电"的讨论

---

再次感谢大家的使用和反馈。如果有任何问题或建议，欢迎在 GitHub 上提 issue。

—— 荣子
```

- [ ] **Step 1: Write about.md**
  Write the content above to `docs/about.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/about.md
git commit -m "docs: add about page content"
```

---

### Task 2: Create js/about-modal.js

**Files:**
- Create: `docs/js/about-modal.js`

This file contains:
1. CSS injection for modal styles
2. `renderMarkdown(text)` — minimal Markdown to HTML converter
3. `openAboutModal()` — fetch about.md, render, show modal
4. `closeAboutModal()` — hide modal, remove body scroll lock
5. ESC key listener
6. Loading and error states

**Step 1: Write the complete about-modal.js**

```javascript
(function () {
  'use strict';

  let modalEl = null;
  let initialized = false;

  // Minimal Markdown renderer
  function renderMarkdown(text) {
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Inline: bold, italic, link
      line = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

      // Headings
      if (line.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h2>' + line.slice(3) + '</h2>';
      } else if (line.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h3>' + line.slice(4) + '</h3>';
      } else if (line.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h1>' + line.slice(2) + '</h1>';
      } else if (line.startsWith('- ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + line.slice(2) + '</li>';
      } else if (line.startsWith('---')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<hr>';
      } else if (line.trim() === '') {
        if (inList) { html += '</ul>'; inList = false; }
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<p>' + line + '</p>';
      }
    }
    if (inList) html += '</ul>';

    return html;
  }

  // Create modal DOM
  function createModal() {
    const overlay = document.createElement('div');
    overlay.id = 'about-modal-overlay';
    overlay.style.cssText = `
      display: none; position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.5);
      align-items: center; justify-content: center;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--surface, #fff);
      border-radius: var(--radius-lg, 20px);
      max-width: 640px; width: 90%; max-height: 80vh;
      overflow-y: auto; padding: 40px 32px;
      position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: sticky; top: 0; float: right;
      background: none; border: none; font-size: 28px;
      cursor: pointer; color: var(--muted, #888);
      line-height: 1; padding: 0; margin: -8px -8px 0 0;
      z-index: 1;
    `;
    closeBtn.onmouseover = () => { closeBtn.style.color = 'var(--fg, #333)'; };
    closeBtn.onmouseout = () => { closeBtn.style.color = 'var(--muted, #888)'; };
    closeBtn.onclick = closeAboutModal;

    const content = document.createElement('div');
    content.id = 'about-modal-content';
    content.style.cssText = 'clear: both;';

    card.appendChild(closeBtn);
    card.appendChild(content);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click backdrop to close
    overlay.onclick = function (e) {
      if (e.target === overlay) closeAboutModal();
    };

    // ESC key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        closeAboutModal();
      }
    });

    modalEl = overlay;
    initialized = true;
  }

  // Open modal
  window.openAboutModal = function () {
    if (!initialized) createModal();

    const content = document.getElementById('about-modal-content');
    content.innerHTML = '<p style="text-align:center;color:var(--muted,#888);padding:40px 0;">加载中...</p>';
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    fetch('about.md')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (md) {
        content.innerHTML = renderMarkdown(md);
      })
      .catch(function () {
        content.innerHTML = '<p style="text-align:center;color:var(--danger,#e44);padding:40px 0;">加载失败，请刷新重试</p>';
      });
  };

  // Close modal
  window.closeAboutModal = function () {
    if (modalEl) {
      modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }
  };
})();
```

- [ ] **Step 1: Write about-modal.js**
  Create `docs/js/about-modal.js` with the code above.

- [ ] **Step 2: Commit**

```bash
git add docs/js/about-modal.js
git commit -m "feat: add about modal component with markdown renderer"
```

---

### Task 3: Add nav link and script to index.html

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Add nav link in .nav-links**

After `<a href="campus-view.html">校区视角</a>`, add:
```html
        <a href="javascript:void(0)" onclick="openAboutModal();return false">关于</a>
```

- [ ] **Step 2: Add script include before closing `</body>`**

Add after the existing scripts:
```html
  <script src="js/about-modal.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add docs/index.html
git commit -m "feat: add about modal to index page"
```

---

### Task 4: Add nav link and script to room-view.html

**Files:**
- Modify: `docs/room-view.html`

- [ ] **Step 1: Add nav link in .nav-links** (after campus-view link)
- [ ] **Step 2: Add `<script src="js/about-modal.js"></script>`** before `</body>`
- [ ] **Step 3: Commit**

```bash
git add docs/room-view.html
git commit -m "feat: add about modal to room view page"
```

---

### Task 5: Add nav link and script to building-view.html

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add nav link in .nav-links** (after campus-view link)
- [ ] **Step 2: Add `<script src="js/about-modal.js"></script>`** before `</body>`
- [ ] **Step 3: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: add about modal to building view page"
```

---

### Task 6: Add nav link and script to campus-view.html

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: Add nav link in .nav-links** (after campus-view link)
- [ ] **Step 2: Add `<script src="js/about-modal.js"></script>`** before `</body>`
- [ ] **Step 3: Commit**

```bash
git add docs/campus-view.html
git commit -m "feat: add about modal to campus view page"
```

---

### Task 7: Add nav link and script to electricity-monitor-index.html

**Files:**
- Modify: `docs/electricity-monitor-index.html`

- [ ] **Step 1: Add nav link in .nav-links** (after campus-view link)
- [ ] **Step 2: Add `<script src="js/about-modal.js"></script>`** before `</body>`
- [ ] **Step 3: Commit**

```bash
git add docs/electricity-monitor-index.html
git commit -m "feat: add about modal to electricity monitor index page"
```