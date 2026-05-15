---

description: "Task list for Daily Data Pipeline feature implementation"
---

# Tasks: Daily Data Pipeline

**Input**: Design documents from `/specs/001-daily-data-pipeline/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/, research.md, quickstart.md

**Tests**: Tests are REQUIRED per Constitution Principle III (Test-First Development NON-NEGOTIABLE)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `scripts/`, `config/`, `database/`, `logs/`, `tests/`, `.github/workflows/` at repository root
- Paths shown below follow this structure

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project directory structure per plan.md (scripts/, config/, database/archives/, logs/query_runs/, tests/unit/, tests/integration/)
- [x] T002 [P] Create config/room_ids.txt with placeholder room IDs
- [x] T003 [P] Create requirements.txt with dependencies (aiohttp, pandas, numpy, pytest, jsonschema)
- [x] T004 [P] Create .gitignore for database/, logs/, and temporary files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create tests/unit/conftest.py with shared fixtures for database paths and sample data
- [x] T006 [P] Create scripts/__init__.py to make scripts directory a Python package
- [x] T007 [P] Copy JSON schema contracts to tests/schemas/ for validation testing

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Daily Automated Data Collection (Priority: P1) 🎯 MVP

**Goal**: Automate daily electricity data collection via GitHub Actions with atomic batch operations and rollback on failure

**Independent Test**: Trigger GitHub Action workflow manually and verify new daily JSON files are created for all tracked rooms

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Create tests/unit/test_validate_cookie.py with test cases for valid/invalid/expired cookies
- [x] T009 [P] [US1] Create tests/unit/test_rollback_failed_run.py with test cases for partial rollback scenarios
- [x] T010 [P] [US1] Create tests/integration/test_daily_workflow.py with end-to-end workflow test

### Implementation for User Story 1

- [x] T011 [US1] Implement scripts/validate_cookie.py with cookie validation logic per research.md pattern
- [x] T012 [US1] Implement scripts/rollback_failed_run.py with atomic rollback logic per data-model.md
- [x] T013 [US1] Create .github/workflows/daily-query.yml with scheduled trigger at 2 AM UTC per research.md
- [x] T014 [US1] Create .github/workflows/manual-query.yml with workflow_dispatch trigger for ad-hoc runs
- [x] T015 [US1] Add cookie validation step to daily-query.yml workflow before batch query
- [x] T016 [US1] Add rollback step to daily-query.yml workflow on query failure
- [x] T017 [US1] Add logging to daily-query.yml workflow per FR-006 (success/failure counts, error details)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Data Retention and Storage Optimization (Priority: P2)

**Goal**: Automated cleanup strategy that archives old daily files and deletes ancient archives

**Independent Test**: Run cleanup script on test dataset and verify old daily files are compressed into monthly archives while recent data remains accessible

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T018 [P] [US2] Create tests/unit/test_cleanup_archives.py with test cases for archive creation, verification, and deletion
- [x] T019 [P] [US2] Create tests/integration/test_cleanup_workflow.py with end-to-end cleanup workflow test
- [x] T020 [US2] Implement scripts/cleanup_archives.py with archive creation logic per research.md tar.gz pattern
- [x] T021 [US2] Add archive verification to scripts/cleanup_archives.py with checksum validation per data-model.md
- [x] T022 [US2] Add old archive deletion to scripts/cleanup_archives.py (365-day retention) per FR-008
- [x] T023 [US2] Create .github/workflows/data-cleanup.yml with monthly schedule trigger
- [x] T024 [US2] Add logging to cleanup_archives.py per FR-006 (files archived, archives deleted)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Frontend-Ready Data Aggregation (Priority: P3)

**Goal**: Generate pre-aggregated summary JSON files for fast frontend loading

**Independent Test**: Generate aggregated JSON from daily data and verify summary file is under 500KB and loads in under 1 second

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T025 [P] [US3] Create tests/unit/test_aggregate_data.py with test cases for summary generation with various data scenarios
- [x] T026 [P] [US3] Create tests/integration/test_aggregation_workflow.py with end-to-end aggregation test
- [x] T027 [US3] Implement scripts/aggregate_data.py with rolling window aggregation per research.md pattern
- [x] T028 [US3] Add statistics computation to scripts/aggregate_data.py (current balance, 7-day avg, 30-day trend, min/max) per data-model.md
- [x] T029 [US3] Add schema validation to scripts/aggregate_data.py using contracts/summary.schema.json
- [x] T030 [US3] Add file size validation to scripts/aggregate_data.py (< 500KB per FR-008)
- [x] T031 [US3] Add aggregation step to daily-query.yml workflow after successful daily query
- [x] T032 [US3] Add logging to aggregate_data.py per FR-006 (rooms processed, summary size)

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T033 [P] Create README.md with quickstart instructions from quickstart.md
- [x] T034 [P] Create docs/troubleshooting.md with common issues and solutions from quickstart.md
- [x] T035 Code cleanup and remove debug logging
- [x] T036 [P] Add type hints to all Python scripts
- [x] T037 [P] Run all tests and verify 100% pass rate
- [x] T038 Verify quickstart.md instructions work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on US1 (operates on existing data files)
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Depends on daily data files existing, but independently testable with sample data

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Scripts before workflows
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Create tests/unit/test_validate_cookie.py"
Task: "Create tests/unit/test_rollback_failed_run.py"
Task: "Create tests/integration/test_daily_workflow.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Daily Collection)
   - Developer B: User Story 2 (Cleanup/Archival)
   - Developer C: User Story 3 (Aggregation)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
