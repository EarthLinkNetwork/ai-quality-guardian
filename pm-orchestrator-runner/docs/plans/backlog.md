# Backlog

## Out of Scope for Phase 1

These features are intentionally excluded from the initial implementation but planned for future phases.

## Priority: High (Phase 2)

### B-001: WebSocket Real-time Updates

**Description:** Replace polling with WebSocket for real-time log streaming and status updates.

**Benefits:**
- Reduced server load (no polling)
- Lower latency for log updates
- Better UX

**Estimated Effort:** 3-5 days

---

### B-002: Email Notifications

**Description:** Send email notifications for critical events (task errors, awaiting response).

**Dependencies:**
- Email service (SendGrid, SES)
- User email verification

**Estimated Effort:** 2-3 days

---

### B-003: Slack Integration

**Description:** Send notifications to Slack channels.

**Dependencies:**
- Slack OAuth app
- Webhook configuration UI

**Estimated Effort:** 2-3 days

## Priority: Medium (Phase 3)

### B-004: Multi-Org Support

**Description:** Full multi-tenant support with org switching.

**Features:**
- User can belong to multiple orgs
- Org switcher in UI
- Billing per org

**Estimated Effort:** 1-2 weeks

---

### B-005: Agent Spawn from Web

**Description:** Start new agent processes from Web UI.

**Challenges:**
- Security (remote code execution)
- Process management
- SSH/tunneling

**Estimated Effort:** 1 week

---

### B-006: Full-text Log Search

**Description:** Search across all task logs with full-text search.

**Options:**
- OpenSearch
- Algolia
- DynamoDB streams + custom indexing

**Estimated Effort:** 1 week

---

### B-007: Task Dependencies/Workflows

**Description:** Define task dependencies and workflows.

**Features:**
- Task A must complete before Task B
- Parallel task execution
- Workflow templates

**Estimated Effort:** 2 weeks

## Priority: Low (Future)

### B-008: Custom RBAC Roles

**Description:** Define custom roles beyond owner/admin/member/viewer.

**Features:**
- Custom permission sets
- Role inheritance
- Fine-grained permissions

**Estimated Effort:** 1 week

---

### B-009: OAuth Providers

**Description:** Login with Google, GitHub, etc.

**Dependencies:**
- OAuth library
- Provider configuration

**Estimated Effort:** 3-5 days

---

### B-010: 2FA Support

**Description:** Two-factor authentication.

**Options:**
- TOTP (authenticator app)
- SMS
- Email

**Estimated Effort:** 3-5 days

---

### B-011: Audit Log Export

**Description:** Export audit logs for compliance.

**Formats:**
- CSV
- JSON
- SIEM integration

**Estimated Effort:** 2-3 days

---

### B-012: Single-Table DynamoDB Design

**Description:** Consolidate multiple tables into single-table design for cost/performance.

**Benefits:**
- Reduced costs
- Atomic operations
- Better query patterns

**Estimated Effort:** 1-2 weeks (migration)

---

### B-013: Mobile App

**Description:** iOS/Android app for monitoring and responding.

**Features:**
- Push notifications
- Task monitoring
- Respond to clarifications

**Estimated Effort:** 2-4 weeks

---

### B-014: API Rate Limiting

**Description:** Implement rate limiting on API endpoints.

**Implementation:**
- Token bucket algorithm
- Per-user limits
- DynamoDB-based tracking

**Estimated Effort:** 2-3 days

---

### B-015: Metrics Dashboard

**Description:** Analytics dashboard for task metrics.

**Metrics:**
- Tasks per day
- Average completion time
- Error rate
- Agent utilization

**Estimated Effort:** 1 week

## Completed

(None yet - implementation not started)
