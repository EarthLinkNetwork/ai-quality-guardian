# BLOCKED Output Invariants Specification

## Overview

This document defines the invariants and acceptance criteria for BLOCKED status handling in the PM Orchestrator Runner. The core principle is **fail-closed with user feedback**: when execution cannot proceed, the system MUST provide actionable feedback to the user.

## Problem Statement

**Bug**: `AutoResolvingExecutor` returns BLOCKED status with empty output, causing operational failure. When the system transitions to `AWAITING_RESPONSE` state but provides no question/output, the user has no way to understand or resolve the issue.

**Impact**: Users see a blocked task with no explanation, making the system unusable.

## Invariants

### INV-1: BLOCKED Output Non-Empty Guard

```
INVARIANT: If status === 'BLOCKED', then output.trim().length > 0
```

When the executor returns BLOCKED status, the `output` field MUST contain at least one of:
1. A clarification question extracted from the execution output
2. A fallback question if no clarification was extractable

**Fallback question template**:
```
YES/NO: このタスクはコード変更を許可しますか？
(Do you permit code changes for this task?)
```

### INV-2: Non-DANGEROUS_OP Task BLOCKED Prohibition (AC D)

```
INVARIANT: If task_type !== 'DANGEROUS_OP', then status !== 'BLOCKED'
```

Only DANGEROUS_OP tasks may return BLOCKED status. All other task types MUST NOT return BLOCKED status. Instead:
- If information is missing → Return `AWAITING_RESPONSE` with a clarification question
- If execution fails → Return `ERROR` with error details

**Blockable Task Types** (explicit allow-list):
- `DANGEROUS_OP` - Destructive operations requiring explicit user confirmation

**Non-Blockable Task Types** (convert BLOCKED to INCOMPLETE):
- `READ_INFO` - Information requests
- `REPORT` - Report/summary generation
- `LIGHT_EDIT` - Small changes, bug fixes
- `IMPLEMENTATION` - File creation/modification
- `REVIEW_RESPONSE` - Code review responses
- `CONFIG_CI_CHANGE` - Configuration and CI/CD changes

**Rationale**: Per AC D (Guard Responsibility), the Guard should only block execution for destructive operations (DANGEROUS_OP) and forgery prevention. All other task types should proceed with execution, converting BLOCKED to INCOMPLETE with clarification.

### INV-3: Task Groups Non-Empty After Chat

```
INVARIANT: After POST /api/projects/:projectId/chat completes,
           GET /api/task-groups returns task_groups.length > 0
```

When a user sends a chat message, a task group MUST be created. Empty task groups indicate a system failure.

### INV-4: Thread Continuation Same TaskGroup

```
INVARIANT: For the same sessionId, all tasks belong to the same task_group_id
           1 Session = 1 TaskGroup (per SESSION_MODEL.md)
```

Multiple messages in the same session MUST accumulate in the same task group. Creating new task groups for the same session is a violation.

### INV-5: Persistence After Restart

```
INVARIANT: Given stateDir S and namespace N,
           tasks created before restart are visible after restart
```

FileQueueStore MUST persist task groups and tasks across server restarts. Data loss indicates a storage failure.

### INV-6: AWAITING_RESPONSE Reply UI Requirement

```
INVARIANT: If status === 'AWAITING_RESPONSE', then:
           1. output contains exactly one question
           2. The question is actionable (user can provide an answer)
           3. Reply UI (textarea) is rendered for user input
```

When a task requires user input, the system MUST provide a clear question and input mechanism.

## Acceptance Criteria

### AC-1: BLOCKED with Fallback Question

**Given**: An executor returns BLOCKED with empty output
**When**: AutoResolvingExecutor processes the result
**Then**: The result output is populated with a fallback question
**And**: The fallback question is actionable (YES/NO or specific question)

### AC-2: Non-DANGEROUS_OP Never BLOCKED (AC D)

