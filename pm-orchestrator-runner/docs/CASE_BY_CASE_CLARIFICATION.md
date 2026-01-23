# Case-by-Case Clarification (AWAITING_RESPONSE)

This document describes the AWAITING_RESPONSE state and the case-by-case clarification flow in the PM Orchestrator Runner.

## Overview

When the AutoResolvingExecutor encounters a question that cannot be auto-resolved (case-by-case decision required), the task enters the `AWAITING_RESPONSE` state. This state is visible across all REPL commands and must be resolved via the `/respond` command before the task can continue.

## State Transitions

```
QUEUED -> RUNNING -> AWAITING_RESPONSE -> RUNNING -> COMPLETE
                          ^                  |
                          |                  v
                          +--- /respond ---+
```

## AWAITING_RESPONSE State

### When Does It Occur?

The AWAITING_RESPONSE state is triggered when:
1. AutoResolvingExecutor encounters a question during task execution
2. The LLM sentinel determines the question requires case-by-case decision
3. The question cannot be auto-resolved by matching existing preferences

### Task Properties

When a task is in AWAITING_RESPONSE state, the following properties are set:

```typescript
interface QueuedTask {
  id: string;                       // Task ID
  description: string;              // Task description
  state: 'AWAITING_RESPONSE';       // Current state
  clarificationQuestion: string;    // The question to answer
  clarificationReason?: string;     // Why it couldn't be auto-resolved
  // ... other properties
}
```

## REPL Commands

### `/tasks` - Shows [?] Marker

Tasks in AWAITING_RESPONSE state are shown with a `[?]` marker:

```
Task Queue

   1. [?] task-123456 - Create configuration file
         Question: Which format should I use? (YAML or JSON)
         Reason: Multiple valid approaches exist - user preference required
```

Summary includes AWAITING_RESPONSE count:
```
Summary: 0 RUNNING, 1 AWAITING_RESPONSE, 0 QUEUED, 3 COMPLETE
```

### `/status` - Shows Pending Information

The status command shows:

```
User Response Status:
  awaiting_user_response: true
  pending_task_id: task-123456
```

### `/logs <task-id>` - Shows Pending Question Details

When viewing logs for a task in AWAITING_RESPONSE state:

```
Task: task-123456
Status: AWAITING_RESPONSE
...

Pending Response Required:
  Question: Which format should I use? (YAML or JSON)
  Reason: Multiple valid approaches exist - user preference required
  How to respond: /respond <your answer>
```

### `/respond <answer>` - Resolves the Question

To resolve a pending question:

```
> /respond YAML

Response received: "YAML"
Task task-123456 continuing...
```

#### Fail-Closed Behavior

If no task is awaiting response:

```
> /respond something

Error: No tasks awaiting response - nothing to respond to
       Use /tasks to check task states.
       Use /logs <task-id> to see what a task needs.
```

## Integration with AutoResolvingExecutor

### UserResponseHandler Callback

The REPL creates a `userResponseHandler` callback that:
1. Sets the task state to AWAITING_RESPONSE
2. Sets the clarificationQuestion and clarificationReason
3. Returns a Promise that resolves when `/respond` is called

```typescript
const userResponseHandler = async (
  question: string,
  options?: string[],
  context?: string
): Promise<string> => {
  // Set task to AWAITING_RESPONSE
  currentTask.state = 'AWAITING_RESPONSE';
  currentTask.clarificationQuestion = question;
  currentTask.clarificationReason = context;

  // Wait for /respond command
  return new Promise((resolve) => {
    pendingUserResponse = { resolve, taskId: currentTask.id };
  });
};
```

### Resolution Flow

When `/respond <answer>` is called:
1. The pending Promise is resolved with the user's answer
2. The task state transitions back to RUNNING
3. The AutoResolvingExecutor continues with the user's response

## Best Practice vs Case-by-Case

The LLM sentinel classifies questions into two categories:

### Best Practice (Auto-Resolved)
- Questions with industry-standard answers
- No user input required
- Example: "Should I use TypeScript strict mode?" -> "Yes" (best practice)

### Case-by-Case (Requires User Input)
- Questions requiring project-specific decisions
- User preference matters
- Example: "Which database should I use?" -> AWAITING_RESPONSE

## Error Handling

### No Pending Task
When `/respond` is called but no task is awaiting response, an error is returned with code E107.

### Multiple Awaiting Tasks
If multiple tasks are in AWAITING_RESPONSE state (rare), `/respond` targets the oldest task by `queuedAt` timestamp.

### Invalid Response
Invalid responses are passed to the executor, which may handle them appropriately or trigger another clarification.

## Testing

Integration tests are located at:
- `test/integration/awaiting-response-flow.test.ts`

Test scenarios include:
1. State transitions (RUNNING -> AWAITING_RESPONSE -> RUNNING)
2. `/tasks` [?] marker display
3. `/status` awaiting_user_response field
4. `/logs` pending question section
5. `/respond` fail-closed behavior
6. Full flow: AWAITING_RESPONSE -> /respond -> COMPLETE
7. Non-interactive mode handling
8. Error cases (no pending task, multiple awaiting tasks)

## Related Files

- `src/repl/repl-interface.ts` - REPL implementation with AWAITING_RESPONSE handling
- `src/executor/auto-resolve-executor.ts` - AutoResolvingExecutor with userResponseHandler
- `src/repl/commands/session.ts` - Session commands with userResponseHandler setup
