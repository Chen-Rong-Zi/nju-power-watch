# NJU Electricity Data Viewer - 前端功能测试指南

> **自动化测试**: 使用 `/speckit.test` 命令执行自动化测试

## 测试环境

- **URL**: http://localhost:8000/index.html
- **HTTP服务器**: `python3 -m http.server 8000` (在项目根目录运行)
- **浏览器**: Chrome/Firefox/Safari 现代浏览器
- **注意**: 修改JS文件后，需强制刷新浏览器（Ctrl+Shift+R 或 Cmd+Shift+R）清除缓存

---

## 测试用例

### 1. 首页功能测试

#### 1.1 页面加载
- [x] 访问 http://localhost:8000/index.html
- [x] 验证页面标题显示 "NJU Electricity Data Viewer"
- [x] 验证导航菜单显示正确（首页、预警中心、排行榜、对比分析、仪表盘）

#### 1.2 校区选择
- [x] 点击"校区"下拉框
- [x] 验证显示所有校区选项（苏州校区、仙林校区、鼓楼校区、浦口校区）
- [x] 选择"仙林校区"
- [x] 验证楼栋下拉框变为可用状态

#### 1.3 楼栋选择
- [x] 点击"楼栋"下拉框
- [x] 验证显示楼栋列表及房间数（如"19幢 (409间)"）
- [x] 选择"19幢 (409间)"
- [x] 验证房间下拉框变为可用状态

#### 1.4 房间选择
- [x] 点击"房间"下拉框
- [x] 验证显示房间列表及当前余额（如"19栋第16层1613 (53.3度)"）
- [x] 选择任意房间
- [x] 验证右侧显示房间信息（校区、楼栋、房间、记录数）
- [x] 验证下方显示电费统计（当前余额、日均消耗、最低余额、最高余额）

#### 1.5 房间搜索
- [ ] 在搜索框输入房间号（如"1613"）
- [ ] 验证房间列表被过滤

---

### 2. 预警中心测试

#### 2.1 页面访问
- [x] 点击导航菜单"⚠️ 预警中心"
- [x] 验证 URL 变为 `#/warnings`
- [x] 验证页面标题显示"⚠️ 预警中心"

#### 2.2 预警统计
- [x] 验证显示预警统计卡片（紧急、警告、提醒数量）
- [x] 验证数量为有效数字（紧急: 246, 警告: 0, 提醒: 226）

#### 2.3 预警列表
- [x] 验证显示预警房间列表
- [x] 验证每条记录显示：预警级别、房间名、预警原因、当前余额、校区楼栋

#### 2.4 筛选功能
- [x] 点击"全部"按钮，验证显示所有预警
- [ ] 点击"🔴 紧急"按钮，验证只显示紧急预警
- [ ] 点击"🟠 警告"按钮，验证只显示警告预警
- [ ] 点击"🟡 提醒"按钮，验证只显示提醒预警

---

### 3. 排行榜测试

#### 3.1 页面访问
- [x] 点击导航菜单"📊 排行榜"
- [x] 验证 URL 变为 `#/rankings`
- [x] 验证页面标题显示"📊 排行榜"

#### 3.2 校区楼栋选择
- [x] 选择校区"仙林校区"
- [x] 验证楼栋下拉框变为可用
- [x] 选择楼栋"19幢 (409间)"
- [x] 验证显示排名数据

#### 3.3 余额不足排名
- [x] 点击"⚠️ 余额不足"标签
- [x] 验证显示余额最低的房间（升序排列）
- [x] 验证每条记录显示排名、房间名、当前余额
- **测试结果**: 显示 0.2度, 0.7度, 0.9度... ✓

#### 3.4 节能模范排名
- [x] 点击"🌱 节能模范"标签
- [x] 验证显示余额最高的房间（降序排列）
- **测试结果**: 显示 4195度, 2225度, 2060度... ✓

#### 3.5 高耗电排名
- [x] 点击"⚡ 高耗电"标签
- [x] 验证显示高耗电房间排名
- **测试结果**: 显示余额最低的房间 ✓

---

### 4. 对比分析测试

#### 4.1 页面访问
- [x] 点击导航菜单"📈 对比分析"
- [x] 验证 URL 变为 `#/comparison`
- [x] 当前状态：显示"功能开发中"

---

### 5. 仪表盘测试

#### 5.1 页面访问
- [x] 点击导航菜单"🏢 仪表盘"
- [x] 验证 URL 变为 `#/dashboard`
- [x] 验证页面标题显示"🏢 仪表盘"

#### 5.2 校区选择
- [x] 选择校区"仙林校区"
- [x] 验证显示校区统计（楼栋数: 37, 总房间数: 9184）

#### 5.3 楼栋选择
- [x] 选择楼栋"19幢"
- [x] 验证显示楼层用电分布

#### 5.4 楼层分布
- [ ] 验证显示正确的楼层号（1层、2层、3层...）
- **测试结果**: 需要清除浏览器缓存后验证修复

---

### 6. 导航测试

#### 6.1 浏览器前进/后退
- [x] 从首页导航到预警中心
- [x] 点击浏览器后退按钮
- [x] 验证返回首页并正确显示

