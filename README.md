# ⚡ NJU 宿舍电费监控系统

南京大学宿舍电费数据采集、分析与可视化平台。自动从校园 epay 系统采集全校宿舍电量数据，提供多维度可视化看板。

**🌐 在线体验**: [njupower.top](njutpower.top)

---

## 功能一览

### 用户房间视角
- 查看房间历史电费趋势（折线图）
- 电费预测与低余额预警
- 日/周/月耗电量统计
- 充值建议

### 楼栋视角
- 楼栋内各房间耗电量实时排行榜
- 房间搜索与快速定位
- 动态加载动画展示数据
- 校区耗电趋势总览

### 校区视角
- 校区仪表盘总览：覆盖房间数、总余额、总消耗
- 各楼栋耗电量排行榜
- 校区整体耗电趋势图
- 日期范围筛选

## 系统架构

```
每日定时采集 → 数据聚合 → 静态 JSON 文件 → 前端可视化
```

- **数据采集**: 通过 GitHub Actions 每天自动登录 NJU epay 系统，获取全校房间电量数据
- **存储**: 采用分层聚合结构（校区 → 楼栋 → 房间），兼顾查询效率与存储空间
- **前端**: 纯静态 HTML/CSS/JS，无后端依赖，可部署到 Vercel / GitHub Pages
- **图表**: Chart.js 驱动的可视化看板

## 项目结构

```
docs/                      # 前端静态页面
├── index.html             # 首页
├── room-view.html         # 房间视角
├── building-view.html     # 楼栋视角
├── campus-view.html       # 校区视角
├── js/
│   ├── data-service.js    # 数据服务（缓存、聚合、加载）
│   └── indexeddb-service.js
└── database/summaries/    # 聚合数据文件
    ├── overview.json
    └── campuses/

scripts/                   # 数据处理脚本
├── aggregate_data.py
├── generate_building_details.py
└── ...

.github/workflows/         # GitHub Actions 自动化
```

## 部署

本项目完全静态化，前端可直接部署：

```bash
# 本地预览
python -m http.server 8000 --directory docs
```

## 数据说明

- 数据来源：NJU epay 系统
- 更新频率：每日自动采集
- 覆盖范围：4 个校区，106 栋楼，16,657 个房间
- 存储格式：使用分层 JSON 聚合，原始数据按日期归档

## 许可证

MIT
