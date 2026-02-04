# Dev/Prod Separation Guide

## Overview

This document describes how to safely run pm-orchestrator-runner in a self-hosting scenario where the runner itself can be modified by Claude Code through the Web UI.

## Directory Structure

```
/opt/pm-runner/
├── prod/                    # Production deployment
│   ├── dist/               # Compiled production code
│   ├── state/              # Production state (DO NOT MODIFY DIRECTLY)
│   └── package.json
│
└── dev/                     # Development workspace
    ├── src/                 # Source code being modified
    ├── dist/               # Dev build output
    ├── state/              # Dev state (isolated)
    └── package.json
```

## Project Types

### Normal Project (`projectType: 'normal'`)
- Standard project monitored by the runner
- No special restrictions
- Used for typical development work

### Runner Dev Project (`projectType: 'runner-dev'`)  
- Indicates this project IS the pm-orchestrator-runner itself
- Changes here affect the runner's own code
- Extra safety measures:
  - All changes must pass `gate:all` before applying to prod
  - Changes are made to `/dev/` directory, not `/prod/`
  - Manual verification step before promotion

## Setting Up Dev/Prod Separation

### 1. Initial Setup

```bash
# Create directory structure
mkdir -p /opt/pm-runner/{prod,dev}

# Clone/copy runner to both locations
cp -r pm-orchestrator-runner/* /opt/pm-runner/prod/
cp -r pm-orchestrator-runner/* /opt/pm-runner/dev/

# Build production
cd /opt/pm-runner/prod && npm run build

# Start production server
PORT=3502 node dist/web/server.js --state-dir=/opt/pm-runner/prod/state
```

### 2. Register Dev Project

In the Web UI:
1. Go to Dashboard → Create Project
2. Set path to `/opt/pm-runner/dev`
3. Set project type to "Runner Dev"
4. Save

### 3. Making Changes

When modifying the runner through Chat:
1. Chat sends request → Plan created → Tasks dispatched
2. Claude Code makes changes in `/opt/pm-runner/dev/`
3. All changes are isolated from production

### 4. Applying Changes to Production

**Prerequisites for Apply:**
- `gate:all` must PASS
- EVIDENCE.md must document changes
- No uncommitted changes

**Manual Apply Process:**
```bash
# 1. Verify gate:all passes
cd /opt/pm-runner/dev && npm run gate:all

# 2. Build
npm run build

# 3. Stop production (graceful)
# (Use process manager or signal)

# 4. Copy built files to prod
cp -r dist/* /opt/pm-runner/prod/dist/

# 5. Restart production
cd /opt/pm-runner/prod && node dist/web/server.js --state-dir=/opt/pm-runner/prod/state
```

## State Persistence

### What is Persisted
- Conversation history (per project)
- AWAITING_RESPONSE messages
- Run history and logs
- Project settings (bootstrapPrompt, projectType)
- Session metadata

### Restart Recovery
After server restart:
1. All state is loaded from `state/` directory
2. Pending AWAITING_RESPONSE messages are recovered
3. Chat history is available in Web UI
4. Runs can be resumed if interrupted

## Safety Guarantees

### Isolation
- Dev changes never affect prod until manually promoted
- Each environment has separate state directories
- Port separation (dev: 3503, prod: 3502)

### Verification
- `gate:all` must pass before any promotion
- TypeScript compilation checks
- Unit and integration tests
- E2E tests verify UI functionality

### Recovery
- State is file-based (JSON) - easy to backup
- Git history tracks all code changes
- Rollback: simply restart with previous dist/

## Example Workflow

1. **User requests a feature via Chat:**
   ```
   User: Add a new API endpoint for health checks
   ```

2. **Runner creates Plan and Dispatches:**
   - Plan: Create health.ts route
   - Tasks: Implement endpoint, add tests

3. **Claude Code executes in dev:**
   - Modifies `/opt/pm-runner/dev/src/web/routes/health.ts`
   - Runs tests in dev environment

4. **Verification:**
   ```bash
   # In dev directory
   npm run gate:all
   # Output: ALL PASS
   ```

5. **Manual Promotion:**
   ```bash
   # After reviewing changes
   ./scripts/promote-to-prod.sh
   ```

## Troubleshooting

### State Corruption
```bash
# Backup current state
cp -r state/ state.backup/

# Reset state (loses history)
rm -rf state/
mkdir state/
```

### Port Conflicts
```bash
# Check what's running
lsof -i :3502
lsof -i :3503

# Kill if needed
kill -9 <PID>
```

### Build Failures
```bash
# Clean rebuild
rm -rf dist/ node_modules/
npm install
npm run build
```
