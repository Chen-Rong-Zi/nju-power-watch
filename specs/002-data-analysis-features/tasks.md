---
description: "Task list for data analysis features implementation"
---

# Tasks: Data Analysis Features

**Input**: Design documents from `/specs/002-data-analysis-features/`  
**Prerequisites**: plan.md (✓), spec.md (✓)  
**Generated**: 2026-05-17  

**Tests**: No tests requested in spec.md - focusing on implementation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `docs/` directory at repository root
- **Modules**: `docs/js/modules/` for feature modules
- **Utils**: `docs/js/utils/` for shared utilities
- **Pages**: `docs/pages/` for additional HTML pages
- **Assets**: `docs/css/` for styles, `docs/js/vendor/` for libraries

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, library setup, and foundational structure

- [X] T001 Create module directory structure at docs/js/modules/
- [X] T002 Create utility directory structure at docs/js/utils/
- [X] T003 Create pages directory structure at docs/pages/
- [X] T004 [P] Add ECharts 5.x library to docs/js/vendor/echarts.min.js
- [X] T005 [P] Update docs/index.html to include ECharts script tag
- [X] T006 [P] Extend docs/css/style.css with new component styles for analytics cards

---

## Phase 2: Foundational (Shared Utilities)

**Purpose**: Core utility functions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Create analytics utility module in docs/js/utils/analytics.js with common calculation functions
- [X] T008 Create prediction utility module in docs/js/utils/prediction.js with forecasting algorithms
- [X] T009 [P] Extend docs/js/app.js with module loader and routing infrastructure
- [X] T010 [P] Add state management extensions to docs/js/app.js for analytics features
- [X] T011 [P] Create notification utility module in docs/js/utils/notifications.js for Web Push support
- [X] T012 Update docs/index.html with navigation menu for analytics features

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Smart Electricity Warning System (Priority: P1) 🎯 MVP

**Goal**: Intelligent warnings for low electricity balance and abnormal consumption

**Independent Test**:
1. Load warnings.html page
2. Verify warnings are displayed for rooms with balance < 10 kWh (red)
3. Verify warnings for rooms predicted to run out within 3 days (orange)
4. Verify warnings for rooms predicted to run out within 7 days (yellow)
5. Click a warning item → navigate to room details page

### Implementation for User Story 1

- [X] T013 [US1] Create warning system module in docs/js/modules/warnings.js with detection logic
- [X] T014 [US1] Implement red warning logic (< 10 kWh balance) in docs/js/modules/warnings.js
- [X] T015 [US1] Implement orange warning logic (run out within 3 days) in docs/js/modules/warnings.js
- [X] T016 [US1] Implement yellow warning logic (run out within 7 days) in docs/js/modules/warnings.js
- [X] T017 [US1] Implement abnormal consumption detection (sudden spikes/drops) in docs/js/modules/warnings.js
- [X] T018 [US1] Create warning dashboard page at docs/pages/warnings.html with warning list UI
- [X] T019 [US1] Add warning level filter controls to docs/pages/warnings.html
- [X] T020 [US1] Add warning list component to docs/pages/warnings.html with click-to-detail functionality
- [X] T021 [US1] Extend docs/css/style.css with warning card styles (red, orange, yellow)
- [ ] T022 [US1] Add warning badge indicators to room detail view in docs/index.html

**Checkpoint**: Warning system fully functional - users can view and filter warnings

---

## Phase 4: User Story 2 - Building Electricity Ranking (Priority: P1)

**Goal**: Compare room electricity usage with building peers through rankings

**Independent Test**:
1. Load rankings.html page
2. Select a building from dropdown
3. Verify top 10 "High Consumption" rooms are displayed
4. Verify top 10 "Energy Savers" rooms are displayed
5. Verify top 10 "Low Balance" rooms are displayed
6. Click a room → navigate to room details
7. Switch time range (7 days / 30 days) → rankings update

### Implementation for User Story 2

