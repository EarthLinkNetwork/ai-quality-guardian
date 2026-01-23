# Stable/Dev Runner Guide

Per spec/21_STABLE_DEV.md - Stable and Development Runner Separation

## Overview

This guide explains how to run stable and development versions of PM Orchestrator Runner on the same machine without conflicts.

**Key Principle**: stable runner develops dev runner, not the reverse.

### Why stable cannot be broken by dev

- stable runner binary is installed separately (npm global or local node_modules)
- stable's state lives in its own namespace directory (`.claude/state/stable/`)
- stable's QueueStore uses its own DynamoDB table (`pm-runner-queue-stable`)
- `--project` only sets the working directory for file operations
- Even if dev source is corrupted, stable binary remains intact
- Worst case: delete dev worktree and re-clone; stable continues working

## Auto-Derived Namespace ("Same Folder = Same Queue")

Starting from v1.1.0, PM Orchestrator Runner automatically derives namespace from the project path. This ensures that:

- **Same folder always uses same queue** - No need to remember `--namespace` flag
- **Different folders never share queue** - Even with same folder name

### How It Works

When you run `pm repl` without `--namespace`, the runner automatically derives a namespace from your project path:

```
Format: {folder_name}-{path_hash_4_chars}

Examples:
  /Users/masa/dev/my-project     -> my-project-a1b2
  /Users/john/dev/my-project     -> my-project-c3d4  (different hash)
  /Users/masa/dev/another-project -> another-project-e5f6
```

### Priority Order

Namespace resolution follows this priority:

1. **Explicit `--namespace` option** (highest priority)
2. **`PM_RUNNER_NAMESPACE` environment variable**
3. **Auto-derived from project path** (default behavior)
4. **`default` namespace** (if auto-derive disabled)

### Examples

```bash
# Auto-derived namespace (recommended for most use cases)
pm repl --project /path/to/my-project
# Uses: my-project-xxxx (auto-derived)

# Explicit namespace (when you need specific name)
pm repl --namespace stable --project /path/to/my-project
# Uses: stable

# Environment variable (for CI/CD or scripts)
export PM_RUNNER_NAMESPACE=ci-runner
pm repl --project /path/to/my-project
# Uses: ci-runner
```

### Verifying Auto-Derived Namespace

Check current namespace via API:

```bash
# Health check shows namespace info
curl http://localhost:5678/api/health

# Response:
{
  "status": "ok",
  "timestamp": "2025-01-21T...",
  "namespace": "my-project-a1b2",
  "namespace_auto_derived": true,
  "table_name": "pm-runner-queue-my-project-a1b2",
  "state_dir": "/path/to/my-project/.claude/state/my-project-a1b2"
}

# Dedicated namespace endpoint
curl http://localhost:5678/api/namespace

# Response:
{
  "namespace": "my-project-a1b2",
  "auto_derived": true,
  "table_name": "pm-runner-queue-my-project-a1b2",
  "state_dir": "/path/to/my-project/.claude/state/my-project-a1b2",
  "port": 5678
}
```

### Folder Name Normalization

Folder names are normalized for valid namespace format:

| Original | Normalized |
|----------|------------|
| `MyProject` | `myproject` |
| `my_project` | `my-project` |
| `my.project@v2` | `myprojectv2` |
| `very-long-project-name-...` | (truncated to 27 chars) |

### When to Use Explicit Namespace

Use `--namespace` flag when:

1. **Stable/Dev separation** - `--namespace stable` or `--namespace dev`
2. **CI/CD pipelines** - Consistent namespace across runs
3. **Multiple runners same folder** - Different namespaces for parallel testing
4. **Backward compatibility** - Existing workflows using explicit namespace


## Directory Structure

```
/path/to/runners/
├── stable/                      # npm installed stable version
│   ├── node_modules/
│   │   └── pm-orchestrator-runner/
│   └── .claude/
│       └── state/
│           └── stable/          # state dir for --namespace=stable
│               └── evidence/
│
└── dev/                         # local development working tree
    ├── src/
    ├── test/
    ├── package.json
    └── .claude/
        └── state/
            └── dev/             # state dir for --namespace=dev
                └── evidence/
```

## State Separation

Each namespace maintains completely separate state:

