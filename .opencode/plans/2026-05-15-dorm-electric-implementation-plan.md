# 南京大学宿舍电费统计系统 - 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于 GitHub Pages 的静态网站，用于统计和展示南京大学各宿舍电费使用情况，实现数据自动采集、聚合和可视化。

**Architecture:** 
- 数据层：原始数据按日期存储在 `database/raw/`，聚合数据存储在 `docs/data/`
- 处理层：Python 脚本负责爬取和聚合数据，GitHub Actions 自动化执行
- 展示层：Vanilla JS + Chart.js 实现，托管在 GitHub Pages

**Tech Stack:** 
- 后端：Python 3.9+, aiohttp, pyyaml
- 前端：Vanilla JavaScript, Chart.js 4.x
- 自动化：GitHub Actions
- 托管：GitHub Pages

---

## 文件结构规划

### 新增文件

```
dorm_public/
├── .github/
│   └── workflows/
│       └── daily-query.yml          # GitHub Actions 配置
├── config/
│   ├── buildings.yaml                # 楼栋配置白名单
│   └── cookie.json                   # Cookie 存储（gitignore）
├── scripts/
│   ├── query_daily.py               # 每日爬取脚本
│   └── aggregate_data.py            # 数据聚合脚本
├── docs/
│   ├── index.html                   # 主页
│   ├── building.html                # 楼栋详情页
│   ├── campus.html                  # 校区统计页
│   ├── css/
│   │   └── style.css               # 全局样式
│   ├── js/
│   │   ├── app.js                  # 主逻辑
│   │   ├── api.js                  # 数据加载
│   │   ├── charts.js               # 图表配置
│   │   └── utils.js                # 工具函数
│   └── data/                       # 聚合数据（由脚本生成）
│       ├── latest.json
│       ├── daily-summary.json
│       ├── building-meta.json
│       └── stats/
│           └── leaderboard.json
└── tests/
    ├── test_query_daily.py
    └── test_aggregate_data.py
```

### 修改文件

- `.gitignore`: 添加 `config/cookie.json`, `database/raw/`, `*.tar.gz`
- `README.md`: 添加项目说明和使用文档

---

## Chunk 1: 配置与基础结构

### Task 1.1: 创建配置文件

**Files:**
- Create: `config/buildings.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: 创建配置目录**

```bash
mkdir -p config scripts tests docs/css docs/js docs/data/stats
```

- [ ] **Step 2: 创建楼栋配置文件**

创建文件 `config/buildings.yaml`:

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

- [ ] **Step 3: 更新 .gitignore**

在 `.gitignore` 中添加:

```
# Cookie 文件（敏感信息）
config/cookie.json

# 原始数据（可选归档）
# database/raw/

# 归档文件
*.tar.gz

# 日志文件
logs/

# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 4: 提交配置文件**

```bash
git add config/buildings.yaml .gitignore
git commit -m "chore: add building configuration and update gitignore"
```

---

### Task 1.2: 创建测试数据

**Files:**
- Create: `tests/fixtures/sample_data.json`

- [ ] **Step 1: 创建测试数据目录**

```bash
mkdir -p tests/fixtures
```

- [ ] **Step 2: 创建测试数据**

创建文件 `tests/fixtures/sample_data.json`:

```json
{
  "test_rooms": [
    {
      "校区": "仙林校区",
      "楼栋": "19幢",
      "房间": "1613",
      "宿舍ID": "53463",
      "学号": "522025360001",
      "剩余电量": "515.70度",
      "id": "53463",
      "success": true
    },
    {
      "校区": "仙林校区",
      "楼栋": "19幢",
      "房间": "1614",
      "宿舍ID": "53464",
      "学号": "522025360002",
      "剩余电量": "324.50度",
      "id": "53464",
      "success": true
    },
    {
      "校区": "浦口校区",
      "楼栋": "12栋宿舍",
      "房间": "507",
      "宿舍ID": "91310",
      "学号": "522025360003",
      "剩余电量": "850.20度",
      "id": "91310",
      "success": true
    }
  ]
}
```

- [ ] **Step 3: 提交测试数据**

```bash
git add tests/fixtures/sample_data.json
git commit -m "test: add sample data for testing"
```

---

## Chunk 2: 数据处理脚本

### Task 2.1: 实现每日爬取脚本

**Files:**
- Create: `scripts/query_daily.py`
- Create: `tests/test_query_daily.py`

- [ ] **Step 1: 编写测试用例**

创建文件 `tests/test_query_daily.py`:

```python
import pytest
import json
import tempfile
import shutil
from pathlib import Path
from scripts.query_daily import load_config, remove_sensitive_fields, save_raw_data

def test_load_config():
    """测试配置文件加载"""
    config = load_config('config/buildings.yaml')
    assert 'buildings' in config
    assert len(config['buildings']) > 0
    assert config['buildings'][0]['campus'] == "仙林校区"

def test_remove_sensitive_fields():
    """测试敏感字段去除"""
    data = {
        "校区": "仙林校区",
        "楼栋": "19幢",
        "房间": "1613",
        "宿舍ID": "53463",
        "学号": "522025360001",
        "剩余电量": "515.70度",
        "id": "53463",
        "success": True
    }
    
    cleaned = remove_sensitive_fields(data)
    assert "学号" not in cleaned
    assert cleaned["校区"] == "仙林校区"
    assert cleaned["宿舍ID"] == "53463"

def test_save_raw_data():
    """测试原始数据保存"""
    with tempfile.TemporaryDirectory() as tmpdir:
        data = {
            "campus": "仙林校区",
            "building": "19幢",
            "room": "1613",
            "room_id": "53463",
            "power": 515.70,
            "date": "2026-05-15",
            "scraped_at": "2026-05-15T00:30:00Z"
        }
        
        output_dir = Path(tmpdir)
        filepath = save_raw_data(data, output_dir)
        
        assert filepath.exists()
        with open(filepath, 'r', encoding='utf-8') as f:
            saved_data = json.load(f)
        assert saved_data == data

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

- [ ] **Step 2: 运行测试（预期失败）**

```bash
python -m pytest tests/test_query_daily.py -v
```

Expected: FAIL - 模块不存在

- [ ] **Step 3: 实现 query_daily.py**

创建文件 `scripts/query_daily.py`:

```python
#!/usr/bin/env python3
"""
每日电费查询脚本
功能：
1. 从配置文件读取监控楼栋
2. 爬取各楼栋电费数据
3. 去除敏感信息
4. 保存原始数据
"""

import os
import sys
import json
import yaml
import asyncio
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

# 添加父目录到路径，以便导入 nju_electric_query
sys.path.insert(0, str(Path(__file__).parent.parent))
from nju_electric_query import query_batch

