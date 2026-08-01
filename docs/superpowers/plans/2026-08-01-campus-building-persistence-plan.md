# 校区/楼栋选择持久化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为校区视角和楼栋视角页面增加 localStorage 缓存，自动恢复上次选择

**Architecture:** 复用 `DataService.setUserConfig/getUserConfig`（localStorage 键 `electricity_user_config`），采用读-改-写模式避免字段覆盖。各页面只保存自己关心的字段：campus-view 保存 `{ campus }`，building-view 保存 `{ campus, building, date, sortDesc, page }`

**Tech Stack:** Vanilla JavaScript, localStorage

---

## 文件结构

| 文件 | 变更 |
|------|------|
| `docs/campus-view.html` | 添加 `savePartialConfig` 辅助函数；在 `selectCampus()` 中保存；在 `initCampusTabs()` 中恢复 |
| `docs/building-view.html` | 添加 `savePartialConfig` 辅助函数；在 `onCampusChange`/`onBuildingChange`/日期/分页操作中保存；在 `restoreStateFromUrl()` 中增加 localStorage 回退 |

---

### Task 1: 校区视角 — 保存选中校区

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: 添加 `savePartialConfig` 辅助函数**

在 `selectCampus` 函数之前（约第 796 行），添加：

```javascript
// localStorage 读-改-写辅助，避免覆盖其他页面的字段
function savePartialConfig(partial) {
  const config = DataService.getUserConfig() || {};
  Object.assign(config, partial);
  DataService.setUserConfig(config);
}
```

- [ ] **Step 2: 在 `selectCampus()` 末尾添加保存逻辑**

在 `selectCampus()` 函数末尾（`loadTrendData(campus)` 调用之后，约第 863 行），添加：

```javascript
// 保存选中的校区到 localStorage
savePartialConfig({ campus: campus });
```

- [ ] **Step 3: 提交**

```bash
git add docs/campus-view.html
git commit -m "feat: save campus selection to localStorage when campus changes"
```

---

### Task 2: 校区视角 — 恢复上次选中校区

**Files:**
- Modify: `docs/campus-view.html`

- [ ] **Step 1: 修改 `initCampusTabs()` 恢复上次选中的校区**

将 `initCampusTabs()` 函数从：

```javascript
async function initCampusTabs() {
  const campuses = await DataService.getCampuses();
  campuses.sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const container = document.getElementById('campus-tabs');

  campuses.forEach((campus, index) => {
    const tab = document.createElement('button');
    tab.className = 'campus-tab' + (index === 0 ? ' active' : '');
    tab.textContent = campus;
    tab.addEventListener('click', () => selectCampus(campus, tab));
    container.appendChild(tab);
  });

  if (campuses.length > 0) {
    selectCampus(campuses[0], container.querySelector('.campus-tab'));
  }
}
```

修改为：

```javascript
async function initCampusTabs() {
  const campuses = await DataService.getCampuses();
  campuses.sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const container = document.getElementById('campus-tabs');

  // 从 localStorage 恢复上次选中的校区
  const savedConfig = DataService.getUserConfig();
  const savedCampus = savedConfig && savedConfig.campus;
  const validSavedCampus = savedCampus && campuses.indexOf(savedCampus) !== -1;

  campuses.forEach((campus, index) => {
    const tab = document.createElement('button');
    tab.className = 'campus-tab' + (campus === validSavedCampus ? ' active' : index === 0 ? ' active' : '');
    tab.textContent = campus;
    tab.addEventListener('click', () => selectCampus(campus, tab));
    container.appendChild(tab);
  });

  if (campuses.length > 0) {
    selectCampus(validSavedCampus || campuses[0], container.querySelector('.campus-tab'));
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add docs/campus-view.html
git commit -m "feat: restore saved campus from localStorage on page load"
```

---

### Task 3: 楼栋视角 — 保存状态到 localStorage

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: 添加 `savePartialConfig` 辅助函数**

在 `state` 对象定义之后（约第 1584 行后），添加：

