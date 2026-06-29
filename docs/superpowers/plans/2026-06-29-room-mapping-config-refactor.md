# Room Mapping Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `config/room_ids.txt` with `config/room_ids.json` (campus→building→room_name→id mapping) so scan deduplicates by room name instead of raw ID.

**Architecture:** New `scripts/config_utils.py` provides type-safe JSON mapping I/O. `nju_electric_query.py` uses it for scan dedup (room-name key) and gains `--from-mapping` for daily query. GitHub Actions workflows simplified.

**Tech Stack:** Python 3.11, mypy --strict, pyright strict, aiofiles, aiohttp

---

### Task 1: Create `scripts/config_utils.py`

**Files:**
- Create: `scripts/config_utils.py`
- Create: `tests/unit/test_config_utils.py`

- [ ] **Step 1: Write `scripts/config_utils.py`**

```python
"""Type-safe room ID mapping utilities.

config/room_ids.json structure:
    {campus: {building: {room_name: id_str}}}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, TypeAlias

RoomIdMapping: TypeAlias = dict[str, str]
"""{room_name: id}"""

BuildingMapping: TypeAlias = dict[str, RoomIdMapping]
"""{building_name: {room_name: id}}"""

CampusMapping: TypeAlias = dict[str, BuildingMapping]
"""{campus_name: {building_name: {room_name: id}}}"""


def load_mapping(path: str | Path) -> CampusMapping:
    """Load room ID mapping from JSON file.

    Returns empty dict if file does not exist or is invalid.
    """
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_mapping(mapping: CampusMapping, path: str | Path) -> None:
    """Save room ID mapping to JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def extract_ids(mapping: CampusMapping) -> list[str]:
    """Extract all current IDs as a flat sorted list."""
    ids: list[str] = []
    for buildings in mapping.values():
        for rooms in buildings.values():
            ids.extend(rooms.values())
    return sorted(set(ids), key=int)


def is_room_known(mapping: CampusMapping, campus: str, building: str, room_name: str) -> bool:
    """Check if a room (by campus+building+room_name) exists in the mapping."""
    bldg = mapping.get(campus, {}).get(building)
    return bldg is not None and room_name in bldg


def update_id(mapping: CampusMapping, campus: str, building: str, room_name: str, new_id: str) -> bool:
    """Add or update a room's ID.

    Returns True if a NEW room entry was created.
    Returns False if an existing entry was updated (ID replaced).
    """
    is_new = not is_room_known(mapping, campus, building, room_name)
    bldg = mapping.setdefault(campus, {}).setdefault(building, {})
    bldg[room_name] = new_id
    return is_new
```

- [ ] **Step 2: Run mypy --strict on config_utils.py**

Run:
```bash
source .venv/bin/activate
mypy --strict scripts/config_utils.py
```
Expected: Success, no errors.

- [ ] **Step 3: Run pyright on config_utils.py**

Run:
```bash
npx pyright scripts/config_utils.py
```
Expected: Success, no errors.

- [ ] **Step 4: Write `tests/unit/test_config_utils.py`**

