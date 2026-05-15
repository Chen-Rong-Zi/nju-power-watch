# Implementation Plan: Daily Data Pipeline for Automated Electricity Data Collection

**Branch**: `001-daily-data-pipeline` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-daily-data-pipeline/spec.md`

## Summary

Automate daily electricity data collection from NJU epay system using existing Python scripts, with GitHub Actions scheduling, data retention/archival strategy, and pre-aggregated summary generation for static frontend consumption. Balances storage efficiency with frontend performance through tiered retention (30 days daily, 365 days archived).

## Technical Context

**Language/Version**: Python 3.8+ (existing scripts compatible)  
**Primary Dependencies**: aiohttp (async HTTP), pandas/numpy (data aggregation), pytest (testing), GitHub Actions (automation)  
**Storage**: File-based JSON storage in repository (database/ directory), monthly tar.gz archives  
**Testing**: pytest for Python scripts, integration tests for data pipeline  
**Target Platform**: GitHub Actions (Linux runner), static file serving via GitHub Pages or local file system  
**Project Type**: CLI tools + automation scripts (data acquisition and processing)  
**Performance Goals**: <30 min for 500 rooms daily collection, <1s frontend summary load time, <10MB/month storage growth  
**Constraints**: Cookie-based authentication (7-day validity), GitHub Actions free tier limits, university website rate limits (24 concurrent connections)  
**Scale/Scope**: Up to 500 rooms, 12 months historical data retention, single repository admin

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Data-Business Separation ✅

- **Status**: COMPLIANT
- **Analysis**: Feature maintains strict separation:
  - Data acquisition: `nju_electric_query.py` (unchanged, query-only)
  - Data processing: New aggregation/cleanup scripts (independent of acquisition)
  - Presentation: Static frontend consumes pre-aggregated JSON (future feature)
- **Evidence**: Existing scripts already follow separation; new scripts will continue this pattern

### II. Static Frontend Architecture ✅

- **Status**: COMPLIANT
- **Analysis**: Feature produces static JSON files that frontend can load:
  - Daily JSON files in hierarchical structure
  - Aggregated summary JSON for fast frontend loading
  - No backend server required for frontend
- **Evidence**: Spec explicitly requires pre-aggregated JSON files under 500KB

### III. Test-First Development (NON-NEGOTIABLE) ✅

- **Status**: REQUIRES ENFORCEMENT
- **Analysis**: TDD must be applied to:
  - New aggregation script (tests first)
  - Cleanup/archival script (tests first)
  - GitHub Actions workflow validation (integration tests)
- **Action Required**: All new scripts must have failing tests before implementation

### IV. Data Quality & Integrity ✅

- **Status**: COMPLIANT
- **Analysis**: Feature addresses data quality:
  - Atomic batch operations (all-or-nothing writes)
  - Validation before queries (cookie check)
  - Error logging with specific types
  - Rollback on partial failures
- **Evidence**: FR-003, FR-004, FR-006, FR-010 in spec

### V. Progressive Enhancement ✅

- **Status**: COMPLIANT
- **Analysis**: Feature priorities align with progressive enhancement:
  - P1: Basic daily collection (foundation)
  - P2: Storage optimization (operational improvement)
  - P3: Aggregation for frontend (performance enhancement)
- **Evidence**: User stories are independently testable and deliverable

**Gate Result**: PASS - All principles satisfied, TDD enforcement noted for implementation

## Project Structure

### Documentation (this feature)

```text
specs/001-daily-data-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (data contracts)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── daily-query.yml          # Daily data collection workflow
    ├── data-cleanup.yml         # Monthly cleanup/archival workflow
    └── manual-query.yml         # Manual trigger workflow

scripts/
├── aggregate_data.py            # Generate summary JSON from daily data
├── cleanup_archives.py          # Archive old daily files, delete old archives
├── validate_cookie.py           # Pre-flight cookie validation
└── rollback_failed_run.py       # Rollback partial results on failure

config/
└── room_ids.txt                 # List of room IDs to query

database/
├── [campus]/[building]/[room-id]/[date].json  # Daily data files
├── archives/                    # Monthly archive files
│   └── 2026-05.tar.gz          # Example archive
└── summary.json                 # Aggregated summary for frontend

logs/
└── query_runs/                  # Workflow execution logs
    └── 2026-05-15.log          # Example log file

tests/
├── unit/
│   ├── test_aggregate_data.py
│   ├── test_cleanup_archives.py
│   └── test_validate_cookie.py
└── integration/
    ├── test_daily_workflow.py
    └── test_cleanup_workflow.py

# Existing files (unchanged)
nju_electric_query.py
list_room_ids.py
```

**Structure Decision**: Single project structure with automation scripts in `scripts/`, configuration in `config/`, data storage in `database/`, and GitHub Actions workflows in `.github/workflows/`. Maintains separation between existing scripts (data acquisition) and new scripts (processing/management). Follows constitution principle of data-business separation.

## Complexity Tracking

> No constitution violations detected - no justification table needed.