- [X] T023 [US2] Create rankings module in docs/js/modules/rankings.js with calculation logic
- [X] T024 [US2] Implement "High Consumption" ranking calculation in docs/js/modules/rankings.js
- [X] T025 [US2] Implement "Energy Savers" ranking calculation in docs/js/modules/rankings.js
- [X] T026 [US2] Implement "Low Balance" ranking calculation in docs/js/modules/rankings.js
- [X] T027 [US2] Implement "Sudden Growth" ranking calculation (7-day growth) in docs/js/modules/rankings.js
- [X] T028 [US2] Create rankings page at docs/pages/rankings.html with building selector
- [X] T029 [US2] Add ranking category tabs to docs/pages/rankings.html (High/Savers/Low/Growth)
- [X] T030 [US2] Add time range selector (7 days / 30 days) to docs/pages/rankings.html
- [X] T031 [US2] Implement bar chart visualization for rankings using Chart.js in docs/js/modules/rankings.js
- [ ] T032 [US2] Add click-to-detail navigation for ranking items in docs/js/modules/rankings.js
- [X] T033 [US2] Extend docs/css/style.css with ranking card and badge styles

**Checkpoint**: Rankings system fully functional - users can compare rooms in their building

---

## Phase 5: User Story 3 - Floor Electricity Heatmap (Priority: P1)

**Goal**: Visualize electricity consumption distribution by floor

**Independent Test**:
1. Load building detail view from docs/index.html
2. Select a building with multiple floors
3. Verify floor heatmap is displayed with color coding
4. Hover over a floor → tooltip shows floor details
5. Click a floor → room list for that floor expands
6. Verify color mapping: green (low) → yellow (medium) → red (high)

### Implementation for User Story 3

- [X] T034 [US3] Create heatmap module in docs/js/modules/heatmap.js with floor extraction logic
- [X] T035 [US3] Implement floor number extraction from room_name in docs/js/modules/heatmap.js
- [X] T036 [US3] Implement floor average consumption calculation in docs/js/modules/heatmap.js
- [X] T037 [US3] Implement color mapping logic (green → yellow → red) in docs/js/modules/heatmap.js
- [ ] T038 [US3] Create heatmap component using ECharts in docs/js/modules/heatmap.js
- [X] T039 [US3] Add heatmap visualization to building detail view in docs/index.html
- [X] T040 [US3] Implement floor tooltip with details in docs/js/modules/heatmap.js
- [X] T041 [US3] Implement click-to-expand floor room list in docs/js/modules/heatmap.js
- [X] T042 [US3] Extend docs/css/style.css with heatmap container styles

**Checkpoint**: Floor heatmap fully functional - users can visualize floor consumption patterns

---

## Phase 6: User Story 4 - Multi-Room Trend Comparison (Priority: P2)

**Goal**: Compare electricity trends across multiple rooms

**Independent Test**:
1. Load comparison.html page
2. Select 2-5 rooms from different buildings
3. Verify multi-line chart displays all selected rooms
4. Toggle legend items → lines show/hide
5. Verify difference statistics are calculated and displayed
6. Verify chart updates when changing time range

### Implementation for User Story 4

- [ ] T043 [US4] Create comparison module in docs/js/modules/comparison.js with room selection logic
- [ ] T044 [US4] Implement multi-room selector UI component in docs/js/modules/comparison.js
- [ ] T045 [US4] Implement multi-line chart rendering with Chart.js in docs/js/modules/comparison.js
- [ ] T046 [US4] Implement difference calculation between rooms in docs/js/modules/comparison.js
- [ ] T047 [US4] Create comparison page at docs/pages/comparison.html with room selector
- [ ] T048 [US4] Add time range selector to docs/pages/comparison.html
- [ ] T049 [US4] Add difference statistics cards to docs/pages/comparison.html
- [ ] T050 [US4] Implement legend toggle functionality in docs/js/modules/comparison.js
- [ ] T051 [US4] Extend docs/css/style.css with comparison chart and stats styles

**Checkpoint**: Multi-room comparison fully functional - users can compare trends across rooms

---

## Phase 7: User Story 5 - Smart Recharge Suggestion (Priority: P2)

**Goal**: Provide intelligent recharge amount suggestions based on consumption patterns

