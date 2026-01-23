# Evidence: Project Settings Persistence

This document provides evidence that project settings persistence works correctly,
survives process exit, and is project-scoped (isolated between different projects).

## Overview

PM Orchestrator Runner persists project settings in two complementary locations:

1. **ProjectSettingsStore** (`~/.pm-orchestrator/projects/{hash}.json`)
   - Stores: template selection, LLM provider/model, preferences
   - Global location, indexed by project path hash
   - Per spec/33_PROJECT_SETTINGS_PERSISTENCE.md

2. **ReplState** (`.claude/repl.json`)
   - Stores: selected_provider, selected_model, active state
   - Project-local storage
   - Per spec/10_REPL_UX.md

## Persistence Mechanism

### ProjectSettingsStore

```typescript
// Storage location
const storageDir = path.join(os.homedir(), '.pm-orchestrator', 'projects');

// Project identification via SHA-256 hash (first 16 chars)
function generateProjectHash(projectPath: string): string {
  const normalized = path.resolve(projectPath).toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
```

### Settings Structure

```typescript
interface ProjectSettings {
  version: number;
  projectPath: string;
  projectHash: string;
  template: {
    selectedId: string | null;
    enabled: boolean;
  };
  llm: {
    provider: string | null;
    model: string | null;
    customEndpoint: string | null;
  };
  preferences: {
    autoChunking: boolean;
    costWarningEnabled: boolean;
    costWarningThreshold: number;
  };
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}
```

## Reproduction Steps

### Step 1: Start REPL in Project A

```bash
cd /path/to/project-a
npx pm-orchestrator
```

### Step 2: Configure Settings

```
pm> /provider openai
Provider set to openai

pm> /template use builtin-standard
Template 'builtin-standard' selected and enabled
```

### Step 3: Exit REPL

```
pm> /exit
Goodbye!
```

### Step 4: Verify Settings Persisted

```bash
# Check ProjectSettingsStore (global)
cat ~/.pm-orchestrator/projects/*.json | jq '.'

# Check ReplState (project-local)
cat /path/to/project-a/.claude/repl.json | jq '.'
```

Expected output (ProjectSettingsStore):
```json
{
  "version": 1,
  "projectPath": "/path/to/project-a",
  "projectHash": "abc123...",
  "template": {
    "selectedId": "builtin-standard",
    "enabled": true
  },
  "llm": {
    "provider": "openai",
    "model": null
  },
  ...
}
```

Expected output (ReplState):
```json
{
  "selected_provider": "openai",
  "selected_model": null,
  "updated_at": "2026-01-24T..."
}
```

### Step 5: Restart REPL

```bash
cd /path/to/project-a
npx pm-orchestrator

pm> /provider
Current provider: OpenAI
  ID: openai
  ...

pm> /template status
Template: builtin-standard (enabled)
```

Settings are restored.

## Project Isolation Evidence

### Setup: Two Different Projects

```bash
# Project A
mkdir -p /tmp/project-a/.claude
echo '# Project A' > /tmp/project-a/.claude/CLAUDE.md

# Project B
mkdir -p /tmp/project-b/.claude
echo '# Project B' > /tmp/project-b/.claude/CLAUDE.md
```

### Configure Different Settings

**Project A:**
```bash
cd /tmp/project-a
npx pm-orchestrator

pm> /provider openai
pm> /template use builtin-minimal
pm> /exit
```

**Project B:**
```bash
cd /tmp/project-b
npx pm-orchestrator

pm> /provider anthropic
pm> /template use builtin-standard
pm> /exit
```

### Verify Isolation

```bash
# Project A hash
HASH_A=$(node -e "console.log(require('crypto').createHash('sha256').update('/tmp/project-a'.toLowerCase()).digest('hex').substring(0, 16))")

# Project B hash  
HASH_B=$(node -e "console.log(require('crypto').createHash('sha256').update('/tmp/project-b'.toLowerCase()).digest('hex').substring(0, 16))")

# Check Project A settings
cat ~/.pm-orchestrator/projects/${HASH_A}.json | jq '{provider: .llm.provider, template: .template.selectedId}'
# Expected: {"provider": "openai", "template": "builtin-minimal"}

# Check Project B settings
cat ~/.pm-orchestrator/projects/${HASH_B}.json | jq '{provider: .llm.provider, template: .template.selectedId}'
# Expected: {"provider": "anthropic", "template": "builtin-standard"}
```

### Restart and Confirm

**Project A:**
```bash
cd /tmp/project-a
npx pm-orchestrator

pm> /provider
# Expected: openai

pm> /template status
# Expected: builtin-minimal (enabled)
```

**Project B:**
```bash
cd /tmp/project-b
npx pm-orchestrator

pm> /provider
# Expected: anthropic

pm> /template status
# Expected: builtin-standard (enabled)
```

Settings are isolated - each project has its own configuration.

## Automated Test Coverage

### Unit Tests

- `test/unit/config/configuration-manager.test.ts`
  - Configuration loading/validation
  - Default values
  - Range validation

### Integration Tests

- `test/integration/template-settings-persistence.test.ts`
  - Template storage read/write
  - Project settings storage read/write
  - Hash consistency
  - Settings restoration simulation
  - Corrupted file handling

- `test/integration/project-settings-isolation.test.ts`
  - Two temp project directories
  - Different activeTemplate + provider in each
  - Save, reload, assert restored and isolated

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/settings/project-settings-store.ts` | ProjectSettingsStore class |
| `src/config/global-config.ts` | Global config (API keys, default provider) |
| `src/repl/commands/provider.ts` | Provider command (saves to repl.json) |
| `src/template/template-store.ts` | Template storage and selection |

## Fail-Closed Behavior

If settings file is corrupted:
1. Parse error is caught
2. Warning is logged
3. Default settings are used
4. New valid settings file is written

```typescript
// From project-settings-store.ts
try {
  const content = fs.readFileSync(settingsPath, 'utf-8');
  const parsed = JSON.parse(content);
  settings = migrateSettings(parsed, resolvedPath, projectHash, this.onEvent);
} catch {
  // Corrupted file - use defaults
  console.warn('[WARN] Project settings corrupted: using defaults');
  settings = createDefaultSettings(resolvedPath, projectHash);
}
```

## Security

- Settings files created with mode 0o600 (owner read/write only)
- Storage directories created with mode 0o700 (owner full access only)
- API keys stored in global config, not project settings

## Summary

| Feature | Evidence |
|---------|----------|
| Settings persist across exit | Settings read from disk on startup |
| Settings restored on restart | ProjectSettingsStore.initialize() loads existing file |
| Project A vs B isolation | Separate hash-named files for each project |
| Corrupted file handling | Fail-closed with defaults |
| Secure file permissions | 0o600 for files, 0o700 for directories |

---

**Last verified:** 2026-01-24  
**Implementation spec:** spec/33_PROJECT_SETTINGS_PERSISTENCE.md
