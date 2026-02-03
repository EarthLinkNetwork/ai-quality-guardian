# TEST_PLAN.md - Docs-First Gate Testing Strategy

## Test Coverage

### Unit Tests

Location: `test/unit/diagnostics/docs-first.check.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-U1 | extractAcNumbers extracts AC-1, AC-2, etc. from content |
| TC-U2 | hasActualEvidence returns true for code blocks |
| TC-U3 | hasActualEvidence returns true for URLs |
| TC-U4 | hasActualEvidence returns true for image references |
| TC-U5 | isDeclarationOnly returns true for "done", "completed", etc. |
| TC-U6 | isDeclarationOnly returns false for content with evidence |
| TC-U7 | extractEvidenceForAc parses AC sections correctly |
| TC-U8 | checkDocsFirst fails when docs missing |
| TC-U9 | checkDocsFirst fails when AC format missing |
| TC-U10 | checkDocsFirst fails when evidence missing for AC |
| TC-U11 | checkDocsFirst fails when evidence is declaration-only |
| TC-U12 | checkDocsFirst passes when all requirements met |

### Integration Tests

Location: `test/integration/docs-first-gate.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-I1 | gate:docs command runs successfully |
| TC-I2 | gate:docs returns exit code 1 when docs missing |
| TC-I3 | gate:docs returns exit code 0 when all pass |
| TC-I4 | gate:all includes docs-first gate |

### E2E Test

Location: `scripts/e2e-docs-first.ts`
Log: `.tmp/e2e-docs-first.log`

| Test Case | Description |
|-----------|-------------|
| TC-E1 | Complete REJECT -> FIX -> PASS flow |
| TC-E2 | Log file contains all transitions |

---

## Phase 1: Settings UI Enhancement Test Plan

### API Key Configuration Tests (Requirement A)

Location: `test/unit/web/settings-api-key.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-A1 | API key input field renders as password type |
| TC-A2 | Show/Hide toggle reveals/masks API key |
| TC-A3 | API key is encrypted before storage (AES-GCM) |
| TC-A4 | API key is decrypted correctly on retrieval |
| TC-A5 | Masked display shows last 4 characters (sk-...xxxx) |
| TC-A6 | PUT /api/settings/api-key stores encrypted key in DynamoDB |
| TC-A7 | GET /api/settings/api-key/status returns configured=true/false |

### Provider/Model Dropdown Tests (Requirement B)

Location: `test/unit/web/settings-provider-model.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-B1 | Provider renders as dropdown (select element) |
| TC-B2 | Provider dropdown contains Anthropic and OpenAI options |
| TC-B3 | Model dropdown populates based on selected provider |
| TC-B4 | Selecting Anthropic shows claude-* models |
| TC-B5 | Selecting OpenAI shows gpt-* and o1-* models |
| TC-B6 | GET /api/models?provider=anthropic returns correct models |
| TC-B7 | GET /api/models?provider=openai returns correct models |
| TC-B8 | Model dropdown shows display name and pricing |

### Save Button Tests (Requirement C)

Location: `test/unit/web/settings-save.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-C1 | Save button exists on Settings page |
| TC-C2 | Save button is disabled on initial load (clean state) |
| TC-C3 | Save button becomes enabled when field is modified (dirty state) |
| TC-C4 | Modified fields have visual indicator |
| TC-C5 | Save button calls PUT /api/settings with all dirty fields |
| TC-C6 | Save button shows loading state during save |
| TC-C7 | Success feedback shown after successful save |
| TC-C8 | Error feedback shown after failed save |
| TC-C9 | Navigation away with dirty state shows warning |

### Two-Tier Settings Tests (Requirement D)

Location: `test/unit/web/settings-two-tier.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-D1 | Settings page has Global/Project tabs |
| TC-D2 | Global settings stored with SK=SETTINGS#GLOBAL |
| TC-D3 | Project settings stored with SK=SETTINGS#PROJECT#<id> |
| TC-D4 | Project view shows inherited values with indicator |
| TC-D5 | Reset to Global removes project-level override |
| TC-D6 | getEffectiveSettings merges global -> project correctly |

### Undefined Display Tests (Requirement E)

Location: `test/unit/web/settings-defaults.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-E1 | Provider never displays "undefined" |
| TC-E2 | Model never displays "undefined" |
| TC-E3 | Max tokens defaults to 4096 |
| TC-E4 | Temperature defaults to 0.7 |
| TC-E5 | Missing settings use default values |

### Namespace Convergence Tests (Requirement F)

Location: `test/integration/namespace-convergence.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-F1 | REPL and Web derive same namespace for same directory |
| TC-F2 | Settings page displays current namespace |
| TC-F3 | REPL /status shows same namespace as Web Settings |

### Agents Cleanup Tests (Requirement G)

Location: `test/unit/web/agents-cleanup.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-G1 | Runner records have ttl_expires_at field |
| TC-G2 | TTL is 24 hours after last_heartbeat |
| TC-G3 | Agents page has status filter dropdown |
| TC-G4 | Filter shows only Running/Stale/Stopped agents |
| TC-G5 | Purge Stale Agents button requires confirmation |
| TC-G6 | DELETE /api/runners/stale removes stale runners |

### Task Settings Reflection Tests (Requirement H)

Location: `test/unit/web/task-settings-snapshot.test.ts`

| Test Case | Description |
|-----------|-------------|
| TC-H1 | Task creation captures settings_snapshot |
| TC-H2 | GET /api/tasks/:id includes settings_snapshot |
| TC-H3 | Task detail UI shows settings that were used |
| TC-H4 | settings_snapshot contains provider, model, max_tokens, temperature |

---

## Test Execution

```bash
# Run unit tests
npm run test:unit -- --grep "docs-first"

# Run integration tests
npm run test:integration -- --grep "docs-first"

# Run E2E test
ts-node scripts/e2e-docs-first.ts

# Run all gates
npm run gate:all

# Run Settings UI tests
npm run test:unit -- --grep "settings"

# Run all tests
npm test
```

## Pass Criteria

### Docs-First Gate
- All unit tests pass (TC-U1 to TC-U12)
- All integration tests pass (TC-I1 to TC-I4)
- E2E test demonstrates REJECT -> FIX -> PASS flow
- Log file created at .tmp/e2e-docs-first.log

### Settings UI Enhancement
- All Settings tests pass (TC-A1 to TC-H4)
- No "undefined" values displayed in UI
- API key is never logged in plaintext
- Save button workflow works correctly
- Two-tier settings inheritance works correctly
