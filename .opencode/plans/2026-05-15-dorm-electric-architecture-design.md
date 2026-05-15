# 南京大学宿舍电费统计系统 - 架构设计文档

**日期**: 2026-05-15  
**作者**: AI Assistant  
**状态**: 已批准

---

## 一、项目概述

### 1.1 目标
构建一个基于 GitHub Pages 的静态网站，用于统计和展示南京大学各宿舍电费使用情况，提供数据分析和可视化功能。

### 1.2 核心需求
- 数据与业务分离：前端只负责展示，数据独立维护
- 静态托管：所有资源托管在 GitHub，零成本运维
- 自动化：每日自动爬取数据，无需人工干预
- 隐私保护：公开数据中去除学号等敏感信息

### 1.3 已完成工作
- `nju_electric_query.py`: 电费爬取脚本
- `list_room_ids.py`: 楼栋房间统计脚本
- `database/`: 历史数据存储

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌──────────────────────────┐ │
│  │   爬虫脚本    │────────>│   database/              │ │
│  │ (Python)     │         │   ├── raw/               │ │
│  └──────────────┘         │   └── archive/           │ │
│         │                 └──────────────────────────┘ │
│         │                                                │
│         ▼                                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  GitHub Actions (每天 UTC 0点)                    │  │
│  │  1. 爬取当日电费数据                               │  │
│  │  2. 去除敏感信息（学号）                           │  │
│  │  3. 生成聚合数据文件                               │  │
│  │  4. 自动提交到仓库                                 │  │
│  └──────────────────────────────────────────────────┘  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  docs/ (GitHub Pages)                             │  │
│  │  ├── index.html                                   │  │
│  │  ├── js/                                          │  │
│  │  └── data/                                        │  │
│  │      ├── latest.json                              │  │
│  │      ├── daily-summary.json                       │  │
│  │      └── building-meta.json                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 数据层
- **原始数据存储**: `database/raw/YYYY/MM/DD/*.json`
- **聚合数据存储**: `docs/data/*.json`
- **历史归档**: `database/archive/YYYY-MM.tar.gz`

#### 2.2.2 数据处理层
- **爬虫脚本**: `scripts/query_daily.py`
  - 从配置文件读取监控楼栋
  - 调用现有爬虫逻辑
  - 去除敏感信息
  - 保存原始数据
  
- **聚合脚本**: `scripts/aggregate_data.py`
  - 读取最近 N 天原始数据
  - 计算统计数据（平均值、排行榜等）
  - 生成聚合 JSON 文件
  - 可选归档历史数据

#### 2.2.3 展示层
- **前端框架**: Vanilla JS + Chart.js
- **页面结构**:
  - `index.html`: 主页（排行榜、概览）
  - `building.html`: 楼栋详情页
  - `campus.html`: 校区统计页

#### 2.2.4 运维层
- **自动化**: GitHub Actions
- **配置管理**: `config/buildings.yaml`
- **密钥管理**: GitHub Secrets

---

## 三、数据设计

### 3.1 原始数据格式

**路径**: `database/raw/2026/05/15/仙林校区/19幢/1613-53463.json`

```json
{
  "campus": "仙林校区",
  "building": "19幢",
  "room": "1613",
  "room_id": "53463",
  "power": 515.70,
  "date": "2026-05-15",
  "scraped_at": "2026-05-15T00:30:00Z"
}
```

**变更**: 去除 `学号` 字段，保护隐私

### 3.2 聚合数据格式

#### 3.2.1 latest.json（最新数据）

**路径**: `docs/data/latest.json`

```json
{
  "date": "2026-05-15",
  "updated_at": "2026-05-15T00:30:00Z",
  "total_rooms": 1250,
  "campuses": {
    "仙林校区": {
      "total_rooms": 800,
      "buildings": {
        "19幢": {
          "total_rooms": 50,
          "rooms": [
            {
              "room_id": "53463",
              "room": "1613",
              "power": 515.70
            }
          ]
        }
      }
    }
  }
}
```