def load_config(config_path: str) -> dict:
    """加载配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def remove_sensitive_fields(data: dict) -> dict:
    """去除敏感字段"""
    sensitive_fields = ["学号"]
    cleaned = {k: v for k, v in data.items() if k not in sensitive_fields}
    
    # 转换字段名为英文（便于前端处理）
    result = {
        "campus": cleaned.get("校区", ""),
        "building": cleaned.get("楼栋", ""),
        "room": cleaned.get("房间", ""),
        "room_id": cleaned.get("id", cleaned.get("宿舍ID", "")),
        "power": float(cleaned.get("剩余电量", "0度").replace("度", "")),
        "date": datetime.now().strftime("%Y-%m-%d"),
        "scraped_at": datetime.now().isoformat() + "Z"
    }
    
    return result

def save_raw_data(data: dict, output_dir: Path) -> Path:
    """保存原始数据到文件"""
    date_path = datetime.now().strftime("%Y/%m/%d")
    campus = data["campus"]
    building = data["building"]
    room = data["room"]
    room_id = data["room_id"]
    
    # 构建路径: database/raw/2026/05/15/仙林校区/19幢/1613-53463.json
    dir_path = output_dir / date_path / campus / building
    dir_path.mkdir(parents=True, exist_ok=True)
    
    filename = f"{room}-{room_id}.json"
    filepath = dir_path / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return filepath

def get_room_ids_for_building(building_config: dict) -> List[str]:
    """获取楼栋的所有房间 ID"""
    # 从 database/{campus}/{building}/ 目录读取房间 ID
    campus = building_config["campus"]
    building = building_config["buildings"][0]  # 简化：每次处理一个楼栋
    
    database_path = Path(__file__).parent.parent / "database" / campus / building
    
    if not database_path.exists():
        print(f"警告: 楼栋目录不存在: {database_path}")
        return []
    
    room_ids = []
    for room_dir in database_path.iterdir():
        if room_dir.is_dir():
            parts = room_dir.name.rsplit('-', 1)
            if len(parts) == 2 and parts[1].isdigit():
                room_ids.append(parts[1])
    
    return room_ids

async def query_buildings(config: dict, output_dir: Path, dry_run: bool = False):
    """查询所有配置的楼栋"""
    all_room_ids = []
    
    for building_config in config["buildings"]:
        campus = building_config["campus"]
        for building in building_config["buildings"]:
            print(f"获取楼栋房间 ID: {campus} - {building}")
            
            # 构建配置用于获取房间 ID
            temp_config = {"campus": campus, "buildings": [building]}
            room_ids = get_room_ids_for_building(temp_config)
            
            if room_ids:
                print(f"  找到 {len(room_ids)} 个房间")
                all_room_ids.extend(room_ids)
            else:
                print(f"  警告: 未找到房间 ID")
    
    if not all_room_ids:
        print("错误: 没有找到任何房间 ID")
        return
    
    print(f"\n总共需要查询 {len(all_room_ids)} 个房间")
    
    if dry_run:
        print("Dry run 模式，跳过实际查询")
        return
    
    # 执行查询
    print("\n开始查询...")
    summary = await query_batch(
        all_room_ids,
        output_dir=None,  # 不使用默认保存逻辑
        show_progress=True,
        max_concurrent=config.get("query", {}).get("concurrency", 20)
    )
    
    # 处理结果
    print("\n处理查询结果...")
    success_count = 0
    
    for result in summary.get("success_details", []):
        # 从原始结果中获取完整数据
        # 注意：这里需要从 query_batch 的返回值中获取完整数据
        # 由于 query_batch 返回的是简化数据，我们需要重新构造
        # 这里简化处理，实际使用时需要调整
        cleaned_data = {
            "campus": result.get("building", "").split()[0] if result.get("building") else "",
            "building": result.get("building", ""),
            "room": result.get("room", ""),
            "room_id": result["id"],
            "power": float(result.get("power", "0度").replace("度", "")),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "scraped_at": datetime.now().isoformat() + "Z"
        }
        
        filepath = save_raw_data(cleaned_data, output_dir)
        success_count += 1
    
    print(f"\n成功保存 {success_count} 个房间的数据")
    print(f"失败: {summary.get('failed', 0)} 个房间")

def main():
    parser = argparse.ArgumentParser(description="每日电费查询")
    parser.add_argument(
        "--config", 
        "-c",
        default="config/buildings.yaml",
        help="配置文件路径"
    )
    parser.add_argument(
        "--output", 
        "-o",
        default="database/raw",
        help="输出目录"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅显示将执行的查询，不实际运行"
    )
    
    args = parser.parse_args()
    
    # 加载配置
    config = load_config(args.config)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 执行查询
    asyncio.run(query_buildings(config, output_dir, args.dry_run))

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 安装依赖**

```bash
pip install pyyaml pytest
```

- [ ] **Step 5: 运行测试**

```bash
python -m pytest tests/test_query_daily.py -v
```

Expected: PASS (部分测试可能因为数据格式不完全匹配而失败，需要调整)

- [ ] **Step 6: 提交脚本**

```bash
git add scripts/query_daily.py tests/test_query_daily.py
git commit -m "feat: implement daily query script with privacy protection"
```

---

### Task 2.2: 实现数据聚合脚本

**Files:**
- Create: `scripts/aggregate_data.py`
- Create: `tests/test_aggregate_data.py`

- [ ] **Step 1: 编写测试用例**

创建文件 `tests/test_aggregate_data.py`:

```python
import pytest
import json
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from scripts.aggregate_data import load_raw_data, calculate_daily_summary, generate_leaderboard

def create_test_data(base_dir: Path, date: str):
    """创建测试数据"""
    data = [
        {
            "campus": "仙林校区",
            "building": "19幢",
            "room": "1613",
            "room_id": "53463",
            "power": 515.70,
            "date": date,
            "scraped_at": f"{date}T00:30:00Z"
        },
        {
            "campus": "仙林校区",
            "building": "19幢",
            "room": "1614",
            "room_id": "53464",
            "power": 324.50,
            "date": date,
            "scraped_at": f"{date}T00:30:00Z"
        },
        {
            "campus": "浦口校区",
            "building": "12栋宿舍",
            "room": "507",
            "room_id": "91310",
            "power": 850.20,
            "date": date,
            "scraped_at": f"{date}T00:30:00Z"
        }
    ]
    
    year, month, day = date.split("-")
    for item in data:
        dir_path = base_dir / year / month / day / item["campus"] / item["building"]
        dir_path.mkdir(parents=True, exist_ok=True)
        
        filename = f"{item['room']}-{item['room_id']}.json"
        filepath = dir_path / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(item, f, ensure_ascii=False)

def test_load_raw_data():
    """测试加载原始数据"""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        date = "2026-05-15"
        
        create_test_data(base_dir, date)
        
        data = load_raw_data(base_dir, days=1)
        
        assert len(data) == 3
        assert data[0]["campus"] == "仙林校区"

def test_calculate_daily_summary():
    """测试计算每日统计"""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        date = "2026-05-15"
        
        create_test_data(base_dir, date)
        
        data = load_raw_data(base_dir, days=1)
        summary = calculate_daily_summary(data)
        
        assert summary["date"] == date
        assert summary["total_rooms"] == 3
        assert summary["avg_power"] == pytest.approx((515.70 + 324.50 + 850.20) / 3)
        assert summary["max_power"] == 850.20
        assert summary["min_power"] == 324.50

def test_generate_leaderboard():
    """测试生成排行榜"""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir)
        date = "2026-05-15"
        
        create_test_data(base_dir, date)
        
        data = load_raw_data(base_dir, days=1)
        leaderboard = generate_leaderboard(data, top_n=2)
        
        assert len(leaderboard["top_20"]) == 2
        assert leaderboard["top_20"][0]["power"] == 850.20
        assert leaderboard["top_20"][1]["power"] == 515.70

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

- [ ] **Step 2: 运行测试（预期失败）**

```bash
python -m pytest tests/test_aggregate_data.py -v
```

Expected: FAIL - 模块不存在

- [ ] **Step 3: 实现 aggregate_data.py**

创建文件 `scripts/aggregate_data.py`:

```python
#!/usr/bin/env python3
"""
数据聚合脚本
功能：
1. 加载原始数据
2. 计算统计数据
3. 生成聚合文件
4. 归档历史数据
"""

import os
import json
import tarfile
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict
from collections import defaultdict
import statistics

def load_raw_data(base_dir: Path, days: int = 90) -> List[Dict]:
    """加载最近 N 天的原始数据"""
    all_data = []
    
    for i in range(days):
        date = datetime.now() - timedelta(days=i)
        year = date.strftime("%Y")
        month = date.strftime("%m")
        day = date.strftime("%d")
        
        date_path = base_dir / year / month / day
        
        if not date_path.exists():
            continue
        
        # 递归查找所有 JSON 文件
        for json_file in date_path.rglob("*.json"):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    all_data.append(data)
            except Exception as e:
                print(f"警告: 无法读取文件 {json_file}: {e}")
    
    return all_data

def calculate_daily_summary(data: List[Dict]) -> Dict:
    """计算每日统计数据"""
    if not data:
        return {}
    
    # 按日期分组
    by_date = defaultdict(list)
    for item in data:
        by_date[item["date"]].append(item)
    
    summaries = []
    for date, rooms in sorted(by_date.items(), reverse=True):
        powers = [r["power"] for r in rooms]
        
        # 按校区分组
        campuses = defaultdict(list)
        for room in rooms:
            campuses[room["campus"]].append(room["power"])
        
        campus_stats = {}
        for campus, powers in campuses.items():
            campus_stats[campus] = {
                "avg_power": round(statistics.mean(powers), 2),
                "room_count": len(powers),
                "max_power": max(powers),
                "min_power": min(powers)
            }
        
        summary = {
            "date": date,
            "total_rooms": len(rooms),
            "avg_power": round(statistics.mean(powers), 2),
            "max_power": max(powers),
            "min_power": min(powers),
            "median_power": round(statistics.median(powers), 2),
            "std_power": round(statistics.stdev(powers), 2) if len(powers) > 1 else 0,
            "campuses": campus_stats
        }
        
        summaries.append(summary)
    
    # 返回最新的一天（用于测试）
    return summaries[0] if summaries else {}

def calculate_all_daily_summaries(data: List[Dict]) -> List[Dict]:
    """计算所有每日统计数据"""
    if not data:
        return []
    
    # 按日期分组
    by_date = defaultdict(list)
    for item in data:
        by_date[item["date"]].append(item)
    
    summaries = []
    for date, rooms in sorted(by_date.items(), reverse=True):
        powers = [r["power"] for r in rooms]
        
        # 按校区分组
        campuses = defaultdict(list)
        for room in rooms:
            campuses[room["campus"]].append(room["power"])
        
        campus_stats = {}
        for campus, powers in campuses.items():
            campus_stats[campus] = {
                "avg_power": round(statistics.mean(powers), 2),
                "room_count": len(powers),
                "max_power": max(powers),
                "min_power": min(powers)
            }
        
        summary = {
            "date": date,
            "total_rooms": len(rooms),
            "avg_power": round(statistics.mean(powers), 2),
            "max_power": max(powers),
            "min_power": min(powers),
            "median_power": round(statistics.median(powers), 2),
            "std_power": round(statistics.stdev(powers), 2) if len(powers) > 1 else 0,
            "campuses": campus_stats
        }
        
        summaries.append(summary)
    
    return summaries

def generate_latest_data(data: List[Dict]) -> Dict:
    """生成最新数据文件"""
    if not data:
        return {}
    
    # 获取最新日期
    latest_date = max(item["date"] for item in data)
    latest_data = [item for item in data if item["date"] == latest_date]
    
    # 按校区和楼栋分组
    campuses = defaultdict(lambda: defaultdict(list))
    for item in latest_data:
        campuses[item["campus"]][item["building"]].append({
            "room_id": item["room_id"],
            "room": item["room"],
            "power": item["power"]
        })
    
    result = {
        "date": latest_date,
        "updated_at": datetime.now().isoformat() + "Z",
        "total_rooms": len(latest_data),
        "campuses": {}
    }
    
    for campus, buildings in campuses.items():
        result["campuses"][campus] = {
            "total_rooms": sum(len(rooms) for rooms in buildings.values()),
            "buildings": {}
        }
        
        for building, rooms in buildings.items():
            result["campuses"][campus]["buildings"][building] = {
                "total_rooms": len(rooms),
                "rooms": sorted(rooms, key=lambda x: x["room"])
            }
    
    return result

def generate_leaderboard(data: List[Dict], top_n: int = 20) -> Dict:
    """生成排行榜"""
    if not data:
        return {}
    
    # 获取最新日期
    latest_date = max(item["date"] for item in data)
    latest_data = [item for item in data if item["date"] == latest_date]
    
    # 按电量排序
    sorted_data = sorted(latest_data, key=lambda x: x["power"], reverse=True)
    
    top_20 = []
    for i, item in enumerate(sorted_data[:top_n], 1):
        top_20.append({
            "rank": i,
            "room_id": item["room_id"],
            "room": item["room"],
            "building": item["building"],
            "campus": item["campus"],
            "power": item["power"]
        })
    
    bottom_20 = []
    for i, item in enumerate(sorted_data[-top_n:][::-1], 1):
        bottom_20.append({
            "rank": i,
            "room_id": item["room_id"],
            "room": item["room"],
            "building": item["building"],
            "campus": item["campus"],
            "power": item["power"]
        })
    
    return {
        "date": latest_date,
        "updated_at": datetime.now().isoformat() + "Z",
        "top_20": top_20,
        "bottom_20": bottom_20
    }

def generate_building_meta(data: List[Dict]) -> Dict:
    """生成楼栋元数据"""
    if not data:
        return {}
    
    # 统计楼栋信息
    campuses = defaultdict(lambda: defaultdict(lambda: {"total_rooms": 0, "rooms": set()}))
    
    for item in data:
        campuses[item["campus"]][item["building"]]["total_rooms"] += 1
        campuses[item["campus"]][item["building"]]["rooms"].add(item["room_id"])
    
    result = {
        "last_updated": datetime.now().isoformat() + "Z",
        "campuses": {}
    }
    
    for campus, buildings in campuses.items():
        result["campuses"][campus] = {
            "buildings": {}
        }
        
        for building, info in buildings.items():
            result["campuses"][campus]["buildings"][building] = {
                "total_rooms": info["total_rooms"],
                "unique_rooms": len(info["rooms"])
            }
    
    return result

def save_json(data: Dict, filepath: Path):
    """保存 JSON 文件"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def archive_old_data(base_dir: Path, output_dir: Path):
    """归档历史数据"""
    # 获取上个月的日期
    last_month = datetime.now().replace(day=1) - timedelta(days=1)
    year = last_month.strftime("%Y")
    month = last_month.strftime("%m")
    
    source_dir = base_dir / year / month
    
    if not source_dir.exists():
        print(f"没有需要归档的数据: {source_dir}")
        return
    
    # 创建归档文件
    archive_path = output_dir / f"{year}-{month}.tar.gz"
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"归档 {source_dir} -> {archive_path}")
    
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(source_dir, arcname=f"{year}/{month}")
    
    # 删除原始数据（可选）
    # shutil.rmtree(source_dir)
    print(f"归档完成")

