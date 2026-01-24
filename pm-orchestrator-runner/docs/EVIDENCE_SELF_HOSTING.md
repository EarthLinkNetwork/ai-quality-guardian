# Self-Hosting Proof - Integrity Evidence

This document provides evidence for self-hosting integrity: the runner can manage its own development without state corruption.

## State Integrity Mechanisms

### 1. Init-Only Mode Guard

When `.claude` directory is missing, REPL enters init-only mode:

**Reproduction Steps:**
```bash
# 1. Create empty directory without .claude
mkdir /tmp/test-init-only
cd /tmp/test-init-only

# 2. Start REPL
pm --project /tmp/test-init-only

# Result: REPL enters init-only mode
# Only commands available: help, init, exit
```

**Implementation:**
- `src/repl/repl-interface.ts`: `validateProjectStructure()` method
- `src/config/configuration-manager.ts`: `loadConfiguration()` throws `E101_MISSING_CLAUDE_DIRECTORY`

**Test Evidence:**
- `test/unit/repl/repl-failclosed-startup.test.ts`
- `test/unit/repl/repl-init-only-mode.test.ts`

### 2. Key Setup Mode Guard

When no API key is configured, REPL enters key-setup mode:

**Reproduction Steps:**
```bash
# 1. Ensure no API key is set
unset OPENAI_API_KEY
unset ANTHROPIC_API_KEY

# 2. Start REPL with a valid project
pm --project /path/to/valid/project

# Result: REPL enters key-setup mode
# Only commands available: help, keys, provider, exit, templates, template, config
```

**Implementation:**
- `src/repl/repl-interface.ts`: Lines 785-830 (key-setup mode initialization)
- Non-interactive mode: fails closed immediately with exit code

**Test Evidence:**
- `test/unit/repl/key-setup-mode.test.ts`

### 3. QueueStore Task Restoration

On startup, tasks are restored from QueueStore with state normalization:

**Reproduction Steps:**
```bash
# 1. Submit task and kill REPL mid-execution
pm --project ./
> Create a test file
# Ctrl+C during execution

# 2. Restart REPL
pm --project ./

# Result: RUNNING tasks are reset to QUEUED
# Tasks resume from queue
```

**Implementation:**
- `src/repl/repl-interface.ts`: `restoreTasksFromQueueStore()` (Lines 640-680)
- RUNNING state is transient; reset to QUEUED on restart

**State Transitions (spec/20_QUEUE_STORE.md):**
```
QUEUED -> RUNNING -> COMPLETE | ERROR | CANCELLED | AWAITING_RESPONSE
AWAITING_RESPONSE -> RUNNING | CANCELLED | ERROR
```

**Test Evidence:**
- `test/acceptance/ac-7-state-restore.test.ts`
- `test/unit/queue/queue-store.test.ts`

### 4. AWAITING_RESPONSE Clarification Flow

Tasks requiring user clarification persist their state:

**Reproduction Steps:**
```bash
# 1. Submit ambiguous task
pm --project ./
> Create something

# Result: Task enters AWAITING_RESPONSE
# Clarification info persisted to QueueStore

# 2. Restart REPL
pm --project ./

# Result: AWAITING_RESPONSE tasks displayed
# User can respond with /respond command
```

**Implementation:**
- `src/repl/repl-interface.ts`: `syncTaskToQueueStore()` with clarification
- `src/queue/queue-store.ts`: `ClarificationRequest` interface

**Test Evidence:**
- `test/integration/awaiting-response-flow.test.ts`

### 5. Configuration File Validation (Fail-Closed)

Missing or corrupted configuration triggers fail-closed:

**Required Files (.claude directory):**
- `CLAUDE.md` - Project instructions
- `settings.json` - Configuration

**Required Directories (.claude directory):**
- `agents/` - Agent definitions
- `rules/` - Rule definitions

**Reproduction Steps:**
```bash
# 1. Create .claude with missing required file
mkdir -p /tmp/test-config/.claude/agents /tmp/test-config/.claude/rules
echo "{}" > /tmp/test-config/.claude/settings.json
# Note: CLAUDE.md is missing

# 2. Attempt to start
pm --project /tmp/test-config

# Result: E103_CONFIGURATION_FILE_MISSING error
# "Missing required file: CLAUDE.md in .claude directory"
```

**Implementation:**
- `src/config/configuration-manager.ts`: `validateRequiredStructure()` (Lines 167-191)
- Error codes: `E101`, `E103`, `E104`, `E105`

**Test Evidence:**
- `test/unit/config/configuration-manager.test.ts`

### 6. Session State Persistence

Session state is atomically persisted:

**Implementation:**
- `src/session/session-manager.ts`: `persistSession()` with atomic write
- `src/logging/task-log-manager.ts`: `atomicWriteFileSync()` with fsync

**Session State Fields:**
```typescript
{
  session_id: string;
  status: SessionStatus;
  current_phase: Phase;
  target_project: string;
  task_results: TaskResult[];
  overall_status: OverallStatus;
  resource_stats: ResourceStats;
  saved_at: string;
}
```

**Test Evidence:**
- `test/unit/session/session-manager.test.ts`

### 7. Executor Recovery Mode (E2E Testing)

Recovery scenarios can be simulated for testing:

**Environment Variables:**
- `PM_EXECUTOR_MODE=recovery-stub` - Enable recovery executor
- `PM_RECOVERY_SCENARIO=timeout|blocked|fail-closed`

**Implementation:**
- `src/executor/recovery-executor.ts`
- Production guard: `assertRecoveryModeAllowed()` fails with exit 1 if misused

**Test Evidence:**
- `test/unit/executor/recovery-executor.test.ts`
- `test/integration/executor-blocking.test.ts`

## Error Code Reference

| Code | Description | Fail-Closed Behavior |
|------|-------------|---------------------|
| E101 | Missing .claude directory | Enter init-only mode |
| E102 | Invalid project path | Reject initialization |
| E103 | Configuration file missing | Reject initialization |
| E104 | Schema validation failure | Reject initialization |
| E105 | Critical configuration corruption | Reject initialization |

## Validation Commands

Run these to verify self-hosting integrity:

```bash
# Full test suite
npm test

# Specific fail-closed tests
npm test -- --grep "fail-closed"

# Key setup mode tests
npm test -- --grep "key-setup"

# State restoration tests
npm test -- --grep "state-restore"

# Configuration validation tests
npm test -- --grep "configuration-manager"
```

## Summary

The pm-orchestrator-runner implements comprehensive fail-closed guards:

1. **Project validation**: Init-only mode when `.claude` missing
2. **API key validation**: Key-setup mode when credentials missing
3. **Task state restoration**: RUNNING reset to QUEUED on restart
4. **Clarification persistence**: AWAITING_RESPONSE survives restart
5. **Configuration validation**: Missing files trigger immediate error
6. **Atomic persistence**: Session state uses fsync for durability
7. **Recovery testing**: Controlled simulation of failure scenarios

All guards are tested and documented in the codebase.