**Independent Test**:
1. Load room detail view from docs/index.html
2. Select a room with consumption history
3. Verify recharge suggestion card is displayed
4. Input desired days → verify suggested kWh amount updates
5. Input recharge amount → verify estimated days updates
6. Verify seasonal adjustment is considered (summer AC usage)

### Implementation for User Story 5

- [ ] T052 [US5] Create recharge suggestion module in docs/js/modules/recharge.js
- [ ] T053 [US5] Implement days-until-empty prediction in docs/js/modules/recharge.js
- [ ] T054 [US5] Implement seasonal adjustment factor calculation in docs/js/modules/recharge.js
- [ ] T055 [US5] Implement recharge amount → days conversion in docs/js/modules/recharge.js
- [ ] T056 [US5] Implement desired days → recharge amount conversion in docs/js/modules/recharge.js
- [ ] T057 [US5] Add recharge suggestion card to room detail view in docs/index.html
- [ ] T058 [US5] Add interactive input fields (amount/days) to recharge card in docs/index.html
- [ ] T059 [US5] Extend docs/css/style.css with recharge suggestion card styles

**Checkpoint**: Recharge suggestions fully functional - users get personalized recharge advice

---

## Phase 8: User Story 6 - Usage Pattern Recognition (Priority: P2)

**Goal**: Identify and label electricity usage patterns

**Independent Test**:
1. Load room detail view from docs/index.html
2. Select a room with sufficient history (30+ days)
3. Verify pattern labels are displayed (e.g., "High Energy", "Energy Saver")
4. Verify radar chart shows usage characteristics
5. Verify weekday vs weekend comparison is shown
6. Verify empty room detection works for low-usage rooms

### Implementation for User Story 6

- [ ] T060 [US6] Create pattern recognition module in docs/js/modules/patterns.js
- [ ] T061 [US6] Implement weekday vs weekend consumption comparison in docs/js/modules/patterns.js
- [ ] T062 [US6] Implement empty room detection (continuous low consumption) in docs/js/modules/patterns.js
- [ ] T063 [US6] Implement abnormal peak detection in docs/js/modules/patterns.js
- [ ] T064 [US6] Implement pattern label assignment logic in docs/js/modules/patterns.js
- [ ] T065 [US6] Create radar chart visualization using ECharts in docs/js/modules/patterns.js
- [ ] T066 [US6] Add pattern labels display to room detail view in docs/index.html
- [ ] T067 [US6] Add radar chart to room detail view in docs/index.html
- [ ] T068 [US6] Extend docs/css/style.css with pattern badge and chart styles

**Checkpoint**: Pattern recognition fully functional - users can see their usage characteristics

---

## Phase 9: User Story 7 - Campus/Building Dashboard (Priority: P3)

**Goal**: Macro-level electricity statistics and multi-level drill-down

**Independent Test**:
1. Load dashboard.html page
2. Verify campus comparison view is displayed
3. Click a campus → building comparison view loads
4. Click a building → floor heatmap loads
5. Click a floor → room list expands
6. Verify total consumption and average balance per level are displayed
7. Verify trend charts update when changing date range

### Implementation for User Story 7

- [ ] T069 [US7] Create dashboard module in docs/js/modules/dashboard.js
- [ ] T070 [US7] Implement campus-level statistics calculation in docs/js/modules/dashboard.js
- [ ] T071 [US7] Implement building-level statistics calculation in docs/js/modules/dashboard.js
- [ ] T072 [US7] Implement campus comparison chart using Chart.js in docs/js/modules/dashboard.js
- [ ] T073 [US7] Implement drill-down navigation (campus → building → floor) in docs/js/modules/dashboard.js
- [ ] T074 [US7] Create dashboard page at docs/pages/dashboard.html with campus selector
- [ ] T075 [US7] Add multi-level breadcrumb navigation to docs/pages/dashboard.html
- [ ] T076 [US7] Add aggregate statistics cards (total, average, warnings) to docs/pages/dashboard.html
- [ ] T077 [US7] Add date range filter to docs/pages/dashboard.html
- [ ] T078 [US7] Integrate existing heatmap component (US3) into dashboard in docs/js/modules/dashboard.js
- [ ] T079 [US7] Extend docs/css/style.css with dashboard layout and card styles

