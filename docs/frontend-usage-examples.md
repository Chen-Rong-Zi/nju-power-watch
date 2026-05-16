# 前端使用完整历史数据示例

## 数据结构

每个房间的 summary JSON 包含**完整历史数据**：

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
    ...  // 所有历史数据
    "20270415": 150.30,
    "20270416": 148.20,
    "20270417": 146.99
  },
  "last_updated": "20270417"
}
```

## 前端代码示例

### 1. 加载数据

```javascript
// 加载单个房间数据
async function loadRoom(campus, building, roomId) {
  const response = await fetch(
    `database/summaries/campuses/${campus}/buildings/${building}/rooms/${roomId}.json`
  );
  return await response.json();
}

// 使用示例
const room = await loadRoom('仙林校区', '19幢', '53463');
```

### 2. 计算任意时间范围的统计

```javascript
/**
 * 计算指定时间范围的统计指标
 * @param {Object} room - 房间数据
 * @param {string} startDate - 开始日期 (YYYYMMDD)
 * @param {string} endDate - 结束日期 (YYYYMMDD)
 */
function calculateRangeStats(room, startDate, endDate) {
  const history = room.balance_history;
  const dates = Object.keys(history).sort();
  
  // 筛选时间范围内的数据
  const rangeData = dates
    .filter(date => date >= startDate && date <= endDate)
    .map(date => ({ date, balance: history[date] }));
  
  const balances = rangeData.map(d => d.balance);
  
  if (balances.length === 0) {
    return null;
  }
  
  return {
    startDate: rangeData[0].date,
    endDate: rangeData[rangeData.length - 1].date,
    days: balances.length,
    average: (balances.reduce((a, b) => a + b, 0) / balances.length).toFixed(2),
    min: Math.min(...balances).toFixed(2),
    max: Math.max(...balances).toFixed(2),
    current: balances[balances.length - 1].toFixed(2),
    first: balances[0].toFixed(2)
  };
}

// 使用示例：计算最近7天
const stats7d = calculateRangeStats(room, '20270410', '20270417');
console.log('最近7天统计:', stats7d);

// 使用示例：计算最近30天
const stats30d = calculateRangeStats(room, '20270318', '20270417');
console.log('最近30天统计:', stats30d);

// 使用示例：计算完整历史
const allDates = Object.keys(room.balance_history).sort();
const statsAll = calculateRangeStats(room, allDates[0], allDates[allDates.length - 1]);
console.log('完整历史统计:', statsAll);
```

### 3. 计算用电趋势

```javascript
/**
 * 计算用电趋势（每天平均用电量）
 * @param {Object} room - 房间数据
 * @param {number} days - 计算天数
 */
function calculateConsumptionTrend(room, days) {
  const history = room.balance_history;
  const dates = Object.keys(history).sort().slice(-days);
  
  if (dates.length < 2) return null;
  
  const consumptions = [];
  for (let i = 1; i < dates.length; i++) {
    const prevBalance = history[dates[i - 1]];
    const currBalance = history[dates[i]];
    const consumption = prevBalance - currBalance;
    consumptions.push({
      date: dates[i],
      consumption: Math.max(0, consumption)  // 用电量不能为负
    });
  }
  
  const avgConsumption = consumptions.reduce((sum, c) => sum + c.consumption, 0) / consumptions.length;
  
  return {
    averageDailyConsumption: avgConsumption.toFixed(2),
    totalDays: consumptions.length,
    data: consumptions
  };
}

// 使用示例：最近7天用电趋势
const trend7d = calculateConsumptionTrend(room, 7);
console.log('最近7天平均用电:', trend7d.averageDailyConsumption, '度/天');

// 使用示例：最近30天用电趋势
const trend30d = calculateConsumptionTrend(room, 30);
console.log('最近30天平均用电:', trend30d.averageDailyConsumption, '度/天');
```

### 4. 预测余额不足时间

```javascript
/**
 * 预测余额不足时间
 * @param {Object} room - 房间数据
 * @param {number} dailyConsumption - 每天用电量（可选，不传则自动计算）
 */