#### 3.2.2 daily-summary.json（每日统计）

**路径**: `docs/data/daily-summary.json`

```json
[
  {
    "date": "2026-05-15",
    "total_rooms": 1250,
    "avg_power": 324.5,
    "max_power": 850.2,
    "min_power": 12.3,
    "median_power": 310.5,
    "std_power": 95.3,
    "campuses": {
      "仙林校区": {
        "avg_power": 350.2,
        "room_count": 800,
        "max_power": 850.2,
        "min_power": 12.3
      },
      "浦口校区": {
        "avg_power": 280.3,
        "room_count": 300,
        "max_power": 650.5,
        "min_power": 45.2
      }
    }
  }
]
```

**保留策略**: 最近 90 天

#### 3.2.3 building-meta.json（楼栋元数据）

**路径**: `docs/data/building-meta.json`

```json
{
  "last_updated": "2026-05-15T00:30:00Z",
  "campuses": {
    "仙林校区": {
      "buildings": {
        "19幢": {
          "total_rooms": 50,
          "floors": 16,
          "description": "仙林校区学生宿舍19幢"
        }
      }
    }
  }
}
```

#### 3.2.4 leaderboard.json（排行榜）

**路径**: `docs/data/stats/leaderboard.json`

```json
{
  "date": "2026-05-15",
  "top_20": [
    {
      "rank": 1,
      "room_id": "53463",
      "room": "1613",
      "building": "19幢",
      "campus": "仙林校区",
      "power": 850.2
    }
  ],
  "bottom_20": [
    {
      "rank": 1,
      "room_id": "12345",
      "room": "101",
      "building": "4幢",
      "campus": "仙林校区",
      "power": 12.3
    }
  ]
}
```

---

## 四、配置设计

### 4.1 buildings.yaml（楼栋配置）

**路径**: `config/buildings.yaml`

```yaml
# 监控的楼栋白名单
buildings:
  - campus: "仙林校区"
    buildings: ["19幢", "4幢"]
  
  - campus: "浦口校区"
    buildings: ["12栋宿舍"]

# 爬虫配置
query:
  concurrency: 20
  retry_attempts: 3
  timeout_seconds: 30
  
# 数据处理配置
aggregation:
  daily_summary_days: 90
  archive_monthly: true
  
# 隐私配置
privacy:
  remove_student_id: true
  remove_sensitive_fields: ["学号"]
```

### 4.2 GitHub Actions 配置

**路径**: `.github/workflows/daily-query.yml`

```yaml
name: Daily Electric Query

on:
  schedule:
    - cron: '0 0 * * *'  # UTC 0:00 (北京时间 8:00)
  workflow_dispatch:

jobs:
  query-and-update:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
          cache: 'pip'
      
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install aiohttp pyyaml
      
      - name: Run daily query
        env:
          NJU_COOKIE: ${{ secrets.NJU_COOKIE }}
        run: |
          echo "$NJU_COOKIE" > config/cookie.json
          python scripts/query_daily.py
      
      - name: Aggregate data
        run: python scripts/aggregate_data.py
      
      - name: Commit and push changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add database/ docs/data/
          git commit -m "Update data for $(date +%Y-%m-%d)" || echo "No changes to commit"
          git push
```

---

## 五、前端设计

### 5.1 技术栈

- **核心**: Vanilla JavaScript (ES6+)
- **图表**: Chart.js 4.x
- **样式**: 原生 CSS + CSS Variables
- **构建**: 无构建工具，直接在浏览器运行

### 5.2 页面结构

#### 5.2.1 主页（index.html）

**功能**:
- 今日电费排行榜（Top 20）
- 各校区平均电费对比
- 最近 7 天使用趋势图
- 快速跳转到楼栋详情