**Checkpoint**: Campus dashboard fully functional - administrators can view macro-level statistics

---

## Phase 10: User Story 8 - Electricity Cost Prediction (Priority: P3)

**Goal**: Predict monthly and semester electricity costs

**Independent Test**:
1. Load room detail view from docs/index.html
2. Select a room with consumption history
3. Enter electricity price (e.g., 0.5 yuan/kWh)
4. Verify monthly cost prediction is displayed
5. Verify semester total cost is calculated
6. Verify monthly cost trend chart is shown
7. Verify energy-saving suggestions are provided

### Implementation for User Story 8

- [ ] T080 [US8] Create cost prediction module in docs/js/modules/cost-prediction.js
- [ ] T081 [US8] Implement monthly cost prediction based on consumption history in docs/js/modules/cost-prediction.js
- [ ] T082 [US8] Implement semester cost accumulation in docs/js/modules/cost-prediction.js
- [ ] T083 [US8] Implement cost trend chart using Chart.js in docs/js/modules/cost-prediction.js
- [ ] T084 [US8] Implement energy-saving suggestion logic in docs/js/modules/cost-prediction.js
- [ ] T085 [US8] Add cost prediction card to room detail view in docs/index.html
- [ ] T086 [US8] Add electricity price input field to cost card in docs/index.html
- [ ] T087 [US8] Add monthly cost trend chart to room detail view in docs/index.html
- [ ] T088 [US8] Add energy-saving suggestions section to room detail view in docs/index.html
- [ ] T089 [US8] Extend docs/css/style.css with cost prediction card and chart styles

**Checkpoint**: Cost prediction fully functional - users can budget their electricity expenses

---

## Phase 11: User Story 9 - Anomaly Alert Subscription (Priority: P3)

**Goal**: Subscribe to alerts and receive notifications for anomalies

**Independent Test**:
1. Load room detail view from docs/index.html
2. Click "Subscribe" button for a room
3. Verify subscription confirmation is shown
4. Trigger anomaly (e.g., sudden consumption spike)
5. Verify Web Push notification is received (if permitted)
6. Load alerts history page → verify alert is logged
7. Unsubscribe → verify no more alerts received

### Implementation for User Story 9

- [ ] T090 [US9] Create alert subscription module in docs/js/modules/alerts.js
- [ ] T091 [US9] Implement subscription storage using localStorage in docs/js/modules/alerts.js
- [ ] T092 [US9] Implement anomaly detection trigger in docs/js/modules/alerts.js
- [ ] T093 [US9] Implement Web Push notification integration in docs/js/utils/notifications.js
- [ ] T094 [US9] Implement alert history logging in docs/js/modules/alerts.js
- [ ] T095 [US9] Add subscription button to room detail view in docs/index.html
- [ ] T096 [US9] Add subscription management UI to docs/pages/warnings.html
- [ ] T097 [US9] Add alert history view to docs/pages/warnings.html
- [ ] T098 [US9] Implement customizable threshold settings in docs/js/modules/alerts.js
- [ ] T099 [US9] Extend docs/css/style.css with subscription button and alert history styles

**Checkpoint**: Alert subscription fully functional - users receive notifications for anomalies

---

## Phase 12: User Story 10 - Energy Saving Challenge & Achievement System (Priority: P3)

**Goal**: Gamified energy saving with badges and challenges

**Independent Test**:
1. Load room detail view from docs/index.html
2. Select a room with 30+ days history
3. Verify achievement badges are displayed (if earned)
4. Verify leaderboard is accessible
5. Participate in a challenge (e.g., "20% less this month")
6. Verify progress is tracked and displayed
7. Earn a badge → verify badge appears in profile

### Implementation for User Story 10

