<!--
Sync Impact Report:
- Version change: 1.0.0 → 1.1.0 (minor - new principles added)
- Added principles:
  * VI. Performance-First Development
  * VII. User-Behavior Driven Decomposition
  * VIII. Efficient Frontend Architecture
- Modified sections:
  * Technology Stack - expanded with performance constraints
  * Data Architecture - added performance optimization section
- Templates requiring updates:
  ✅ plan-template.md (verified compatible - Constitution Check section supports new principles)
  ✅ spec-template.md (verified compatible - supports performance requirements)
  ✅ tasks-template.md (verified compatible - supports performance tasks)
- Follow-up TODOs: None
-->

# NJU Electricity Analytics Constitution

## Core Principles

### I. Data-Business Separation

**All features MUST maintain strict separation between data acquisition, data processing, and presentation layers.**

- Data acquisition (collection scripts) MUST NOT contain visualization logic
- Business logic (analysis, prediction) MUST be independent of frontend framework
- Frontend MUST only consume processed data through well-defined interfaces
- Each layer MUST be independently deployable and testable
- Changes to visualization MUST NOT require changes to data acquisition code

**Rationale**: Decoupling enables independent evolution of each layer, simplifies testing, and allows technology substitution without cascading changes.

### II. Static Frontend Architecture

**The frontend MUST be a static site that can be served without server-side rendering.**