| Component | stable | dev |
|-----------|--------|-----|
| QueueStore Table | `pm-runner-queue-stable` | `pm-runner-queue-dev` |
| State Directory | `.claude/state/stable/` | `.claude/state/dev/` |
| Web UI Port | 5678 | 5679 |
| Evidence Dir | `.claude/state/stable/evidence/` | `.claude/state/dev/evidence/` |

## Startup Commands

### Stable Runner

```bash
# Start stable runner with explicit namespace
pm repl --namespace stable --project /path/to/dev

# With custom port
pm repl --namespace stable --port 5678 --project /path/to/dev

# Non-interactive mode (for scripts)
pm repl --namespace stable --non-interactive --exit-on-eof
```

### Dev Runner (for testing)

```bash
# From dev working tree
cd /path/to/runners/dev
npm run dev -- repl --namespace dev

# Or after build
npm run build
node dist/cli/index.js repl --namespace dev
```

## Workflow: stable develops dev

### Step 1: Start stable runner

```bash
# From stable installation directory
cd /path/to/runners/stable

# Start stable REPL targeting dev source
pm repl --namespace stable --project /path/to/runners/dev
```

### Step 2: Edit dev code

From the stable REPL, edit dev source files:

```
> edit src/cli/index.ts
> edit src/queue/queue-store.ts
```

### Step 3: Test dev code

Run tests from stable REPL:

```
> !npm test
> !npm run typecheck
> !npm run lint
```

Or run directly:

```bash
# In a separate terminal
cd /path/to/runners/dev
npm test
```

### Step 4: Build dev code

```
> !npm run build
```

### Step 5: Verify dev changes

```bash
# Start dev runner to verify
cd /path/to/runners/dev
node dist/cli/index.js repl --namespace dev
```

### Step 6: Merge to stable

Once dev changes are verified:

```bash
# Publish dev as new stable version
cd /path/to/runners/dev
npm version patch
npm publish

# Update stable
cd /path/to/runners/stable
npm update pm-orchestrator-runner
```

## Conflict Detection

### Symptoms of Namespace Collision

1. **QueueStore collision**: Tasks from one namespace appear in another
   - Check: `GET /api/tasks` returns unexpected tasks
   - Fix: Verify `--namespace` flag is set correctly

2. **Web UI port conflict**: "EADDRINUSE" error on startup
   - Check: `lsof -i :5678` and `lsof -i :5679`
   - Fix: Use different `--port` values

3. **State directory collision**: Evidence files mixed
   - Check: `ls .claude/state/*/evidence/`
   - Fix: Verify `--namespace` flag is set correctly

### Verification Method

```bash
# Verify state separation

# 1. Check QueueStore tables (DynamoDB Local)
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Expected output:
# {
#     "TableNames": [
#         "pm-runner-queue-stable",
#         "pm-runner-queue-dev"
#     ]
# }

# 2. Check state directories
ls -la .claude/state/

# Expected output:
# drwxr-xr-x  stable/
# drwxr-xr-x  dev/

# 3. Check port allocation
lsof -i :5678  # Should show stable server
lsof -i :5679  # Should show dev server
```

## Self-Development Procedure

When developing PM Orchestrator Runner itself using stable:

### Prerequisites

```bash
# Install stable globally
npm install -g pm-orchestrator-runner

# Clone dev repository
git clone <repo> /path/to/runners/dev
cd /path/to/runners/dev
npm install
```

### Development Workflow

```bash
# 1. Start stable runner targeting dev
pm repl --namespace stable --project /path/to/runners/dev

# 2. Make changes to dev source (from REPL or editor)

# 3. Run dev tests (from REPL)
> !npm test

# 4. Build dev (from REPL)
> !npm run build

# 5. Test dev build manually
cd /path/to/runners/dev
node dist/cli/index.js repl --namespace dev

# 6. Verify changes work

# 7. Commit and publish
git add .
git commit -m "feat: ..."
npm version patch
npm publish
```

### Accident Prevention

Before publishing:

1. **Run full test suite**: `npm test` must pass
2. **Run type check**: `npm run typecheck` must pass
3. **Run lint**: `npm run lint` must pass
4. **Run build**: `npm run build` must succeed
5. **Manual verification**: Test the built version with `--namespace dev`

## Release Workflow (MUST DO After Every Task)

**CRITICAL**: Every completed task MUST follow this workflow. This is non-negotiable.

### The "One Set" Rule

Commit, Push, and Publish are a **single atomic operation**. You cannot do one without the others.

```bash
# After completing ANY task:

# 1. Build
npm run build

# 2. Copy public assets (if modified)
cp -r src/web/public/* dist/web/public/

# 3. Commit
git add .
git commit -m "feat: <description of changes>"

# 4. Bump version and publish
npm version patch  # or minor/major as appropriate
npm publish

# 5. Push (including tags)
git push && git push --tags
```

### Why This Matters

1. **Mobile Development**: PM Orchestrator is designed to be used from mobile devices via Web UI
2. **24/7 Development**: Changes must be immediately available for continuous development
3. **Rollback Safety**: Every commit is a safe point to return to if something breaks
4. **Version Tracking**: npm version creates git tags for precise version history

### Checklist for Every Task Completion

- [ ] `npm run build` succeeded
- [ ] Static assets copied to dist (if applicable)
- [ ] `git add .` (or specific files)
- [ ] `git commit -m "..."` with descriptive message
- [ ] `npm version patch` (creates version commit and tag)
- [ ] `npm publish` succeeded
- [ ] `git push && git push --tags`

### Never Do This

```bash
# WRONG: Commit without publish
git commit -m "feat: something"
git push
# Missing: npm version, npm publish

# WRONG: Publish without push
npm publish
# Missing: git push (others can't see the source)

# WRONG: Just "I'll do it later"
# This breaks the workflow for mobile/continuous development
```

## CLI Reference

### Namespace Options

| Option | Description | Default |
|--------|-------------|---------|
| `--namespace <name>` | Override auto-derived namespace | auto-derived from path |
| `--port <number>` | Web UI port | Based on namespace |

**Note**: Since v1.1.0, namespace is auto-derived from project path by default. Use `--namespace` to override.

### Namespace Resolution

Namespace is resolved in this order (first match wins):

1. `--namespace` CLI option
2. `PM_RUNNER_NAMESPACE` environment variable
3. Auto-derived from project path (format: `{folder}-{hash}`)

### Namespace Validation

Valid namespace names:
- Alphanumeric and hyphens only
- 1-32 characters
- Cannot start or end with hyphen
- Reserved names not allowed: `all`, `none`, `null`, `undefined`, `system`

Invalid namespaces cause immediate exit (fail-closed).

### Environment Variables

```bash
# Override namespace via environment (takes priority over auto-derive)
export PM_RUNNER_NAMESPACE=stable
pm repl  # Uses stable namespace instead of auto-derived

# Unset to use auto-derived namespace
unset PM_RUNNER_NAMESPACE
pm repl  # Uses auto-derived namespace
```

## Troubleshooting

### Q: Tasks are mixed between namespaces

**Cause**: Using same table name for both namespaces.

**Solution**: Verify `--namespace` flag is set correctly. Each namespace uses a different table: `pm-runner-queue-{namespace}`.

### Q: Web UI shows "port already in use"

**Cause**: Another instance is already running on that port.

**Solution**:
1. Check running processes: `lsof -i :5678`
2. Use different port: `--port 3002`
3. Stop existing instance first

### Q: Evidence files are in wrong directory

**Cause**: Namespace not set, using default state directory.

**Solution**: Set `--namespace` to ensure files go to correct state directory.

### Q: DynamoDB table not found

**Cause**: Table for namespace not created yet.

**Solution**: Tables are created automatically on first use. Ensure DynamoDB Local is running: `docker compose up -d dynamodb-local`

## Mobile Access via ngrok

Expose Web UI to mobile devices for testing:

```bash
# 1. Start stable runner with Web UI
pm repl --namespace stable --port 5678 --project /path/to/dev

# 2. In another terminal, start ngrok
ngrok http 5678

# 3. ngrok outputs a public URL:
#    Forwarding: https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:5678

# 4. Open the https URL on mobile browser
```

Notes:
- Free ngrok tier rotates URLs on restart
- For persistent URL, use ngrok paid plan or configure custom domain
- Web UI is read-only by default; task submission requires REPL
