# 南京大学电费查询工具

## nju_electric_query.py

异步批量查询南京大学宿舍电费余额信息。

### 用法

```bash
# 激活虚拟环境
source venv/bin/activate

# 查询多个宿舍
python3 nju_electric_query.py 53463 53464 53465

# 指定输出目录
python3 nju_electric_query.py -d ./logs 53463 53464 53465

# 指定并发数 (默认10)
python3 nju_electric_query.py -c 20 -d ./logs 53463 53464 53465
```

### 输出示例

```
开始查询 3 个宿舍 (并发数: 10)...
--------------------------------------------------
[3/3] 成功: 3, 失败: 0
==================================================
查询完成!
  总数: 3
  成功: 3
  失败: 0
  耗时: 0.51秒
  输出目录: /home/rongzi/Project/dorm_query/logs
==================================================
```

### 输出文件

目录结构：`{校区}/{楼栋}/{房间}/{日期}.json`

```
logs/
├── 仙林校区/
│   ├── 19幢/
│   │   └── 19栋第16层1613/
│   │       └── 20260515.json
│   └── 4幢/
│       └── 4A505/
│           └── 20260515.json
└── 苏州校区/
    └── 仁园-戊/
        └── 戊504/
            └── 20260515.json
```

### 参数

| 参数 | 说明 | 默认值 |
|
| `-d, --dir` | 输出目录 | 无 |
| `-c, --concurrency` | 最大并发数 | 10 |
| `room_ids` | 缴费系统ID列表（仅用于API查询参数） | 必填 |

### 依赖

- Python 3.8+
- aiohttp (已包含在 venv 中)

### 功能特性

- **Cookie 自动加载**: 默认从 `~/Downloads/epay.nju.edu.cn_json_1778821830826.json` 加载
- **并发控制**: 信号量限制并发数
- **重试机制**: 指数退避 (默认3次, 2/3/4.5秒)
- **流式处理**: 异步生成器，内存占用恒定
- **错误分类**: 详细错误类型及原因

### 注意事项

- Cookie 信息具有时效性，过期后需要重新导出
- 楼栋信息因页面动态渲染，静态解析无法获取，当前使用 "宿舍_{id}" 作为标识
- 建议并发数设置为 10-20，过高可能触发服务端限流

## 消耗量分析模块 (Consumption Analytics)

### 概述

消耗量分析模块提供从余额数据中提取消耗量和充值量的功能，支持三个视角的分析：校区视角、楼栋视角和房间视角。

**重要**: 所有消耗量计算均在浏览器前端完成，无需运行后端脚本。数据从现有的余额历史数据中计算得出。

### 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     现有余额数据                              │
│  database/summaries/campuses/{campus}/buildings/{building}/ │
│  rooms/{room_name}.json (包含 balance_history)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    前端加载数据
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              consumption-calculator.js                       │
│  • calculateConsumption() - 余额差值 → 消耗量               │
│  • detectRecharges() - 余额增加 → 充值事件                  │
│  • calculateAggregates() - 房间 → 楼栋/校区统计             │
│  • detectAnomalies() - Z-score 异常检测                     │
│  • calculatePredictions() - 历史 → 未来预估                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    结果缓存到浏览器
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              展示层 (campus/building/room views)             │
└─────────────────────────────────────────────────────────────┘
```

### 快速开始

```bash
# 从仓库根目录
cd docs
python3 -m http.server 8000

# 访问 http://localhost:8000/index.html
# 点击 "⚡ 消耗视角" 或直接访问 #/consumption
```

### 三层视角

#### 1. 校区视角 (Campus Perspective)
- 显示全校区的总消耗量和充值量
- 楼栋消耗量排名
- 支持 `#/consumption` 路由访问

#### 2. 楼栋视角 (Building Perspective)
- 楼层消耗量分布
- 异常房间检测 (Z-score > 2)
- 支持 `#/building/{campus}/{building}` 路由

#### 3. 房间视角 (Room Perspective)
- 个性化消耗预测
- 充值建议
- 周消耗模式分析
- 支持 `#/room/{campus}/{building}/{roomId}` 路由

### 关键文件

```
docs/js/modules/
├── utils.js                    # 前端工具函数 (缓存、格式化)
├── consumption-calculator.js   # 核心计算引擎 (消耗量、预测、异常检测)
├── consumption.js              # 数据获取和聚合计算
├── campus-view.js              # 校区视角UI
├── building-view.js            # 楼栋视角UI
├── room-view.js                # 房间视角UI
└── prediction.js               # 预测显示组件

docs/database/summaries/
├── campuses.json               # 校区列表
├── overview.json               # 全局概览
└── campuses/{campus}/
    ├── summary.json            # 校区摘要 (楼栋列表)
    └── buildings/{building}/
        ├── summary.json        # 楼栋摘要 (房间列表)
        └── rooms/{room_name}.json # 房间历史数据

config/
└── room_ids.json               # 房间名→ID映射及历史记录
```

### 消耗量计算方法

使用余额差值法：
```javascript
// consumption = max(0, previous_balance - current_balance)
function calculateConsumption(balanceHistory) {
    // 排序后计算相邻余额差值
    const delta = prevBalance - currBalance;
    if (delta > 0) {
        // 余额减少 = 消耗
        return { consumption: delta, method: 'delta' };
    } else if (delta < 0) {
        // 余额增加 = 充值
        return { recharge: Math.abs(delta), method: 'recharge' };
    }
}
```

### 用户配置

用户可在消耗视角页面调整以下参数（保存到 localStorage）：

| 参数 | 键名 | 默认值 | 说明 |
|------|------|--------|------|
| 预测窗口 | `consumption.prediction_window` | 14 | 用于预测的历史天数 |
| 异常阈值 | `consumption.anomaly_threshold` | 2.0 | 异常检测的标准差倍数 |
| 置信度阈值 | `consumption.confidence_threshold` | 0.70 | 显示预测的最低置信度 |

### 性能优化

- **前端计算**: 无需预计算脚本，数据始终最新
- **快速估算**: 校区/楼栋级别使用估算值 (~3.5 kWh/天/间)
- **延迟加载图表库**: Chart.js 和 ECharts 按需加载
- **带 TTL 的缓存**: 计算结果缓存到内存和 localStorage

## Active Technologies
- JavaScript ES6+ (frontend), Python 3.8+ (data collection only) + Chart.js 4.4.0, ECharts 5.x, vanilla JavaScript (no frameworks)
- Static JSON files (existing balance data), localStorage (computed cache)
- localStorage (user preferences, room cache), sessionStorage (computed cache) (003-consumption-perspective-refactor)

## 房间ID映射 (Room ID Mapping)

缴费系统的 `room_id` 是动态的，可能被重新分配给其他房间。系统使用 `config/room_ids.json` 记录房间名与ID的对应关系及历史变更。

### 映射文件结构

```json
{
  "仙林校区": {
    "1幢": {
      "1A102": {
        "current_id": "101223",
        "previous_ids": ["100492"]
      }
    }
  }
}
```

### 相关脚本

| 脚本 | 用途 |
|------|------|
| `scripts/update_mapping.py` | 查询API更新映射文件 |
| `scripts/extract_room_ids.py` | 提取所有room_id（优先从映射文件） |
| `scripts/migrate_room_ids.py` | 一次性迁移脚本（已执行） |

## Recent Changes
- 004-room-id-refactor: Changed primary key from room_id to room_name, added room_ids.json mapping
- 003-consumption-perspective-refactor: Changed from backend pre-computation to frontend calculation with caching