```javascript
// localStorage 读-改-写辅助，避免覆盖其他页面的字段
function saveBuildingConfig() {
  const config = DataService.getUserConfig() || {};
  config.campus = state.campus;
  config.building = state.building;
  config.date = state.date;
  config.sortDesc = state.sortDesc;
  config.page = state.currentPage;
  DataService.setUserConfig(config);
}
```

- [ ] **Step 2: 在 `onCampusChange()` 末尾添加保存**

在 `saveStateToUrl()` 调用之后（第 1879 行），添加 `saveBuildingConfig();`。

- [ ] **Step 3: 在 `onBuildingChange()` 末尾添加保存**

在 `saveStateToUrl()` 调用之后（第 1906 行），添加 `saveBuildingConfig();`。

- [ ] **Step 4: 在日期选择回调中添加保存**

在日期按钮点击和自定义日期变更回调中，在 `saveStateToUrl()` 调用之后（第 1811 行和第 1824 行），各添加 `saveBuildingConfig();`。

- [ ] **Step 5: 在分页操作中添加保存**

在 `prevPage()`、`nextPage()`、`goToPage()` 函数中，在 `saveStateToUrl()` 调用之后（第 2732、2740、2748 行），各添加 `saveBuildingConfig();`。

- [ ] **Step 6: 在排序切换中添加保存**

在 `toggleSortOrder()` 函数中，在 `saveStateToUrl()` 调用之后（第 1939 行），添加 `saveBuildingConfig();`。

- [ ] **Step 7: 提交**

```bash
git add docs/building-view.html
git commit -m "feat: save campus/building/date/page state to localStorage"
```

---

### Task 4: 楼栋视角 — 从 localStorage 恢复状态

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: 在 `restoreStateFromUrl()` 末尾添加 localStorage 回退**

在 `restoreStateFromUrl()` 函数末尾（第 1648 行左右的 `}` 之前），添加：

```javascript
// 无 URL 参数时，尝试从 localStorage 恢复
if (!campus) {
  const savedConfig = DataService.getUserConfig();
  if (savedConfig && savedConfig.campus) {
    state.campus = savedConfig.campus;
    document.getElementById('campus-select').value = savedConfig.campus;

    // 等待楼栋选项加载完成
    await onCampusChange({ target: { value: savedConfig.campus } });

    if (savedConfig.building) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const buildingSelect = document.getElementById('building-select');
      const optionExists = Array.from(buildingSelect.options).some(opt => opt.value === savedConfig.building);

      if (optionExists) {
        state.building = savedConfig.building;
        buildingSelect.value = savedConfig.building;

        if (savedConfig.date) {
          state.date = savedConfig.date;
          setActiveDateButton(savedConfig.date);
        }
        if (savedConfig.sortDesc !== undefined) {
          state.sortDesc = savedConfig.sortDesc === true || savedConfig.sortDesc === 'true';
          updateSortButton();
        }
        if (savedConfig.page) {
          state.currentPage = parseInt(savedConfig.page) || 1;
        }

        await loadRanking();
        loadBuildingTrend(state.campus, state.building);
      }
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add docs/building-view.html
git commit -m "feat: restore saved campus/building from localStorage when no URL params"
```

---

### 自检项

1. 校区视角：切换校区后刷新页面，是否自动恢复上次选中的校区？
2. 校区视角：如果 localStorage 中保存的校区名已不存在，是否回退到第一个校区？
3. 楼栋视角：选择校区和楼栋后刷新页面（无 URL 参数），是否自动恢复？
4. 楼栋视角：带 URL 参数访问时，URL 参数优先于 localStorage？
5. 楼栋视角：切换校区/楼栋/日期/排序/页码后，刷新是否恢复最新状态？
6. 字段冲突：校区视角保存后，再打开房间视角，房间视角的配置是否被覆盖？
7. 字段冲突：房间视角保存后，再打开楼栋视角，楼栋视角的配置是否被覆盖？