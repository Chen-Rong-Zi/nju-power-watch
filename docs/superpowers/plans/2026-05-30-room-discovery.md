# Room Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add room ID discovery mode to `nju_electric_query.py` that scans a specified ID range and outputs unique room IDs to a file.

**Architecture:** Add scan mode to the existing script with new CLI arguments. Scan mode iterates through ID range, queries each ID, deduplicates by room identity (campus + building + room name), and writes results to file. Create GitHub Action for weekly automated scanning.

**Tech Stack:** Python 3.11, aiohttp (existing), GitHub Actions

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `nju_electric_query.py` | Modify | Add scan mode logic |
| `.github/workflows/weekly-room-discovery.yml` | Create | Weekly automated scanning |

---

### Task 1: Add Scan Mode CLI Arguments

**Files:**
- Modify: `nju_electric_query.py:378-385`

- [ ] **Step 1: Add new arguments to argparse**

Add after the existing arguments in `async_main()`:

```python
    parser.add_argument("--scan", type=int, nargs=2, metavar=('START', 'END'), help="扫描ID区间模式: 扫描指定范围内的所有ID")
    parser.add_argument("--scan-output", type=str, default="config/room_ids.txt", help="扫描结果输出文件 (默认: config/room_ids.txt)")
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add --scan and --scan-output CLI arguments"
```

---

### Task 2: Implement Scan Mode Logic

**Files:**
- Modify: `nju_electric_query.py`

- [ ] **Step 1: Add scan_batch function after query_batch**

Add this new function after the `query_batch` function (around line 316):

```python
async def scan_room_ids(start_id: int, end_id: int, cookies: dict, output_file: str, max_concurrent: int = DEFAULT_CONCURRENCY, show_progress: bool = True):
    """扫描ID区间，发现存在的房间
    
    Args:
        start_id: 起始ID (包含)
        end_id: 结束ID (包含)
        cookies: Cookie字典
        output_file: 输出文件路径
        max_concurrent: 最大并发数
        show_progress: 是否显示进度
    """
    total = end_id - start_id + 1
    processed = 0
    found = 0
    
    # 去重: 记录已发现的房间 (校区, 楼栋, 房间名) -> room_id
    seen_rooms = {}
    valid_ids = []
    
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def scan_single(session, room_id):
        nonlocal processed, found
        async with semaphore:
            url = urljoin(base_url, f"/epay/h5/nju/electric/charge?id={room_id}")
            try:
                async with session.get(url, cookies=cookies, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status != 200:
                        return None
                    
                    html = await response.text()
                    
                    # 检查是否是错误页面
                    if "房间查询失败" in html or ("错误" in html and "房间查询失败" in html):
                        return None
                    
                    # 检查是否需要登录
                    if "login" in html.lower() or "登录" in html:
                        return None
                    
                    # 解析房间信息
                    result = parse_html(html)
                    if not result.get("校区") or not result.get("楼栋") or not result.get("房间"):
                        return None
                    
                    return {
                        "id": room_id,
                        "campus": result.get("校区", ""),
                        "building": result.get("楼栋", ""),
                        "room": result.get("房间", "")
                    }
            except Exception:
                return None
            finally:
                processed += 1
                if show_progress and processed % 100 == 0:
                    print(f"\r[{processed}/{total}] 已发现: {found}", end="", flush=True)
    
    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [scan_single(session, room_id) for room_id in range(start_id, end_id + 1)]
        results = await asyncio.gather(*tasks)
    
    if show_progress:
        print()
    
    # 去重处理
    for result in results:
        if result is None:
            continue
        
        room_key = (result["campus"], result["building"], result["room"])
        if room_key not in seen_rooms:
            seen_rooms[room_key] = result["id"]
            valid_ids.append(result["id"])
            found += 1
    
    # 排序并写入文件
    valid_ids.sort(key=int)
    
    # 确保输出目录存在
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    async with aiofiles.open(output_path, "w", encoding="utf-8") as f:
        for room_id in valid_ids:
            await f.write(f"{room_id}\n")
    
    if show_progress:
        print(f"扫描完成: 共扫描 {total} 个ID, 发现 {found} 个有效房间")
        print(f"结果已保存到: {output_file}")
    
    return {
        "total": total,
        "found": found,
        "output_file": str(output_path)
    }
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add scan_room_ids function for room discovery"
```

---

### Task 3: Wire Scan Mode into Main

**Files:**
- Modify: `nju_electric_query.py:async_main`

- [ ] **Step 1: Add scan mode branch in async_main**

Find the section that starts with `if show_progress:` after loading cookies, and add the scan mode branch before the normal query logic. Replace the section starting at "开始查询" with:

