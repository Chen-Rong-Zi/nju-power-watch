# Query Error Handling and Success Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `| tee` swallowing Python exit code, raise success threshold to 90%, and output error breakdown to GitHub Actions Summary.

**Architecture:** Two changes in Python script (threshold logic + always-print error stats) and two changes in workflow YAML (`pipefail` + awk-based error extraction).

**Tech Stack:** Python 3.11, GitHub Actions, bash, awk

---

### Task 1: Python script — threshold and error stats

**Files:**
- Modify: `nju_electric_query.py` (2 locations)

- [ ] **Step 1: Change threshold from `failed >= succeeded` to `success_rate < 0.9`**

Find the current exit logic at the end of `async_main`:

```python
# Current (line 747):
if summary['failed'] >= summary['succeeded']:
    sys.exit(1)
```

Replace with:

```python
# New: 90% success threshold
success_rate = summary['succeeded'] / summary['total'] if summary['total'] > 0 else 0
if success_rate < 0.9:
    print(f"错误: 成功率 {success_rate:.1%} ({summary['succeeded']}/{summary['total']}) 低于 90% 阈值")
    sys.exit(1)
```

- [ ] **Step 2: Remove `if show_progress:` guard from error stats output**

Find the error stats section:

```python
# Current (line 725-726):
if summary['failed'] > 0:
    if show_progress:
        print("\n--- 失败原因统计 ---")
```

Remove the `if show_progress:` indentation level:

```python
# New: always print error stats
if summary['failed'] > 0:
    print("\n--- 失败原因统计 ---")
```

- [ ] **Step 3: Verify the changes**

Run:
```bash
source .venv/bin/activate
python -c "import ast; ast.parse(open('nju_electric_query.py').read()); print('Syntax OK')"
```
Expected: Syntax OK.

- [ ] **Step 4: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: raise success threshold to 90%, always print error stats"
```

---

### Task 2: Workflow — pipefail and error breakdown in Summary

**Files:**
- Modify: `.github/workflows/daily-query.yml`

- [ ] **Step 1: Add `set -o pipefail` to Query step**

Find the Query step:

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
```

Add `set -o pipefail` at the top of the `run:` block:

```yaml
      - name: Query electricity data
        id: query
        run: |
          set -o pipefail
          python nju_electric_query.py \
            --cookie-file /tmp/cookie.json \
            --from-mapping config/room_ids.json \
            -d ./database \
            -c 200 \
            -q \
            2>&1 | tee query_output.log
```

- [ ] **Step 2: Add error breakdown to Summary step**

Find the Summary step. After the existing `if [ "$FAILED" -gt 0 ]` block, add the error breakdown extraction:

```yaml
          if [ "$FAILED" -gt 0 ]; then
              echo "**Failed Rooms**: $FAILED" >> $GITHUB_STEP_SUMMARY
              echo "" >> $GITHUB_STEP_SUMMARY
              echo "**Failure Breakdown:**" >> $GITHUB_STEP_SUMMARY
              echo '```' >> $GITHUB_STEP_SUMMARY
              awk '/--- 失败原因统计 ---/{flag=1} flag' query_output.log 2>/dev/null >> $GITHUB_STEP_SUMMARY || true
              echo '```' >> $GITHUB_STEP_SUMMARY
          fi
```

This should go inside the existing `if [ "$FAILED" -gt 0 ]` block that already exists in the Summary step (which currently only prints "Failed Rooms: $FAILED").

- [ ] **Step 3: Verify the YAML is valid**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/daily-query.yml')); print('YAML OK')"
```
Or just check syntax visually. Expected: Valid YAML.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/daily-query.yml
git commit -m "ci: fix pipefail, add error breakdown to Summary"
```

---

### Task 3: Verification

**No files changed.** Run these verification steps.

- [ ] **Step 1: Test error stats output with invalid cookie**

```bash
# Create a dummy invalid cookie
echo '[]' > /tmp/bad_cookie.json

# Run query with -q mode against a few IDs
source .venv/bin/activate
python nju_electric_query.py \
  --cookie-file /tmp/bad_cookie.json \
  -q \
  53463 53464 53465 2>&1 | tee /tmp/test_output.log
```

Expected: Output includes `--- 失败原因统计 ---` with error breakdown (auth_failed).

- [ ] **Step 2: Test awk extraction**

```bash
awk '/--- 失败原因统计 ---/{flag=1} flag' /tmp/test_output.log
```

Expected: Prints the error statistics section from the log.

- [ ] **Step 3: Test threshold logic**

The threshold change is from `failed >= succeeded` (50%) to `success_rate < 0.9` (90%). With a bad cookie, all queries fail, so `success_rate = 0/3 = 0% < 90%`, and the script should exit with code 1:

```bash
python nju_electric_query.py \
  --cookie-file /tmp/bad_cookie.json \
  -q \
  53463 53464 53465
echo "Exit code: $?"
```

Expected: Exit code 1.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes"
```