# PM Orchestrator Runner - Tutorial

This tutorial walks you through using the PM Orchestrator Runner to build a simple Node.js HTTP server with a `/health` endpoint.

## Prerequisites

- Node.js 18+ installed
- npm or npx available
- API key configured (one of the following):
  - Environment variable: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
  - Config file: Set via `/keys` command in REPL
  - Claude Code CLI configured (alternative: use `/provider claude-code`)

## Quick Start

### 1. Create a New Project

```bash
mkdir my-health-server
cd my-health-server
npm init -y
```

### 2. Initialize PM Orchestrator

Start the REPL and initialize the project:

```bash
pm repl
```

In the REPL, run:

```
/init
```

This creates the `.claude/` directory structure:
- `.claude/CLAUDE.md` - Project configuration
- `.claude/settings.json` - PM Orchestrator settings
- `.claude/agents/pm-orchestrator.md` - Agent configuration
- `.claude/rules/project-rules.md` - Project rules

### 3. Start a Session

```
/start
```

This initializes a new task session with a unique session ID.

### 4. Describe Your Task

Simply type your request in natural language:

```
Create a Node.js HTTP server with a /health endpoint that returns JSON { "status": "ok" }
```

The PM Orchestrator will:
1. Analyze your request
2. Create a task plan
3. Execute the implementation
4. Verify the result

### 5. Monitor Progress

Check the current status:

```
/status
```

View tasks:

```
/tasks
```

### 6. Review Results

Once complete, you should have:

**server.js**:
```javascript
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**test/server.test.js**:
```javascript
const assert = require('assert');
const http = require('http');

describe('Health Endpoint', () => {
  it('should return status ok', (done) => {
    // Test implementation
  });
});
```

### 7. Test the Server

```bash
node server.js
```

In another terminal:

```bash
curl http://localhost:3000/health
# Output: {"status":"ok"}
```

## REPL Commands Reference

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/init` | Initialize .claude/ directory structure |
| `/start [path]` | Start a new session |
| `/continue <id>` | Continue an existing session |
| `/status` | Show current session status |
| `/tasks` | List current tasks |
| `/model [name]` | Get or set the AI model |
| `/approve` | Approve continuation of INCOMPLETE session |
| `/exit` | Exit the REPL |

## Configuration

### Model Selection

View current model:
```
/model
```

Set a specific model:
```
/model claude-3-opus-20240229
```

Available models:
- `claude-sonnet-4-20250514`
- `claude-opus-4-20250514`
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

### Session Management

Sessions are automatically tracked with unique IDs. You can:
- Continue a paused session with `/continue <session-id>`
- Approve incomplete sessions with `/approve`

## Evidence-Based Verification

PM Orchestrator Runner uses evidence-based verification:

1. **Fail-Closed Design**: Tasks are marked INCOMPLETE until evidence confirms success
2. **Evidence Collection**: All outputs, test results, and artifacts are recorded
3. **Status Tracking**:
   - `COMPLETE` - All success criteria verified
   - `INCOMPLETE` - Work in progress or verification pending
   - `ERROR` - Execution failed
   - `NO_EVIDENCE` - No verification evidence found
   - `INVALID` - Invalid state detected

## CLI Usage

Besides the REPL, you can use CLI commands directly:

```bash
# Start a session on a project
pm start --project ./my-project

# Continue a session
pm continue session-2025-01-15-abc123

# Get session status
pm status session-2025-01-15-abc123
```

## Troubleshooting

### Session Not Found

If you get a "session not found" error:
1. Check the session ID with `/status`
2. Ensure you're in the correct project directory
3. Try starting a new session with `/start`

### Model Not Available

If you get model errors:
1. Check your Claude Code CLI configuration
2. Verify API access with `claude --version`
3. Try a different model with `/model`

### Evidence Directory Issues

If evidence collection fails:
1. Check write permissions in `.claude/evidence/`
2. Ensure sufficient disk space
3. Try reinitializing with `/init`

## Advanced Usage

### Custom Project Path

Start REPL with a specific project:
```bash
pm repl --project /path/to/project
```

### Evidence Directory

Specify custom evidence directory:
```bash
pm repl --evidence /path/to/evidence
```

### Validate Project

Validate project structure without executing:
```bash
pm validate --project ./project
```

## Next Steps

- Read the [Architecture Documentation](../src/docs/spec/) for system design details
- Explore the [API Reference](./API.md) for programmatic usage
- Check [Contributing Guide](../CONTRIBUTING.md) for development setup
