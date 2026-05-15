# 数据持久化机制

## 问题：GitHub Actions 每次都是全新环境

GitHub Actions 的每次运行都是全新的虚拟环境，运行结束后所有数据都会被销毁。那么如何保证电费数据的连续性？

## 解决方案：Git 仓库存储聚合数据（Summaries Only）+ 完整历史

### 核心思路

**不存储原始数据，只存储聚合后的 summary 数据，并保留所有历史**

- ✅ 原始数据（`database/{校区}/`）：**不提交**到仓库，节省空间
- ✅ 聚合数据（`database/summaries/`）：**提交**到仓库，保留历史
- ✅ 每次运行：加载旧 summary → 合并新数据 → 生成新 summary → 提交
- ✅ **每个房间的 JSON 包含所有查询过的日期及余额**（无时间限制）

### 数据持久化流程

```
┌─────────────────────────────────────────────────────────────┐
│               GitHub Actions 数据流（完整历史版）              │
└─────────────────────────────────────────────────────────────┘

第一次运行 (Day 1)
┌──────────────┐
│  1. Checkout │  ← 检出仓库（summaries/ 为空）
│  空仓库      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  2. Query    │  ← 查询电费数据，写入原始 database/
│  原始数据    │     database/仙林校区/19幢/.../20260515.json
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  3. Aggregate│  ← 生成 summaries（第一次，无历史数据）
│  新 summary  │     database/summaries/campuses/.../53463.json
└──────┬───────┘     {
       │                "balance_history": {
       ▼                  "20260515": 135.20
┌──────────────┐        }
│  4. Commit   │      }
│  summaries/  │  ← 只提交 summaries/，原始数据丢弃
│  + Push      │
└──────────────┘

═══════════════════════════════════════════════════════════

第二次运行 (Day 2) - 全新环境
┌──────────────┐
│  1. Checkout │  ← 检出仓库（包含 Day 1 的 summary！）
│  Day 1       │     database/summaries/campuses/.../53463.json
│  summaries   │          "balance_history": {"20260515": 135.20}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  2. Query    │  ← 查询电费数据，写入原始 database/
│  新原始数据  │     database/仙林校区/19幢/.../20260516.json
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  3. Merge    │  ← 加载旧 summary + 新数据，合并
│  旧+新       │     database/summaries/campuses/.../53463.json
│              │          "balance_history": {
│              │            "20260515": 135.20,  ← Day 1
│              │            "20260516": 132.40   ← Day 2
│              │          }
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  4. Commit   │  ← 提交合并后的 summaries/
│  summaries/  │
│  + Push      │
└──────────────┘

═══════════════════════════════════════════════════════════

第 365 天运行 - 全新环境
┌──────────────┐
│  1. Checkout │  ← 检出仓库（包含 364 天的 summary！）
│  Day 1-364   │     "balance_history": {
│  summaries   │       "20260515": 135.20,
│              │       "20260516": 132.40,
│              │       ...
│              │       "20260513": 118.30  ← 完整364天数据
│              │     }
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  2. Query    │  ← 查询 Day 365 数据
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  3. Merge    │  ← 合并 365 天数据（保留所有历史）
│  完整历史    │     "balance_history": {
│              │       "20260515": 135.20,
│              │       ...
│              │       "20260514": 118.30,
│              │       "20260515": 116.50   ← Day 365
│              │     }
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  4. Commit   │
│  summaries/  │
│  + Push      │
└──────────────┘
```

## 关键配置

### 1. .gitignore 配置

```gitignore
# 忽略原始数据（节省空间）
database/仙林校区/
database/鼓楼校区/
database/浦口校区/
database/苏州校区/
database/archives/

# 保留聚合数据（提交到仓库）
!database/summaries/

# 保留日志
!logs/query_runs/
```

### 2. 聚合脚本关键逻辑

`scripts/aggregate_data.py` 的合并逻辑：

```python
def merge_room_data(existing: Dict, new: Dict) -> Dict:
    """合并新旧数据，保留所有历史"""
    # 合并 balance_history（保留所有日期）
    merged_history = existing.get('balance_history', {}).copy()
    merged_history.update(new.get('balance_history', {}))
    
    # 不删除旧数据，保留所有历史
    return {
        'room_id': new['room_id'],
        'balance_history': merged_history,  # 完整历史
        ...
    }
```

### 3. GitHub Actions Workflow

`.github/workflows/daily-query.yml` 关键步骤：

```yaml
steps:
  # Step 1: 检出仓库（包含历史 summary 数据）
  - name: Checkout repository
    uses: actions/checkout@v4
    with:
      fetch-depth: 1
  
  # Step 2: 查询新数据（写入原始 database/）
  - name: Query electricity data
    run: |
      python nju_electric_query.py \
        --cookie-file /tmp/cookie.json \
        -d ./database \
        $(cat config/room_ids.txt)
  
  # Step 3: 合并新数据与旧 summary（保留所有历史）
  - name: Generate summaries
    run: |
      python scripts/aggregate_data.py \
        --database ./database \
        --output ./database/summaries
      # 自动加载 database/summaries/ 中的旧数据并合并
  
  # Step 4: 只提交 summaries（不提交原始数据）
  - name: Commit and push summaries only
    run: |
      git config --local user.email "action@github.com"
      git config --local user.name "GitHub Action"
      
      # 只添加 summaries 和 logs
      git add database/summaries/ logs/ || true
      
      if ! git diff --staged --quiet; then
        git commit -m "chore: update electricity summaries for $(date +%Y-%m-%d)"
        git push
      fi
```

## 空间估算

### 单个房间 Summary 文件大小

每个房间 JSON 包含所有历史数据：