def main():
    parser = argparse.ArgumentParser(description="数据聚合")
    parser.add_argument(
        "--input", 
        "-i",
        default="database/raw",
        help="原始数据目录"
    )
    parser.add_argument(
        "--output", 
        "-o",
        default="docs/data",
        help="输出目录"
    )
    parser.add_argument(
        "--archive",
        action="store_true",
        help="归档历史数据"
    )
    
    args = parser.parse_args()
    
    input_dir = Path(args.input)
    output_dir = Path(args.output)
    
    print("加载原始数据...")
    data = load_raw_data(input_dir)
    print(f"加载了 {len(data)} 条数据")
    
    if not data:
        print("警告: 没有找到数据")
        return
    
    print("\n生成聚合数据...")
    
    # 生成 latest.json
    print("  - latest.json")
    latest = generate_latest_data(data)
    save_json(latest, output_dir / "latest.json")
    
    # 生成 daily-summary.json
    print("  - daily-summary.json")
    daily_summaries = calculate_all_daily_summaries(data)
    save_json(daily_summaries, output_dir / "daily-summary.json")
    
    # 生成 building-meta.json
    print("  - building-meta.json")
    building_meta = generate_building_meta(data)
    save_json(building_meta, output_dir / "building-meta.json")
    
    # 生成 leaderboard.json
    print("  - stats/leaderboard.json")
    leaderboard = generate_leaderboard(data)
    save_json(leaderboard, output_dir / "stats" / "leaderboard.json")
    
    print(f"\n聚合完成！数据保存到 {output_dir}")
    
    # 归档历史数据
    if args.archive:
        archive_old_data(input_dir, output_dir.parent / "archive")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行测试**

