# Research: Daily Data Pipeline

**Feature**: 001-daily-data-pipeline  
**Date**: 2026-05-15  
**Purpose**: Resolve technical unknowns and establish best practices for implementation

## Research Topics

### 1. GitHub Actions Scheduled Workflows

**Decision**: Use `schedule` trigger with cron syntax, combined with `workflow_dispatch` for manual runs

**Rationale**: 
- Cron-based scheduling is native to GitHub Actions
- `workflow_dispatch` enables manual testing and ad-hoc runs
- Free tier includes 2000 minutes/month, well within daily needs (~30 min/run = 900 min/month)

**Alternatives Considered**:
- External cron services (overkill, adds external dependency)
- GitHub API-based triggering (unnecessary complexity)

**Best Practices**:
- Use `concurrency` group to prevent overlapping runs
- Set timeout to prevent runaway workflows
- Use `workflow_dispatch` inputs for manual overrides
- Cache dependencies to speed up runs

**Implementation**:
```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:
    inputs:
      force_run:
        description: 'Force run even if data exists'
        required: false
        default: 'false'

concurrency:
  group: daily-query
  cancel-in-progress: false
```

---

### 2. Atomic File Operations in Python

**Decision**: Write to temporary directory, then atomic move to final location

**Rationale**:
- Ensures all-or-nothing semantics for batch operations
- Prevents partial data corruption if process fails mid-write
- File move is atomic on same filesystem

**Alternatives Considered**:
- Database transactions (overkill for file-based storage)
- Direct writes with error handling (risk of partial data)

**Best Practices**:
- Use `tempfile.TemporaryDirectory()` for scratch space
- Write all files first, then move atomically
- Clean up temp files on failure
- Use `shutil.move()` for atomic rename

**Implementation Pattern**:
```python
import tempfile
import shutil
from pathlib import Path

def atomic_batch_write(results: list, output_dir: Path):
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        
        # Write all files to temp location
        for result in results:
            file_path = build_file_path(result, tmp_path)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, 'w') as f:
                json.dump(result, f)
        
        # If all writes succeed, move to final location
        for result in results:
            src = build_file_path(result, tmp_path)
            dst = build_file_path(result, output_dir)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
```

---

### 3. Data Aggregation for Time-Series

**Decision**: Rolling window aggregation with incremental updates

**Rationale**:
- Incremental updates avoid reprocessing all historical data
- Rolling windows (7-day, 30-day) are efficient with sorted data
- Single summary file keeps frontend load simple

**Alternatives Considered**:
- Full recompute each run (wasteful for large datasets)
- Multiple summary files by date range (complex frontend logic)
- Database with aggregation queries (overkill for static frontend)

**Best Practices**:
- Load only recent data needed for windows
- Use pandas for efficient time-series operations
- Store last-N days in memory for quick recalculation
- Persist summary as single JSON for atomic updates

**Implementation Pattern**:
```python
import pandas as pd
from datetime import datetime, timedelta

def compute_summary(database_dir: Path, room_ids: list):
    summary = {}
    today = datetime.now().date()
    
    for room_id in room_ids:
        room_files = find_room_files(database_dir, room_id)
        if not room_files:
            continue
        
        # Load last 30 days
        df = load_recent_data(room_files, days=30)
        
        summary[room_id] = {
            'current_balance': df.iloc[-1]['balance'] if len(df) > 0 else None,
            'avg_7d': df.tail(7)['balance'].mean(),
            'avg_30d': df['balance'].mean(),
            'trend_30d': compute_trend(df['balance']),
            'min_30d': df['balance'].min(),
            'max_30d': df['balance'].max(),
        }
    
    return summary
```

---

### 4. Monthly Archive Compression

**Decision**: tar.gz with date-based directory structure preserved

**Rationale**:
- tar.gz is standard Unix format, widely supported
- Preserves directory hierarchy for easy extraction
- Good compression ratio for JSON files
- GitHub/GitLab support browsing tar.gz contents