| 时间跨度 | 天数 | 键值对数 | 文件大小 | 说明 |
|---------|------|---------|---------|------|
| 1 个月 | 30 | 30 | ~1KB | 初始阶段 |
| 6 个月 | 180 | 180 | ~6KB | 半年数据 |
| 1 年 | 365 | 365 | ~11KB | 一年数据 |
| 2 年 | 730 | 730 | ~22KB | 两年数据 |
| 5 年 | 1825 | 1825 | ~55KB | 五年数据 |

**计算方式**：
- 每个键值对：`"20260515": 135.20` ≈ 25-30 字节
- 365 天 × 30 字节 ≈ 11KB

### 仓库总体积（500 个房间）

| 时间跨度 | 总体积 | 说明 |
|---------|--------|------|
| 1 个月 | ~500KB | 初始阶段 |
| 1 年 | ~5.5MB | 一年数据 |
| 2 年 | ~11MB | 两年数据 |
| 5 年 | ~27.5MB | 五年数据 |

**对比原始数据**：
- 原始数据（1年）：~182MB
- Summary 数据（1年）：~5.5MB
- **节省空间：97%** ✅

## 数据示例

### 单个房间 Summary 文件（包含所有历史）

`database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json`:

```json
{
  "room_id": "53463",
  "room_name": "19栋第16层1613",
  "campus": "仙林校区",
  "building": "19幢",
  "current_balance": 146.99,
  "balance_history": {
    "20260515": 135.20,
    "20260516": 132.40,
    "20260517": 130.10,
    "20260518": 128.50,
    ...
    "20270415": 150.30,
    "20270416": 148.20,
    "20270417": 146.99
  },
  "last_updated": "20270417"
}
```

**关键点**：
- `balance_history` 包含**所有历史**余额数据（无时间限制）
- 每次运行会自动合并新旧数据
- 前端可以基于此计算任意时间范围的统计指标

## 前端使用

### 查看完整历史

```javascript
// 加载单个房间的完整历史数据
const room = await fetch(
  'database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json'
).then(r => r.json());

// balance_history 包含所有历史数据
console.log(room.balance_history);
// {
//   "20260515": 135.20,
//   "20260516": 132.40,
//   ... 完整历史
// }

const dates = Object.keys(room.balance_history).sort();
console.log(`数据时间范围: ${dates[0]} ~ ${dates[dates.length-1]}`);
console.log(`总天数: ${dates.length}`);
```

### 计算统计指标

```javascript
// 计算任意时间范围的统计
function calculateStats(room, startDate, endDate) {
  const history = room.balance_history;
  const balances = [];
  
  for (const [date, balance] of Object.entries(history)) {
    if (date >= startDate && date <= endDate) {
      balances.push({ date, balance });
    }
  }
  
  const values = balances.map(b => b.balance);
  
  return {
    count: balances.length,
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    current: values[values.length - 1]
  };
}

// 最近7天
const stats7d = calculateStats(room, '20270410', '20270417');

// 最近30天
const stats30d = calculateStats(room, '20270318', '20270417');

// 完整历史
const allDates = Object.keys(room.balance_history).sort();
const statsAll = calculateStats(room, allDates[0], allDates[allDates.length - 1]);

console.log(`完整历史统计:`);
console.log(`  总天数: ${statsAll.count}`);
console.log(`  平均余额: ${statsAll.avg.toFixed(2)}度`);
console.log(`  最高: ${statsAll.max}度`);
console.log(`  最低: ${statsAll.min}度`);
```

### 绘制趋势图

```javascript
// 绘制完整历史趋势
function renderTrendChart(room) {
  const history = room.balance_history;
  const dates = Object.keys(history).sort();
  const balances = dates.map(d => history[d]);
  
  // 使用 Chart.js 或类似库
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDate(d)),
      datasets: [{
        label: '电费余额',
        data: balances,
        borderColor: 'rgb(75, 192, 192)'
      }]
    }
  });
}
```

## 验证数据持久化

```bash
# 查看仓库中的 summary 文件
git log --oneline --all -- database/summaries/

# 查看特定房间的历史提交
git log --follow database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json

# 查看最新 summary 包含多少天数据
cat database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json | \
  jq '.balance_history | length'

# 查看数据时间范围
cat database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json | \
  jq '.balance_history | keys | {first: .[0], last: .[-1], total: length}'
```

## 为什么保留所有历史？

### 优点

1. ✅ **完整数据**：不丢失任何历史信息
2. ✅ **灵活分析**：可以计算任意时间范围的统计
3. ✅ **趋势预测**：更多历史数据提高预测准确度
4. ✅ **审计追踪**：完整的数据变化记录
5. ✅ **体积可控**：Summary 比原始数据小 97%

### 空间管理

如果未来数据过多，可以选择：

1. **定期归档**：将超过 N 年的数据移到归档分支
2. **按年分文件**：`53463_2026.json`, `53463_2027.json`
3. **压缩存储**：使用更紧凑的数据格式

## 总结

✅ **数据持久化机制（完整历史版）**：
1. 原始数据**不**提交到仓库（节省空间）
2. Summary 数据提交到仓库（保留历史）
3. 每次运行：加载旧 summary → 合并新数据 → 提交新 summary
4. `balance_history` 保留**所有历史数据**（无时间限制）
5. 仓库体积可控：~5.5MB/年（对比原始数据 ~182MB/年）

✅ **核心要点**：
- `database/{校区}/` **被** `.gitignore` 忽略
- `database/summaries/` **不**被忽略，会提交
- 每次运行结束只 `git commit` summaries
- 通过 `balance_history` 字段累积所有历史数据
- 每个房间 JSON 包含所有查询过的日期及余额