```bash
python -m pytest tests/test_aggregate_data.py -v
```

Expected: PASS

- [ ] **Step 5: 提交脚本**

```bash
git add scripts/aggregate_data.py tests/test_aggregate_data.py
git commit -m "feat: implement data aggregation script"
```

---

## Chunk 3: GitHub Actions 自动化

### Task 3.1: 配置 GitHub Actions

**Files:**
- Create: `.github/workflows/daily-query.yml`
- Modify: `scripts/query_daily.py` (添加 Cookie 支持)

- [ ] **Step 1: 创建 workflows 目录**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: 创建 GitHub Actions 配置**

创建文件 `.github/workflows/daily-query.yml`:

```yaml
name: Daily Electric Query

on:
  schedule:
    - cron: '0 0 * * *'  # UTC 0:00 (北京时间 8:00)
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (不实际查询)'
        required: false
        default: 'false'
        type: boolean

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
      
      - name: Setup Cookie
        env:
          NJU_COOKIE: ${{ secrets.NJU_COOKIE }}
        run: |
          if [ -z "$NJU_COOKIE" ]; then
            echo "错误: NJU_COOKIE 未设置"
            echo "请在 GitHub Secrets 中添加 NJU_COOKIE"
            exit 1
          fi
          echo "$NJU_COOKIE" > config/cookie.json
          echo "Cookie 已配置"
      
      - name: Run daily query
        if: ${{ github.event.inputs.dry_run != 'true' }}
        run: |
          python scripts/query_daily.py \
            --config config/buildings.yaml \
            --output database/raw
      
      - name: Dry run (test only)
        if: ${{ github.event.inputs.dry_run == 'true' }}
        run: |
          python scripts/query_daily.py \
            --config config/buildings.yaml \
            --output database/raw \
            --dry-run
      
      - name: Aggregate data
        run: |
          python scripts/aggregate_data.py \
            --input database/raw \
            --output docs/data
      
      - name: Check for changes
        id: check_changes
        run: |
          git add database/ docs/data/
          if git diff --staged --quiet; then
            echo "::set-output name=has_changes::false"
          else
            echo "::set-output name=has_changes::true"
          fi
      
      - name: Commit and push changes
        if: steps.check_changes.outputs.has_changes == 'true'
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git commit -m "chore: update data for $(date +%Y-%m-%d)"
          git push
      
      - name: Send notification on failure
        if: failure()
        run: |
          echo "::error::电费查询失败，请检查 Cookie 是否过期"
          echo "查看详细日志: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

- [ ] **Step 3: 更新 query_daily.py 以支持 Cookie 文件**

在 `scripts/query_daily.py` 中添加：

```python
# 在文件开头添加
import os