- Frontend MUST be pure HTML/CSS/JavaScript with no server dependencies
- All data MUST be loaded from static JSON files or client-side fetch from APIs
- Frontend MUST work when opened as local files (file:// protocol)
- Build process MUST produce deployable static assets only
- No backend server required for frontend to function

**Rationale**: Simplifies deployment, reduces hosting costs, improves performance, and enables offline usage.

### III. Test-First Development (NON-NEGOTIABLE)

**All features MUST follow strict TDD: Tests written → Approved → Tests fail → Then implement.**

- No implementation code without failing tests first
- Red-Green-Refactor cycle MUST be followed
- Tests MUST be approved by user before implementation begins
- Test coverage MUST be maintained for all business logic
- Integration tests REQUIRED for data pipelines

**Rationale**: Prevents regression, documents intended behavior, and ensures reliability of data analysis functions.

### IV. Data Quality & Integrity

**All data processing MUST preserve integrity and provide quality guarantees.**

- Data validation MUST occur at ingestion points
- Missing or malformed data MUST be handled explicitly with defined fallbacks
- Data transformations MUST be reversible or logged for audit
- All analysis outputs MUST include data source provenance
- Prediction models MUST report confidence intervals and error metrics

**Rationale**: Data analysis is only valuable if the underlying data is trustworthy and traceable.

### V. Progressive Enhancement

**Features MUST be built incrementally from simple to complex.**

- Start with data visualization before adding prediction
- Simple charts MUST work before complex analytics
- Each enhancement MUST leave previous functionality intact
- Users MUST be able to use basic features without advanced features
- No feature blocking dependencies on future planned features

**Rationale**: Enables early delivery of value, reduces risk, and allows iterative refinement based on user feedback.

### VI. Performance-First Development

**All features MUST be designed with performance as a primary constraint from the start.**

- Performance requirements MUST be defined before implementation begins
- Features processing >1000 records MUST include performance benchmarks
- Data loading operations MUST complete within 3 seconds for initial render
- User interactions MUST respond within 100ms for perceived instant feedback
- Memory-intensive operations MUST be lazy-loaded or paginated
- Performance degradation >50% from baseline MUST be documented and justified

**Performance Budgets**:
- Initial page load: <2 seconds on 3G network
- Time to Interactive: <3 seconds
- First Contentful Paint: <1 second
- Data processing: <100ms per 1000 records
- Chart rendering: <500ms for up to 100 data points

**Rationale**: Performance issues discovered late are expensive to fix. Building with performance constraints from the start ensures a responsive user experience and prevents technical debt.

### VII. User-Behavior Driven Decomposition

**Performance-intensive requirements MUST be decomposed into user-behavior driven sub-requirements.**

- Complex analysis features MUST be broken down by actual user workflows
- Each sub-feature MUST be independently deliverable and testable
- Background processing MUST be preferred over blocking UI operations
- Batch operations MUST support cancellation and progress indication
- Large datasets MUST be processed incrementally with user-controlled triggers
- Pre-computation MUST be used when possible to shift load from runtime to build time

**Decomposition Pattern**:
1. Identify user's actual workflow (not assumed behavior)
2. Extract data access patterns from workflow
3. Determine what can be pre-computed vs. computed on-demand
4. Split into: immediate response → background processing → progressive enhancement
5. Each stage MUST provide user value independently

**Rationale**: Large performance-intensive features often fail because they try to do everything at once. Breaking them down by actual user behavior enables incremental delivery, better UX, and easier performance optimization.

### VIII. Efficient Frontend Architecture

**Frontend implementation MUST prioritize efficient rendering and minimal re-computation.**

- DOM manipulation MUST be batched; no layout thrashing
- Event handlers MUST be debounced/throttled for high-frequency events
- Computed values MUST be cached and invalidated only when dependencies change
- Chart libraries MUST be loaded on-demand (lazy loading)
- Data fetching MUST use caching strategies (localStorage, memory cache)
- Network requests MUST be deduplicated for identical requests
- Memory leaks MUST be prevented through proper cleanup on page navigation

**Implementation Standards**:
- Use `requestAnimationFrame` for visual updates
- Implement virtual scrolling for lists >100 items
- Cache processed data with TTL (time-to-live) for freshness balance
- Prefetch data only for likely next user actions
- Use Web Workers for CPU-intensive calculations (>100ms)

**Rationale**: Frontend performance directly impacts user experience. Efficient patterns prevent jank, reduce memory usage, and ensure responsive interactions even with large datasets.

## Technology Stack

**Core Technologies**:

- **Data Acquisition**: Python 3.8+ with aiohttp for async HTTP requests
- **Data Processing**: Python with pandas, numpy for analysis
- **Visualization**: Static HTML/CSS/JavaScript (vanilla ES6+, Chart.js, ECharts)
- **Prediction**: Python with scikit-learn or similar (when prediction features added)
- **Testing**: pytest for Python, Playwright MCP for frontend automation

**Performance-Related Constraints**:

- No server-side rendering frameworks (React SSR, Next.js, etc.)
- No backend API server for frontend (frontend MUST work with static data)
- Cookie-based authentication for data acquisition only
- JSON MUST be the primary data interchange format
- Frontend bundle size MUST stay under 500KB (excluding chart libraries)
- Chart libraries loaded dynamically only when needed

**Performance Monitoring**:

- Build process MUST report bundle sizes
- Performance regression tests MUST be part of CI/CD
- Lighthouse score MUST stay above 80 for performance category

## Data Architecture

**Data Flow**:

```
Acquisition → Raw Data → Processing → Analyzed Data → Visualization
                                    ↓
                            Pre-computed Aggregates
```

**Performance Optimization Strategy**:

- Raw data: JSON files in structured directory hierarchy (campus/building/room/date.json)
- Pre-computed summaries: Aggregated JSON at building/campus/overview levels
- Frontend cache: localStorage with TTL for frequently accessed data
- Lazy loading: Detailed room data loaded only on user selection
- Pagination: Large datasets split into chunks for frontend consumption

**Data Storage**:

- Raw data: `{campus}/{building}/{room}-{id}/{date}.json`
- Summary data: `database/summaries/{level}.json` (pre-computed for fast access)
- Frontend data: Bundled static JSON files with versioning

**Data Contracts**:

- Data acquisition scripts MUST output to defined JSON schemas
- Processing scripts MUST accept defined input schemas and produce defined output schemas
- Frontend MUST consume defined visualization data schemas
- All schemas MUST be versioned and documented
- Schema changes MUST include migration paths for existing data

## Governance

**Amendment Process**:

1. Proposed changes MUST be documented with rationale
2. Impact assessment MUST be completed for existing features
3. User approval REQUIRED for principle changes
4. Migration plan MUST exist for breaking changes
5. Constitution version MUST be incremented per semantic versioning

**Versioning Policy**:

- MAJOR: Backward incompatible principle changes or removals
- MINOR: New principles or materially expanded guidance
- PATCH: Clarifications, wording improvements, typo fixes

**Compliance**:

- All code reviews MUST verify compliance with these principles
- Violations MUST be justified in writing before merge
- Complexity beyond these principles MUST be justified
- Runtime development guidance maintained in project documentation

**Performance Compliance**:

- Performance budgets MUST be validated before merge
- Performance regressions MUST block deployment
- Optimization proposals MUST include benchmark data

**Version**: 1.1.0 | **Ratified**: 2026-05-15 | **Last Amended**: 2026-05-18
