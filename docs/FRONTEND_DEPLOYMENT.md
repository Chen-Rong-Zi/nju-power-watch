# 前端部署指南 (更新版)

## 数据结构变更说明

### 旧数据结构
```
database/{campus}/{building}/{room}-{id}/{date}.json
```
- 需要扫描目录获取日期文件
- 前端需要加载多个JSON文件
- 每个文件只有单天数据

### 新数据结构（分级聚合）
```
database/summaries/
├── overview.json                          # 总览
└── campuses/{campus}/
    ├── summary.json                       # 校区汇总
    └── buildings/{building}/
        ├── summary.json                   # 楼栋汇总
        └── rooms/{room_id}.json           # 房间详情（完整历史）
```

**优势**：
- ✅ 每个房间文件包含完整历史数据
- ✅ 前端只需加载单个文件获取所有历史
- ✅ 支持灵活的统计分析
- ✅ 支持余额预测功能

## 快速开始

### 1. 确认数据已生成

```bash
# 检查数据库摘要是否存在
ls -la database/summaries/overview.json

# 如果不存在，运行聚合脚本
python scripts/aggregate_data.py
```

### 2. 启动本地服务器

```bash
# 运行测试脚本
./scripts/test_frontend.sh

# 启动服务器
python scripts/serve_docs.py

# 浏览器打开 http://localhost:8000
```

### 3. 测试功能

- [ ] 页面加载，显示4个校区
- [ ] 选择校区，显示楼栋列表
- [ ] 选择楼栋，显示房间列表（含余额）
- [ ] 选择房间，显示完整历史折线图
- [ ] 统计卡片显示正确数据
- [ ] 时间范围切换按钮工作正常

## 数据文件说明

### overview.json
```json
{
  "generated_at": "2026-05-16T03:07:26",
  "total_rooms": 61748,
  "campuses": {
    "仙林校区": {
      "total_rooms": 34347,
      "buildings_count": 37
    }
  }
}
```

**文件大小**: ~500 bytes  
**加载时间**: < 50ms

### campus summary
```json
{
  "campus": "仙林校区",
  "total_rooms": 34347,
  "buildings": {
    "19幢": {
      "total_rooms": 50,
      "avg_balance": 125.50
    }
  }
}
```

**文件大小**: ~50KB  
**加载时间**: < 200ms

### building summary
```json
{
  "building": "19幢",
  "campus": "仙林校区",
  "total_rooms": 50,
  "rooms": {
    "53463": {
      "room_name": "1613",
      "current_balance": 125.50,
      "last_updated": "20260515"
    }
  }
}
```

**文件大小**: ~100KB  
**加载时间**: < 300ms

### room detail (NEW!)
```json
{
  "room_id": "53463",
  "room_name": "1613",
  "campus": "仙林校区",
  "building": "19幢",
  "current_balance": 125.50,
  "balance_history": {
    "20260501": 135.20,
    "20260502": 133.80,
    "20260515": 125.50
  },
  "last_updated": "20260515"
}
```

**文件大小**: ~1KB (per year)  
**加载时间**: < 50ms  
**关键特性**: 包含完整历史数据！

## 前端计算示例

### 计算统计指标

```javascript
// 从balance_history计算统计
const history = room.balance_history;
const dates = Object.keys(history).sort();
const balances = dates.map(d => history[d]);

const stats = {
  current: balances[balances.length - 1],
  min: Math.min(...balances),
  max: Math.max(...balances),
  avg: balances.reduce((a, b) => a + b, 0) / balances.length,
  days: balances.length
};

console.log(`当前: ${stats.current}度`);
console.log(`最低: ${stats.min}度`);
console.log(`最高: ${stats.max}度`);
console.log(`平均: ${stats.avg.toFixed(2)}度`);
```

### 预测余额不足时间

```javascript
// 计算日均用电量
function calculateDailyConsumption(balances) {
  if (balances.length < 2) return 0;
  const recent = balances.slice(-7); // 最近7天
  const consumption = recent[0] - recent[recent.length - 1];
  return consumption / (recent.length - 1);
}

// 预测
const dailyConsumption = calculateDailyConsumption(balances);
const daysUntilEmpty = Math.floor(room.current_balance / dailyConsumption);
const emptyDate = new Date();
emptyDate.setDate(emptyDate.getDate() + daysUntilEmpty);

console.log(`日均用电: ${dailyConsumption.toFixed(2)}度/天`);
console.log(`预计${daysUntilEmpty}天后余额不足 (${emptyDate.toISOString().split('T')[0]})`);
```

