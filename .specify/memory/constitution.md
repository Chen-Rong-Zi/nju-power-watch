<!--
Sync Impact Report:
- Version change: 0.0.0 → 1.0.0 (initial ratification)
- Added principles:
  * I. Data-Business Separation
  * II. Static Frontend Architecture
  * III. Test-First Development (NON-NEGOTIABLE)
  * IV. Data Quality & Integrity
  * V. Progressive Enhancement
- Added sections: Technology Stack, Data Architecture
- Templates requiring updates:
  ✅ plan-template.md (verified compatible with constitution)
  ✅ spec-template.md (verified compatible with constitution)
  ✅ tasks-template.md (verified compatible with constitution)
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

## Technology Stack

**Core Technologies**:

- **Data Acquisition**: Python 3.8+ with aiohttp for async HTTP requests
- **Data Processing**: Python with pandas, numpy for analysis
- **Visualization**: Static HTML/CSS/JavaScript (framework TBD based on requirements)
- **Prediction**: Python with scikit-learn or similar (when prediction features added)
- **Testing**: pytest for Python, appropriate test framework for frontend

**Constraints**:

- No server-side rendering frameworks (React SSR, Next.js, etc.)
- No backend API server for frontend (frontend MUST work with static data)
- Cookie-based authentication for data acquisition only
- JSON MUST be the primary data interchange format

## Data Architecture

**Data Flow**:

```
Acquisition → Raw Data → Processing → Analyzed Data → Visualization
```

**Data Storage**:

- Raw data: JSON files in structured directory hierarchy (campus/building/room/date.json)
- Processed data: Aggregated JSON with analysis results
- Frontend data: Bundled static JSON files

**Data Contracts**:

- Data acquisition scripts MUST output to defined JSON schemas
- Processing scripts MUST accept defined input schemas and produce defined output schemas
- Frontend MUST consume defined visualization data schemas
- All schemas MUST be versioned and documented

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

**Version**: 1.0.0 | **Ratified**: 2026-05-15 | **Last Amended**: 2026-05-15
