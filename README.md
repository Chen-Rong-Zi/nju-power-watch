# NJU Electricity Data Pipeline

Automated daily electricity data collection and analysis for Nanjing University dormitories.

> **📈 Scale**: Supports **60,000+ daily queries**  
> **💰 Cost**: **$0/month** with public repository  
> **⚡ Performance**: ~1 hour for 60k queries at 30 concurrency

## Overview

This project automates the collection, processing, and aggregation of electricity consumption data from the NJU epay system. It provides:

- **Daily automated data collection** via GitHub Actions
- **Data retention and archival** with 30-day rolling daily data and 365-day archives
- **Pre-aggregated summaries** for fast frontend visualization
- **Static architecture** - no backend server required
- **High performance** - optimized for large-scale queries (60k+ rooms)

## Features

✅ Automated daily data collection at 2 AM UTC  
✅ Atomic batch operations with rollback on failure  
✅ Cookie-based authentication with validation  
✅ Monthly data archiving (tar.gz)  
✅ Pre-computed statistics for frontend  
✅ File-based JSON storage  
✅ GitHub Actions automation  
✅ **Optimized for 60,000+ queries** with configurable concurrency  
✅ **Free unlimited usage** with public repository  

## Large-Scale Deployment

### GitHub Actions - Free Unlimited Usage

**Key Insight**: GitHub Actions is **free and unlimited** for public repositories!

| Repository Type | Free Minutes/Month | Actual Cost |
|----------------|-------------------|-------------|
| **Public** | **∞ Unlimited** | **$0** ✅ |
| Private (Free) | 2,000 | ~$258/month 💸 |
| Private (Pro) | 3,000 | ~$252/month 💸 |

**Recommendation**: Make repository **public** for free unlimited usage.

### Concurrency Optimization

For **60,000 queries**:

```yaml
# Recommended settings
Concurrency: 30
Timeout: 120 minutes
Estimated time: ~50 minutes
```

See [docs/concurrency-analysis.md](docs/concurrency-analysis.md) for detailed analysis.

### Performance Tuning

```bash
# Adjust concurrency based on your needs
python nju_electric_query.py -c 30  # Recommended: 30
python nju_electric_query.py -c 50  # Faster but higher risk
python nju_electric_query.py -c 20  # Safer but slower
```

See [docs/github-actions-guide.md](docs/github-actions-guide.md) for long-term usage guide.

## Quick Start

### Prerequisites

- Python 3.8+
- GitHub account with repository access
- Valid NJU epay system cookie

### Setup

1. **Configure GitHub Secrets**:
   - Go to repository Settings → Secrets → Actions
   - Add secret `EPAY_COOKIE` with your cookie JSON
   
   ```json
   [
     {
       "name": "JSESSIONID",
       "value": "your-session-id",
       "domain": "epay.nju.edu.cn"
     }
   ]
   ```

2. **Configure room IDs**:
   ```bash
   # Edit config/room_ids.txt
   echo "53463" >> config/room_ids.txt
   echo "53464" >> config/room_ids.txt
   ```

3. **Test locally**:
   ```bash
   # Install dependencies
   pip install -r requirements.txt
   
   # Export cookie to file
   echo '[{"name":"JSESSIONID","value":"your-value","domain":"epay.nju.edu.cn"}]' > /tmp/cookie.json
   
   # Test cookie validation
   python scripts/validate_cookie.py /tmp/cookie.json
   
   # Run manual query
   python nju_electric_query.py --cookie-file /tmp/cookie.json -d ./database 53463
   ```

4. **Enable GitHub Actions**:
   - Workflows are already configured in `.github/workflows/`
   - They will run automatically on schedule
   - Or trigger manually via Actions tab

### Manual Trigger

Go to Actions → "Manual Electricity Query" → Run workflow

## Project Structure

```
.
├── .github/workflows/      # GitHub Actions automation
│   ├── daily-query.yml     # Scheduled daily collection
│   ├── manual-query.yml    # Manual trigger workflow
│   └── data-cleanup.yml    # Monthly cleanup/archival
│
├── scripts/                # Processing scripts
│   ├── validate_cookie.py  # Cookie validation
│   ├── rollback_failed_run.py  # Rollback on failure
│   ├── cleanup_archives.py # Archive management
│   └── aggregate_data.py   # Summary generation
│
├── config/
│   └── room_ids.txt        # List of room IDs to query
│
├── database/               # Data storage (git-ignored)
│   ├── [campus]/[building]/[room-id]/[date].json  # Daily data
│   ├── archives/           # Monthly archives
│   └── summary.json        # Aggregated summary
│
├── logs/
│   └── query_runs/         # Workflow execution logs
│
├── tests/                  # Test suite
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
│
├── nju_electric_query.py   # Existing query script (unchanged)
└── list_room_ids.py        # Existing room ID script (unchanged)
```

## Data Access

### View Today's Data

```bash
# Find today's file
find database -name "$(date +%Y%m%d).json"

# View data
cat database/仙林校区/19幢/19栋第16层1613-53463/$(date +%Y%m%d).json | jq
```

### View Summary

```bash
# View aggregated summary
cat database/summary.json | jq

# View specific room
cat database/summary.json | jq '.rooms["53463"]'
```

### Extract Archives

```bash
# Extract specific month
cd database/archives
tar -xzf 2026-05.tar.gz
```

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md) for common issues and solutions.

## Development

### Run Tests

```bash
# Install dev dependencies
pip install -r requirements.txt

# Run all tests
pytest tests/

# Run specific test file
pytest tests/unit/test_validate_cookie.py -v
```

### Code Style

```bash
# Format code
black scripts/

# Lint code
ruff check scripts/
```

## Architecture

This project follows the **Data-Business Separation** principle:

1. **Data Acquisition**: `nju_electric_query.py` (unchanged)
2. **Data Processing**: `scripts/aggregate_data.py`, `scripts/cleanup_archives.py`
3. **Presentation**: Static frontend consumes `summary.json` (future)

## Monitoring

- GitHub Actions notifications on workflow failures
- Logs stored in `logs/query_runs/`
- Summary includes `query_success_rate` metric

## Maintenance

### Cookie Renewal (weekly)

1. Login to https://epay.nju.edu.cn
2. Export cookies as JSON
3. Update `EPAY_COOKIE` secret in GitHub
4. Verify with manual workflow trigger

### Archive Management

- Archives are created monthly (first day of month)
- Archives older than 365 days are automatically deleted
- Dry run available: trigger workflow with `dry_run: true`

## License

MIT

## Credits

Built with:
- Python 3.8+
- aiohttp (async HTTP)
- pandas/numpy (data processing)
- pytest (testing)
- GitHub Actions (automation)
