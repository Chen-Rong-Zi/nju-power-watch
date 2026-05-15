# Quickstart: Daily Data Pipeline

**Feature**: 001-daily-data-pipeline  
**Purpose**: Guide for setting up and running the automated electricity data collection system

## Prerequisites

- Python 3.8+ installed
- GitHub account with repository access
- Valid NJU epay system cookie
- Room IDs to monitor

## Initial Setup

### 1. Configure GitHub Secrets

1. Go to repository Settings → Secrets and variables → Actions
2. Add new repository secret:
   - **Name**: `EPAY_COOKIE`
   - **Value**: JSON-formatted cookie array from browser export
   
   Example format:
   ```json
   [
     {
       "name": "JSESSIONID",
       "value": "ABC123...",
       "domain": "epay.nju.edu.cn"
     },
     ...
   ]
   ```

3. To export cookies from browser:
   - Install "EditThisCookie" or similar extension
   - Login to https://epay.nju.edu.cn
   - Export cookies as JSON
   - Paste into secret value

### 2. Create Room Configuration

Create `config/room_ids.txt` in repository root:

```
# Room IDs to query daily
53463
53464
53465
```

Generate automatically from existing data:
```bash
python list_room_ids.py
# Creates details.md files with room IDs
# Extract IDs manually or use script
```

### 3. Verify Cookie Validity

Test cookie before first run:
```bash
# Set cookie environment variable
export EPAY_COOKIE='[{"name":"JSESSIONID","value":"..."}]'

# Run validation script
python scripts/validate_cookie.py
```

Expected output:
```
✓ Cookie is valid
✓ Successfully authenticated to epay.nju.edu.cn
```

## Running the Pipeline

### Daily Automated Run (GitHub Actions)

The workflow runs automatically at 2:00 AM UTC daily.

**Check workflow status**:
1. Go to Actions tab in GitHub
2. Select "Daily Electricity Query" workflow
3. View recent runs

**Manual trigger** (for testing):
1. Go to Actions → "Daily Electricity Query"
2. Click "Run workflow"
3. Select branch and run

### Local Testing

Run individual components locally:

**1. Query electricity data**:
```bash
# Create cookie file
echo "$EPAY_COOKIE" > /tmp/cookie.json

# Run query
python nju_electric_query.py \
  -d ./database \
  --cookie-file /tmp/cookie.json \
  $(cat config/room_ids.txt)
```

**2. Generate aggregated summary**:
```bash
python scripts/aggregate_data.py \
  --database ./database \
  --output ./database/summary.json
```

**3. Run cleanup/archival**:
```bash
python scripts/cleanup_archives.py \
  --database ./database \
  --archive-dir ./database/archives \
  --days-to-keep 30
```

## Data Access

### View Daily Data

Daily data is stored in hierarchical structure:

```bash
# View today's data for room 53463
cat database/仙林校区/19幢/19栋第16层1613-53463/$(date +%Y%m%d).json
```

### View Aggregated Summary

```bash
# View all room summaries
cat database/summary.json | jq '.rooms["53463"]'

# Output:
{
  "campus": "仙林校区",
  "building": "19幢",
  "room": "19栋第16层1613",
  "current_balance": 125.50,
  "avg_7d": 128.30,
  "avg_30d": 130.45,
  "trend_30d": -0.15,
  "min_30d": 120.00,
  "max_30d": 135.20,
  "last_updated": "2026-05-15T02:00:00Z"
}
```

### Access Archived Data

Archives are stored in `database/archives/`:

```bash
# Extract specific archive
cd database/archives
tar -xzf 2026-05.tar.gz

# Navigate to extracted data
cd 仙林校区/19幢/19栋第16层1613-53463/
ls
# 20260501.json  20260502.json  ...
```

## Troubleshooting

### Cookie Expired

**Symptom**: Workflow fails with authentication error

**Solution**:
1. Login to https://epay.nju.edu.cn
2. Export new cookie JSON
3. Update `EPAY_COOKIE` secret in GitHub
4. Re-run workflow

### Partial Query Failures

**Symptom**: Some rooms fail, entire batch rolled back

**Solution**:
1. Check error log in workflow output
2. Identify failed room IDs
3. Remove invalid IDs from `config/room_ids.txt`
4. Re-run workflow

### Archive Verification Failed

**Symptom**: Cleanup script reports corrupt archive

**Solution**:
1. Delete corrupt archive: `rm database/archives/YYYY-MM.tar.gz`
2. Re-run cleanup script
3. Archive will be regenerated from source files

### Workflow Quota Exhausted

**Symptom**: Workflow doesn't run, GitHub shows quota exceeded

**Solution**:
1. Check GitHub Actions usage in billing
2. Wait for monthly quota reset
3. Consider self-hosted runner or GitHub Pro upgrade

## Monitoring

### Workflow Notifications

GitHub automatically emails repository watchers on workflow failures.

**Enable notifications**:
1. Go to repository → Watch
2. Select "Custom" → "Actions"
3. Enable email notifications

### Log Access

Workflow logs are stored in `logs/query_runs/`:

```bash
# View today's log
cat logs/query_runs/$(date +%Y-%m-%d).log

# Search for errors
grep ERROR logs/query_runs/*.log
```

## Performance Expectations

| Metric | Target | Typical |
|--------|--------|---------|
| Query time (50 rooms) | < 5 min | ~3 min |
| Query time (500 rooms) | < 30 min | ~20 min |
| Summary generation | < 30 sec | ~10 sec |
| Archive creation | < 5 min | ~2 min |
| Repository growth | < 10 MB/month | ~5 MB/month |
| Summary file size | < 500 KB | ~200 KB |

## Next Steps

After successful setup:

1. **Monitor** first few automated runs via GitHub Actions
2. **Verify** data quality in `database/summary.json`
3. **Configure** static frontend to consume summary data
4. **Review** monthly archives after first month
5. **Adjust** retention periods as needed

## Support

For issues or questions:
1. Check workflow logs in `logs/query_runs/`
2. Review GitHub Actions workflow output
3. Consult data model documentation in `specs/001-daily-data-pipeline/data-model.md`
