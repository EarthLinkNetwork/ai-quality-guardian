# TASK_PLAN.md - Docs-First Gate Implementation

## Task Breakdown

### Phase 1: Gate Implementation

| Task | Status | Description |
|------|--------|-------------|
| T1.1 | Done | Create diagnostics/docs-first.check.ts |
| T1.2 | Done | Implement file existence check (5 required docs) |
| T1.3 | Done | Implement AC-N extraction from ACCEPTANCE.md |
| T1.4 | Done | Implement evidence verification in EVIDENCE.md |
| T1.5 | Done | Implement declaration-only detection |

### Phase 2: Documentation

| Task | Status | Description |
|------|--------|-------------|
| T2.1 | Done | Create docs/SPEC.md |
| T2.2 | Done | Create docs/TASK_PLAN.md (this file) |
| T2.3 | Done | Create docs/TEST_PLAN.md |
| T2.4 | Done | Create docs/ACCEPTANCE.md |
| T2.5 | Done | Create docs/EVIDENCE.md |

### Phase 3: Integration

| Task | Status | Description |
|------|--------|-------------|
| T3.1 | Done | Update package.json to add gate:docs |
| T3.2 | Done | Integrate gate:docs into gate:all |

### Phase 4: Testing

| Task | Status | Description |
|------|--------|-------------|
| T4.1 | Done | Create unit tests for docs-first.check.ts |
| T4.2 | Done | Create E2E test with .tmp/e2e-docs-first.log |
| T4.3 | Done | Verify REJECT -> FIX -> PASS flow |

---

## Phase 1: Settings UI Enhancement (Requirements A-H)

### P1.1: API Key Configuration (Requirement A)

| Task | Status | Description |
|------|--------|-------------|
| T1.1.1 | Pending | Add API key input field to Settings UI (password type) |
| T1.1.2 | Pending | Implement Show/Hide toggle for API key |
| T1.1.3 | Pending | Create DAL function for encrypted API key storage |
| T1.1.4 | Pending | Add AES-GCM encryption/decryption helpers |
| T1.1.5 | Pending | Implement masked display format (sk-...xxxx) |
| T1.1.6 | Pending | Add API endpoints: PUT /api/settings/api-key, GET /api/settings/api-key/status |

### P1.2: Provider/Model Dropdown UX (Requirement B)

| Task | Status | Description |
|------|--------|-------------|
| T1.2.1 | Pending | Change Provider from text to dropdown |
| T1.2.2 | Pending | Add model registry endpoint: GET /api/models?provider=xxx |
| T1.2.3 | Pending | Change Model from text to dynamic dropdown |
| T1.2.4 | Pending | Implement provider-change handler to reload models |
| T1.2.5 | Pending | Add pricing info to model dropdown options |

### P1.3: Save Button with Dirty State (Requirement C)

| Task | Status | Description |
|------|--------|-------------|
| T1.3.1 | Pending | Remove onchange auto-save behavior |
| T1.3.2 | Pending | Add dirty state tracking to Settings UI |
| T1.3.3 | Pending | Add Save button (disabled when clean) |
| T1.3.4 | Pending | Implement single-call batch save |
| T1.3.5 | Pending | Add loading/success/error states for save |
| T1.3.6 | Pending | Add "Unsaved changes" warning on navigation |

### P1.4: Two-Tier Settings (Requirement D)

| Task | Status | Description |
|------|--------|-------------|
| T1.4.1 | Pending | Add Global/Project tabs to Settings UI |
| T1.4.2 | Pending | Implement scope parameter in settings API |
| T1.4.3 | Pending | Create DAL function for effective settings merge |
| T1.4.4 | Pending | Add "(inherited from Global)" indicators |
| T1.4.5 | Pending | Add "Reset to Global" action |

### P1.5: Undefined Display Fix (Requirement E)

| Task | Status | Description |
|------|--------|-------------|
| T1.5.1 | Pending | Add default values to WebSettings type |
| T1.5.2 | Pending | Add validation/fallback in renderSettings() |
| T1.5.3 | Pending | Add default values in server settings initialization |

### P1.6: Namespace Convergence (Requirement F)

| Task | Status | Description |
|------|--------|-------------|
| T1.6.1 | Done | Verify REPL uses buildNamespaceConfig({ autoDerive: true }) |
| T1.6.2 | Done | Verify Web uses buildNamespaceConfig({ autoDerive: true }) |
| T1.6.3 | Done | Add namespace to Settings page display |

### P1.7: Agents Cleanup (Requirement G)

| Task | Status | Description |
|------|--------|-------------|
| T1.7.1 | Pending | Add TTL field (ttl_expires_at) to runner records |
| T1.7.2 | Pending | Add status filter dropdown to Agents page |
| T1.7.3 | Pending | Add "Purge Stale Agents" button with confirmation |
| T1.7.4 | Pending | Implement DELETE /api/runners/stale endpoint |

### P1.8: Task Settings Reflection (Requirement H)

| Task | Status | Description |
|------|--------|-------------|
| T1.8.1 | Pending | Add settings_snapshot field to task creation |
| T1.8.2 | Pending | Include settings_snapshot in task detail API response |
| T1.8.3 | Pending | Display settings snapshot in task detail UI |

---

## Dependencies

- Node.js >= 18
- TypeScript
- Mocha test framework
- ts-node for execution
- @aws-sdk/lib-dynamodb for DynamoDB operations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Gate too strict | Provide clear rejection messages with hints |
| Performance impact | Gate runs only on explicit check, not on every command |
| False positives | Allow configurable patterns for evidence detection |
| API key security | Use AES-GCM encryption, never log plaintext |
| Migration from memory settings | Implement fallback to env vars if DB empty |