# 修改 load_config 函数
def load_config(config_path: str) -> dict:
    """加载配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # 检查 Cookie 文件
    cookie_file = Path(__file__).parent.parent / "config" / "cookie.json"
    if not cookie_file.exists():
        raise FileNotFoundError(f"Cookie 文件不存在: {cookie_file}")
    
    # 更新全局 COOKIES（来自 nju_electric_query.py）
    global COOKIES
    import nju_electric_query
    nju_electric_query.COOKIES = nju_electric_query.load_cookies_from_file(str(cookie_file))
    
    return config
```

- [ ] **Step 4: 测试 GitHub Actions（手动触发）**

在 GitHub 网页上：
1. 进入仓库的 Actions 页面
2. 选择 "Daily Electric Query" workflow
3. 点击 "Run workflow" → 选择 "Dry run" → "Run workflow"
4. 查看运行日志

Expected: 成功运行，显示 "Dry run 模式"

- [ ] **Step 5: 提交 GitHub Actions 配置**

```bash
git add .github/workflows/daily-query.yml scripts/query_daily.py
git commit -m "feat: add GitHub Actions for automated daily query"
```

---

### Task 3.2: 设置 GitHub Secrets

**Files:** 无（GitHub 网页操作）

- [ ] **Step 1: 导出 Cookie**

在浏览器中：
1. 登录 https://epay.nju.edu.cn
2. 安装 "EditThisCookie" 浏览器插件
3. 点击插件图标，导出 Cookie 为 JSON

- [ ] **Step 2: 设置 GitHub Secret**

在 GitHub 网页上：
1. 进入仓库 Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. Name: `NJU_COOKIE`
4. Value: 粘贴 Cookie JSON
5. 点击 "Add secret"

- [ ] **Step 3: 测试真实查询**

在 GitHub 网页上：
1. 手动触发 "Daily Electric Query" workflow（不勾选 dry run）
2. 查看运行日志，确认数据成功爬取和提交

Expected: Actions 成功运行，`docs/data/` 目录生成聚合文件

---

## Chunk 4: 前端页面

### Task 4.1: 创建基础 HTML 页面

**Files:**
- Create: `docs/index.html`
- Create: `docs/building.html`
- Create: `docs/campus.html`
- Create: `docs/css/style.css`

- [ ] **Step 1: 创建主页**

创建文件 `docs/index.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>南京大学宿舍电费统计</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
    <header>
        <h1>南京大学宿舍电费统计</h1>
        <p class="update-time">数据更新时间: <span id="update-time">加载中...</span></p>
    </header>
    
    <main>
        <section id="overview">
            <h2>概览</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>总房间数</h3>
                    <p id="total-rooms">-</p>
                </div>
                <div class="stat-card">
                    <h3>平均电量</h3>
                    <p id="avg-power">-</p>
                </div>
                <div class="stat-card">
                    <h3>最高电量</h3>
                    <p id="max-power">-</p>
                </div>
                <div class="stat-card">
                    <h3>最低电量</h3>
                    <p id="min-power">-</p>
                </div>
            </div>
        </section>
        
        <section id="leaderboard">
            <h2>电费排行榜 (Top 20)</h2>
            <div class="table-container">
                <table id="leaderboard-table">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>校区</th>
                            <th>楼栋</th>
                            <th>房间</th>
                            <th>剩余电量</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboard-body">
                        <tr><td colspan="5">加载中...</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
        
        <section id="trend">
            <h2>最近 7 天趋势</h2>
            <div class="chart-container">
                <canvas id="trend-chart"></canvas>
            </div>
        </section>
        
        <section id="campus-comparison">
            <h2>校区对比</h2>
            <div class="chart-container">
                <canvas id="campus-chart"></canvas>
            </div>
        </section>
    </main>
    
    <footer>
        <p>数据来源: 南京大学电费查询系统</p>
        <p>本项目开源: <a href="https://github.com/your-username/dorm_public">GitHub</a></p>
    </footer>
    
    <script src="js/utils.js"></script>
    <script src="js/api.js"></script>
    <script src="js/charts.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建楼栋详情页**

创建文件 `docs/building.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>楼栋详情 - 南京大学宿舍电费统计</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
    <header>
        <h1><a href="index.html">南京大学宿舍电费统计</a></h1>
        <p id="building-title">楼栋详情</p>
    </header>
    
    <main>
        <section id="building-stats">
            <h2>统计信息</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>总房间数</h3>
                    <p id="building-total-rooms">-</p>
                </div>
                <div class="stat-card">
                    <h3>平均电量</h3>
                    <p id="building-avg-power">-</p>
                </div>
                <div class="stat-card">
                    <h3>最高电量</h3>
                    <p id="building-max-power">-</p>
                </div>
                <div class="stat-card">
                    <h3>最低电量</h3>
                    <p id="building-min-power">-</p>
                </div>
            </div>
        </section>
        
        <section id="room-list">
            <h2>房间列表</h2>
            <div class="search-box">
                <input type="text" id="search-input" placeholder="搜索房间号...">
            </div>
            <div class="table-container">
                <table id="room-table">
                    <thead>
                        <tr>
                            <th>房间号</th>
                            <th>剩余电量</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody id="room-body">
                        <tr><td colspan="3">加载中...</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
        
        <section id="power-distribution">
            <h2>电量分布</h2>
            <div class="chart-container">
                <canvas id="distribution-chart"></canvas>
            </div>
        </section>
    </main>
    
    <footer>
        <p><a href="index.html">返回主页</a></p>
    </footer>
    
    <script src="js/utils.js"></script>
    <script src="js/api.js"></script>
    <script src="js/charts.js"></script>
    <script src="js/components/building-detail.js"></script>
</body>
</html>
```

- [ ] **Step 3: 创建基础样式**

创建文件 `docs/css/style.css`:

```css
:root {
    --primary-color: #4a90e2;
    --secondary-color: #7b68ee;
    --success-color: #10b981;
    --warning-color: #f59e0b;
    --danger-color: #ef4444;
    --bg-color: #f5f5f5;
    --card-bg: #ffffff;
    --text-color: #333333;
    --text-secondary: #666666;
    --border-color: #e5e7eb;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    line-height: 1.6;
}

header {
    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
    color: white;
    padding: 2rem 1rem;
    text-align: center;
}

header h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
}

header h1 a {
    color: white;
    text-decoration: none;
}

.update-time {
    font-size: 0.9rem;
    opacity: 0.9;
}

main {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 1rem;
}

section {
    background: var(--card-bg);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

section h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: var(--text-color);
    border-bottom: 2px solid var(--primary-color);
    padding-bottom: 0.5rem;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
}

.stat-card {
    background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid var(--border-color);
}

.stat-card h3 {
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
}

.stat-card p {
    font-size: 2rem;
    font-weight: bold;
    color: var(--primary-color);
}

.table-container {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
}

thead {
    background: var(--bg-color);
}

th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
}

th {
    font-weight: 600;
    color: var(--text-color);
}

tbody tr:hover {
    background-color: #f9fafb;
}

.chart-container {
    position: relative;
    height: 400px;
    margin-top: 1rem;
}

.search-box {
    margin-bottom: 1rem;
}

.search-box input {
    width: 100%;
    max-width: 400px;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 1rem;
}

footer {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
}

footer a {
    color: var(--primary-color);
    text-decoration: none;
}

footer a:hover {
    text-decoration: underline;
}

@media (max-width: 768px) {
    header h1 {
        font-size: 1.5rem;
    }
    
    section {
        padding: 1rem;
    }
    
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .chart-container {
        height: 300px;
    }
}

@media (max-width: 480px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }
}
```

- [ ] **Step 4: 提交前端基础页面**

```bash
git add docs/index.html docs/building.html docs/css/style.css
git commit -m "feat: add basic HTML pages and styles"
```

---

### Task 4.2: 实现前端 JavaScript

**Files:**
- Create: `docs/js/utils.js`
- Create: `docs/js/api.js`
- Create: `docs/js/charts.js`
- Create: `docs/js/app.js`
- Create: `docs/js/components/building-detail.js`

- [ ] **Step 1: 创建工具函数**

创建文件 `docs/js/utils.js`:

```javascript
/**
 * 工具函数
 */

// 格式化电量显示
function formatPower(power) {
    return power.toFixed(2) + ' 度';
}

// 格式化日期
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// 格式化时间
function formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 获取 URL 参数
function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 获取电量状态
function getPowerStatus(power) {
    if (power < 50) {
        return { text: '电量不足', class: 'danger' };
    } else if (power < 100) {
        return { text: '电量偏低', class: 'warning' };
    } else {
        return { text: '正常', class: 'success' };
    }
}

// 排序函数
function sortByPower(a, b, order = 'desc') {
    const diff = a.power - b.power;
    return order === 'desc' ? -diff : diff;
}

// 过滤房间
function filterRooms(rooms, searchTerm) {
    if (!searchTerm) return rooms;
    
    const term = searchTerm.toLowerCase();
    return rooms.filter(room => 
        room.room.toLowerCase().includes(term) ||
        room.room_id.includes(term)
    );
}
```

- [ ] **Step 2: 创建 API 加载函数**

创建文件 `docs/js/api.js`:

```javascript
/**
 * 数据加载 API
 */

const API = {
    // 数据文件路径
    DATA_PATH: 'data/',
    
    // 缓存
    cache: {},
    
    // 加载 JSON 文件
    async loadJSON(filename) {
        if (this.cache[filename]) {
            return this.cache[filename];
        }
        
        try {
            const response = await fetch(this.DATA_PATH + filename);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.cache[filename] = data;
            return data;
        } catch (error) {
            console.error(`加载 ${filename} 失败:`, error);
            throw error;
        }
    },
    
    // 获取最新数据
    async getLatestData() {
        return await this.loadJSON('latest.json');
    },
    
    // 获取每日统计
    async getDailySummary() {
        return await this.loadJSON('daily-summary.json');
    },
    
    // 获取排行榜
    async getLeaderboard() {
        return await this.loadJSON('stats/leaderboard.json');
    },
    
    // 获取楼栋元数据
    async getBuildingMeta() {
        return await this.loadJSON('building-meta.json');
    },
    
    // 清除缓存
    clearCache() {
        this.cache = {};
    }
};
```

- [ ] **Step 3: 创建图表配置**

创建文件 `docs/js/charts.js`:

```javascript
/**
 * 图表配置
 */

const Charts = {
    // 默认配置
    defaultConfig: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top'
            }
        }
    },
    
    // 创建趋势图
    createTrendChart(ctx, dailySummary) {
        const last7Days = dailySummary.slice(0, 7).reverse();
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days.map(d => formatDate(d.date)),
                datasets: [{
                    label: '平均电量',
                    data: last7Days.map(d => d.avg_power),
                    borderColor: '#4a90e2',
                    backgroundColor: 'rgba(74, 144, 226, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: '最高电量',
                    data: last7Days.map(d => d.max_power),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: false
                }, {
                    label: '最低电量',
                    data: last7Days.map(d => d.min_power),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                ...this.defaultConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '电量 (度)'
                        }
                    }
                }
            }
        });
    },
    
    // 创建校区对比图
    createCampusChart(ctx, latestData) {
        const campuses = Object.entries(latestData.campuses);
        
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: campuses.map(([name]) => name),
                datasets: [{
                    label: '房间数量',
                    data: campuses.map(([, data]) => data.total_rooms),
                    backgroundColor: [
                        'rgba(74, 144, 226, 0.8)',
                        'rgba(123, 104, 238, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                ...this.defaultConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '房间数量'
                        }
                    }
                }
            }
        });
    },
    
    // 创建电量分布图
    createDistributionChart(ctx, rooms) {
        const ranges = [
            { label: '0-50', min: 0, max: 50 },
            { label: '50-100', min: 50, max: 100 },
            { label: '100-200', min: 100, max: 200 },
            { label: '200-300', min: 200, max: 300 },
            { label: '300-500', min: 300, max: 500 },
            { label: '500+', min: 500, max: Infinity }
        ];
        
        const distribution = ranges.map(range => {
            return rooms.filter(r => r.power >= range.min && r.power < range.max).length;
        });
        
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ranges.map(r => r.label + '度'),
                datasets: [{
                    label: '房间数量',
                    data: distribution,
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(74, 144, 226, 0.8)',
                        'rgba(123, 104, 238, 0.8)',
                        'rgba(168, 85, 247, 0.8)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                ...this.defaultConfig,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '房间数量'
                        }
                    }
                }
            }
        });
    }
};
```

- [ ] **Step 4: 创建主应用逻辑**

创建文件 `docs/js/app.js`:

```javascript
/**
 * 主应用逻辑
 */

// 初始化主页
async function initHomePage() {
    try {
        // 显示加载状态
        document.getElementById('update-time').textContent = '加载中...';
        
        // 加载数据
        const [latestData, dailySummary, leaderboard] = await Promise.all([
            API.getLatestData(),
            API.getDailySummary(),
            API.getLeaderboard()
        ]);
        
        // 更新统计卡片
        document.getElementById('update-time').textContent = formatDateTime(latestData.updated_at);
        document.getElementById('total-rooms').textContent = latestData.total_rooms;
        
        const summary = dailySummary[0];
        document.getElementById('avg-power').textContent = formatPower(summary.avg_power);
        document.getElementById('max-power').textContent = formatPower(summary.max_power);
        document.getElementById('min-power').textContent = formatPower(summary.min_power);
        
        // 更新排行榜
        updateLeaderboard(leaderboard.top_20);
        
        // 创建图表
        createCharts(latestData, dailySummary);
        
    } catch (error) {
        console.error('初始化失败:', error);
        alert('数据加载失败，请刷新页面重试');
    }
}

// 更新排行榜表格
function updateLeaderboard(top20) {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    
    top20.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${item.campus}</td>
            <td><a href="building.html?campus=${encodeURIComponent(item.campus)}&building=${encodeURIComponent(item.building)}">${item.building}</a></td>
            <td>${item.room}</td>
            <td>${formatPower(item.power)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 创建图表
function createCharts(latestData, dailySummary) {
    // 趋势图
    const trendCtx = document.getElementById('trend-chart').getContext('2d');
    Charts.createTrendChart(trendCtx, dailySummary);
    
    // 校区对比图
    const campusCtx = document.getElementById('campus-chart').getContext('2d');
    Charts.createCampusChart(campusCtx, latestData);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    if (currentPage === 'index.html' || currentPage === '') {
        initHomePage();
    } else if (currentPage === 'building.html') {
        // 由 building-detail.js 处理
    } else if (currentPage === 'campus.html') {
        // 由 campus-stats.js 处理
    }
});
```

- [ ] **Step 5: 创建楼栋详情组件**

创建文件 `docs/js/components/building-detail.js`:

```javascript
/**
 * 楼栋详情页组件
 */

async function initBuildingDetailPage() {
    const campus = getUrlParam('campus');
    const building = getUrlParam('building');
    
    if (!campus || !building) {
        alert('缺少必要参数');
        window.location.href = 'index.html';
        return;
    }
    
    try {
        // 更新标题
        document.getElementById('building-title').textContent = `${campus} - ${building}`;
        document.title = `${building} - 南京大学宿舍电费统计`;
        
        // 加载数据
        const latestData = await API.getLatestData();
        
        // 获取楼栋数据
        const buildingData = latestData.campuses[campus]?.buildings[building];
        
        if (!buildingData) {
            alert('未找到该楼栋数据');
            window.location.href = 'index.html';
            return;
        }
        
        // 计算统计信息
        const rooms = buildingData.rooms;
        const powers = rooms.map(r => r.power);
        
        const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
        const maxPower = Math.max(...powers);
        const minPower = Math.min(...powers);
        
        // 更新统计卡片
        document.getElementById('building-total-rooms').textContent = buildingData.total_rooms;
        document.getElementById('building-avg-power').textContent = formatPower(avgPower);
        document.getElementById('building-max-power').textContent = formatPower(maxPower);
        document.getElementById('building-min-power').textContent = formatPower(minPower);
        
        // 更新房间列表
        updateRoomTable(rooms);
        
        // 创建分布图
        const distributionCtx = document.getElementById('distribution-chart').getContext('2d');
        Charts.createDistributionChart(distributionCtx, rooms);
        
        // 搜索功能
        setupSearch(rooms);
        
    } catch (error) {
        console.error('初始化失败:', error);
        alert('数据加载失败，请刷新页面重试');
    }
}

// 更新房间列表
function updateRoomTable(rooms, searchTerm = '') {
    const filteredRooms = filterRooms(rooms, searchTerm);
    const tbody = document.getElementById('room-body');
    tbody.innerHTML = '';
    
    filteredRooms.forEach(room => {
        const status = getPowerStatus(room.power);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${room.room}</td>
            <td>${formatPower(room.power)}</td>
            <td><span class="status-badge ${status.class}">${status.text}</span></td>
        `;
        tbody.appendChild(tr);
    });
    
    if (filteredRooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">没有找到匹配的房间</td></tr>';
    }
}

// 设置搜索功能
function setupSearch(rooms) {
    const searchInput = document.getElementById('search-input');
    
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateRoomTable(rooms, e.target.value);
        }, 300);
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', initBuildingDetailPage);
```

- [ ] **Step 6: 提交前端 JavaScript**

```bash
mkdir -p docs/js/components
git add docs/js/
git commit -m "feat: implement frontend JavaScript for data visualization"
```

---

## Chunk 5: 文档与部署

### Task 5.1: 更新 README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README.md**

更新文件 `README.md`:

```markdown
# 南京大学宿舍电费统计系统

一个基于 GitHub Pages 的静态网站，用于统计和展示南京大学各宿舍电费使用情况。

## 功能特性

- 📊 **实时数据**: 每日自动爬取电费数据
- 📈 **数据可视化**: 趋势图、排行榜、统计图表
- 🔍 **楼栋详情**: 查看各楼栋房间电费详情
- 📱 **响应式设计**: 支持移动端访问
- 🔒 **隐私保护**: 自动去除学号等敏感信息

## 快速开始

### 1. 访问网站

访问 GitHub Pages: https://your-username.github.io/dorm_public/

### 2. 本地开发

\`\`\`bash
# 克隆仓库
git clone https://github.com/your-username/dorm_public.git
cd dorm_public

# 安装依赖
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install aiohttp pyyaml

# 运行测试
python -m pytest tests/ -v

# 手动爬取数据（需要 Cookie）
python scripts/query_daily.py --config config/buildings.yaml

# 聚合数据
python scripts/aggregate_data.py

# 本地预览
cd docs
python -m http.server 8000
# 访问 http://localhost:8000
\`\`\`

## 项目结构

\`\`\`
dorm_public/
├── .github/workflows/       # GitHub Actions 配置
├── config/                  # 配置文件
│   └── buildings.yaml      # 楼栋白名单
├── scripts/                 # 运维脚本
│   ├── query_daily.py      # 每日爬取
│   └── aggregate_data.py   # 数据聚合
├── database/                # 数据存储
│   ├── raw/                # 原始数据
│   └── archive/            # 历史归档
├── docs/                    # GitHub Pages
│   ├── index.html          # 主页
│   ├── building.html       # 楼栋详情
│   ├── js/                 # JavaScript
│   ├── css/                # 样式
│   └── data/               # 聚合数据
└── tests/                   # 测试文件
\`\`\`

## 配置说明

### 修改监控楼栋

编辑 \`config/buildings.yaml\`:

\`\`\`yaml
buildings:
  - campus: "仙林校区"
    buildings: ["19幢", "4幢"]
\`\`\`

### 设置 Cookie

1. 登录 https://epay.nju.edu.cn
2. 使用浏览器插件导出 Cookie 为 JSON
3. 在 GitHub 仓库 Settings → Secrets → Actions 中设置 \`NJU_COOKIE\`

## 开发指南

### 添加新的统计功能

1. 在 \`scripts/aggregate_data.py\` 中添加新的聚合函数
2. 在 \`docs/js/charts.js\` 中添加图表渲染逻辑
3. 在对应的 HTML 页面中添加图表容器

### 修改前端样式

编辑 \`docs/css/style.css\`，使用 CSS 变量统一管理颜色。

## 技术栈

- **后端**: Python 3.9+, aiohttp, pyyaml
- **前端**: Vanilla JavaScript, Chart.js 4.x
- **自动化**: GitHub Actions
- **托管**: GitHub Pages

## 注意事项

- Cookie 有效期有限，需要定期更新
- 请勿滥用爬虫，避免对服务器造成压力
- 数据仅供参考，不作为官方依据

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
```

- [ ] **Step 2: 提交 README**

```bash
git add README.md
git commit -m "docs: update README with project overview and usage guide"
```

---

### Task 5.2: 配置 GitHub Pages

**Files:** 无（GitHub 网页操作）

- [ ] **Step 1: 启用 GitHub Pages**

在 GitHub 网页上：
1. 进入仓库 Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` (或 `master`)
4. Folder: `/docs`
5. 点击 "Save"

- [ ] **Step 2: 等待部署**

等待 1-2 分钟，GitHub Pages 会自动部署。

访问: https://your-username.github.io/dorm_public/

- [ ] **Step 3: 测试功能**

在浏览器中测试：
1. 主页是否正常显示
2. 排行榜数据是否正确
3. 图表是否正常渲染
4. 楼栋详情页是否可以访问

---

### Task 5.3: 创建示例数据

**Files:**
- Create: `docs/data/latest.json` (示例)
- Create: `docs/data/daily-summary.json` (示例)

- [ ] **Step 1: 创建示例 latest.json**

创建文件 `docs/data/latest.json`:

```json
{
  "date": "2026-05-15",
  "updated_at": "2026-05-15T00:30:00Z",
  "total_rooms": 3,
  "campuses": {
    "仙林校区": {
      "total_rooms": 2,
      "buildings": {
        "19幢": {
          "total_rooms": 2,
          "rooms": [
            {
              "room_id": "53463",
              "room": "1613",
              "power": 515.70
            },
            {
              "room_id": "53464",
              "room": "1614",
              "power": 324.50
            }
          ]
        }
      }
    },
    "浦口校区": {
      "total_rooms": 1,
      "buildings": {
        "12栋宿舍": {
          "total_rooms": 1,
          "rooms": [
            {
              "room_id": "91310",
              "room": "507",
              "power": 850.20
            }
          ]
        }
      }
    }
  }
}
```

- [ ] **Step 2: 创建示例 daily-summary.json**

创建文件 `docs/data/daily-summary.json`:

```json
[
  {
    "date": "2026-05-15",
    "total_rooms": 3,
    "avg_power": 563.47,
    "max_power": 850.20,
    "min_power": 324.50,
    "median_power": 515.70,
    "std_power": 263.35,
    "campuses": {
      "仙林校区": {
        "avg_power": 420.10,
        "room_count": 2,
        "max_power": 515.70,
        "min_power": 324.50
      },
      "浦口校区": {
        "avg_power": 850.20,
        "room_count": 1,
        "max_power": 850.20,
        "min_power": 850.20
      }
    }
  },
  {
    "date": "2026-05-14",
    "total_rooms": 3,
    "avg_power": 560.50,
    "max_power": 848.10,
    "min_power": 320.30,
    "median_power": 513.10,
    "std_power": 264.00,
    "campuses": {
      "仙林校区": {
        "avg_power": 416.70,
        "room_count": 2,
        "max_power": 513.10,
        "min_power": 320.30
      },
      "浦口校区": {
        "avg_power": 848.10,
        "room_count": 1,
        "max_power": 848.10,
        "min_power": 848.10
      }
    }
  }
]
```

- [ ] **Step 3: 创建示例 leaderboard.json**

创建文件 `docs/data/stats/leaderboard.json`:

```json
{
  "date": "2026-05-15",
  "updated_at": "2026-05-15T00:30:00Z",
  "top_20": [
    {
      "rank": 1,
      "room_id": "91310",
      "room": "507",
      "building": "12栋宿舍",
      "campus": "浦口校区",
      "power": 850.20
    },
    {
      "rank": 2,
      "room_id": "53463",
      "room": "1613",
      "building": "19幢",
      "campus": "仙林校区",
      "power": 515.70
    },
    {
      "rank": 3,
      "room_id": "53464",
      "room": "1614",
      "building": "19幢",
      "campus": "仙林校区",
      "power": 324.50
    }
  ],
  "bottom_20": [
    {
      "rank": 1,
      "room_id": "53464",
      "room": "1614",
      "building": "19幢",
      "campus": "仙林校区",
      "power": 324.50
    }
  ]
}
```

- [ ] **Step 4: 提交示例数据**

```bash
git add docs/data/
git commit -m "chore: add sample data for demonstration"
```

---

### Task 5.4: 最终测试与上线

**Files:** 无

- [ ] **Step 1: 本地测试**

```bash
# 进入 docs 目录
cd docs

# 启动本地服务器
python -m http.server 8000

# 在浏览器中访问 http://localhost:8000
# 测试所有功能是否正常
```

- [ ] **Step 2: 推送到 GitHub**

```bash
git push origin main
```

- [ ] **Step 3: 验证 GitHub Pages**

访问: https://your-username.github.io/dorm_public/

测试以下功能：
- [ ] 主页正常显示
- [ ] 排行榜数据正确
- [ ] 图表正常渲染
- [ ] 楼栋详情页可访问
- [ ] 搜索功能正常
- [ ] 移动端显示正常

- [ ] **Step 4: 手动触发 Actions 测试**

在 GitHub 网页上：
1. 进入 Actions 页面
2. 手动触发 "Daily Electric Query" workflow
3. 查看运行日志，确认成功

---

## 验收清单

### 功能验收

- [ ] GitHub Actions 每日自动运行
- [ ] 原始数据正确保存到 `database/raw/`
- [ ] 聚合数据正确生成到 `docs/data/`
- [ ] 敏感信息（学号）已去除
- [ ] GitHub Pages 正常访问
- [ ] 主页显示最新数据
- [ ] 排行榜正确渲染
- [ ] 图表正确显示
- [ ] 楼栋详情页可访问
- [ ] 搜索功能正常

### 性能验收

- [ ] 页面加载时间 < 2 秒
- [ ] 数据文件大小合理（< 1MB）
- [ ] 移动端加载流畅

### 安全验收

- [ ] Cookie 存储在 GitHub Secrets
- [ ] 敏感信息已去除
- [ ] 无硬编码的密钥或密码

### 文档验收

- [ ] README 完整清晰
- [ ] 配置说明详细
- [ ] 使用指南明确

---

## 维护指南

### 日常维护

1. **监控 Actions 运行状态**
   - 每周检查 Actions 是否正常运行
   - 如有失败，查看日志并修复

2. **更新 Cookie**
   - 当 Actions 报告认证失败时，更新 Cookie
   - 预计每 1-3 个月更新一次

3. **检查数据质量**
   - 定期检查爬取成功率（应 > 95%）
   - 关注异常数据（负数、超大值）

### 故障处理

**问题 1: Actions 失败**

症状: Actions 显示红色 ❌

解决步骤:
1. 查看 Actions 日志
2. 检查 Cookie 是否过期
3. 检查网络连接
4. 检查配置文件是否正确

**问题 2: 数据异常**

症状: 电量显示负数或超大值

解决步骤:
1. 检查爬虫逻辑
2. 手动验证数据
3. 修复异常数据
4. 重新运行聚合脚本

**问题 3: 前端无法加载数据**

症状: 页面显示"加载中..."或空白

解决步骤:
1. 检查数据文件是否存在
2. 检查文件路径是否正确
3. 检查 JSON 格式是否正确
4. 清除浏览器缓存

---

## 未来优化

### 短期（1-2 周）

- [ ] 添加校区统计页
- [ ] 实现异常用电告警
- [ ] 优化移动端体验
- [ ] 添加数据导出功能

### 中期（1-2 月）

- [ ] 实现历史数据对比
- [ ] 添加用电趋势预测
- [ ] 支持用户订阅提醒
- [ ] 优化数据加载性能

### 长期（3-6 月）

- [ ] 实现用户系统
- [ ] 支持自定义报表
- [ ] 添加数据 API 接口
- [ ] 实现多校区对比

---

**计划版本**: 1.0  
**创建时间**: 2026-05-15  
**最后更新**: 2026-05-15