function predictEmptyDate(room, dailyConsumption) {
  const currentBalance = room.current_balance;
  
  // 如果没有提供每天用电量，计算最近7天平均
  if (!dailyConsumption) {
    const trend = calculateConsumptionTrend(room, 7);
    dailyConsumption = parseFloat(trend.averageDailyConsumption);
  }
  
  if (dailyConsumption <= 0) {
    return { error: '用电量为0或负，无法预测' };
  }
  
  const daysUntilEmpty = Math.floor(currentBalance / dailyConsumption);
  const emptyDate = new Date();
  emptyDate.setDate(emptyDate.getDate() + daysUntilEmpty);
  
  return {
    currentBalance: currentBalance.toFixed(2),
    dailyConsumption: dailyConsumption.toFixed(2),
    daysUntilEmpty,
    emptyDate: emptyDate.toISOString().split('T')[0]
  };
}

// 使用示例
const prediction = predictEmptyDate(room);
console.log(`当前余额: ${prediction.currentBalance}度`);
console.log(`日均用电: ${prediction.dailyConsumption}度/天`);
console.log(`预计${prediction.daysUntilEmpty}天后余额不足 (${prediction.emptyDate})`);
```

### 5. 绘制完整历史趋势图

```javascript
/**
 * 绘制完整历史趋势图
 * @param {Object} room - 房间数据
 * @param {string} canvasId - Canvas元素ID
 */
function renderHistoryChart(room, canvasId) {
  const history = room.balance_history;
  const dates = Object.keys(history).sort();
  const balances = dates.map(d => history[d]);
  
  // 格式化日期显示（每N个显示一个标签）
  function formatDate(dateStr) {
    return `${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  
  const labels = dates.map((d, i) => {
    // 每7天显示一个标签
    return i % 7 === 0 ? formatDate(d) : '';
  });
  
  // 使用 Chart.js 绘制
  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '电费余额 (度)',
        data: balances,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `电费余额趋势 - ${room.room_name}`
        },
        tooltip: {
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex;
              return `日期: ${dates[index]}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: '余额 (度)'
          }
        },
        x: {
          title: {
            display: true,
            text: '日期'
          }
        }
      }
    }
  });
}

// 使用示例
renderHistoryChart(room, 'balanceChart');
```

### 6. 完整示例：房间详情页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>房间电费详情</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div id="room-info">
    <h2 id="room-name"></h2>
    <div id="current-balance"></div>
    <div id="stats"></div>
    <canvas id="chart"></canvas>
  </div>

  <script>
    async function init() {
      // 加载数据
      const room = await loadRoom('仙林校区', '19幢', '53463');
      
      // 显示基本信息
      document.getElementById('room-name').textContent = room.room_name;
      document.getElementById('current-balance').innerHTML = 
        `当前余额: <strong>${room.current_balance}度</strong>`;
      
      // 计算统计
      const allDates = Object.keys(room.balance_history).sort();
      const stats = calculateRangeStats(room, allDates[0], allDates[allDates.length - 1]);
      const trend = calculateConsumptionTrend(room, 30);
      const prediction = predictEmptyDate(room);
      
      // 显示统计
      document.getElementById('stats').innerHTML = `
        <h3>历史统计 (${stats.days}天)</h3>
        <ul>
          <li>平均余额: ${stats.average}度</li>
          <li>最高余额: ${stats.max}度</li>
          <li>最低余额: ${stats.min}度</li>
          <li>日均用电: ${trend.averageDailyConsumption}度/天</li>
          <li>预计${prediction.daysUntilEmpty}天后余额不足</li>
        </ul>
      `;
      
      // 绘制图表
      renderHistoryChart(room, 'chart');
    }
    
    init();
  </script>
</body>
</html>
```

## 性能说明

### 数据加载

- **文件大小**: 每个房间约 11KB/年
- **加载时间**: < 100ms（单个房间）
- **浏览器缓存**: 自动缓存 JSON 文件

### 大数据量处理

如果历史数据超过 1000 天：

```javascript
// 只加载最近 N 天到图表
function renderRecentHistory(room, canvasId, days = 365) {
  const dates = Object.keys(room.balance_history).sort().slice(-days);
  // ... 绘制逻辑
}
```

### 按需加载

```javascript
// 先加载总览，点击后再加载详情
const overview = await fetch('database/summaries/overview.json').then(r => r.json());

// 用户点击某个房间时再加载详细数据
document.getElementById('room-list').addEventListener('click', async (e) => {
  const roomId = e.target.dataset.roomId;
  const room = await loadRoom(campus, building, roomId);
  // ... 显示详情
});
```
