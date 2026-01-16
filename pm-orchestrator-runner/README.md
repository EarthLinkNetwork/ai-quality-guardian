# PM Orchestrator Runner

A CLI tool for orchestrated execution of Claude Code with evidence-based completion verification.

## Features

- Interactive REPL mode for Claude Code execution
- Evidence-based completion tracking (prevents "fake completion" reports)
- Two-stage timeout system (soft warning + hard terminate)
- Session management and persistence
- Non-interactive mode for scripting and automation

## Installation

```bash
# Global installation
npm install -g pm-orchestrator-runner

# Or use npx
npx pm-orchestrator-runner --help
```

## Quick Start

### Interactive Mode

```bash
# Start REPL in current directory
pm repl

# Start REPL with specific project
pm repl --project /path/to/project
```

### Non-Interactive Mode (Scripting)

```bash
# Pipe input
echo "Create a file called hello.txt with content Hello World" | pm repl --non-interactive --exit-on-eof

# Heredoc input
pm repl --non-interactive --exit-on-eof << 'EOF'
Create README.md with content "# My Project"
EOF
```

### Fixed Project Mode

For persistent verification root (useful for CI/CD):

```bash
pm repl --project-mode fixed --project-root /path/to/project
```

## Commands

| Command | Description |
|---------|-------------|
| `pm repl` | Start interactive REPL mode |
| `pm start <path>` | Start a new session on a project |
| `pm continue <id>` | Continue a paused session |
| `pm status <id>` | Get session status |
| `pm validate <path>` | Validate project structure |

## REPL Options

| Option | Description |
|--------|-------------|
| `--project <path>` | Project path (default: current directory) |
| `--evidence <path>` | Evidence directory |
| `--non-interactive` | Force non-interactive mode |
| `--exit-on-eof` | Exit when EOF is received |
| `--project-mode <mode>` | `temp` (default) or `fixed` |
| `--project-root <path>` | Verification root directory |

## REPL Commands

Inside the REPL:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/status` | Show current session status |
| `/tasks` | List all tasks |
| `/logs [task-id]` | Show task logs |
| `/session` | Show session info |
| `/quit` | Exit REPL |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SOFT_TIMEOUT_MS` | Soft timeout in milliseconds (default: 60000) |
| `HARD_TIMEOUT_MS` | Hard timeout in milliseconds (default: 120000) |
| `CLI_TEST_MODE` | Set to `1` for test mode (mock executor) |

## Requirements

- Node.js >= 18.0.0
- Claude Code CLI (`claude` command) installed

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