**Alternatives Considered**:
- zip (less efficient compression)
- Individual file gzip (harder to manage)
- SQLite database (different paradigm, harder to browse)

**Best Practices**:
- Use `tarfile` module for Python
- Name archives by month: `YYYY-MM.tar.gz`
- Include manifest file listing archived files
- Delete originals only after successful compression verification

**Implementation Pattern**:
```python
import tarfile
from datetime import datetime
from pathlib import Path

def archive_month(database_dir: Path, year: int, month: int, archive_dir: Path):
    archive_name = f"{year}-{month:02d}.tar.gz"
    archive_path = archive_dir / archive_name
    
    with tarfile.open(archive_path, "w:gz") as tar:
        # Find all files from target month
        month_start = datetime(year, month, 1)
        month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        
        for json_file in database_dir.rglob("*.json"):
            file_date = parse_date_from_path(json_file)
            if month_start <= file_date < month_end:
                tar.add(json_file, arcname=str(json_file.relative_to(database_dir)))
    
    # Verify archive integrity
    with tarfile.open(archive_path, "r:gz") as tar:
        members = tar.getnames()
        if len(members) == 0:
            raise ValueError("Archive is empty")
    
    return archive_path
```

---

### 5. GitHub Secrets Management

**Decision**: Store cookie JSON as single secret, deserialize in workflow

**Rationale**:
- GitHub Secrets are encrypted at rest
- Single secret easier to manage than multiple
- JSON format matches existing cookie export structure

**Alternatives Considered**:
- Multiple secrets for each cookie field (overly complex)
- Environment variables in workflow file (insecure)

**Best Practices**:
- Use `secrets.EPAY_COOKIE` as secret name
- Store as JSON string
- Deserialize in Python script
- Never log or print secret values
- Use `add-mask` for any derived values

**Implementation**:
```yaml
env:
  EPAY_COOKIE: ${{ secrets.EPAY_COOKIE }}

steps:
  - name: Run query
    run: |
      echo "$EPAY_COOKIE" > /tmp/cookie.json
      python nju_electric_query.py -d ./database --cookie-file /tmp/cookie.json $(cat config/room_ids.txt)
```

---

### 6. Cookie Validation Techniques

**Decision**: Pre-flight validation with test query to known room

**Rationale**:
- Catching expired cookies early prevents wasted work
- Test query to known room validates both cookie and API availability
- Fail-fast pattern improves user experience

**Alternatives Considered**:
- Query all rooms first, then check results (wastes quota)
- Parse cookie expiration date (unreliable, not always available)

**Best Practices**:
- Use simple HEAD request or minimal GET
- Check response for authentication errors (401, 403, redirect to login)
- Provide clear error message with renewal instructions
- Exit with non-zero status for workflow failure

**Implementation**:
```python
async def validate_cookie(session, cookie_dict, test_room_id: str):
    url = f"https://epay.nju.edu.cn/epay/h5/nju/electric/charge?id={test_room_id}"
    
    async with session.get(url, cookies=cookie_dict) as response:
        if response.status in (401, 403):
            raise ValueError("Cookie expired or invalid. Please update EPAY_COOKIE secret.")
        
        html = await response.text()
        if "login" in html.lower() or "登录" in html:
            raise ValueError("Cookie expired. Session redirected to login page.")
        
        return True
```

---

## Summary of Decisions

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| GitHub Actions | Cron + workflow_dispatch | Automated + manual control |
| Atomic Operations | Temp dir + atomic move | All-or-nothing consistency |
| Data Aggregation | Incremental rolling windows | Efficient updates |
| Archive Format | tar.gz with directory structure | Standard, compressible, browsable |
| Secrets | Single JSON secret | Simple, secure |
| Cookie Validation | Pre-flight test query | Fail-fast, clear errors |

## Open Questions

None - all technical unknowns resolved.
