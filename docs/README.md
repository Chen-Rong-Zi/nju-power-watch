# Frontend Deployment Guide

## 快速开始

### 本地测试

```bash
# 1. 生成数据索引
python scripts/generate_index.py

# 2. 运行测试脚本
./scripts/test_frontend.sh

# 3. 启动本地服务器
python scripts/serve_docs.py

# 浏览器自动打开 http://localhost:8000
```

### 功能验证清单

- [ ] 页面加载成功，显示标题和校区选择器
- [ ] 校区下拉框包含4个校区选项
- [ ] 选择校区后，楼栋下拉框启用并显示选项
- [ ] 选择楼栋后，房间下拉框启用并显示选项
- [ ] 房间搜索框可以过滤房间列表
- [ ] 选择房间后显示房间信息
- [ ] 折线图显示电费变化趋势
- [ ] 统计卡片显示正确数据（当前余额、日均消耗、最低/最高）
- [ ] 图表时间范围切换按钮工作正常

## GitHub Pages 部署

### 方法1: 自动部署（推荐）

1. **启用GitHub Pages**:
   ```
   GitHub仓库 → Settings → Pages → Source: GitHub Actions
   ```

2. **推送到main分支**:
   ```bash
   git add .
   git commit -m "feat: add static frontend for data visualization"
   git push origin main
   ```

3. **等待部署完成**:
   - 在Actions标签查看workflow状态
   - 通常需要1-2分钟

4. **访问网站**:
   ```
   https://<username>.github.io/<repo-name>/
   ```

### 方法2: 手动触发

```
GitHub → Actions → "Deploy to GitHub Pages" → Run workflow
```

## 架构说明

### 文件结构

```
docs/
├── index.html           # 主页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   └── app.js          # 前端逻辑
├── data/
│   ├── index.json      # 校区索引 (122 bytes)
│   ├── campus_仙林校区.json  # 校区数据 (~2.8MB)
│   ├── campus_鼓楼校区.json  # 校区数据 (~1.5MB)
│   ├── campus_浦口校区.json  # 校区数据 (~315KB)
│   └── campus_苏州校区.json  # 校区数据 (~338KB)
└── database -> ../database  # 数据库符号链接
```

### 技术栈

- **纯静态**: HTML + CSS + JavaScript（无框架）
- **图表**: Chart.js (CDN加载)
- **数据格式**: JSON
- **部署**: GitHub Pages

### 数据流

```
用户选择校区 → 加载校区索引 → 显示楼栋列表
     ↓
用户选择楼栋 → 过滤房间列表 → 显示房间
     ↓
用户选择房间 → 加载历史数据 → 绘制折线图
```

### 性能优化

1. **懒加载**: 校区数据按需加载
2. **压缩JSON**: 使用紧凑格式减少文件大小
3. **CDN**: Chart.js从CDN加载
4. **缓存**: 浏览器自动缓存静态文件

## 定制化

### 修改主题颜色

编辑 `docs/css/style.css`:

```css
/* 修改主题渐变色 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 改为其他颜色 */
background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);  /* 蓝色 */
background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);  /* 粉色 */
background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);  /* 紫色 */
```

### 添加新功能

**示例: 添加房间对比**

```javascript
// 在 app.js 中添加
let selectedRooms = [];

function addToComparison(roomName) {
    if (!selectedRooms.includes(roomName)) {
        selectedRooms.push(roomName);
        updateComparisonChart();
    }
}

function updateComparisonChart() {
    // 为每个选中的房间加载数据并显示在同一图表
}
```

## 故障排查

### 问题: 页面空白

**检查**:
- 浏览器控制台是否有错误
- Network标签查看资源加载状态
- 确认通过HTTP服务器访问（不是file://）

### 问题: 数据加载失败

**检查**:
- `docs/data/index.json` 是否存在
- `docs/database` 符号链接是否正确
- GitHub Pages是否启用并部署成功

### 问题: 图表不显示

**检查**:
- Chart.js是否成功加载
- 房间是否有足够的历史数据（至少2个数据点）
- 数据格式是否符合预期

## 下一步改进

### 短期（容易实现）

- [ ] 添加深色模式
- [ ] 支持房间收藏/书签
- [ ] 添加数据导出功能（CSV/Excel）
- [ ] 显示消费预警（余额低于阈值）

### 中期（需要开发）

- [ ] 多房间对比功能
- [ ] 预测未来电费趋势
- [ ] 自定义日期范围查询
- [ ] 移动端优化（PWA）

### 长期（架构改进）

- [ ] 后端API支持（实时数据）
- [ ] 用户认证和权限管理
- [ ] 数据分析和报告生成
- [ ] 通知和推送服务

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT
