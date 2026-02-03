# PM Orchestrator Runner - Specification Index

## Overview

This document serves as the master index for all specifications in pm-orchestrator-runner.
All specs are interconnected; read order matters for understanding dependencies.

## Reading Order (Recommended)

```
1. overview.md           ─→ System vision, architecture, key entities
2. 01_PROJECT_MODEL.md   ─→ Project entity definition (depends on overview)
3. 02_SESSION_MODEL.md   ─→ Session and Thread model (depends on project)
4. task-lifecycle.md     ─→ Task state machine (depends on session)
5. dynamodb.md           ─→ Data persistence schema (depends on all models)
6. 03_DASHBOARD_UI.md    ─→ Dashboard and Tree UI (depends on all models)
7. web-ui.md             ─→ General Web UI patterns
8. api.md                ─→ API design principles
9. agent.md              ─→ Agent registration and execution
10. auth-and-rbac.md     ─→ Authentication and authorization
11. logging-and-audit.md ─→ Logging infrastructure
12. notifications.md     ─→ Notification system
13. testing-and-gates.md ─→ Quality gates and testing strategy
14. 04_TRACEABILITY.md   ─→ Requirements traceability matrix
15. 05_INSPECTION_PACKET.md ─→ ChatGPT integration (inspection packets)
```

## Specification Chapters

### Core Models

| Chapter | File | Description | Status |
|---------|------|-------------|--------|
| 1 | `overview.md` | System vision, architecture, key entities | Complete |
| 2 | `01_PROJECT_MODEL.md` | Project entity: projectId, status, archive, lifecycle | Complete |
| 3 | `02_SESSION_MODEL.md` | Session, Thread, Run hierarchy | Complete |
| 4 | `task-lifecycle.md` | Task state machine and transitions | Complete |
| 5 | `dynamodb.md` | DynamoDB schema for all entities | Complete |

### User Interface

| Chapter | File | Description | Status |
|---------|------|-------------|--------|
| 6 | `03_DASHBOARD_UI.md` | Dashboard, project list, tree UI | Complete |
| 7 | `web-ui.md` | General Web UI patterns | Complete |
| 8 | `web-dashboard-and-logs.md` | Detailed dashboard and logs spec | Complete |

### Infrastructure

| Chapter | File | Description | Status |
|---------|------|-------------|--------|
| 9 | `api.md` | API design principles | Complete |
| 10 | `agent.md` | Agent registration and execution | Complete |
| 11 | `auth-and-rbac.md` | Authentication and authorization | Complete |
| 12 | `logging-and-audit.md` | Logging infrastructure | Complete |
| 13 | `notifications.md` | Notification system | Complete |

### Quality & Governance

| Chapter | File | Description | Status |
|---------|------|-------------|--------|
| 14 | `testing-and-gates.md` | Quality gates and testing strategy | Complete |
| 15 | `04_TRACEABILITY.md` | Requirements → Spec → Impl → Test mapping | Complete |
| 16 | `05_INSPECTION_PACKET.md` | ChatGPT integration (observation packets) | Complete |

## Dependency Graph

```
                    ┌──────────────────┐
                    │   overview.md    │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
   │01_PROJECT_MODEL│ │ agent.md      │ │auth-and-rbac  │
   └───────┬───────┘ └───────────────┘ └───────────────┘
           │
           ▼
   ┌───────────────┐
   │02_SESSION_MODEL│
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │task-lifecycle │
   └───────┬───────┘
           │
   ┌───────┴───────┐
   ▼               ▼
┌──────────┐  ┌──────────────┐
│dynamodb  │  │03_DASHBOARD_UI│
└──────────┘  └──────────────┘
                    │
                    ▼
           ┌────────────────┐
           │04_TRACEABILITY │
           └────────────────┘
                    │
                    ▼
           ┌────────────────────┐
           │05_INSPECTION_PACKET│
           └────────────────────┘
```

## Key Concepts Cross-Reference

| Concept | Primary Spec | Supporting Specs |
|---------|--------------|------------------|
| Project | 01_PROJECT_MODEL.md | dynamodb.md, overview.md |
| Session | 02_SESSION_MODEL.md | web-dashboard-and-logs.md |
| Task | task-lifecycle.md | dynamodb.md |
| Dashboard | 03_DASHBOARD_UI.md | web-dashboard-and-logs.md |
| Status (derived) | 01_PROJECT_MODEL.md | 03_DASHBOARD_UI.md |
| Lifecycle (ACTIVE/IDLE/ARCHIVED) | 01_PROJECT_MODEL.md | web-dashboard-and-logs.md |
| Archive | 01_PROJECT_MODEL.md | 03_DASHBOARD_UI.md |
| Inspection Packet | 05_INSPECTION_PACKET.md | - |
| Traceability | 04_TRACEABILITY.md | testing-and-gates.md |

## Acceptance Criteria Index

All acceptance criteria are tracked in `04_TRACEABILITY.md` with:
- Requirement ID
- Spec location (file:line)
- Implementation location
- Test location

## Spec Coverage Gate

The `gate:spec-coverage` diagnostic validates:
1. All chapters listed in this index exist
2. Required sections are present in each chapter
3. Traceability matrix is complete in docs/EVIDENCE.md

Run: `npm run gate:spec-coverage`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-03 | Initial index creation |