**数据加载**:
```javascript
// 加载聚合数据
const latest = await fetch('data/latest.json').then(r => r.json());
const summary = await fetch('data/daily-summary.json').then(r => r.json());
const leaderboard = await fetch('data/stats/leaderboard.json').then(r => r.json());
```

#### 5.2.2 楼栋详情页（building.html）

**URL**: `building.html?campus=仙林校区&building=19幢`

**功能**:
- 该楼栋所有房间列表（可搜索、排序）
- 电费统计：平均值、最高/最低值、中位数
- 电费分布图（区间统计）
- 与其他楼栋对比

#### 5.2.3 校区统计页（campus.html）

**URL**: `campus.html?name=仙林校区`

**功能**:
- 各楼栋对比表格
- 总用电量趋势图
- 异常用电提醒（电量 < 50 度）

### 5.3 目录结构

```
docs/
├── index.html
├── building.html
├── campus.html
├── css/
│   ├── style.css           # 全局样式
│   ├── components.css      # 组件样式
│   └── responsive.css      # 响应式样式
├── js/
│   ├── app.js              # 主逻辑
│   ├── api.js              # 数据加载
│   ├── charts.js           # 图表配置
│   ├── utils.js            # 工具函数
│   └── components/
│       ├── leaderboard.js
│       ├── building-detail.js
│       └── campus-stats.js
└── data/
    ├── latest.json
    ├── daily-summary.json
    ├── building-meta.json
    └── stats/
        ├── leaderboard.json
        ├── campus-stats.json
        └── building-stats.json
```

---

## 六、脚本设计

### 6.1 query_daily.py

**路径**: `scripts/query_daily.py`

**功能**:
1. 从 `config/buildings.yaml` 读取监控楼栋
2. 遍历每个楼栋的所有房间 ID
3. 调用 `nju_electric_query.py` 的核心函数爬取数据
4. 去除学号等敏感字段
5. 保存到 `database/raw/YYYY/MM/DD/`

**输入**:
- 配置文件: `config/buildings.yaml`
- Cookie 文件: `config/cookie.json`

**输出**:
- 原始数据: `database/raw/YYYY/MM/DD/*.json`
- 日志: `logs/query-YYYYMMDD.log`

**错误处理**:
- Cookie 失效: 抛出异常，Actions 记录错误
- 网络错误: 重试 3 次，记录失败房间
- 部分失败: 只保存成功的数据

### 6.2 aggregate_data.py

**路径**: `scripts/aggregate_data.py`

**功能**:
1. 读取最近 90 天的原始数据
2. 计算各项统计数据:
   - 每日汇总: 平均值、最大/最小值、中位数、标准差
   - 排行榜: Top 20、Bottom 20
   - 校区统计: 各校区平均值、房间数
   - 楼栋统计: 各楼栋平均值、异常房间
3. 生成聚合 JSON 文件
4. 可选: 归档历史数据（按月压缩）

**输入**:
- 原始数据: `database/raw/*/*.json`
- 配置: `config/buildings.yaml`

**输出**:
- 聚合数据: `docs/data/*.json`
- 归档文件: `database/archive/YYYY-MM.tar.gz`

**性能优化**:
- 使用生成器流式处理，避免加载所有数据到内存
- 缓存已计算的统计数据

---

## 七、运维设计

### 7.1 Cookie 管理

**问题**: Cookie 会过期，需要定期更新

**解决方案**:

1. **存储位置**: GitHub Repository Secrets
   - Secret 名称: `NJU_COOKIE`
   - 格式: JSON 字符串

2. **更新流程**:
   ```
   浏览器登录 epay.nju.edu.cn
   → 导出 Cookie (使用 EditThisCookie 插件)
   → GitHub 仓库 Settings → Secrets → Actions → Update NJU_COOKIE
   → 重新运行 Actions 测试
   ```

3. **有效期测试**: 
   - 初期每天检查 Cookie 是否有效
   - 记录 Cookie 有效期，确定更新频率

### 7.2 数据备份

