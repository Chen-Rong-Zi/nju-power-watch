# Room ID 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据模型的主键从 room_id 改为房间名，room_id 仅作为 API 查询参数，不出现在目录结构和 JSON 键名中。

**Architecture:** 引入映射文件 `config/room_ids.json` 记录房间名→ID 的对应关系及历史。修改查询脚本只存储房间名目录和不含 ID 字段的 JSON。一次性迁移脚本处理存量数据。映射更新由独立脚本负责。

**Tech Stack:** Python 3.8+, aiohttp, aiofiles

---

### Task 1: 修改 `nju_electric_query.py` 的存储逻辑

**Files:**
- Modify: `nju_electric_query.py:87-117` (parse_html)
- Modify: `nju_electric_query.py:132-196` (query_single_with_retry)
- Modify: `nju_electric_query.py:311-365` (save_result)

- [ ] **Step 1: 修改 `save_result()` — 目录路径从 `{room}-{room_id}` 改为 `{room}`，JSON 移除 `id`/`宿舍ID` 字段**

将 `save_result` 函数（第311-365行）替换为：

```python
async def save_result(result: dict, output_dir: Path, quiet: bool = False):
    """保存结果到文件，格式: {校区}/{楼栋}/{房间}/{日期}.json"""
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限创建目录 {output_dir}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法创建目录 {output_dir}: {e}")
        return False

    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间", "未知房间")

    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"{date_str}.json"
    filepath = dir_path / filename

    try:
        dir_path.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限创建目录 {dir_path}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法创建目录 {dir_path}: {e}")
        return False

    if filepath.exists():
        if not quiet:
            print(f"\n警告: 文件 {filepath} 已存在，跳过保存")
        return False

    # 移除 id 和 宿舍ID 字段
    save_data = {k: v for k, v in result.items() if k not in ('id', '宿舍ID')}

    try:
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))
        return True
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限写入文件 {filepath}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法写入文件 {filepath}: {e}")
        return False
```

- [ ] **Step 2: 修改 `query_single_with_retry()` — 不再在 result 中设置 `id` 字段**

在第167行，移除 `result["id"] = room_id`。因为 `save_result` 会过滤掉 `id`，但为保持内部一致性，直接不设置：

将第167行：
```python
result["id"] = room_id
```
删除该行。

- [ ] **Step 3: 修改 `parse_html()` — 不再在 result 中设置 `宿舍ID` 字段**

在第91行，移除 `宿舍ID` 的提取：
```python
result["宿舍ID"] = check_data.get("id", "")
```
删除该行。

- [ ] **Step 4: 验证修改**

运行语法检查：
```bash
python3 -m py_compile nju_electric_query.py
```
Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add nju_electric_query.py
git commit -m "refactor: remove room_id from save path and JSON output in query script"
```

---

### Task 2: 修改 `aggregate_data.py` 使用房间名作为 key

**Files:**
- Modify: `scripts/aggregate_data.py:51-84` (load_existing_summaries)
- Modify: `scripts/aggregate_data.py:87-145` (process_room)
- Modify: `scripts/aggregate_data.py:183-212` (merge_room_data)
- Modify: `scripts/aggregate_data.py:215-229` (organize_by_hierarchy)
- Modify: `scripts/aggregate_data.py:232-370` (generate_hierarchical_summaries)

- [ ] **Step 1: 修改 `process_room()` — 从目录名直接取房间名，不再解析 ID**

将 `process_room` 函数（第87-145行）替换为：

```python
async def process_room(room_dir: Path, read_semaphore: asyncio.Semaphore) -> Dict[str, Any]:
    """
    Process a single room directory asynchronously.
    Directory name is now just the room name (no ID suffix).
    """
    room_name = room_dir.name

    json_files = sorted(room_dir.glob("*.json"), key=lambda f: f.stem)

    if not json_files:
        return None

    async def read_with_limit(f: Path):
        async with read_semaphore:
            return await read_json_file(f)

    tasks = [read_with_limit(f) for f in json_files]
    results = await asyncio.gather(*tasks)

    balance_history = {}
    campus = None
    building = None

    for idx, result in enumerate(results):
        if not result or not result.get('success', False):
            continue

        if not campus:
            campus = result.get('校区', 'Unknown')
            building = result.get('楼栋', 'Unknown')

        balance_str = result.get('剩余电量', '0度')
        balance = float(balance_str.replace('度', ''))

        date = json_files[idx].stem

        balance_history[date] = balance

    if not balance_history:
        return None

    latest_date = max(balance_history.keys())
    current_balance = balance_history[latest_date]

    return {
        'room_name': room_name,
        'campus': campus,
        'building': building,
        'current_balance': current_balance,
        'balance_history': balance_history,
        'last_updated': latest_date
    }