```python
    # 扫描模式
    if args.scan:
        start_id, end_id = args.scan
        if start_id > end_id:
            print(f"错误: 起始ID ({start_id}) 不能大于结束ID ({end_id})")
            sys.exit(1)
        
        if show_progress:
            print(f"开始扫描ID区间: {start_id} - {end_id} (共 {end_id - start_id + 1} 个ID)")
            print(f"并发数: {max_concurrent}")
            print("-" * 50)
        
        start_time = time.time()
        result = await scan_room_ids(start_id, end_id, cookies, args.scan_output, max_concurrent, show_progress)
        elapsed = time.time() - start_time
        
        if show_progress:
            print("-" * 50)
            print(f"扫描完成!")
            print(f"  总数: {result['total']}")
            print(f"  发现: {result['found']}")
            print(f"  耗时: {elapsed:.2f}秒")
            print(f"  输出: {result['output_file']}")
            print("-" * 50)
        
        return
    
    # 正常查询模式
    if output_dir and output_dir.exists():
        if not output_dir.is_dir():
            print(f"错误: {output_dir} 不是一个目录")
            sys.exit(1)
        if not os.access(output_dir, os.W_OK):
            print(f"错误: 没有权限写入目录 {output_dir}")
            sys.exit(1)

    if show_progress:
        print(f"开始查询 {len(room_ids)} 个宿舍 (并发数: {max_concurrent})...")
        print("-" * 50)
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: wire scan mode into main function"
```

---

### Task 4: Test Scan Mode Locally

**Files:**
- None (testing only)

- [ ] **Step 1: Test with a small range**

Run with a small range to verify the scan mode works:

```bash
# 首先确保有有效的cookie
python nju_electric_query.py --cookie-file /tmp/cookie.json --scan 50000 50010 --scan-output /tmp/test_scan.txt

# 查看结果
cat /tmp/test_scan.txt
```

Expected: Script should scan IDs 50000-50010 and output any valid room IDs to the file.

- [ ] **Step 2: Test error handling**

Test with invalid range:

```bash
python nju_electric_query.py --cookie-file /tmp/cookie.json --scan 60000 50000
```

Expected: Script should exit with error "起始ID (60000) 不能大于结束ID (50000)"

---

### Task 5: Create Weekly Discovery GitHub Action

**Files:**
- Create: `.github/workflows/weekly-room-discovery.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Weekly Room Discovery

on:
  schedule:
    - cron: '0 3 * * 1'  # Every Monday at 3 AM UTC
  workflow_dispatch:
    inputs:
      start_id:
        description: 'Starting room ID'
        required: false
        default: '1'
      end_id:
        description: 'Ending room ID'
        required: false
        default: '99999'

permissions:
  contents: write

env:
  PYTHON_VERSION: '3.11'

jobs:
  discover-rooms:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    
    concurrency:
      group: room-discovery
      cancel-in-progress: false
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
      
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: Auto login to get cookie
        id: login
        env:
          NJU_USERNAME: ${{ secrets.NJU_USERNAME }}
          NJU_PASSWORD: ${{ secrets.NJU_PASSWORD }}
          YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}
        run: |
          echo "=== 开始自动登录流程 ==="
          
          echo "$NJU_USERNAME" > /tmp/username
          echo "$NJU_PASSWORD" > /tmp/password
          echo "$YUNMA_TOKEN" > /tmp/token
          
          python scripts/nju_auto_login.py
          
          if [ -f "/tmp/cookie.json" ]; then
            echo "✓ Cookie文件已生成: /tmp/cookie.json"
            echo "cookie_file=/tmp/cookie.json" >> $GITHUB_OUTPUT
          else
            echo "✗ Cookie文件生成失败"
            exit 1
          fi
      
      - name: Scan for room IDs
        id: scan
        run: |
          START_ID="${{ github.event.inputs.start_id || '1' }}"
          END_ID="${{ github.event.inputs.end_id || '99999' }}"
          
          echo "扫描范围: $START_ID - $END_ID"
          
          python nju_electric_query.py \
            --cookie-file /tmp/cookie.json \
            --scan $START_ID $END_ID \
            --scan-output config/room_ids.txt \
            -c 200
          
          COUNT=$(wc -l < config/room_ids.txt)
          echo "found_count=$COUNT" >> $GITHUB_OUTPUT
          echo "发现 $COUNT 个有效房间ID"
      
      - name: Commit and push updated room_ids.txt
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          
          git add config/room_ids.txt
          
          STAGED_FILES=$(git diff --staged --name-only)
          if [ -z "$STAGED_FILES" ]; then
            echo "No changes to commit"
          else
            git commit -m "chore: update room_ids.txt - ${{ steps.scan.outputs.found_count }} rooms found"
            git push
            echo "✓ room_ids.txt 已更新"
          fi
      
      - name: Summary
        if: always()
        run: |
          echo "## 🔍 Room Discovery Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Found Rooms | ${{ steps.scan.outputs.found_count }} |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Status**: ${{ job.status }}" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/weekly-room-discovery.yml
git commit -m "feat: add weekly room discovery GitHub Action"
```

---

### Task 6: Final Commit and Push

**Files:**
- None (finalization)

- [ ] **Step 1: Push all changes**

```bash
git push origin master
```

---

## Verification

After implementation, verify:

1. **Scan mode works locally:**
   ```bash
   python nju_electric_query.py --cookie-file /tmp/cookie.json --scan 50000 50100
   ```

2. **Deduplication works:**
   - Multiple IDs pointing to same room should only appear once in output

3. **GitHub Action runs:**
   - Can manually trigger via workflow_dispatch
   - Runs automatically every Monday at 3 AM UTC
