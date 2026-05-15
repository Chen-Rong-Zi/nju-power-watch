# Frontend Test Guide

## 本地测试 (Local Testing)

### 方法1: 使用Python HTTP服务器 (推荐)

```bash
# 从项目根目录运行
python scripts/serve_docs.py
```

服务器会自动在浏览器中打开 `http://localhost:8000`

### 方法2: 手动启动服务器

```bash
# 启动HTTP服务器
cd docs
python -m http.server 8000

# 浏览器打开
# http://localhost:8000
```

### 方法3: 使用其他HTTP服务器

```bash
# 使用Node.js http-server
npx http-server docs -p 8000

# 使用PHP内置服务器
cd docs
php -S localhost:8000
```

## 测试步骤

### 1. 验证数据索引加载

打开浏览器控制台(F12)，检查Network标签：

- 应该看到 `data/index.json` 成功加载(200 OK)
- 响应应该包含校区列表

### 2. 测试校区选择

- 页面加载后，校区下拉框应显示4个校区
- 选择一个校区(例如"仙林校区")
- 应该看到 "data/campus_仙林校区.json" 加载成功

### 3. 测试楼栋选择

- 校区选择后，楼栋下拉框应该启用
- 选择一个楼栋
- 房间下拉框应该启用

### 4. 测试房间搜索

- 在搜索框输入房间号或名称
- 房间列表应该实时过滤

### 5. 测试房间数据加载

- 选择一个房间
- 应该看到房间信息显示
- 应该看到折线图出现
- 应该看到统计数据更新

### 6. 测试图表交互

- 点击"最近7天"、"最近30天"、"全部数据"按钮
- 图表应该相应更新
- 统计数据应该保持一致

## 检查API端点

### 主索引
```bash
curl http://localhost:8000/data/index.json
```

### 校区数据
```bash
curl http://localhost:8000/data/campus_仙林校区.json | head -50
```

### 房间数据
```bash
curl "http://localhost:8000/database/仙林校区/19幢/19栋第16层1613-53463/20260515.json"
```

## 常见问题

### 1. CORS错误

**症状**: 控制台显示 CORS policy错误

**解决**: 必须通过HTTP服务器访问，不能直接打开HTML文件

### 2. 数据加载失败

**症状**: 下拉框无内容或图表不显示

**检查**:
- 确认database目录存在且有数据
- 确认docs/database符号链接正确
- 检查Network标签的响应状态

### 3. 图表不显示

**症状**: Chart.js报错或图表区域空白

**检查**:
- 确认Chart.js库加载成功
- 检查控制台是否有JavaScript错误
- 确认数据格式正确

## GitHub Pages部署

### 自动部署

1. 推送到main分支会自动触发部署
2. 在GitHub仓库设置中启用GitHub Pages:
   - Settings → Pages → Source: GitHub Actions
3. 等待workflow完成
4. 访问: `https://<username>.github.io/<repo-name>/`

### 手动部署

1. 在Actions标签中找到"Deploy to GitHub Pages"workflow
2. 点击"Run workflow"
3. 等待部署完成

### 验证部署

```bash
# 检查部署状态
gh api repos/<username>/<repo>/pages

# 查看部署URL
gh api repos/<username>/<repo>/pages | jq .html_url
```

## 性能测试

### 文件大小检查

```bash
# 检查索引文件大小
ls -lh docs/data/

# 预期:
# index.json: < 1KB
# campus_*.json: < 3MB each
```

### 加载时间测试

在浏览器DevTools的Network标签中检查：

- index.json: 应该 < 100ms
- campus_*.json: 应该 < 2s
- 房间JSON: 应该 < 50ms

### 首次内容渲染(FCP)

应该 < 1.8秒 (良好)

## 浏览器兼容性

测试过的浏览器：
- ✅ Chrome 120+
- ✅ Firefox 120+
- ✅ Safari 17+
- ✅ Edge 120+

移动设备：
- ✅ iOS Safari
- ✅ Chrome for Android
- ✅ Firefox for Android

## 下一步

测试成功后：

1. **部署到GitHub Pages**: 推送到main分支
2. **配置自定义域名**(可选): 在Pages设置中添加
3. **添加更多功能**: 
   - 数据导出
   - 多房间对比
   - 预警提醒
   - 历史趋势分析