## GitHub Pages 部署

### 自动部署

```bash
# 提交代码
git add .
git commit -m "feat: update frontend for hierarchical aggregation"
git push origin main

# GitHub Actions 自动部署
# 访问: https://<username>.github.io/<repo-name>/
```

### 手动部署

```bash
# 运行聚合脚本
python scripts/aggregate_data.py

# 确保summaries目录存在
ls -la database/summaries/

# 推送到GitHub
git add database/summaries/
git commit -m "chore: update electricity summaries"
git push
```

## 性能优化

### 懒加载策略

```javascript
// 首次只加载总览
const overview = await fetch('./database/summaries/overview.json')
  .then(r => r.json());

// 用户选择校区时才加载校区数据
async function loadCampus(campus) {
  return await fetch(`./database/summaries/campuses/${campus}/summary.json`)
    .then(r => r.json());
}

// 用户选择房间时才加载房间详情
async function loadRoom(campus, building, roomId) {
  return await fetch(
    `./database/summaries/campuses/${campus}/buildings/${building}/rooms/${roomId}.json`
  ).then(r => r.json());
}
```

### 缓存策略

```javascript
const cache = {
  overview: null,
  campuses: {},
  buildings: {},
  rooms: {}
};

async function getCachedData(type, ...keys) {
  const cacheKey = keys.join('/');
  
  if (!cache[type][cacheKey]) {
    const url = buildUrl(type, ...keys);
    cache[type][cacheKey] = await fetch(url).then(r => r.json());
  }
  
  return cache[type][cacheKey];
}
```

## 新功能示例

### 1. 完整历史趋势分析

```javascript
// 显示所有历史数据
const dates = Object.keys(room.balance_history).sort();
const balances = dates.map(d => room.balance_history[d]);

// 计算长期趋势
const trend = calculateLinearTrend(balances);
console.log(`趋势: ${trend > 0 ? '上升' : '下降'}`);
```

### 2. 自定义时间范围查询

```javascript
// 查询特定时间范围
function queryRange(history, startDate, endDate) {
  const dates = Object.keys(history).sort();
  return dates
    .filter(d => d >= startDate && d <= endDate)
    .map(d => ({ date: d, balance: history[d] }));
}

// 查询最近一个月
const lastMonth = queryRange(
  room.balance_history,
  '20260415',
  '20260515'
);
```

### 3. 用电异常检测

```javascript
// 检测异常用电
function detectAnomalies(history) {
  const balances = Object.values(history);
  const avg = balances.reduce((a, b) => a + b, 0) / balances.length;
  const stdDev = Math.sqrt(
    balances.reduce((sum, b) => sum + Math.pow(b - avg, 2), 0) / balances.length
  );
  
  return balances.map((b, i) => ({
    index: i,
    value: b,
    isAnomaly: Math.abs(b - avg) > 2 * stdDev
  })).filter(r => r.isAnomaly);
}
```

## 故障排查

### 问题: 数据加载失败

**检查**:
```bash
# 确认文件存在
ls -la database/summaries/overview.json

# 确认文件权限
chmod 644 database/summaries/**/*.json

# 检查JSON格式
cat database/summaries/overview.json | jq
```

### 问题: 历史数据不完整

**原因**: 只有一天的数据

**解决**:
- 运行多次聚合脚本
- 等待GitHub Actions每日自动更新
- 数据会随时间累积

### 问题: 图表不显示

**检查**:
```javascript
// 控制台检查数据
console.log('Room data:', room);
console.log('History:', room.balance_history);
console.log('Dates:', Object.keys(room.balance_history));
```

## 下一步改进

### 短期
- [ ] 添加余额预警通知
- [ ] 支持数据导出（CSV/Excel）
- [ ] 添加深色模式

### 中期
- [ ] 多房间对比图表
- [ ] 用电预测模型
- [ ] 自定义日期范围选择器

### 长期
- [ ] 移动端PWA支持
- [ ] 离线访问能力
- [ ] 数据分析报告生成

## 技术支持

- 数据结构文档: `docs/hierarchical-aggregation.md`
- 前端使用示例: `docs/frontend-usage-examples.md`
- 数据持久化说明: `docs/data-persistence.md`