```python
"""Tests for config_utils.py"""
import json
import pytest
from pathlib import Path
from scripts.config_utils import (
    load_mapping,
    save_mapping,
    extract_ids,
    is_room_known,
    update_id,
    CampusMapping,
)

SAMPLE_MAPPING: CampusMapping = {
    "仙林校区": {
        "19幢": {
            "19栋第16层1613": "103407",
            "19栋第16层1614": "102385",
        },
    },
    "苏州校区": {
        "仁园-戊": {
            "戊504": "99876",
        },
    },
}


class TestLoadMapping:
    def test_load_existing_file(self, tmp_path: Path):
        f = tmp_path / "test.json"
        f.write_text(json.dumps(SAMPLE_MAPPING, ensure_ascii=False), encoding="utf-8")
        result = load_mapping(f)
        assert result == SAMPLE_MAPPING

    def test_file_not_exists(self, tmp_path: Path):
        result = load_mapping(tmp_path / "nonexistent.json")
        assert result == {}

    def test_invalid_json(self, tmp_path: Path):
        f = tmp_path / "bad.json"
        f.write_text("{invalid", encoding="utf-8")
        result = load_mapping(f)
        assert result == {}


class TestSaveMapping:
    def test_save_and_reload(self, tmp_path: Path):
        f = tmp_path / "output.json"
        save_mapping(SAMPLE_MAPPING, f)
        assert f.exists()
        with open(f, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert data == SAMPLE_MAPPING


class TestExtractIds:
    def test_extract_all_ids(self):
        ids = extract_ids(SAMPLE_MAPPING)
        assert sorted(ids) == ["102385", "103407", "99876"]

    def test_empty_mapping(self):
        assert extract_ids({}) == []

    def test_deduplicates(self):
        dup = {
            "仙林校区": {
                "19幢": {"1613": "12345"},
                "20幢": {"201": "12345"},
            }
        }
        assert extract_ids(dup) == ["12345"]


class TestIsRoomKnown:
    def test_known_room(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "19幢", "19栋第16层1613") is True

    def test_unknown_campus(self):
        assert is_room_known(SAMPLE_MAPPING, "鼓楼校区", "1幢", "101") is False

    def test_unknown_building(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "99幢", "101") is False

    def test_unknown_room(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "19幢", "9999") is False


class TestUpdateId:
    def test_add_new_room(self):
        m: CampusMapping = {}
        result = update_id(m, "仙林校区", "1幢", "1A101", "101223")
        assert result is True
        assert m["仙林校区"]["1幢"]["1A101"] == "101223"

    def test_replace_existing_id(self):
        m: CampusMapping = {"仙林校区": {"1幢": {"1A101": "old_id"}}}
        result = update_id(m, "仙林校区", "1幢", "1A101", "new_id")
        assert result is False
        assert m["仙林校区"]["1幢"]["1A101"] == "new_id"
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
source .venv/bin/activate
python -m pytest tests/unit/test_config_utils.py -v
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/config_utils.py tests/unit/test_config_utils.py
git commit -m "feat: add config_utils.py for type-safe room ID mapping"
```

---

### Task 2: Add `--from-mapping` parameter to `nju_electric_query.py`

**Files:**
- Modify: `nju_electric_query.py`

- [ ] **Step 1: Add `--from-mapping` argument to argparse**

Find the argparse section around line 693-695. Add:

```python
parser.add_argument("--from-mapping", type=str, help="从JSON映射文件读取房间ID列表")
```

- [ ] **Step 2: Add `--from-mapping` handling before the `if not room_ids` check**

After `room_ids = args.room_ids` (line 698), add:

```python
if args.from_mapping:
    from scripts.config_utils import load_mapping, extract_ids
    mapping = load_mapping(args.from_mapping)
    room_ids = extract_ids(mapping)
    if not room_ids:
        print(f"错误: 映射文件 {args.from_mapping} 中没有找到任何房间ID")
        sys.exit(1)
    if show_progress:
        print(f"✓ 从映射文件加载了 {len(room_ids)} 个房间ID: {args.from_mapping}")
```

This must be placed BEFORE the `if not room_ids:` error check at line 743, so that `--from-mapping` populates `room_ids` before that check.

- [ ] **Step 3: Verify the logic**

Check that the flow is:
1. `--scan` → scan mode, skip normal query
2. `--from-mapping` → load IDs from JSON, populate `room_ids`, then proceed to normal query
3. Neither → existing behavior (room_ids from positional args or error)

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add --from-mapping parameter to load room IDs from JSON config"
```

---

### Task 3: Modify `scan_room_ids()` to use room-name dedup

**Files:**
- Modify: `nju_electric_query.py` (scan_room_ids function + load_existing_ids replacement)

- [ ] **Step 1: Replace `load_existing_ids()` usage in `scan_room_ids()`**

Change `scan_room_ids()` signature to accept mapping directly. At the top of the function, replace:

```python
# OLD:
existing_ids = load_existing_ids(output_file)
```

```python
# NEW:
from scripts.config_utils import load_mapping, extract_ids, is_room_known, update_id, save_mapping

mapping = load_mapping(output_file)
existing_id_set = set(extract_ids(mapping))
```

The `existing_id_set` is used for the same purpose as before: deciding which IDs to skip during scan (no need to re-query already-known IDs).

- [ ] **Step 2: Update `ids_to_scan` generation**

Replace:
```python
if str(room_id) in existing_ids:
```
With:
```python
if str(room_id) in existing_id_set:
```

Remove the block that adds existing room info:
```python
# DELETE this block:
for existing_id, (campus, building) in existing_ids.items():
    room_info[int(existing_id)] = (campus, building)
