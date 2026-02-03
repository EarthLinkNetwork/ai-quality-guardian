# SPEC.md - Docs-First + Acceptance + Evidence Gate

## Overview

This document specifies the "Docs-First Gate" feature for pm-orchestrator-runner.
The gate enforces fail-closed documentation requirements before any task can be marked as PASS.

## Assumptions

- This project uses TypeScript with Mocha for testing
- The diagnostics/ directory contains gate check scripts
- npm run gate:all runs all quality gates
- Documentation files are located in docs/

## Requirements

### R1: Required Documentation Files

The following 5 files MUST exist in docs/ directory:

1. `docs/SPEC.md` - Feature specification
2. `docs/TASK_PLAN.md` - Implementation task breakdown
3. `docs/TEST_PLAN.md` - Test strategy and coverage
4. `docs/ACCEPTANCE.md` - Numbered acceptance criteria (AC-N format)
5. `docs/EVIDENCE.md` - Evidence for each AC with actual execution results

### R2: Acceptance Criteria Format

ACCEPTANCE.md must contain numbered criteria in the format:
- AC-1: [description]
- AC-2: [description]
- ...

### R3: Evidence Requirements

EVIDENCE.md must:
1. Reference ALL AC numbers from ACCEPTANCE.md
2. Contain actual execution results (not just declarations)
3. Include one or more of:
   - Command output (code blocks)
   - URLs
   - Screenshot references
   - Log snippets

### R4: Fail-Closed Behavior

If ANY of the above requirements are not met:
- The gate MUST return exit code 1 (FAIL)
- A specific rejection reason MUST be provided
- The task MUST NOT be marked as PASS

### R5: Integration with gate:all

The docs-first gate MUST be included in `npm run gate:all` so that all quality checks include documentation verification.

---

## Phase 1: Settings UI Enhancement Requirements

### R6: API Key Configuration (Requirement A)

**R6.1: API Key Input**
- Settings UI MUST provide a password-type input field for API key entry
- The input MUST be masked by default (show dots/asterisks)
- A "Show/Hide" toggle MUST be available

**R6.2: API Key Storage**
- API keys MUST be stored in DynamoDB (not in memory or local files)
- API keys MUST be encrypted at rest using the Web Crypto API with AES-GCM
- Storage location: `pm-runner-settings` table, scope = "project" or "global"

**R6.3: API Key Display**
- When an API key is configured, display masked format: `sk-...xxxx` (last 4 chars)
- Show "Configured" status badge when key exists
- Show "Not Configured" status badge when key is missing

### R7: Provider/Model Dropdown UX (Requirement B)

**R7.1: Provider Dropdown**
- Provider MUST be a dropdown (select) element, not text input
- Options: "Anthropic", "OpenAI"
- Default: "Anthropic" (if no saved preference)

**R7.2: Model Dropdown (Dynamic)**
- Model MUST be a dropdown populated based on selected provider
- Anthropic models: claude-opus-4-20250514, claude-sonnet-4-20250514, etc.
- OpenAI models: gpt-4o, gpt-4o-mini, o1, o1-mini, etc.
- Model dropdown MUST update when provider changes
- Show model display name and pricing info as option label

### R8: Explicit Save Button with Dirty State (Requirement C)

**R8.1: Save Button**
- Settings page MUST have an explicit "Save" button
- Save button MUST be disabled when no changes are pending (clean state)
- Save button MUST be enabled when changes are pending (dirty state)

**R8.2: Dirty State Tracking**
- UI MUST track which fields have been modified since last save/load
- Show visual indicator (e.g., asterisk, different color) for modified fields
- Show "Unsaved changes" warning when navigating away with dirty state

**R8.3: Save Operation**
- Save MUST persist all changed fields in a single API call
- Show loading state during save operation
- Show success/error feedback after save

### R9: Two-Tier Settings (Global/Project) (Requirement D)

**R9.1: Scope Selection**
- Settings UI MUST have a tab or toggle for "Global" vs "Project" settings
- Global settings apply to all projects in the namespace
- Project settings override global settings for the current project

**R9.2: Inheritance Display**
- When viewing Project settings, show effective value (inherited or overridden)
- Show "(inherited from Global)" indicator for non-overridden values
- Allow "Reset to Global" action to remove project-level override

**R9.3: Storage**
- Global: SK = `SETTINGS#GLOBAL`
- Project: SK = `SETTINGS#PROJECT#<project_id>`

### R10: Undefined Display Fix (Requirement E)

**R10.1: Default Values**
- All settings fields MUST have sensible defaults
- Never display "undefined" or "null" as field value
- Default provider: "anthropic"
- Default model: "claude-sonnet-4-20250514"
- Default max_tokens: 4096
- Default temperature: 0.7

**R10.2: Field Validation**
- Validate all fields before display
- Use fallback values for missing/invalid data

### R11: Namespace Convergence (Requirement F)

**R11.1: Consistent Namespace**
- REPL and Web UI MUST derive namespace from same source (project root)
- `deriveDefaultNamespace(projectRoot)` is the single source of truth
- Both interfaces MUST use `buildNamespaceConfig({ autoDerive: true })`

**R11.2: Namespace Display**
- Settings page MUST show current namespace
- Namespace MUST match between REPL `/status` and Web UI Settings

### R12: Agents Cleanup (Requirement G)

**R12.1: TTL for Runners**
- Runner records MUST have TTL based on last_heartbeat
- Default TTL: 24 hours after last heartbeat
- DynamoDB TTL attribute: `ttl_expires_at`

**R12.2: Status Filter**
- Agents page MUST support filtering by status
- Options: "All", "Running", "Stale", "Stopped"
- Default: "All"

**R12.3: Manual Purge**
- Provide "Purge Stale Agents" button
- Purge removes runners with status = "STOPPED" or last_heartbeat > 2 hours
- Confirm before purge action

### R13: Task Settings Reflection (Requirement H)

**R13.1: Settings Applied to Tasks**
- New tasks MUST use current settings (provider, model, max_tokens, temperature)
- Settings values MUST be captured at task creation time
- Task detail MUST show which settings were used

**R13.2: Settings in Task Response**
- `/api/tasks/:id` MUST include `settings_snapshot` field
- Snapshot contains: provider, model, max_tokens, temperature at creation time

---

## Non-Goals

- Automatic documentation generation (out of scope for this feature)
- Content quality assessment beyond format checks
- Integration with external documentation systems
- Multi-user authentication (single-user/local mode for Phase 1)
- API key rotation/expiry management
