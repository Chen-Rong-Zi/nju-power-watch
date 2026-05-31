# Load Existing IDs for Scan Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load existing room IDs from config/room_ids.txt at scan start to skip already-discovered IDs, reducing network requests.

**Architecture:** Add a helper function to parse existing IDs from file, then filter the scan range to exclude already-known IDs.

**Tech Stack:** Python 3.11

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `nju_electric_query.py` | Modify | Add `load_existing_ids` function and integrate into `scan_room_ids` |

---

### Task 1: Add load_existing_ids Helper Function

**Files:**
- Modify: `nju_electric_query.py` (add before `scan_room_ids`)

- [ ] **Step 1: Add the helper function**

Add this function before `scan_room_ids` (around line 324):

```python
def load_existing_ids(file_path: str) -> set:
    """从文件加载已有ID，跳过注释和空行
    
    Args:
        file_path: room_ids.txt 文件路径
        
    Returns:
        已存在的ID集合
    """
    existing = set()
    output_path = Path(file_path)
    if not output_path.exists():
        return existing
    
    with open(output_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            # 跳过空行
            if not line:
                continue
            # 跳过注释行
            if line.startswith('#'):
                continue
            # 验证是有效数字ID
            if line.isdigit():
                existing.add(line)
    
    return existing
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add load_existing_ids helper function"
```

---

### Task 2: Integrate Existing IDs into Scan Flow

**Files:**
- Modify: `nju_electric_query.py:scan_room_ids`

- [ ] **Step 1: Load existing IDs and filter scan range**

Find the beginning of `scan_room_ids` function and add the loading logic. Replace:

```python
    total = end_id - start_id + 1
    processed = 0
    found = 0
```

With:

```python
    # 加载已有ID
    existing_ids = load_existing_ids(output_file)
    if existing_ids and show_progress:
        print(f"从 {output_file} 加载了 {len(existing_ids)} 个已有ID")
    
    total = end_id - start_id + 1
    processed = 0
    found = 0
    skipped = 0  # 跳过的已有ID计数
```

- [ ] **Step 2: Modify task generation to skip existing IDs**

Find the line that creates tasks:

```python
    tasks = [scan_single(session, room_id) for room_id in range(start_id, end_id + 1)]
```

Replace with:

```python
    # 生成待扫描的ID列表，跳过已有ID
    ids_to_scan = []
    for room_id in range(start_id, end_id + 1):
        if str(room_id) in existing_ids:
            skipped += 1
        else:
            ids_to_scan.append(room_id)
    
    if show_progress:
        print(f"跳过 {skipped} 个已有ID，待扫描 {len(ids_to_scan)} 个ID")
    
    tasks = [scan_single(session, room_id) for room_id in ids_to_scan]
```

- [ ] **Step 3: Update total for progress display**

Update the progress display logic. Find:

```python
    if show_progress:
        print(f"开始扫描ID区间: {start_id} - {end_id} (共 {end_id - start_id + 1} 个ID)")
```

Replace with:

```python
    if show_progress:
        print(f"开始扫描ID区间: {start_id} - {end_id}")
        print(f"  总范围: {total} 个ID")
        print(f"  已有: {len(existing_ids)} 个")
        print(f"  待扫描: {len(ids_to_scan)} 个")
```

- [ ] **Step 4: Update progress display in scan_single**

Find the progress line in `scan_single`:

```python
            print(f"\r[{processed}/{total}] 已发现: {len(seen_rooms)}", end="", flush=True)
```

Replace with:

```python
            print(f"\r[{processed}/{len(ids_to_scan)}] 已发现: {len(seen_rooms)}", end="", flush=True)
```

- [ ] **Step 5: Update scan completion output**

Find the scan completion output section and update the total count:

```python
    print(f"扫描完成: 共扫描 {total} 个ID, 发现 {found} 个有效房间")
```

Replace with:

```python
    print(f"扫描完成: 扫描 {len(ids_to_scan)} 个ID, 发现 {found} 个新房间, 跳过 {skipped} 个已有ID")
```

- [ ] **Step 6: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: skip existing IDs during scan to reduce requests"
```

---

## Verification

After implementation, verify:

1. **Load existing IDs**: Run scan and confirm it loads IDs from config/room_ids.txt
2. **Skip existing IDs**: Confirm scanned count is reduced by the number of existing IDs
3. **Progress display**: Confirm progress shows correct counts (scanned vs total range)
