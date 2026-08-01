# About Modal Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a closable modal overlay ("about" page) that shares the project story, feature timeline, and thanks to the community.

**Architecture:** Modal HTML inlined in each page (matching existing pattern of `config-overlay` and `redirect-overlay`). Triggered by a "关于" link in the nav bar. No page navigation — opens as an overlay, closable via × button, ESC key, or backdrop click.

**Tech Stack:** Vanilla JavaScript, CSS (no frameworks), consistent with existing design system.

---

### Trigger Point
- Add a "关于" link to the nav bar (`div.nav-links`) on all pages
- Pages: `index.html`, `room-view.html`, `building-view.html`, `campus-view.html`, `electricity-monitor-index.html`
- Positioned after "校区视角", no `.active` class needed (it's not a page)
- Link: `<a href="javascript:void(0)" onclick="openAboutModal();return false">关于</a>`

### Modal UI
- Fixed overlay: `position: fixed; inset: 0; z-index: 200;` with semi-transparent black background (`rgba(0,0,0,0.5)`)
- Centered white card: `max-width: 640px; max-height: 80vh; overflow-y: auto;` with border-radius matching existing design (`--radius-lg: 20px`)
- Close button: × in the top-right corner, 28px, hover color change
- Close behaviors: click ×, click backdrop, press ESC key
- Body scroll locked when modal is open (`overflow: hidden` on body)

### Content Structure
1. **Header** — "关于 电费监控系统" title, subtitle "南京大学宿舍电费查询工具"
2. **自我介绍** — "大家好，我是荣子。" 简短介绍
3. **项目起源** — 软院《人工智能驱动软件工程》大作业，5月在校园集市首次宣传
4. **社区反馈** — 感谢大家提的 issue 和 bug，社区的帮助让项目不断完善
5. **功能时间线** — 按日期拣选的重要功能更新（见下）
6. **结尾致谢** — 再次感谢使用和反馈

### Feature Timeline (拣选)
- 2026-05 — 项目启动，校园集市首次宣传，收到大量反馈
- 2026-06 — 房间视角上线，电费趋势图表、余额预警、充值建议
- 2026-07 — 校区视角、楼栋视角上线，支持全校范围浏览
- 2026-08 — 楼层分析功能上线，帮助识别高楼层耗电差异

### Content Storage
- Content stored in `docs/about.md` as Markdown (easy to edit, no HTML knowledge needed)
- Modal loads content via `fetch('about.md')` on open
- Markdown rendered to HTML with a minimal custom parser (supports headings, lists, paragraphs, links, bold, italic — all that the content needs)
- No external dependencies (no marked.js, no showdown)

### Implementation
- Modal HTML inlined in each page (matching existing `config-overlay` / `redirect-overlay` pattern)
- CSS: reuse existing CSS variables (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--radius-lg`, `--shadow`)
- JS: `openAboutModal()` / `closeAboutModal()` functions, ESC key listener, `renderMarkdown()` helper
- Loading state: spinner or "加载中..." while fetching
- Error state: "加载失败，请刷新重试" if fetch fails