```

注意：`room_id` 字段已移除。

- [ ] **Step 2: 修改 `process_all_rooms()` — 识别新目录格式（纯房间名，无 `-` 后缀 ID）**

将 `process_all_rooms` 函数（第148-180行）中的目录过滤逻辑修改。

将第162行：
```python
if room_dir.is_dir() and '-' in room_dir.name:
```
改为：
```python
if room_dir.is_dir() and room_dir.name not in ('archives', 'summaries'):
```

- [ ] **Step 3: 修改 `load_existing_summaries()` — 按 room_name 而非 room_id 索引**

将 `load_existing_summaries` 函数（第51-84行）中的索引 key 从 `room_id` 改为 `room_name`：

将第79-81行：
```python
for room_file, result in zip(room_files, results):
    if result and 'room_id' in result:
        existing_data[result['room_id']] = result
```
改为：
```python
for room_file, result in zip(room_files, results):
    if result and 'room_name' in result:
        existing_data[result['room_name']] = result
```

- [ ] **Step 4: 修改 `merge_room_data()` — 移除 room_id 字段，按 room_name 合并**

将 `merge_room_data` 函数（第183-212行）替换为：

```python
def merge_room_data(existing: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge existing room data with new data.
    Combines balance_history from both, keeping most recent balance.
    Keeps ALL historical data (no limit).
    """
    if not existing:
        return new

    # Merge balance_history (keep ALL dates)
    merged_history = existing.get('balance_history', {}).copy()
    merged_history.update(new.get('balance_history', {}))

    # Get latest balance
    if merged_history:
        latest_date = max(merged_history.keys())
        current_balance = merged_history[latest_date]
    else:
        current_balance = new.get('current_balance', 0.0)
        latest_date = new.get('last_updated', datetime.now().strftime("%Y%m%d"))

    return {
        'room_name': new.get('room_name', existing.get('room_name', 'Unknown')),
        'campus': new.get('campus', existing.get('campus', 'Unknown')),
        'building': new.get('building', existing.get('building', 'Unknown')),
        'current_balance': current_balance,
        'balance_history': merged_history,
        'last_updated': latest_date
    }
```

- [ ] **Step 5: 修改 `organize_by_hierarchy()` — 使用 room_name 作为 key**

将 `organize_by_hierarchy` 函数（第215-229行）中的 key 从 `room_id` 改为 `room_name`：

将第221-227行：
```python
for room_data in rooms_data:
    campus = room_data['campus']
    building = room_data['building']
    room_id = room_data['room_id']

    hierarchy[campus][building][room_id] = room_data
```
改为：
```python
for room_data in rooms_data:
    campus = room_data['campus']
    building = room_data['building']
    room_name = room_data['room_name']

    hierarchy[campus][building][room_name] = room_data
```

- [ ] **Step 6: 修改 `generate_hierarchical_summaries()` — summary key 使用 room_name，文件名使用 room_name**

将第259行：
```python
for room_id, room_data in existing_summaries.items():
    all_rooms_data[room_id] = room_data
```
改为：
```python
for room_name, room_data in existing_summaries.items():
    all_rooms_data[room_name] = room_data
```

将第263-268行：
```python
for new_data in new_rooms_data:
    room_id = new_data['room_id']
    if room_id in all_rooms_data:
        all_rooms_data[room_id] = merge_room_data(all_rooms_data[room_id], new_data)
    else:
        all_rooms_data[room_id] = new_data
```
改为：
```python
for new_data in new_rooms_data:
    room_name = new_data['room_name']
    if room_name in all_rooms_data:
        all_rooms_data[room_name] = merge_room_data(all_rooms_data[room_name], new_data)
    else:
        all_rooms_data[room_name] = new_data
```

将第303-310行（building summary 的 rooms 部分）：
```python
building_rooms = {}
for room_id, room_data in rooms.items():
    building_rooms[room_id] = {
        'room_name': room_data['room_name'],
        'current_balance': room_data['current_balance'],
        'last_updated': room_data['last_updated']
    }
```
改为：
```python
building_rooms = {}
for room_name, room_data in rooms.items():
    building_rooms[room_name] = {
        'current_balance': room_data['current_balance'],
        'last_updated': room_data['last_updated']
    }
```

将第324-326行（room file 写入）：
```python
for room_id, room_data in rooms.items():
    room_file = building_dir / "rooms" / f"{room_id}.json"
```
改为：
```python
for room_name, room_data in rooms.items():
    room_file = building_dir / "rooms" / f"{room_name}.json"
```

- [ ] **Step 7: 验证修改**

```bash
python3 -m py_compile scripts/aggregate_data.py
```
Expected: 无报错

- [ ] **Step 8: Commit**

```bash
git add scripts/aggregate_data.py
git commit -m "refactor: use room_name as primary key in aggregation script"
```

---

### Task 3: 修改 `generate_index.py` 使用房间名

**Files:**
- Modify: `scripts/generate_index.py:35-58` (scan_database 目录遍历)

- [ ] **Step 1: 修改目录遍历逻辑**

将 `scan_database` 函数中第39-57行的 room 解析逻辑：

```python
# Room directory format: {room_name}-{room_id}
dir_name = room_dir.name
parts = dir_name.rsplit('-', 1)

if len(parts) == 2:
    room_name = parts[0]
    room_id = parts[1]

    # Count available dates
    json_files = list(room_dir.glob("*.json"))
    date_count = len(json_files)

    if date_count > 0:
        structure[campus_name][building_name].append({
            "n": room_name,  # name (shortened)
            "i": room_id,    # id (shortened)
            "p": str(room_dir.relative_to(database_path)),  # path
            "r": date_count  # records
        })
```

替换为：

```python
dir_name = room_dir.name

json_files = list(room_dir.glob("*.json"))
date_count = len(json_files)

if date_count > 0:
    structure[campus_name][building_name].append({
        "n": dir_name,  # room name
        "p": str(room_dir.relative_to(database_path)),  # path
        "r": date_count  # records
    })
```

注意：`"i"` 字段（room_id）已移除。

- [ ] **Step 2: 验证修改**

```bash
python3 -m py_compile scripts/generate_index.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate_index.py
git commit -m "refactor: remove room_id from index generation"
```

---

### Task 4: 修改 `generate_building_details.py` 使用房间名

**Files:**
- Modify: `scripts/generate_building_details.py:56-110` (process_building)

- [ ] **Step 1: 修改 `process_building()` 中的 room 文件读取和 rooms 字典 key**

将第76-88行：

```python
rooms_dir = building_dir / "rooms"
rooms = {}

async def read_room_file(room_id: str) -> tuple:
    room_file = rooms_dir / f"{room_id}.json"
    room_data = await read_json_file(room_file)
    return room_id, room_data

tasks = [read_room_file(room_id) for room_id in rooms_list.keys()]
results = await asyncio.gather(*tasks)

for room_id, room_data in results:
    if room_data and 'room_id' in room_data:
        rooms[room_id] = room_data
```

替换为：

```python
rooms_dir = building_dir / "rooms"
rooms = {}

async def read_room_file(room_name: str) -> tuple:
    room_file = rooms_dir / f"{room_name}.json"
    room_data = await read_json_file(room_file)
    return room_name, room_data

tasks = [read_room_file(room_name) for room_name in rooms_list.keys()]
results = await asyncio.gather(*tasks)

for room_name, room_data in results:
    if room_data and 'room_name' in room_data:
        rooms[room_name] = room_data
```

- [ ] **Step 2: 验证修改**

```bash
python3 -m py_compile scripts/generate_building_details.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate_building_details.py
git commit -m "refactor: use room_name as key in building details generation"
```

---

### Task 5: 修改 `extract_room_ids.py` 从映射文件读取

**Files:**
- Modify: `scripts/extract_room_ids.py`

- [ ] **Step 1: 重写 `extract_room_ids.py`，从映射文件和目录结构读取**

将整个文件内容替换为：

```python
#!/usr/bin/env python3
"""提取所有房间ID，优先从 config/room_ids.json 读取，回退到目录名解析"""
import os, sys, argparse, json
from pathlib import Path
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING_FILE = os.path.join(BASE_DIR, 'config', 'room_ids.json')

parser = argparse.ArgumentParser(description='Extract room IDs from mapping file or database')
parser.add_argument('directory', nargs='?', default='./database')
parser.add_argument('-o', '--output', metavar='FILE', help='Output to file')
args = parser.parse_args()


def extract_from_mapping():
    """从 config/room_ids.json 提取所有 current_id"""
    if not os.path.exists(MAPPING_FILE):
        return []

    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    ids = []
    for campus, buildings in mapping.items():
        for building, rooms in buildings.items():
            for room_name, entry in rooms.items():
                current_id = entry.get('current_id')
                if current_id:
                    ids.append(current_id)
    return ids


def extract_from_database(base_dir):
    """从数据库目录名提取 ID (向后兼容旧格式)"""
    ids = []
    for campus in os.listdir(base_dir):
        campus_path = os.path.join(base_dir, campus)
        if not os.path.isdir(campus_path) or campus in ('summaries', 'archives'):
            continue
        for building in os.listdir(campus_path):
            building_path = os.path.join(campus_path, building)
            if not os.path.isdir(building_path):
                continue
            for room in os.listdir(building_path):
                room_path = os.path.join(building_path, room)
                if not os.path.isdir(room_path):
                    continue
                if '-' in room:
                    idx = room.rfind('-')
                    room_id = room[idx+1:]
                    if room_id.isdigit():
                        ids.append(room_id)
    return ids


# 优先从映射文件提取，若无则回退到目录名解析
ids = extract_from_mapping()
source = "mapping file"
if not ids:
    ids = extract_from_database(args.directory)
    source = "database directories"

print(f'Found {len(ids)} room IDs (source: {source})')

if args.output:
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        for rid in sorted(ids, key=int):
            f.write(f'{rid}\n')
else:
    for rid in sorted(ids, key=int):
        print(rid)
```

- [ ] **Step 2: 验证修改**

```bash
python3 -m py_compile scripts/extract_room_ids.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/extract_room_ids.py
git commit -m "refactor: extract room IDs from mapping file first, fallback to directory parsing"
```

---

### Task 6: 修改 `query_by_name.py` 和 `query_by_room.py` 的存储逻辑

**Files:**
- Modify: `scripts/query_by_name.py:323-338` (save_result)
- Modify: `scripts/query_by_room.py:495-515` (save_result)

- [ ] **Step 1: 修改 `query_by_name.py` 的 `save_result()`**

将第323-338行：

```python
async def save_result(result: dict, output_dir: Path):
    """保存结果"""
    campus = re.sub(r'[<>:"/\\|?*]', '_', result.get("campus", "未知校区"))
    building = re.sub(r'[<>:"/\\|?*]', '_', result.get("building", "未知楼栋"))
    room = re.sub(r'[<>:"/\\|?*]', '_', result.get("room_name", "未知房间"))
    db_id = result.get("db_id", "")

    dir_path = output_dir / campus / building / f"{room}-{db_id}"
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(result, ensure_ascii=False, indent=2))
```

替换为：

```python
async def save_result(result: dict, output_dir: Path):
    """保存结果"""
    campus = re.sub(r'[<>:"/\\|?*]', '_', result.get("campus", "未知校区"))
    building = re.sub(r'[<>:"/\\|?*]', '_', result.get("building", "未知楼栋"))
    room = re.sub(r'[<>:"/\\|?*]', '_', result.get("room_name", "未知房间"))

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        # 移除 ID 相关字段
        save_data = {k: v for k, v in result.items() if k not in ('db_id', 'room_id', 'cached')}
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))
```

- [ ] **Step 2: 修改 `query_by_room.py` 的 `save_result()`**

将第495-515行：

```python
async def save_result(result: dict, output_dir: Path):
    """保存结果"""
    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间名", result.get("房间号", "未知房间"))
    room_id = result.get("数据库ID", "")

    # 清理文件名
    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    dir_path = output_dir / campus / building / f"{room}-{room_id}"
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(result, ensure_ascii=False, indent=2))
```

替换为：

```python
async def save_result(result: dict, output_dir: Path):
    """保存结果"""
    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间名", result.get("房间号", "未知房间"))

    # 清理文件名
    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        # 移除 ID 相关字段
        save_data = {k: v for k, v in result.items()
                     if k not in ('数据库ID', '楼栋ID', '校区ID', '房间号', '房间名')}
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))
```

注意：`房间名` 字段也被移除，因为 `房间` 字段已经包含了该信息。`房间号` 是内部 ID，不再需要保留。

- [ ] **Step 3: 验证修改**

```bash
python3 -m py_compile scripts/query_by_name.py
python3 -m py_compile scripts/query_by_room.py
```

- [ ] **Step 4: Commit**

```bash
git add scripts/query_by_name.py scripts/query_by_room.py
git commit -m "refactor: remove room_id from save path in query scripts"
```

---

### Task 7: 删除不再需要的脚本

**Files:**
- Delete: `scripts/cleanup_duplicate_ids.py`
- Delete: `scripts/find_duplicate_room_ids.py`

- [ ] **Step 1: 删除脚本**

```bash
rm scripts/cleanup_duplicate_ids.py scripts/find_duplicate_room_ids.py
```

- [ ] **Step 2: Commit**

```bash
git add -u scripts/cleanup_duplicate_ids.py scripts/find_duplicate_room_ids.py
git commit -m "remove: delete scripts for duplicate ID handling (no longer needed)"
```

---

### Task 8: 创建映射更新脚本 `scripts/update_mapping.py`

**Files:**
- Create: `scripts/update_mapping.py`

- [ ] **Step 1: 编写 `update_mapping.py`**

```python
#!/usr/bin/env python3
"""
更新 config/room_ids.json 映射文件

通过查询 API 获取每个 room_id 当前指向的房间，更新映射关系。

用法:
    python scripts/update_mapping.py --cookie-file /tmp/cookie.json
    python scripts/update_mapping.py --cookie-file /tmp/cookie.json --ids 101223 98799
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional

BASE_DIR = Path(__file__).parent.parent
MAPPING_FILE = BASE_DIR / "config" / "room_ids.json"
IDS_FILE = BASE_DIR / "config" / "room_ids.txt"
BASE_URL = "https://epay.nju.edu.cn"

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
    "Referer": "https://epay.nju.edu.cn/",
}


