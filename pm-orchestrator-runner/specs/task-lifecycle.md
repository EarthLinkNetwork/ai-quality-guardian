# Task Lifecycle Specification

## Tier-0 Rules: G-H

### Rule G: Single Pending Clarification
At most ONE task may be in AWAITING_RESPONSE state at any time.
If a second task requests clarification while another is pending,
the second task MUST queue until the first is resolved.

**Testable**: Attempting to set two tasks to AWAITING_RESPONSE throws or is rejected.

### Rule H: /respond Advances State
When the user issues `/respond <answer>`, the system MUST:
1. Locate the single AWAITING_RESPONSE task.
2. Store the response in `task.responseSummary`.
3. Transition the task from AWAITING_RESPONSE to RUNNING.
4. Resume execution with the provided answer.

If no task is awaiting response, `/respond` prints an error message.

**Testable**: After `/respond yes`, the previously AWAITING_RESPONSE task is RUNNING.

---

## Task States (v2.3)

```
QUEUED → RUNNING → COMPLETE
              ↓ → INCOMPLETE
              ↓ → ERROR
              ↓ → AWAITING_RESPONSE → RUNNING (via /respond)
              ↓ → WAITING_CHILDREN  → COMPLETE  (all children done)
                                    → ERROR     (any child errored)
                                    → AWAITING_RESPONSE (any child awaiting)
                                    → CANCELLED (rollback cascade)
```

### State Definitions
| State | Description |
|-------|-------------|
| QUEUED | Task accepted, waiting for agent slot |
| RUNNING | Agent is actively processing |
| WAITING_CHILDREN (v2.3) | Parent task waiting for its subtasks to complete |
| AWAITING_RESPONSE | Blocked on user clarification |
| COMPLETE | Successfully finished |
| INCOMPLETE | Finished but objectives not fully met |
| ERROR | Failed with error |
| CANCELLED | User cancellation or rollback cascade |

### Invariants
1. A task in QUEUED can only transition to RUNNING.
2. A task in RUNNING can transition to COMPLETE, INCOMPLETE, ERROR, AWAITING_RESPONSE, or **WAITING_CHILDREN**.
3. A task in AWAITING_RESPONSE can only transition to RUNNING (via /respond).
4. A task in WAITING_CHILDREN transitions to COMPLETE / ERROR / AWAITING_RESPONSE / CANCELLED based on aggregated child status (see `aggregateParentConversation` in `src/cli/index.ts`).
5. COMPLETE is the sole terminal state. ERROR / CANCELLED are recoverable via Retry.
6. At most one task may be AWAITING_RESPONSE at any time (Rule G).
7. **Rollback cascade**: If a task is rolled back (via checkpoint restore), the task AND all of its descendants transition to CANCELLED in a single operation. Checkpoint is owned by the root task only — see `spec/36_LIVE_TASKS_AND_RECOVERY.md` §5.

---

## Implementation References
- TaskQueueState: `src/repl/repl-interface.ts` (line ~266)
- QueuedTask interface: `src/repl/repl-interface.ts` (line ~278)
- /respond handler: `src/repl/repl-interface.ts`