```

- [ ] **Step 3: Add room-name dedup in `scan_single()`**

Inside `scan_single()`, after successfully parsing the room (around line 499-503), replace:

```python
# OLD:
room_key = (result.get("校区", ""), result.get("楼栋", ""), result.get("房间", ""))
if room_key not in seen_rooms:
    seen_rooms[room_key] = room_id
    room_info[room_id] = room_key[:2]  # (校区, 楼栋)
```

With:

```python
campus = result.get("校区", "")
building = result.get("楼栋", "")
room_name = result.get("房间", "")

# Check if this room name is already known in the mapping
if is_room_known(mapping, campus, building, room_name):
    # Room known, update ID in case it changed
    update_id(mapping, campus, building, room_name, str(room_id))
else:
    # New room
    update_id(mapping, campus, building, room_name, str(room_id))
```

Also remove `seen_rooms` and `room_info` dicts since we no longer use them for output.

- [ ] **Step 4: Replace the output file writing logic**

Replace the entire file writing block (lines 586-597) with:

```python
save_mapping(mapping, output_file)
```

Remove the `save_results()` function and signal handler that used it (the mapping is saved at the end).

- [ ] **Step 5: Update the scan statistics display**

Add a `new_found` counter that tracks rooms discovered during THIS scan:

Add variable declaration near other counters in `scan_room_ids()`:
```python
new_found = 0
```

Inside `scan_single()`, after `update_id()`:
```python
nonlocal new_found
# If this room name was not in the mapping before, count as new
if not is_room_known(mapping, campus, building, room_name):
    new_found += 1
```

At the end of `scan_room_ids()`, display:
```python
print(f"扫描完成: 扫描 {scan_count} 个ID, 发现 {new_found} 个新房间, 跳过 {skipped} 个已有ID")
print(f"结果已保存到: {output_file} (共 {len(extract_ids(mapping))} 个ID)")
```

- [ ] **Step 6: Update the `--scan-output` default**

Change the default value of `--scan-output`:

```python
# OLD:
parser.add_argument("--scan-output", type=str, default="config/room_ids.txt", ...)

# NEW:
parser.add_argument("--scan-output", type=str, default="config/room_ids.json", ...)
```

- [ ] **Step 7: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: use room-name dedup in scan via config_utils"
```

---

### Task 4: Create migration script to generate initial `config/room_ids.json`

**Files:**
- Create: `scripts/migrate_to_json_config.py`

- [ ] **Step 1: Write the migration script**

```python
#!/usr/bin/env python3
"""
迁移 config/room_ids.txt → config/room_ids.json

从数据库中的已有 JSON 文件提取 (校区, 楼栋, 房间名, id) 信息，
构建三层嵌套映射并保存到 config/room_ids.json。

用法:
    python scripts/migrate_to_json_config.py
    python scripts/migrate_to_json_config.py --database ./database --output config/room_ids.json
"""

import argparse
import json
import os
import sys
from pathlib import Path
from collections import defaultdict


def migrate(database_dir: str, output_file: str) -> int:
    """从数据库目录构建映射，返回写入的房间数"""
    db_path = Path(database_dir)
    if not db_path.exists():
        print(f"错误: 数据库目录不存在: {db_path}")
        sys.exit(1)

    # {campus: {building: {room_name: id}}}
    mapping: dict[str, dict[str, dict[str, str]]] = defaultdict(lambda: defaultdict(dict))

    count = 0
    for json_file in db_path.rglob("*.json"):
        # 跳过 summaries 和 archives 目录
        if "summaries" in str(json_file) or "archives" in str(json_file):
            continue
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            campus = data.get("校区", "")
            building = data.get("楼栋", "")
            room_name = data.get("房间", "")
            room_id = data.get("id", "")
            if campus and building and room_name and room_id:
                mapping[campus][building][room_name] = str(room_id)
                count += 1
        except (json.JSONDecodeError, OSError):
            continue

    # 写入输出
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"迁移完成: 从 {count} 个数据文件构建映射")
    print(f"输出: {output_path}")
    return count


def main():
    parser = argparse.ArgumentParser(description="迁移 room_ids.txt → room_ids.json")
    parser.add_argument("--database", default="./database", help="数据库目录路径")
    parser.add_argument("--output", default="config/room_ids.json", help="输出 JSON 文件路径")
    args = parser.parse_args()
    migrate(args.database, args.output)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the migration to generate `config/room_ids.json`**

Run:
```bash
source .venv/bin/activate
python scripts/migrate_to_json_config.py
```
Expected: Success message with count of rooms migrated.

- [ ] **Step 3: Verify the generated JSON**

Run:
```bash
python -c "
import json
with open('config/room_ids.json') as f:
    m = json.load(f)