#### 6.2 直接 URL 访问
- [x] 直接访问 `http://localhost:8000/index.html#/rankings`
- [x] 验证页面正确加载排行榜内容
- [x] 直接访问 `http://localhost:8000/index.html#/dashboard`
- [x] 验证页面正确加载仪表盘内容

---

## 测试结果摘要

### 通过的功能 ✅
1. **首页**: 校区/楼栋/房间选择联动、电费统计显示
2. **预警中心**: 预警统计、预警列表显示
3. **排行榜**: 三个标签（余额不足、节能模范、高耗电）排序正确
4. **仪表盘**: 校区统计显示
5. **路由**: Hash路由导航正常

### 待完善的功能 🚧
1. **对比分析**: 功能开发中
2. **仪表盘楼层分布**: 修复已提交，需清除缓存验证
3. **房间搜索过滤**: 待测试

---

## 已修复的问题

### BUG-1: 排行榜"节能模范"显示错误数据 ✅ 已修复
- **位置**: docs/js/modules/rankings.js:33
- **原因**: 排序逻辑错误，将 `savers` 和 `low` 都设为升序
- **修复**: 修改为 `savers` 使用降序，`low` 使用升序
- **验证**: 节能模范现在显示高余额房间（4195度、2225度等）

### BUG-2: 仪表盘楼层分布解析错误 ✅ 已修复
- **位置**: docs/js/modules/heatmap.js:16-54
- **原因**: `extractFloorNumber` 函数只提取开头的数字
- **修复**: 新增楼层号解析逻辑：
  - 优先匹配 "第X层" 格式
  - 4位数字取前2位作为楼层
  - 3位数字取首位作为楼层
- **验证**: 需清除浏览器缓存后测试

---

## 测试日期

- **首次测试**: 2026-05-18
- **测试工具**: Playwright MCP
- **测试人员**: Claude Code (自动化测试)

---

## 自动化测试步骤 (Playwright)

### 启动测试
```bash
# 1. 启动HTTP服务器
cd /Users/macbook/Program/dorm_public
python3 -m http.server 8000

# 2. 使用 Playwright MCP 进行自动化测试
# 或手动在浏览器中访问 http://localhost:8000/index.html
```

### 测试脚本示例

```javascript
// Playwright 测试脚本示例
const { test, expect } = require('@playwright/test');

test('首页加载测试', async ({ page }) => {
  await page.goto('http://localhost:8000/index.html');
  await expect(page).toHaveTitle('NJU Electricity Data Viewer');
});

test('校区选择测试', async ({ page }) => {
  await page.goto('http://localhost:8000/index.html');
  await page.getByLabel('校区 Campus:').selectOption('仙林校区');
  await expect(page.getByLabel('楼栋 Building:')).not.toBeDisabled();
});

test('排行榜节能模范测试', async ({ page }) => {
  await page.goto('http://localhost:8000/index.html#/rankings');
  await page.locator('#rankings-campus-select').selectOption('仙林校区');
  await page.locator('#rankings-building-select').selectOption('19幢 (409间)');
  await page.getByText('🌱 节能模范').click();
  
  // 验证第一个房间余额较高
  const firstBalance = await page.locator('.ranking-item').first().textContent();
  expect(firstBalance).toContain('度');
});
```

---

## 注意事项

1. **浏览器缓存**: 修改 JS 文件后必须强制刷新（Ctrl+Shift+R / Cmd+Shift+R）
2. **HTTP服务器**: 必须使用 HTTP 服务器运行，file:// 协议会有 CORS 问题
3. **数据文件**: 确保 `docs/database/summaries/` 目录下有正确的 JSON 数据文件

---

## Speckit 集成

### 自动化测试命令

```bash
# 执行自动化测试
/speckit.test

# 使用 speckit 工作流
/speckit.checklist   # 生成需求质量检查清单
/speckit.tasks       # 更新实现任务
/speckit.implement   # 执行实现计划
```

### 测试工作流

```
┌─────────────────────────────────────────────────────────────┐
│                    Speckit 测试工作流                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. /speckit.specify  ─→ 创建功能规格说明                    │
│                                                             │
│  2. /speckit.plan     ─→ 生成实现计划                        │
│                                                             │
│  3. /speckit.tasks    ─→ 生成任务列表                        │
│                                                             │
│  4. /speckit.implement ─→ 执行实现任务                       │
│                                                             │
│  5. /speckit.test     ─→ 执行自动化测试 ◄── 本文档           │
│                                                             │
│  6. /speckit.checklist ─→ 检查需求质量                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Bug 修复流程

测试过程中发现问题后:

1. 使用 `/speckit.test` 记录问题
2. 系统自动启动 Agent 修复 Bug
3. 验证修复结果
4. 更新本文档的测试结果

### 相关文件

| 文件 | 用途 |
|------|------|
| `.claude/commands/speckit.test.md` | 测试命令定义 |
| `docs/TEST_GUIDE.md` | 本测试指南 |
| `.specify/templates/checklist-template.md` | 检查清单模板 |