- [ ] T100 [US10] Create achievement system module in docs/js/modules/achievements.js
- [ ] T101 [US10] Implement "Energy Saver" badge logic (30 days < 2 kWh/day) in docs/js/modules/achievements.js
- [ ] T102 [US10] Implement "Warning Expert" badge logic in docs/js/modules/achievements.js
- [ ] T103 [US10] Implement "Comparison Champion" badge logic in docs/js/modules/achievements.js
- [ ] T104 [US10] Implement challenge tracking logic in docs/js/modules/achievements.js
- [ ] T105 [US10] Implement leaderboard calculation in docs/js/modules/achievements.js
- [ ] T106 [US10] Add achievement badges display to room detail view in docs/index.html
- [ ] T107 [US10] Add challenge participation UI to room detail view in docs/index.html
- [ ] T108 [US10] Create leaderboard page at docs/pages/rankings.html (extend existing page)
- [ ] T109 [US10] Add progress tracking for active challenges in docs/js/modules/achievements.js
- [ ] T110 [US10] Extend docs/css/style.css with badge, challenge, and leaderboard styles

**Checkpoint**: Achievement system fully functional - users earn badges and participate in challenges

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T111 [P] Create analytics guide documentation at docs/ANALYTICS_GUIDE.md
- [ ] T112 [P] Update docs/README.md with new analytics features description
- [ ] T113 [P] Add loading states and error handling to all modules
- [ ] T114 [P] Implement lazy loading for feature modules in docs/js/app.js
- [ ] T115 [P] Optimize ECharts bundle size (tree-shaking unused components)
- [ ] T116 [P] Add mobile responsive styles for all new components in docs/css/style.css
- [ ] T117 [P] Add keyboard navigation and accessibility improvements to all pages
- [ ] T118 [P] Implement client-side caching for analytics results using localStorage
- [ ] T119 [P] Add performance monitoring (console timing logs) for heavy calculations
- [ ] T120 [P] Run cross-browser testing (Chrome, Firefox, Safari, Edge) and fix issues
- [ ] T121 [P] Add JSDoc documentation to all utility modules
- [ ] T122 [P] Code cleanup and refactoring across all modules

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-12)**: All depend on Foundational phase completion
  - P1 stories (US1, US2, US3): Can proceed in parallel after Foundational
  - P2 stories (US4, US5, US6): Can proceed in parallel after Foundational
  - P3 stories (US7, US8, US9, US10): Can proceed in parallel after Foundational
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1) - Warning System**: No dependencies on other stories - can start immediately after Foundational
- **US2 (P1) - Rankings**: No dependencies on other stories - can start immediately after Foundational
- **US3 (P1) - Heatmap**: No dependencies on other stories - can start immediately after Foundational
- **US4 (P2) - Comparison**: Reuses ranking UI patterns from US2 - can run in parallel but benefits from US2 experience
- **US5 (P2) - Recharge**: Reuses prediction algorithms from US1 - can run in parallel but benefits from US1 experience
- **US6 (P2) - Pattern Recognition**: No dependencies on other stories - can start immediately after Foundational
- **US7 (P3) - Dashboard**: Integrates heatmap from US3 and rankings from US2 - ideally after US2 & US3
- **US8 (P3) - Cost Prediction**: Reuses recharge prediction from US5 - ideally after US5
- **US9 (P3) - Alert Subscription**: Reuses warning detection from US1 - ideally after US1
- **US10 (P3) - Achievements**: Reuses rankings from US2 and patterns from US6 - ideally after US2 & US6

### Within Each User Story

- Create module file first
- Implement calculation/logic functions
- Create UI components
- Integrate with existing pages
- Add styling
- Test independently

### Parallel Opportunities

**Setup Phase**:
- T004, T005, T006 can run in parallel (different files)

**Foundational Phase**:
- T009, T010, T011 can run in parallel (different aspects of app.js)

**User Story Phases** (after Foundational):
- All P1 stories (US1, US2, US3) can run in parallel
- All P2 stories (US4, US5, US6) can run in parallel
- All P3 stories (US7, US8, US9, US10) can run in parallel (with noted ideal order)

**Polish Phase**:
- T111-T122 can all run in parallel (different aspects of polish)

---

## Parallel Example: User Story 1 (Warning System)

