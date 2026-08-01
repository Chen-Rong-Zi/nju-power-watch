# 校区/楼栋选择持久化 设计文档

## 概述

为校区视角和楼栋视角页面增加 localStorage 缓存，让用户下次访问时自动恢复上次选择的校区和楼栋，避免重复选择。

## 当前状态

- **room-view.html**: 已通过 `DataService.setUserConfig()` / `getUserConfig()` 使用 localStorage 键 `electricity_user_config` 保存 `{ campus, building, roomName, displayName }`
- **campus-view.html**: 始终默认选中第一个校区，无缓存
- **building-view.html**: 当前通过 URL 参数 (`?campus=X&building=Y`) 保存状态，但仅在当前会话内（页面刷新有效，跨会话无效）。无 localStorage 持久化

## 设计方案

### 数据存储

复用 `DataService.setUserConfig()` / `getUserConfig()` 方法，使用 `localStorage` 键 `electricity_user_config`。各页面只保存自己关心的字段，不冲突：

| 页面 | 存储字段 |
|------|---------|
| campus-view | `{ campus }` |
| building-view | `{ campus, building, date, sortDesc, page }` |
| room-view | `{ campus, building, roomName, displayName }`（不变） |

### 校区视角 (campus-view.html)

- **保存时机**: 每次 `selectCampus()` 被调用时，保存 `{ campus }`
- **恢复时机**: `initCampusTabs()` 加载校区列表后，优先从 localStorage 恢复上次选中的校区；如果 localStorage 中无记录或已失效，则默认选中第一个校区
- **比 URL 参数优先**: 校区视角不使用 URL 参数，完全依赖 localStorage

### 楼栋视角 (building-view.html)

- **保存时机**: 每次校区或楼栋选择变化时（`onCampusChange` 和楼栋选择回调），保存 `{ campus, building, date, sortDesc, page }`
- **恢复时机**: 优先级顺序：URL 参数 > localStorage > 默认（空选择）
  - 已有 URL 参数恢复逻辑不变
  - 无 URL 参数时，尝试从 localStorage 恢复

### 字段兼容性

由于 `electricity_user_config` 被三个页面共享，需要确保字段不冲突：

- room-view 写入 `{ campus, building, roomName, displayName }` — 不包含 `date`/`sortDesc`/`page`
- campus-view 写入 `{ campus }` — 只写 `campus`，不覆盖其他字段
- building-view 写入 `{ campus, building, date, sortDesc, page }` — 不包含 `roomName`/`displayName`

从 localStorage 读取时，各页面只取自己需要的字段，忽略无关字段。

## 文件变更

| 文件 | 变更内容 |
|------|---------|
| `docs/campus-view.html` | 在 `selectCampus()` 中追加保存逻辑；在 `initCampusTabs()` 中增加恢复逻辑 |
| `docs/building-view.html` | 在校区/楼栋选择回调中追加保存逻辑；在 `restoreStateFromUrl()` 中增加 localStorage 回退 |

## 未涉及的范围

- 不修改 `DataService` 的方法签名
- 不修改 room-view.html 的现有行为
- 不修改楼层分析相关代码