# NJU Electricity Data Pipeline

Automated daily electricity data collection and analysis for Nanjing University dormitories.

## Overview

This project automates the collection, processing, and aggregation of electricity consumption data from the NJU epay system. It provides:

- **Daily automated data collection** via GitHub Actions
- **Data retention and archival** with 30-day rolling daily data and 365-day archives
- **Pre-aggregated summaries** for fast frontend visualization
- **Static architecture** - no backend server required

## Features

✅ Automated daily data collection at 2 AM UTC  
✅ Atomic batch operations with rollback on failure  
✅ Cookie-based authentication with validation  
✅ Monthly data archiving (tar.gz)  
✅ Pre-computed statistics for frontend  
✅ File-based JSON storage  
✅ GitHub Actions automation  
✅ **Data persistence via Git repository** - survives between workflow runs

## Important: Data Persistence

**How does data persist between GitHub Actions runs?**

GitHub Actions每次运行都是全新环境，数据通过以下方式持久化：

1. **只提交聚合数据**: 原始数据不提交，只提交 `database/summaries/`
2. **历史数据合并**: 每次运行加载旧的 summary，与新数据合并后提交
3. **完整历史保留**: **每个房间的 JSON 包含所有查询过的日期及余额**（无时间限制）
4. **节省空间**: Summary 比原始数据小 97%（~5.5MB/年 vs ~182MB/年）

**数据流**:
```
运行开始 → 检出仓库（包含完整历史 summary）
       ↓
查询新数据 → 写入原始 database/（临时）
       ↓
合并数据 → 加载旧 summary + 新数据 → 生成新 summary
       ↓
提交推送 → 只提交 summaries/（原始数据丢弃）
```

**空间估算**（500个房间）:
- 1年：~5.5MB
- 2年：~11MB
- 5年：~27.5MB

详见：[docs/data-persistence.md](docs/data-persistence.md)

**关键配置**:
- ✅ `database/{校区}/` **被** `.gitignore` 忽略（原始数据不提交）
- ✅ `database/summaries/` **不**被忽略（聚合数据提交）
- ✅ 每个 summary 包含**完整历史数据**（所有查询过的日期）

## Quick Start

### Test Frontend UI 🎨

快速验证前端数据显示功能：

```bash
# 启动本地服务器
python serve_frontend.py

# 浏览器访问
# http://localhost:8000/frontend/
```

**前端功能演示**：
- ✅ 三级筛选：校区 → 楼栋 → 房间
- ✅ 数据可视化：折线图显示电量变化趋势
- ✅ 统计信息：当前余额、7日/30日平均、最高/最低值
- ✅ 历史数据表格展示

详见：[frontend/README.md](frontend/README.md)

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
│   └── summaries/          # Hierarchical aggregated summaries
│       ├── overview.json   # All campuses overview
│       └── campuses/       # Campus → Building → Room hierarchy
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
# View overview (all campuses)
cat database/summaries/overview.json | jq

# View specific campus
cat database/summaries/campuses/仙林校区/summary.json | jq

# View specific building
cat database/summaries/campuses/仙林校区/buildings/19幢/summary.json | jq

# View specific room
cat database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json | jq
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
3. **Presentation**: Static frontend consumes hierarchical summaries (future)

**Data Flow**:
```
Daily Query → Raw JSON Files → Hierarchical Aggregation
                                     ↓
                            database/summaries/
                            ├── overview.json (all campuses)
                            └── campuses/
                                └── {campus}/
                                    ├── summary.json
                                    └── buildings/
                                        └── {building}/
                                            ├── summary.json
                                            └── rooms/{id}.json
```

See [docs/hierarchical-aggregation.md](docs/hierarchical-aggregation.md) for detailed usage.

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