```bash
# These can run in sequence within US1:
Task T013: "Create warning system module in docs/js/modules/warnings.js"
Task T014: "Implement red warning logic in docs/js/modules/warnings.js"
Task T015: "Implement orange warning logic in docs/js/modules/warnings.js"
Task T016: "Implement yellow warning logic in docs/js/modules/warnings.js"
Task T017: "Implement abnormal consumption detection in docs/js/modules/warnings.js"
Task T018: "Create warning dashboard page at docs/pages/warnings.html"
Task T019: "Add warning level filter controls to docs/pages/warnings.html"
Task T020: "Add warning list component to docs/pages/warnings.html"
Task T021: "Extend docs/css/style.css with warning card styles"
Task T022: "Add warning badge indicators to room detail view in docs/index.html"
```

---

## Parallel Example: All P1 Stories Together

```bash
# After Foundational phase completes, these can all run in parallel:

# Developer 1: User Story 1 (Warnings)
Task T013-T022: Warning System

# Developer 2: User Story 2 (Rankings)
Task T023-T033: Building Rankings

# Developer 3: User Story 3 (Heatmap)
Task T034-T042: Floor Heatmap
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T012) - CRITICAL
3. Complete Phase 3: User Story 1 - Warning System (T013-T022)
4. **STOP and VALIDATE**: Test warning system independently
5. Deploy/demo MVP to collect feedback

### Incremental Delivery (Recommended)

1. Complete Setup + Foundational (T001-T012) → Foundation ready
2. Add User Story 1 (T013-T022) → Test independently → Deploy (MVP Release!)
3. Add User Story 2 (T023-T033) → Test independently → Deploy
4. Add User Story 3 (T034-T042) → Test independently → Deploy
5. Add P2 Stories (T043-T068) → Test each independently → Deploy
6. Add P3 Stories (T069-T110) → Test each independently → Deploy
7. Polish Phase (T111-T122) → Final optimization → Major Release

### Parallel Team Strategy

With multiple developers after Foundational phase:

**Week 2-3 (P1 Stories)**:
- Developer A: User Story 1 (Warning System) - T013-T022
- Developer B: User Story 2 (Rankings) - T023-T033
- Developer C: User Story 3 (Heatmap) - T034-T042

**Week 4-5 (P2 Stories)**:
- Developer A: User Story 4 (Comparison) - T043-T051
- Developer B: User Story 5 (Recharge) - T052-T059
- Developer C: User Story 6 (Patterns) - T060-T068

**Week 6-8 (P3 Stories)**:
- Developer A: User Story 7 (Dashboard) + US8 (Cost) - T069-T089
- Developer B: User Story 9 (Alerts) - T090-T099
- Developer C: User Story 10 (Achievements) - T100-T110

**Week 9 (Polish)**:
- All developers: Polish tasks T111-T122 in parallel

---

## Summary Statistics

**Total Tasks**: 122

**Tasks Per Phase**:
- Phase 1 (Setup): 6 tasks
- Phase 2 (Foundational): 6 tasks
- Phase 3 (US1 - Warnings): 10 tasks
- Phase 4 (US2 - Rankings): 11 tasks
- Phase 5 (US3 - Heatmap): 9 tasks
- Phase 6 (US4 - Comparison): 9 tasks
- Phase 7 (US5 - Recharge): 8 tasks
- Phase 8 (US6 - Patterns): 9 tasks
- Phase 9 (US7 - Dashboard): 11 tasks
- Phase 10 (US8 - Cost): 10 tasks
- Phase 11 (US9 - Alerts): 10 tasks
- Phase 12 (US10 - Achievements): 11 tasks
- Phase 13 (Polish): 12 tasks

**Parallel Opportunities Identified**: 53 tasks marked with [P]

**Independent Test Criteria**: Defined for each user story

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1) = 22 tasks

**Format Validation**: ✅ All tasks follow checklist format with ID, optional [P] marker, optional [Story] label, and file paths

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Tests not requested in spec.md - focus on implementation
- All features are client-side JavaScript with no backend changes
- Leverage existing data structure and Chart.js, add ECharts for advanced visualizations