**Given**: A task with task_type NOT equal to 'DANGEROUS_OP' (e.g., READ_INFO, REPORT, LIGHT_EDIT, IMPLEMENTATION, REVIEW_RESPONSE, CONFIG_CI_CHANGE)
**When**: Execution cannot proceed due to missing information
**Then**: Status is 'INCOMPLETE', NOT 'BLOCKED'
**And**: Output contains clarification or error information
**Rationale**: Per AC D, only DANGEROUS_OP tasks may return BLOCKED status. All other task types convert BLOCKED to INCOMPLETE.

### AC-3: Chat Creates Task Group

**Given**: A project exists
**When**: POST /api/projects/:projectId/chat is called with content
**Then**: A new task is created in the session's task group
**And**: GET /api/task-groups shows the task group with task_count > 0

### AC-4: Thread Continuation

**Given**: A session with sessionId 'test-session'
**And**: 3 chat messages sent in sequence
**When**: GET /api/task-groups is called
**Then**: Exactly one task group with task_group_id = 'test-session' exists
**And**: task_count = 3

### AC-5: Persistence After Restart

**Given**: A FileQueueStore with stateDir S and namespace N
**And**: Tasks created before "restart" (store recreation)
**When**: A new FileQueueStore is created with same S and N
**Then**: Previously created tasks are visible via GET /api/task-groups

### AC-6: AWAITING_RESPONSE Shows Reply UI

**Given**: A task in AWAITING_RESPONSE status
**When**: The task is displayed in the UI
**Then**: A reply textarea is visible
**And**: The clarification question is displayed
**And**: User can submit a response

## Implementation Requirements

### 1. BLOCKED Output Guard (INV-1)

Location: `src/executor/auto-resolve-executor.ts`

```typescript
// After receiving result from innerExecutor
if (result.status === 'BLOCKED' && (!result.output || result.output.trim().length === 0)) {
  // Add fallback question
  result.output = this.generateFallbackQuestion(task);
}
```

### 2. Non-DANGEROUS_OP BLOCKED Prohibition (INV-2, AC D)

Location: `src/executor/auto-resolve-executor.ts`

```typescript
// Allow-list of task types that can be BLOCKED (only DANGEROUS_OP)
export const BLOCKABLE_TASK_TYPES: string[] = ['DANGEROUS_OP'];

export function canTaskTypeBeBlocked(taskType?: string): boolean {
  return taskType !== undefined && BLOCKABLE_TASK_TYPES.includes(taskType);
}

// In execute() method:
if (result.status === 'BLOCKED') {
  const guardedResult = applyBlockedOutputGuard(result, task);

  // AC D: Only DANGEROUS_OP can be BLOCKED
  if (!canTaskTypeBeBlocked(task.taskType)) {
    return {
      ...guardedResult,
      status: 'INCOMPLETE' as const,
      error: guardedResult.output,
    };
  }
  return guardedResult;
}
```

### 3. Fallback Question Templates

```typescript
const FALLBACK_QUESTIONS = {
  default: 'YES/NO: このタスクはコード変更を許可しますか？\n(Do you permit code changes for this task?)',
  implementation: 'このタスクを実行するために、以下の情報を教えてください:\n1. 変更対象のファイル\n2. 期待する動作',
  blocked_timeout: 'タスクがタイムアウトしました。続行しますか？ (YES/NO)',
  blocked_interactive: '対話的な確認が必要です。続行を許可しますか？ (YES/NO)',
};
```

## E2E Test Mapping

| AC | E2E Test File |
|----|---------------|
| AC-1 | blocked-must-have-output.e2e.test.ts |
| AC-2 | implementation-never-blocked.e2e.test.ts |
| AC-3 | task-groups-not-empty-after-chat.e2e.test.ts |
| AC-4 | thread-continuation-no-new-taskgroup.e2e.test.ts |
| AC-5 | persistence-after-restart.e2e.test.ts |
| AC-6 | awaiting-response-reply-ui.e2e.test.ts |

## Related Documents

- `docs/SESSION_MODEL.md` - Session and TaskGroup relationship
- `spec/10_REPL_UX.md` - Non-interactive mode guarantees
- `spec/04_COMPONENTS.md` - Component architecture
- `docs/EVIDENCE.md` - Evidence documentation

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2025-02-07 | Initial specification |