async def load_cookies(filepath: str) -> dict:
    async with aiofiles.open(filepath, "r", encoding="utf-8") as f:
        cookies_list = json.loads(await f.read())
    return {c["name"]: c["value"] for c in cookies_list if c.get("name") and c.get("value")}


def load_mapping() -> Dict:
    if MAPPING_FILE.exists():
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_mapping(mapping: Dict):
    MAPPING_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def load_room_ids() -> list:
    """从 config/room_ids.txt 加载 ID 列表"""
    if not IDS_FILE.exists():
        return []
    with open(IDS_FILE, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]


async def query_room_info(session: aiohttp.ClientSession, room_id: str, cookies: dict) -> Optional[dict]:
    """查询 room_id 当前指向的房间信息"""
    url = f"{BASE_URL}/epay/h5/nju/electric/charge?id={room_id}"
    try:
        async with session.get(url, cookies=cookies, headers=HEADERS,
                               timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                return None
            html = await resp.text()
            if "login" in html.lower() or "登录" in html:
                return None

            result = {"room_id": room_id}
            match = re.search(r'this\.check\s*=\s*(\{.*\})', html)
            if match:
                try:
                    check_data = json.loads(match.group(1))
                    result["campus"] = check_data.get("sysName", "")
                    result["building"] = check_data.get("buildName", "")
                    result["room_name"] = check_data.get("roomName", "")
                except json.JSONDecodeError:
                    return None

            if result.get("room_name"):
                return result
    except Exception:
        return None
    return None


def update_mapping_with_result(mapping: Dict, result: dict):
    """根据查询结果更新映射"""
    campus = result["campus"]
    building = result["building"]
    room_name = result["room_name"]
    room_id = result["room_id"]

    campus_map = mapping.setdefault(campus, {})
    building_map = campus_map.setdefault(building, {})

    # 检查该 room_id 是否已存在于其他房间名下
    for existing_room, entry in building_map.items():
        if entry.get("current_id") == room_id and existing_room != room_name:
            # ID 指向变更: 旧房间 ID 失效
            old_id = entry.pop("current_id", None)
            if old_id and old_id not in entry.get("previous_ids", []):
                entry.setdefault("previous_ids", []).append(old_id)
            entry["current_id"] = None
            print(f"  ID 变更: {room_id} 从 {existing_room} → {room_name}")

    if room_name in building_map:
        entry = building_map[room_name]
        old_id = entry.get("current_id")
        if old_id == room_id:
            pass  # 一致，无需更新
        else:
            # room_name 的 current_id 变了
            if old_id and old_id not in entry.get("previous_ids", []):
                entry.setdefault("previous_ids", []).append(old_id)
            entry["current_id"] = room_id
    else:
        # 新房间
        building_map[room_name] = {
            "current_id": room_id,
            "previous_ids": []
        }


async def async_main():
    parser = argparse.ArgumentParser(description="更新 room_id 映射文件")
    parser.add_argument("--cookie-file", type=str, default="/tmp/cookie.json")
    parser.add_argument("--ids", nargs="+", help="指定 room_id 列表")
    parser.add_argument("-c", "--concurrency", type=int, default=10)
    args = parser.parse_args()

    cookies = await load_cookies(args.cookie_file)

    # 获取 ID 列表
    if args.ids:
        room_ids = args.ids
    else:
        room_ids = load_room_ids()
        if not room_ids:
            print("错误: 没有 room_id 可查询。请提供 --ids 参数或创建 config/room_ids.txt")
            sys.exit(1)

    print(f"开始更新映射: {len(room_ids)} 个 room_id")

    # 加载现有映射
    mapping = load_mapping()

    # 查询并更新
    semaphore = asyncio.Semaphore(args.concurrency)
    connector = aiohttp.TCPConnector(limit=args.concurrency)

    async with aiohttp.ClientSession(connector=connector) as session:
        async def query_with_limit(room_id):
            async with semaphore:
                return await query_room_info(session, room_id, cookies)

        tasks = [query_with_limit(rid) for rid in room_ids]
        results = await asyncio.gather(*tasks)

    succeeded = 0
    failed = 0
    for result in results:
        if result:
            update_mapping_with_result(mapping, result)
            succeeded += 1
        else:
            failed += 1

    # 保存映射
    save_mapping(mapping)

    print(f"映射更新完成: 成功 {succeeded}, 失败 {failed}")
    print(f"映射文件: {MAPPING_FILE}")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 验证修改**

```bash
python3 -m py_compile scripts/update_mapping.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/update_mapping.py
git commit -m "feat: add update_mapping.py script for maintaining room_id mapping"
```

---

### Task 9: 创建数据迁移脚本 `scripts/migrate_room_ids.py`

**Files:**
- Create: `scripts/migrate_room_ids.py`

这是最关键的脚本，将现有数据从旧格式迁移到新格式。

- [ ] **Step 1: 编写 `migrate_room_ids.py`**

```python
#!/usr/bin/env python3
"""
一次性迁移脚本: 将数据模型从 room_id 主键迁移到房间名主键

变更:
  - 原始数据目录: {room}-{room_id}/ → {room}/
  - 原始数据 JSON: 移除 id/宿舍ID 字段
  - Summary rooms key: room_id → room_name
  - Summary 文件名: {room_id}.json → {room_name}.json
  - Summary room_id 字段: 移除
  - 生成 config/room_ids.json 映射文件

用法:
    python scripts/migrate_room_ids.py --database ./database --dry-run
    python scripts/migrate_room_ids.py --database ./database --apply
"""

import json
import os
import re
import shutil
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Any
from datetime import datetime

import argparse

BASE_DIR = Path(__file__).parent.parent


def scan_raw_data(database_dir: Path) -> Dict[str, Dict]:
    """
    扫描原始数据目录，建立映射表。
    Returns: {(campus, building, room_name): {"current_id": str, "previous_ids": [str], "dirs": [Path]}}
    """
    rooms = defaultdict(lambda: {"current_id": None, "previous_ids": [], "dirs": [], "id_dates": {}})

    for campus_dir in database_dir.iterdir():
        if not campus_dir.is_dir() or campus_dir.name in ('summaries', 'archives'):
            continue

        for building_dir in campus_dir.iterdir():
            if not building_dir.is_dir():
                continue

            for room_dir in building_dir.iterdir():
                if not room_dir.is_dir():
                    continue

                # 旧格式: {room_name}-{room_id}
                if '-' not in room_dir.name:
                    continue

                idx = room_dir.name.rfind('-')
                room_name_part = room_dir.name[:idx]
                room_id = room_dir.name[idx+1:]

                if not room_id.isdigit():
                    continue

                # 读取最新 JSON 获取校区/楼栋/房间名
                json_files = sorted(room_dir.glob("*.json"), key=lambda f: f.stem)
                if not json_files:
                    continue

                latest_json = json_files[-1]
                try:
                    with open(latest_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    continue

                if not data.get('success'):
                    continue

                campus = data.get('校区', campus_dir.name)
                building = data.get('楼栋', building_dir.name)
                room_name = data.get('房间', room_name_part)

                key = (campus, building, room_name)
                rooms[key]["dirs"].append(room_dir)
                rooms[key]["id_dates"][room_id] = [f.stem for f in json_files]

    # 确定 current_id: 最新日期对应的 ID
    for key, info in rooms.items():
        # 找最新日期对应的 ID
        latest_date = ""
        latest_id = ""
        for room_id, dates in info["id_dates"].items():
            if dates and dates[-1] > latest_date:
                latest_date = dates[-1]
                latest_id = room_id

        info["current_id"] = latest_id
        info["previous_ids"] = [rid for rid in info["id_dates"] if rid != latest_id]

    return dict(rooms)


def migrate_raw_data(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """迁移原始数据目录和文件"""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}迁移原始数据...")

    for (campus, building, room_name), info in rooms.items():
        target_dir = database_dir / campus / building / room_name

        # 收集所有日期文件
        date_files = {}  # date -> (source_path, data)

        for room_dir in info["dirs"]:
            for json_file in room_dir.glob("*.json"):
                date = json_file.stem
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    continue

                if date in date_files:
                    # 同一天有多个文件，保留数字更大的 ID 对应的数据
                    existing_path = date_files[date][0]
                    existing_dir_name = existing_path.parent.name
                    existing_id = existing_dir_name.rsplit('-', 1)[-1]
                    new_id = room_dir.name.rsplit('-', 1)[-1]
                    if int(new_id) > int(existing_id):
                        date_files[date] = (json_file, data)
                else:
                    date_files[date] = (json_file, data)

        if dry_run:
            print(f"  {campus}/{building}/{room_name}: {len(info['dirs'])} dirs → 1 dir, "
                  f"{len(date_files)} date files, current_id={info['current_id']}")
            continue

        # 创建目标目录
        target_dir.mkdir(parents=True, exist_ok=True)

        # 写入合并后的文件（移除 id/宿舍ID 字段）
        for date, (source_path, data) in sorted(date_files.items()):
            target_file = target_dir / f"{date}.json"
            if target_file.exists():
                continue  # 不覆盖已有文件

            save_data = {k: v for k, v in data.items() if k not in ('id', '宿舍ID')}
            with open(target_file, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, ensure_ascii=False, indent=2)

        # 删除旧目录
        for room_dir in info["dirs"]:
            if room_dir.exists() and room_dir != target_dir:
                shutil.rmtree(room_dir)

    if not dry_run:
        print(f"  原始数据迁移完成")


def migrate_summaries(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """迁移 summaries 数据"""
    summaries_dir = database_dir / "summaries"
    if not summaries_dir.exists():
        print("  summaries 目录不存在，跳过")
        return

    print(f"\n{'[DRY RUN] ' if dry_run else ''}迁移 summaries 数据...")

    # 构建 room_id → room_name 映射（按校区/楼栋分组）
    id_to_name = {}  # (campus, building, room_id) → room_name
    for (campus, building, room_name), info in rooms.items():
        id_to_name[(campus, building, info["current_id"])] = room_name
        for prev_id in info["previous_ids"]:
            id_to_name[(campus, building, prev_id)] = room_name

    campuses_dir = summaries_dir / "campuses"
    if not campuses_dir.exists():
        return

    for campus_dir in campuses_dir.iterdir():
        if not campus_dir.is_dir():
            continue
        campus = campus_dir.name

        buildings_dir = campus_dir / "buildings"
        if not buildings_dir.exists():
            continue

        for building_dir in buildings_dir.iterdir():
            if not building_dir.is_dir():
                continue
            building = building_dir.name

            # a) 迁移 rooms/{room_id}.json → rooms/{room_name}.json
            rooms_dir = building_dir / "rooms"
            if rooms_dir.exists():
                # 收集所有 room_id.json 文件
                room_files = {}  # room_name → merged data
                for room_file in list(rooms_dir.glob("*.json")):
                    room_id = room_file.stem
                    try:
                        with open(room_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        continue

                    # 查找对应的 room_name
                    room_name = id_to_name.get((campus, building, room_id), data.get('room_name', room_id))

                    # 移除 room_id 字段
                    data.pop('room_id', None)

                    if room_name in room_files:
                        # 合并 balance_history
                        existing = room_files[room_name]
                        merged_history = existing.get('balance_history', {})
                        merged_history.update(data.get('balance_history', {}))
                        existing['balance_history'] = merged_history

                        latest_date = max(merged_history.keys()) if merged_history else ""
                        if latest_date:
                            existing['current_balance'] = merged_history[latest_date]
                            existing['last_updated'] = latest_date
                    else:
                        room_files[room_name] = data

                    if not dry_run:
                        # 删除旧文件
                        room_file.unlink()

                if not dry_run:
                    # 写入新文件
                    for room_name, data in room_files.items():
                        new_file = rooms_dir / f"{room_name}.json"
                        with open(new_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)

                print(f"  rooms: {campus}/{building}: {len(room_files)} rooms migrated")

            # b) 迁移 building summary.json
            summary_file = building_dir / "summary.json"
            if summary_file.exists():
                try:
                    with open(summary_file, 'r', encoding='utf-8') as f:
                        summary = json.load(f)
                except Exception:
                    continue

                old_rooms = summary.get('rooms', {})
                new_rooms = {}

                for room_id, room_info in old_rooms.items():
                    room_name = id_to_name.get((campus, building, room_id), room_info.get('room_name', room_id))

                    if room_name in new_rooms:
                        # 合并同名房间（保留最新数据）
                        existing = new_rooms[room_name]
                        if room_info.get('last_updated', '') > existing.get('last_updated', ''):
                            new_rooms[room_name] = room_info
                    else:
                        new_rooms[room_name] = room_info

                # 移除 room_name 冗余字段（现在 key 就是 room_name）
                for room_name, info in new_rooms.items():
                    info.pop('room_name', None)

                summary['rooms'] = new_rooms
                summary['total_rooms'] = len(new_rooms)

                if not dry_run:
                    with open(summary_file, 'w', encoding='utf-8') as f:
                        json.dump(summary, f, ensure_ascii=False, indent=2)

                print(f"  summary: {campus}/{building}: {len(old_rooms)} → {len(new_rooms)} rooms")

            # c) 迁移 details.json（如存在）
            details_file = building_dir / "details.json"
            if details_file.exists():
                try:
                    with open(details_file, 'r', encoding='utf-8') as f:
                        details = json.load(f)
                except Exception:
                    continue

                old_rooms = details.get('rooms', {})
                new_rooms = {}

                for room_id, room_data in old_rooms.items():
                    room_name = id_to_name.get((campus, building, room_id), room_data.get('room_name', room_id))
                    room_data.pop('room_id', None)

                    if room_name in new_rooms:
                        # 合并
                        existing = new_rooms[room_name]
                        merged_history = existing.get('balance_history', {})
                        merged_history.update(room_data.get('balance_history', {}))
                        existing['balance_history'] = merged_history
                        latest = max(merged_history.keys()) if merged_history else ""
                        if latest:
                            existing['current_balance'] = merged_history[latest]
                            existing['last_updated'] = latest
                    else:
                        new_rooms[room_name] = room_data

                details['rooms'] = new_rooms
                details['total_rooms'] = len(new_rooms)

                if not dry_run:
                    with open(details_file, 'w', encoding='utf-8') as f:
                        json.dump(details, f, ensure_ascii=False, indent=2)

        # d) 迁移 campus summary.json
        campus_summary_file = campus_dir / "summary.json"
        if campus_summary_file.exists():
            try:
                with open(campus_summary_file, 'r', encoding='utf-8') as f:
                    campus_summary = json.load(f)
            except Exception:
                continue

            # 重新计算 total_rooms
            total_rooms = 0
            buildings = campus_summary.get('buildings', {})
            for building_name, bstats in buildings.items():
                building_summary_file = campuses_dir / campus / "buildings" / building_name / "summary.json"
                if building_summary_file.exists():
                    try:
                        with open(building_summary_file, 'r', encoding='utf-8') as f:
                            bs = json.load(f)
                        bstats['total_rooms'] = bs.get('total_rooms', 0)
                    except Exception:
                        pass
                total_rooms += bstats.get('total_rooms', 0)

            campus_summary['total_rooms'] = total_rooms

            if not dry_run:
                with open(campus_summary_file, 'w', encoding='utf-8') as f:
                    json.dump(campus_summary, f, ensure_ascii=False, indent=2)

    # e) 迁移 overview.json
    overview_file = summaries_dir / "overview.json"
    if overview_file.exists():
        try:
            with open(overview_file, 'r', encoding='utf-8') as f:
                overview = json.load(f)
        except Exception:
            overview = {}

        # 重新计算 total_rooms
        total_rooms = 0
        for campus_name, cstats in overview.get('campuses', {}).items():
            campus_summary_file = campuses_dir / campus_name / "summary.json"
            if campus_summary_file.exists():
                try:
                    with open(campus_summary_file, 'r', encoding='utf-8') as f:
                        cs = json.load(f)
                    cstats['total_rooms'] = cs.get('total_rooms', 0)
                except Exception:
                    pass
            total_rooms += cstats.get('total_rooms', 0)

        overview['total_rooms'] = total_rooms

        if not dry_run:
            with open(overview_file, 'w', encoding='utf-8') as f:
                json.dump(overview, f, ensure_ascii=False, indent=2)


def generate_mapping_file(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """生成 config/room_ids.json 映射文件"""
    mapping = {}

    for (campus, building, room_name), info in rooms.items():
        campus_map = mapping.setdefault(campus, {})
        building_map = campus_map.setdefault(building, {})
        building_map[room_name] = {
            "current_id": info["current_id"],
            "previous_ids": info["previous_ids"]
        }

    mapping_file = database_dir.parent / "config" / "room_ids.json"

    if dry_run:
        print(f"\n[DRY RUN] 将写入映射文件: {mapping_file}")
        print(f"  校区数: {len(mapping)}")
        total = sum(len(b) for c in mapping.values() for b in c.values())
        print(f"  房间数: {total}")
    else:
        mapping_file.parent.mkdir(parents=True, exist_ok=True)
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
        print(f"\n映射文件已写入: {mapping_file}")


def main():
    parser = argparse.ArgumentParser(description="迁移数据模型: room_id → room_name 主键")
    parser.add_argument("--database", "-d", default="./database", help="数据库目录")
    parser.add_argument("--apply", action="store_true", help="执行实际迁移（默认 dry-run）")
    args = parser.parse_args()

    database_dir = Path(args.database)
    if not database_dir.exists():
        print(f"错误: 目录不存在: {database_dir}")
        sys.exit(1)

    dry_run = not args.apply

    if dry_run:
        print("=== 预览模式 (使用 --apply 执行实际迁移) ===\n")

    # Step 1: 扫描原始数据
    print("步骤1: 扫描原始数据...")
    rooms = scan_raw_data(database_dir)
    print(f"  发现 {len(rooms)} 个房间")

    # Step 2: 迁移原始数据
    print("\n步骤2: 迁移原始数据目录")
    migrate_raw_data(database_dir, rooms, dry_run)

    # Step 3: 迁移 summaries
    print("\n步骤3: 迁移 summaries 数据")
    migrate_summaries(database_dir, rooms, dry_run)

    # Step 4: 生成映射文件
    print("\n步骤4: 生成映射文件")
    generate_mapping_file(database_dir, rooms, dry_run)

    if dry_run:
        print("\n=== 预览完成，使用 --apply 执行实际迁移 ===")
    else:
        print("\n=== 迁移完成 ===")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 验证修改**

```bash
python3 -m py_compile scripts/migrate_room_ids.py
```

- [ ] **Step 3: 用 dry-run 模式测试迁移**

```bash
python3 scripts/migrate_room_ids.py --database ./database --dry-run
```

Expected: 输出预览信息，无报错

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate_room_ids.py
git commit -m "feat: add migrate_room_ids.py for one-time data migration"
```

---

### Task 10: 执行迁移并验证

**Files:**
- 无新文件修改，运行迁移脚本并验证结果

- [ ] **Step 1: 备份数据**

```bash
cp -r database database.bak
```

- [ ] **Step 2: 执行迁移**

```bash
python3 scripts/migrate_room_ids.py --database ./database --apply
```

- [ ] **Step 3: 验证目录结构**

确认旧格式目录已消失：
```bash
find database/ -type d -name '*-[0-9]*' | head
```
Expected: 无输出（所有 `{room}-{id}` 目录已合并为 `{room}` 目录）

确认新目录结构：
```bash
ls database/仙林校区/1幢/ | head -5
```
Expected: 输出房间名（如 `1A102`, `1A104`），无 ID 后缀

- [ ] **Step 4: 验证映射文件**

```bash
cat config/room_ids.json | python3 -m json.tool | head -30
```
Expected: 正确的映射结构

- [ ] **Step 5: 验证 summary JSON**

```bash
cat database/summaries/campuses/仙林校区/buildings/1幢/summary.json | python3 -m json.tool | head -20
```
Expected: rooms key 为房间名，无 room_id 字段

```bash
ls database/summaries/campuses/仙林校区/buildings/1幢/rooms/ | head -5
```
Expected: 文件名为房间名（如 `1A102.json`），非数字 ID

- [ ] **Step 6: 删除备份（确认无误后）**

```bash
rm -rf database.bak
```

- [ ] **Step 7: Commit 迁移结果**

```bash
git add -A
git commit -m "migrate: convert all data from room_id to room_name primary key"
```

---

### Task 11: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新文档中涉及 room_id 的部分**

在 CLAUDE.md 中，进行以下具体修改：

1. 输出目录结构示例：将 `{房间}-{房间id}/{日期}.json` 改为 `{房间}/{日期}.json`
2. 输出文件示例中的目录行：`19栋第16层1613-53463/` → `19栋第16层1613/`
3. 参数表格中 `room_ids` 的说明从 "宿舍ID列表" 改为 "缴费系统ID列表（仅用于API查询参数）"
4. 在"功能特性"章节添加：`- **映射文件**: config/room_ids.json 记录房间名→ID对应关系及历史变更`
5. 在"关键文件"列表中：移除 `cleanup_duplicate_ids.py` 和 `find_duplicate_room_ids.py`，添加 `migrate_room_ids.py` 和 `update_mapping.py`
6. 添加新章节说明 `config/room_ids.json` 的结构和用途

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for room_name primary key model"
```