**策略**:
- 原始数据: 按月归档为 tar.gz
- 聚合数据: 保留最近 90 天
- 历史数据: 可从归档恢复

**归档脚本**:
```bash
# 归档上月数据
tar -czf database/archive/2026-05.tar.gz database/raw/2026/05/
rm -rf database/raw/2026/05/
```

### 7.3 监控与告警

**监控项**:
- Actions 运行状态
- 爬虫成功率（应 > 95%）
- Cookie 有效期
- 数据异常（负数、超大值）

**告警方式**:
- GitHub Actions 失败时发送邮件通知
- 爬虫成功率 < 95% 时记录到日志

### 7.4 故障处理

**常见问题**:

1. **Cookie 过期**
   - 症状: Actions 失败，日志显示认证错误
   - 解决: 更新 GitHub Secrets 中的 `NJU_COOKIE`

2. **网络错误**
   - 症状: 部分宿舍爬取失败
   - 解决: Actions 自动重试，记录失败列表

3. **数据异常**
   - 症状: 某宿舍电量 < 0 或 > 1000
   - 解决: 标记异常数据，前端显示警告

---

## 八、实施计划

### 8.1 第一阶段：基础设施（Week 1）

**目标**: 搭建基础架构，实现数据自动化

**任务**:
1. 创建配置文件 `config/buildings.yaml`
2. 实现 `scripts/query_daily.py`
3. 实现 `scripts/aggregate_data.py`
4. 配置 GitHub Actions
5. 测试 Cookie 管理流程

**验收标准**:
- Actions 能成功运行
- 生成原始数据和聚合数据
- 数据提交到 GitHub

### 8.2 第二阶段：前端开发（Week 2）

**目标**: 实现前端页面，连接数据

**任务**:
1. 创建基础 HTML 页面
2. 实现数据加载逻辑
3. 集成 Chart.js 图表
4. 实现排行榜、统计表格
5. 实现楼栋详情页

**验收标准**:
- GitHub Pages 能正常访问
- 显示最新数据
- 图表正确渲染

### 8.3 第三阶段：优化与部署（Week 3）

**目标**: 优化性能，正式上线

**任务**:
1. 优化数据加载速度
2. 添加响应式设计
3. 实现异常数据告警
4. 编写用户文档
5. 正式上线

**验收标准**:
- 页面加载 < 2 秒
- 移动端适配良好
- 用户能正常使用

---

## 九、风险与应对

### 9.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Cookie 频繁过期 | 高 | 中 | 自动化测试 Cookie 有效期，建立更新流程 |
| 爬虫被封禁 | 高 | 低 | 降低并发数，添加随机延迟 |
| 数据量过大 | 中 | 中 | 定期归档，限制监控楼栋数量 |
| GitHub Pages 限制 | 低 | 低 | 单文件 < 100MB，总仓库 < 1GB |

### 9.2 业务风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 用户隐私泄露 | 高 | 低 | 严格去除学号，审核数据 |
| 数据错误误导用户 | 中 | 中 | 添加数据校验，标注数据来源 |
| 系统无人维护 | 中 | 低 | 编写详细文档，简化运维流程 |

---

## 十、未来扩展

### 10.1 功能扩展

- **推送通知**: 电量过低时推送通知（需后端支持）
- **用户系统**: 用户登录查看自己宿舍历史数据
- **预测分析**: 基于历史数据预测电费使用趋势
- **对比分析**: 与去年同期数据对比

### 10.2 技术优化

- **数据压缩**: 使用 gzip 压缩 JSON 文件
- **CDN 加速**: 使用 Cloudflare CDN
- **PWA**: 实现离线访问
- **数据导出**: 支持导出 CSV/Excel

---

## 十一、参考资料

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Chart.js Documentation](https://www.chartjs.org/docs/)
- [南京大学电费查询 API](https://epay.nju.edu.cn)

---

**文档版本**: 1.0  
**最后更新**: 2026-05-15
