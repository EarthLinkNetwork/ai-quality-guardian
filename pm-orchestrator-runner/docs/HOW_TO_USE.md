# PM Orchestrator Runner - How to Use

## Overview

PM Orchestrator Runner is a fail-closed execution environment for Claude Code. It enforces a strict 7-phase lifecycle with evidence tracking and explicit continuation control.

## Prerequisites

Before using PM Orchestrator Runner, your project must have a valid `.claude` directory structure:

```
your-project/
  .claude/
    CLAUDE.md          # Required
    settings.json      # Required
    agents/            # Required directory
    rules/             # Required directory
```

## CLI Commands

### Start a New Session

```bash
pm start [--project <path>]
```

Starts a new execution session. If `--project` is not specified, uses the current working directory.

**Returns:** `ExecutionResult` with `session_id`, `overall_status`, `evidence_path`, `next_action`, and any `violations`.

### Continue an Existing Session

```bash
pm continue <session-id>
```

Resumes an existing session by its ID.

**Errors:**
- Missing session-id: ERROR
- Non-existent session-id: ERROR
- Completed/Failed session: ERROR (cannot resume)

### Check Session Status

```bash
pm status <session-id>
```

Returns the current status of a session.

### Validate Project Structure

```bash
pm validate [--project <path>]
```

Validates project structure without starting execution. Checks for required `.claude` directory and files.

## REPL Mode

Start the interactive REPL:

```bash
pm repl [--project <path>]
```

### Available REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands and current session info |
| `/init` | Create `.claude/` scaffold in current project |
| `/model` | Show current model |
| `/model <name>` | Set model (saved to `.claude/repl.json`) |
| `/start` | Start a new Runner session |
| `/continue <id>` | Continue an existing session |
| `/status` | Show current session status |
| `/tasks` | List tasks in current session |
| `/approve` | Approve continuation for INCOMPLETE sessions |
| `/exit` | Exit REPL |
| `/provider` | Show current provider |
| `/provider <name>` | Set provider (openai, anthropic, claude-code) |
| `/models` | List available models for current provider |
| `/keys` | Show API key status (SET/NOT SET) |
| `/keys set <provider> <key>` | Set API key for a provider |
| `/logs` | List task logs for current session |
| `/logs <task-id>` | Show task details |

### Natural Language Input

Any input not starting with `/` is treated as a task description and passed to the Runner's 7-phase lifecycle:

1. REQUIREMENT_ANALYSIS
2. TASK_DECOMPOSITION
3. PLANNING
4. EXECUTION
5. QA
6. COMPLETION_VALIDATION
7. REPORT

## API Key Configuration

### Using Environment Variables

Set API keys via environment variables (recommended for development):

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
```

### Using the Config File

API keys can also be stored in `~/.pm-orchestrator-runner/config.json`:

```bash
# In REPL
pm repl
> /keys set openai sk-...
> /keys set anthropic sk-ant-...
```

The config file is created with secure permissions (0600).

### Provider Selection

```bash
# Show current provider
> /provider

# Set provider
> /provider openai
> /provider anthropic
> /provider claude-code  # Uses Claude Code CLI

# List available models
> /models
```

### Key Setup Mode

If no API key is configured (neither environment variable nor config file), REPL enters **Key Setup Mode**:
- Only `/help`, `/keys`, `/provider`, and `/exit` commands are available
- Natural language tasks are blocked
- Set an API key to exit Key Setup Mode

## Configuration

### settings.json Schema

```json
{
  "task_limits": {
    "files": 5,       // 1-20, default: 5
    "tests": 10,      // 1-50, default: 10
    "seconds": 300    // 30-900, default: 300
  },
  "parallel_limits": {
    "subagents": 9,   // 1-9, default: 9
    "executors": 4    // 1-4, default: 4
  },
  "timeouts": {
    "deadlock_timeout_seconds": 60,    // 30-300, default: 60
    "operation_timeout_seconds": 120   // 10-600, default: 120
  },
  "evidence_settings": {
    "retention_days": 30,              // 1-365, default: 30
    "compression_enabled": true
  }
}
```

## Fail-Closed Behavior

PM Orchestrator Runner follows the fail-closed principle:

- Unknown commands result in ERROR
- Missing configuration files halt execution
- Invalid phase transitions are rejected
- Unknown states cause immediate halt
- No automatic continuation without explicit approval

## Overall Status Values

| Status | Meaning |
|--------|---------|
| COMPLETE | All tasks completed successfully |
| INCOMPLETE | Some tasks pending, requires `/approve` to continue |
| ERROR | An error occurred during execution |
| INVALID | Session state is invalid |
| NO_EVIDENCE | Required evidence is missing |

## Evidence Structure

Sessions are stored in the evidence directory:

```
.pm/sessions/
  session-<id>/
    session.json         # Session metadata
    executor_runs.jsonl  # Executor execution log
    evidence_index.json  # Evidence inventory
```

## Error Codes

| Range | Category |
|-------|----------|
| E1xx | Project/Configuration errors |
| E2xx | Execution Lifecycle errors |
| E3xx | Evidence errors |
| E4xx | Locking/Semaphore errors |
| E5xx | Claude Integration errors |

## Examples

### Basic Workflow

```bash
# 1. Initialize project
pm repl
> /init

# 2. Start a session
> /start

# 3. Submit a task
> Implement user authentication

# 4. Check status
> /status

# 5. If INCOMPLETE, approve and continue
> /approve
> /continue <session-id>

# 6. Exit
> /exit
```

### Non-Interactive Usage

```bash
# Validate first
pm validate --project /path/to/project

# Start execution
pm start --project /path/to/project

# Check status later
pm status session-abc123

# Continue if needed
pm continue session-abc123
```
