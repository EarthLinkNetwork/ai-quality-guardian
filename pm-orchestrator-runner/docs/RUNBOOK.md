# PM Orchestrator Runner - RUNBOOK

## Overview

This document provides operational procedures for the pm-orchestrator-runner package.

## Non-Blocking Task Input

### Feature Summary

The REPL input loop is separated from executor execution, allowing non-blocking task submission:

- Input loop accepts new tasks immediately (does not wait for current task to complete)
- Tasks are queued with state: QUEUED -> RUNNING -> COMPLETE/INCOMPLETE/ERROR
- `/tasks` command shows all tasks in queue with their states
- "Input is not blocked" message confirms non-blocking behavior

### Task States

| State | Description |
|-------|-------------|
| QUEUED | Task waiting in queue |
| RUNNING | Task currently executing |
| COMPLETE | Task finished successfully |
| INCOMPLETE | Task finished with partial completion |
| ERROR | Task failed with error |

### Commands

| Command | Description |
|---------|-------------|
| `/tasks` | Show task queue with states and summary |
| `/exit` | Exit REPL |
| `/help` | Show available commands |

### Evidence Collection

#### Case 3: Non-Blocking Proof

To prove that Task B can be submitted while Task A is RUNNING:

1. Start REPL: `pm repl`
2. Submit Task A (any task)
3. Immediately submit Task B (without waiting)
4. Run `/tasks` to see both tasks in queue
5. Evidence: Multiple "Task Queued" messages appear immediately

Expected output:
```
pm> Create file1.txt
Task Queued: task-xxx (Input is not blocked - you can submit more tasks)
pm> Create file2.txt
Task Queued: task-yyy (Input is not blocked - you can submit more tasks)
pm> /tasks
Task Queue:
  1. task-xxx [RUNNING] Create file1.txt
  2. task-yyy [QUEUED] Create file2.txt
Summary: 1 running, 1 queued, 0 complete
```

## Verification Commands

### Run All Tests
```bash
npm test
```

### Run Real-World Proof Collection
```bash
npm run proof:real
```

This runs 3 verification cases:
1. **autostart**: Verify REPL autostart works
2. **logs-consistency**: Verify output consistency across runs
3. **nonblocking**: Prove non-blocking task input

Evidence is saved to: `.claude/evidence/real-world-proof/<ISO_DATETIME>/`

### Run E2E Smoke Tests
```bash
npm run e2e:smoke
```

### Build Package
```bash
npm run build
npm pack
```

## Troubleshooting

### REPL does not start
- Ensure `npm run build` has been run
- Check that `dist/cli/index.js` exists

### Tasks stuck in RUNNING
- Use `/tasks` to check queue state
- Tasks should auto-recover via fail-closed mechanism
- If stuck, `/exit` and restart REPL

### Evidence collection fails
- Ensure write permissions to `.claude/evidence/` directory
- Check disk space

## Version History

- 1.0.6: Added non-blocking task input with task queue
