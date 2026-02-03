# 04_TRACEABILITY.md - Requirements Traceability Matrix

## 1. Overview

This document provides complete traceability from requirements through
specifications, implementations, and tests. Every requirement must have
a path to verification.

## 2. Traceability Matrix

### 2.1 Core Model Requirements

| Req ID | Requirement | Spec Location | Impl Location | Test Location | Status |
|--------|-------------|---------------|---------------|---------------|--------|
| REQ-001 | Project entity with CRUD | 01_PROJECT_MODEL.md:3.1-3.3 | src/models/project.ts | test/unit/project.test.ts | Complete |
| REQ-002 | Project status derived from tasks | 01_PROJECT_MODEL.md:2.2 | src/models/project.ts:deriveProjectStatus | test/unit/project.test.ts:deriveStatus | Complete |
| REQ-003 | Project lifecycle (ACTIVE/IDLE/ARCHIVED) | 01_PROJECT_MODEL.md:2.3 | src/models/project.ts | test/unit/project.test.ts:lifecycle | Complete |
| REQ-004 | Session entity per project | 02_SESSION_MODEL.md:3 | src/models/session.ts | test/unit/session.test.ts | Complete |
| REQ-005 | Thread entity per session | 02_SESSION_MODEL.md:4 | src/models/thread.ts | test/unit/thread.test.ts | Complete |
| REQ-006 | Task state machine | task-lifecycle.md:1-3 | src/models/task.ts | test/unit/task.test.ts | Complete |
| REQ-007 | DynamoDB persistence | dynamodb.md:2 | src/dal/*.ts | test/integration/dal.test.ts | Complete |

### 2.2 UI Requirements

| Req ID | Requirement | Spec Location | Impl Location | Test Location | Status |
|--------|-------------|---------------|---------------|---------------|--------|
| REQ-101 | Dashboard project list | 03_DASHBOARD_UI.md:2 | src/web/public/index.html | test/unit/ui-invariants.test.ts | Complete |
| REQ-102 | Status indicators (colors) | 03_DASHBOARD_UI.md:3 | src/web/public/index.html:CSS | diagnostics/ui-invariants.check.ts | Complete |
| REQ-103 | Navigation tree view | 03_DASHBOARD_UI.md:4 | src/web/public/index.html | test/unit/ui-invariants.test.ts | Complete |
| REQ-104 | Log viewer with auto-scroll | 03_DASHBOARD_UI.md:6 | src/web/public/index.html | diagnostics/web-boot.check.ts | Complete |
| REQ-105 | Real-time polling (2s) | 03_DASHBOARD_UI.md:7 | src/web/public/index.html | test/integration/polling.test.ts | Complete |

### 2.3 Agent Requirements

| Req ID | Requirement | Spec Location | Impl Location | Test Location | Status |
|--------|-------------|---------------|---------------|---------------|--------|
| REQ-201 | Agent registration | agent.md:2 | src/agent/register.ts | test/unit/agent.test.ts | Complete |
| REQ-202 | Heartbeat (10s) | agent.md:3 | src/agent/heartbeat.ts | test/integration/heartbeat.test.ts | Complete |
| REQ-203 | Task leasing | agent.md:4 | src/agent/lease.ts | test/unit/lease.test.ts | Complete |
| REQ-204 | Log streaming | agent.md:5 | src/agent/log-stream.ts | test/integration/log.test.ts | Complete |

### 2.4 API Requirements

| Req ID | Requirement | Spec Location | Impl Location | Test Location | Status |
|--------|-------------|---------------|---------------|---------------|--------|
| REQ-301 | REST API endpoints | api.md:2 | src/web/routes/*.ts | test/integration/api.test.ts | Complete |
| REQ-302 | Error handling | api.md:3 | src/web/middleware/error.ts | test/unit/error.test.ts | Complete |
| REQ-303 | Authentication | auth-and-rbac.md:2 | src/web/middleware/auth.ts | test/integration/auth.test.ts | Complete |

### 2.5 Quality Gate Requirements

| Req ID | Requirement | Spec Location | Impl Location | Test Location | Status |
|--------|-------------|---------------|---------------|---------------|--------|
| REQ-401 | Docs-first gate | testing-and-gates.md:2 | diagnostics/docs-first.check.ts | test/unit/docs-first.test.ts | Complete |
| REQ-402 | UI invariants gate | testing-and-gates.md:3 | diagnostics/ui-invariants.check.ts | test/unit/ui-invariants.test.ts | Complete |
| REQ-403 | Task state gate | testing-and-gates.md:4 | diagnostics/task-state.check.ts | test/unit/task-state.test.ts | Complete |
| REQ-404 | Spec coverage gate | testing-and-gates.md:5 | diagnostics/spec-coverage.check.ts | (self-check) | Complete |

## 3. Acceptance Criteria Cross-Reference

### 3.1 Project Model (01_PROJECT_MODEL.md)

| AC ID | Description | Test Method | Evidence Location |
|-------|-------------|-------------|-------------------|
| AC-PROJ-1 | Projects can be created | Unit test | test/unit/project.test.ts |
| AC-PROJ-2 | Status is derived | Unit test | test/unit/project.test.ts:deriveStatus |
| AC-PROJ-3 | Archive/restore works | Integration test | test/integration/project.test.ts |
| AC-PROJ-4 | Dashboard filters archived | E2E test | test/e2e/dashboard.test.ts |
| AC-PROJ-5 | Archived viewable with filter | E2E test | test/e2e/dashboard.test.ts |

### 3.2 Session Model (02_SESSION_MODEL.md)

| AC ID | Description | Test Method | Evidence Location |
|-------|-------------|-------------|-------------------|
| AC-SESS-1 | Auto-create sessions | Unit test | test/unit/session.test.ts |
| AC-SESS-2 | Manual naming | Unit test | test/unit/session.test.ts |
| AC-SESS-3 | Close session | Unit test | test/unit/session.test.ts |
| AC-SESS-4 | Thread creation | Unit test | test/unit/thread.test.ts |
| AC-SESS-5 | Thread title from prompt | Unit test | test/unit/thread.test.ts |
| AC-SESS-6 | Tree view in dashboard | E2E test | test/e2e/dashboard.test.ts |
| AC-SESS-7 | Runs link to tasks | Integration test | test/integration/run.test.ts |

### 3.3 Dashboard UI (03_DASHBOARD_UI.md)

| AC ID | Description | Test Method | Evidence Location |
|-------|-------------|-------------|-------------------|
| AC-DASH-1 | Project list with status | UI invariants gate | diagnostics/ui-invariants.check.ts |
| AC-DASH-2 | Status colors correct | UI invariants gate | diagnostics/ui-invariants.check.ts |
| AC-DASH-3 | Tree collapsible | E2E test | test/e2e/navigation.test.ts |
| AC-DASH-4 | Session hierarchy visible | E2E test | test/e2e/navigation.test.ts |
| AC-DASH-5 | Logs with auto-scroll | Web boot gate | diagnostics/web-boot.check.ts |
| AC-DASH-6 | Clarification banner | Web boot gate | diagnostics/web-boot.check.ts |
| AC-DASH-7 | Polling works | Integration test | test/integration/polling.test.ts |
| AC-DASH-8 | Responsive layout | E2E test | test/e2e/responsive.test.ts |
| AC-DASH-9 | Keyboard navigation | E2E test | test/e2e/keyboard.test.ts |

## 4. Spec Coverage Validation

### 4.1 Required Chapters

| Chapter | File | Status |
|---------|------|--------|
| 1 | overview.md | Complete |
| 2 | 01_PROJECT_MODEL.md | Complete |
| 3 | 02_SESSION_MODEL.md | Complete |
| 4 | task-lifecycle.md | Complete |
| 5 | dynamodb.md | Complete |
| 6 | 03_DASHBOARD_UI.md | Complete |
| 7 | web-ui.md | Complete |
| 8 | api.md | Complete |
| 9 | agent.md | Complete |
| 10 | auth-and-rbac.md | Complete |
| 11 | logging-and-audit.md | Complete |
| 12 | notifications.md | Complete |
| 13 | testing-and-gates.md | Complete |
| 14 | 04_TRACEABILITY.md | Complete |
| 15 | 05_INSPECTION_PACKET.md | Complete |

### 4.2 Validation Command

```bash
npm run gate:spec-coverage
```

## 5. Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-03 | Initial traceability matrix | System |
| - | Added UI requirements | - |
| - | Added quality gate requirements | - |
