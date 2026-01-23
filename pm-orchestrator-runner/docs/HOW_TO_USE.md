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

## Web UI Mode

Web UI allows you to submit tasks and monitor queue status from a web browser. This is especially useful for external access via ngrok.

### Start Web UI Server

```bash
# Start in foreground (Ctrl+C to stop)
pm web [--port <number>] [--namespace <name>]

# Start in background (detached process)
pm web --background [--port <number>] [--namespace <name>]
```

**Options:**
- `--port <number>`: Server port (default: 5678)
- `--namespace <name>`: Queue namespace for state separation
- `--background`: Run server as a background daemon process

**Examples:**
```bash
# Start on default port (5678)
pm web

# Start on custom port
pm web --port 3000

# Start in background mode
pm web --background --port 5678

# Start with specific namespace
pm web --namespace dev --port 5679
```

### Stop Background Web Server

```bash
# Stop Web UI running on the current namespace
pm web-stop [--namespace <name>] [--port <number>]
```

**Options:**
- `--namespace <name>`: Stop server for specific namespace
- `--port <number>`: Stop server running on specific port

**Examples:**
```bash
# Stop web server for default namespace
pm web-stop

# Stop web server for 'dev' namespace
pm web-stop --namespace dev

# Stop web server on specific port
pm web-stop --port 5679
```

**Notes:**
- The `web-stop` command sends a graceful shutdown signal to the background process
- If the process does not respond, it will be forcefully terminated
- PID file is stored in the namespace state directory

### Queue Sharing Behavior

**Important:** All Web UI servers and REPL instances using the **same namespace** share the **same queue**.

- Same namespace = Same DynamoDB table = Same queue
- Different namespaces are completely isolated

| Namespace | DynamoDB Table Name | Default Port |
|-----------|---------------------|--------------|
| `default` | `pm-runner-queue` | 5678 |
| `stable`  | `pm-runner-queue-stable` | 5678 |
| `dev`     | `pm-runner-queue-dev` | 5679 |
| `<custom>`| `pm-runner-queue-<custom>` | 5680+ |

**Example: Multiple instances sharing a queue**
```bash
# Terminal 1: Start Web UI
pm web --namespace stable --port 5678

# Terminal 2: Start REPL (same namespace - shares queue)
pm repl --namespace stable

# Terminal 3: Start another Web UI (different namespace - separate queue)
pm web --namespace dev --port 5679
```

### Web UI REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/task-groups` | GET | List all task groups |
| `/api/task-groups` | POST | Create task group with first task |
| `/api/task-groups/:id/tasks` | GET | List tasks in a group |
| `/api/tasks` | POST | Submit a new task |
| `/api/tasks/:id` | GET | Get task details |
| `/api/tasks/:id/status` | PATCH | Update task status |

### Verification Steps

```bash
# 1. Start Web UI
pm web --port 5678

# 2. Health check
curl http://localhost:5678/api/health

# 3. Submit a task
curl -X POST http://localhost:5678/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_group_id":"test","prompt":"hello"}'

# 4. View task groups
curl http://localhost:5678/api/task-groups
```
