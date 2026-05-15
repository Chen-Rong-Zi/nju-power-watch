# Troubleshooting Guide

Common issues and solutions for the NJU Electricity Data Pipeline.

## Cookie Issues

### Issue: Cookie Expired

**Symptom**: Workflow fails with "Cookie expired or invalid" error

**Solution**:
1. Login to https://epay.nju.edu.cn
2. Open browser developer tools (F12)
3. Go to Application → Cookies → epay.nju.edu.cn
4. Export cookies using browser extension (EditThisCookie, Cookie Editor)
5. Go to GitHub repository → Settings → Secrets → Actions
6. Update `EPAY_COOKIE` secret with new cookie JSON
7. Re-run workflow to verify

**Prevention**: Renew cookies weekly (validity ~7 days)

### Issue: Invalid Cookie Format

**Symptom**: JSON decode error when parsing cookie

**Solution**:
Ensure cookie is in correct format:
```json
[
  {
    "name": "JSESSIONID",
    "value": "your-actual-value",
    "domain": "epay.nju.edu.cn"
  }
]
```

Common mistakes:
- ❌ Missing array brackets `[]`
- ❌ Wrong domain name
- ❌ Empty value field

## Query Failures

### Issue: Partial Query Failure

**Symptom**: Some rooms fail, entire batch rolled back

**Solution**:
1. Check workflow logs for specific error
2. Identify failed room IDs
3. Remove invalid IDs from `config/room_ids.txt`
4. Re-run workflow

**Common causes**:
- Room ID no longer exists (room demolished/renovated)
- Room ID is invalid
- Network timeout for specific room

### Issue: Authentication Failed for All Rooms

**Symptom**: All queries return 401/403 errors

**Solution**:
See "Cookie Expired" above - your session has expired

### Issue: Rate Limiting

**Symptom**: Queries timeout or fail intermittently

**Solution**:
- Default concurrency is 24 connections
- If experiencing rate limits, reduce in workflow:
  ```yaml
  python nju_electric_query.py -c 10 ...  # Reduce to 10 concurrent
  ```

## Workflow Issues

### Issue: Workflow Doesn't Run

**Symptom**: Scheduled workflow not triggering

**Possible causes**:
1. **GitHub Actions disabled**:
   - Go to repository Settings → Actions → General
   - Ensure "Allow all actions" is selected
   
2. **Workflow not on main branch**:
   - Workflows must be on default branch to run on schedule
   
3. **Cron syntax error**:
   - Verify cron expression in workflow file
   
4. **Free tier limits**:
   - Check GitHub Actions usage in billing
   - Free tier: 2000 minutes/month

### Issue: Workflow Timeout

**Symptom**: Workflow exceeds 30-minute timeout

**Solution**:
1. Reduce number of room IDs in config
2. Increase timeout in workflow file (max 6 hours)
3. Split into multiple workflow runs

### Issue: Git Push Failed

**Symptom**: Workflow completes but can't push changes

**Solution**:
1. Check if you have write access to repository
2. Verify GITHUB_TOKEN permissions
3. Check for merge conflicts

## Data Issues

### Issue: No Data Files Created

**Symptom**: Workflow succeeds but no JSON files in database

**Possible causes**:
1. **Directory permissions**:
   ```bash
   chmod 755 database/
   ```
   
2. **Room IDs empty**:
   Check `config/room_ids.txt` has valid IDs

### Issue: Summary File Too Large

**Symptom**: Summary.json exceeds 500KB

**Solution**:
1. Reduce number of rooms being tracked
2. Archive old data more aggressively
3. Split summary into multiple files by campus/building

### Issue: Archive Verification Failed

**Symptom**: Cleanup workflow reports corrupt archive

**Solution**:
1. Delete corrupt archive:
   ```bash
   rm database/archives/YYYY-MM.tar.gz
   ```
2. Re-run cleanup workflow
3. Archive will be regenerated from source files (if still available)

## Performance Issues

### Issue: Query Takes Too Long

**Symptom**: Daily query exceeds 30 minutes

**Solutions**:
1. **Reduce concurrency** (if rate limiting):
   ```bash
   python nju_electric_query.py -c 12 ...  # Half of default
   ```
   
2. **Split room list**:
   - Create multiple config files
   - Run separate workflows for each

3. **Network issues**:
   - Check GitHub Actions runner status
   - Consider self-hosted runner in China

### Issue: Aggregation Slow

**Symptom**: Summary generation takes > 30 seconds

**Solution**:
1. Ensure sufficient disk I/O
2. Reduce historical data range in aggregation script
3. Archive old data more frequently

## Testing Issues

### Issue: Tests Fail Locally

**Symptom**: pytest shows failures

**Solution**:
```bash
# Ensure dependencies installed
pip install -r requirements.txt

# Run tests with verbose output
pytest tests/ -v --tb=short

# Check for missing fixtures
pytest tests/ --collect-only
```

### Issue: Import Errors in Tests

**Symptom**: `ModuleNotFoundError: No module named 'scripts'`

**Solution**:
```bash
# Run tests from project root
cd /path/to/dorm_public
pytest tests/

# Or add to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
pytest tests/
```

## Recovery Procedures

### Recover from Complete Data Loss

1. **Clone repository fresh**:
   ```bash
   git clone <repository-url>
   cd dorm_public
   ```

2. **Reinstall dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure secrets**:
   - Update `EPAY_COOKIE` in GitHub

4. **Run manual query**:
   - Trigger "Manual Electricity Query" workflow
   - Verify data collection

5. **Generate summary**:
   ```bash
   python scripts/aggregate_data.py -d ./database -o ./database/summary.json
   ```

### Restore from Archives

```bash
# Navigate to archives
cd database/archives

# Extract specific month
tar -xzf 2026-05.tar.gz

# Files will be extracted to current directory
# Move to appropriate location
mv 仙林校区/ ../
```

## Getting Help

1. **Check logs**:
   ```bash
   cat logs/query_runs/$(date +%Y-%m-%d).log
   ```

2. **Review workflow output**:
   - Go to Actions tab in GitHub
   - Click on failed workflow run
   - Review step logs

3. **Validate configuration**:
   ```bash
   # Check room IDs
   cat config/room_ids.txt
   
   # Validate cookie
   python scripts/validate_cookie.py /tmp/cookie.json
   ```

4. **Check GitHub status**:
   - https://www.githubstatus.com/

5. **Open issue**:
   - Create issue in repository with:
     - Error message
     - Workflow run link
     - Steps to reproduce