total = sum(len(r) for b in m.values() for r in b.values())
print(f'Campuses: {len(m)}, Total rooms: {total}')
"
```
Expected: Output shows reasonable counts matching the database.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate_to_json_config.py config/room_ids.json
git commit -m "feat: add migration script and initial config/room_ids.json"
```

---

### Task 5: Update GitHub Actions workflows

**Files:**
- Modify: `.github/workflows/daily-query.yml`
- Modify: `.github/workflows/monthly-scan-part-1.yml`
- Modify: `.github/workflows/monthly-scan-part-2.yml`
- Modify: `.github/workflows/monthly-scan-part-3.yml`
- Modify: `.github/workflows/monthly-scan-part-4.yml`

- [ ] **Step 1: Edit `daily-query.yml`**

Delete the `Read room IDs` step entirely. Change the `Query electricity data` step to use `--from-mapping`:

```yaml
      - name: Query electricity data
        id: query
        run: |
          python nju_electric_query.py \
            --cookie-file /tmp/cookie.json \
            --from-mapping config/room_ids.json \
            -d ./database \
            -c 200 \
            -q \
            2>&1 | tee query_output.log
          
          SUCCESS=$(grep -oP '成功: \K\d+' query_output.log || echo "0")
          FAILED=$(grep -oP '失败: \K\d+' query_output.log || echo "0")
          echo "success_count=$SUCCESS" >> $GITHUB_OUTPUT
          echo "failed_count=$FAILED" >> $GITHUB_OUTPUT
          
          if [ "$SUCCESS" -eq 0 ]; then
            echo "::error::All queries failed ($FAILED rooms)"
            exit 1
          elif [ "$FAILED" -gt 0 ]; then
            echo "::warning::$FAILED rooms failed, $SUCCESS succeeded — continuing with partial results"
          fi
```

In the `Summary` step, update the total calculation since `${{ steps.rooms.outputs.room_ids }}` no longer exists:

```yaml
          TOTAL=${{ steps.query.outputs.success_count + steps.query.outputs.failed_count }}
```
Or replace with:
```yaml
          SUCCESS=${{ steps.query.outputs.success_count }}
          FAILED=${{ steps.query.outputs.failed_count }}
          TOTAL=$((SUCCESS + FAILED))
```

- [ ] **Step 2: Edit `monthly-scan-part-1.yml`**

Change `--scan-output config/room_ids.txt` to `--scan-output config/room_ids.json`.

Change the commit step to add `config/room_ids.json` instead of `config/room_ids.txt`:

```yaml
          git add config/room_ids.json
```

Update the commit message:
```yaml
          git commit -m "chore: update room_ids.json - scan part 1 (1-50000) - ${{ steps.scan.outputs.found_count }} rooms"
```

- [ ] **Step 3: Edit `monthly-scan-part-2.yml`, `part-3.yml`, `part-4.yml`**

Apply the same changes as Step 2 (scan-output → json, add json instead of txt, update commit message).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "ci: update workflows to use config/room_ids.json"
```

---

### Task 6: Final type checking verification

- [ ] **Step 1: Run mypy --strict on config_utils.py**

```bash
source .venv/bin/activate
mypy --strict scripts/config_utils.py
```
Expected: Success, no errors.

- [ ] **Step 2: Run pyright strict on config_utils.py**

```bash
npx pyright scripts/config_utils.py
```
Expected: Success, no errors.

- [ ] **Step 3: Run all tests**

```bash
source .venv/bin/activate
python -m pytest tests/unit/test_config_utils.py -v
```
Expected: All tests pass.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final type checking fixes"
```
