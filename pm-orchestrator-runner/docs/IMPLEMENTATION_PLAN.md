# Implementation Plan for Spec Compliance

## Summary

4 non-compliant areas identified in PHASE 2 audit. This plan addresses each with TDD approach.

---

## Issue 1: CLI Command Names Mismatch

**Spec:** 05_CLI.md L20-26
**Current:** `run/continue/status`
**Required:** `start/continue/status/validate`

### Changes Required

1. **src/cli/cli-interface.ts**
   - Rename `run` command to `start`
   - Add `validate` command
   - Update `validCommands` array

2. **Tests to write first:**
   - `cli-interface.test.ts`: Test `start` command maps to RunnerCore.start()
   - `cli-interface.test.ts`: Test `validate` command maps to RunnerCore.validate()
   - `cli-interface.test.ts`: Test `run` is now unknown command (ERROR)

### Implementation Steps

```typescript
// Before
const validCommands = ['run', 'continue', 'status'];

// After
const validCommands = ['start', 'continue', 'status', 'validate'];
```

---

## Issue 2: Unknown REPL Command Not Fail-Closed

**Spec:** 10_REPL_UX.md L66
**Current:** Prints message, returns void
**Required:** Returns ERROR status

### Changes Required

1. **src/repl/repl-interface.ts**
   - Change `default:` case to return `{ success: false, error: 'E2xx' }`
   - Add error code for unknown command

2. **Tests to write first:**
   - `repl-interface.test.ts`: Unknown command returns `success: false`
   - `repl-interface.test.ts`: Unknown command includes error code

### Implementation Steps

```typescript
// Before
default:
  this.print(`Unknown command: /${command}`);
  this.print('Type /help for available commands.');

// After
default:
  return {
    success: false,
    error: {
      code: 'E2XX',  // Use appropriate E2xx code
      message: `Unknown command: /${command}. Type /help for available commands.`
    }
  };
```

---

## Issue 3: /init Doesn't ERROR When Files Exist

**Spec:** 10_REPL_UX.md L97-99
**Current:** Returns `success: true` when files exist
**Required:** Returns ERROR with list of existing files

### Changes Required

1. **src/repl/commands/init.ts**
   - Check if ANY required file exists BEFORE creating anything
   - If any exist, return ERROR with list
   - Only create if NONE exist

2. **Tests to write first:**
   - `init.test.ts`: Returns ERROR when CLAUDE.md exists
   - `init.test.ts`: Returns ERROR when settings.json exists
   - `init.test.ts`: Returns ERROR with list of existing files
   - `init.test.ts`: Creates all files when none exist

### Implementation Steps

```typescript
// Before: Check each file independently, skip if exists
if (!fs.existsSync(claudeMdPath)) {
  fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD, 'utf-8');
}

// After: Check ALL files first, ERROR if any exist
const existingFiles: string[] = [];
if (fs.existsSync(claudeDir)) existingFiles.push('.claude/');
if (fs.existsSync(claudeMdPath)) existingFiles.push('.claude/CLAUDE.md');
if (fs.existsSync(settingsPath)) existingFiles.push('.claude/settings.json');
// ... check all files

if (existingFiles.length > 0) {
  return {
    success: false,
    error: {
      code: 'E101',
      message: `Cannot initialize: files already exist: ${existingFiles.join(', ')}`
    }
  };
}

// Only now create all files
```

---

## Issue 4: /model Schema Mismatch

**Spec:** 10_REPL_UX.md L123-139
**Current:** `{ model?: string; [key: string]: unknown }`
**Required:** `{ selected_model: string; updated_at: string }`

### Changes Required

1. **src/repl/commands/model.ts**
   - Rename `model` to `selected_model`
   - Add `updated_at` field (ISO 8601)
   - Remove `[key: string]: unknown`
   - On JSON parse error, return E105 ERROR

2. **Tests to write first:**
   - `model.test.ts`: Uses `selected_model` field name
   - `model.test.ts`: Sets `updated_at` on save
   - `model.test.ts`: `updated_at` is ISO 8601 format
   - `model.test.ts`: JSON parse error returns E105

### Implementation Steps

```typescript
// Before
export interface REPLConfig {
  model?: string;
  [key: string]: unknown;
}

// After
export interface REPLConfig {
  selected_model: string;
  updated_at: string;
}

// On save
const config: REPLConfig = {
  selected_model: modelName,
  updated_at: new Date().toISOString()
};

// On parse error
if (error instanceof SyntaxError) {
  return {
    success: false,
    error: {
      code: 'E105',
      message: 'repl.json is corrupted (JSON parse error)'
    }
  };
}
```

---

## Execution Order

1. **Issue 4: /model** - Smallest scope, isolated change
2. **Issue 3: /init** - Self-contained command
3. **Issue 2: Unknown command** - REPL core change
4. **Issue 1: CLI commands** - CLI core change

---

## TDD Checklist

For each issue:

- [ ] Write failing tests first
- [ ] Run tests, confirm RED
- [ ] Implement minimum code to pass
- [ ] Run tests, confirm GREEN
- [ ] Run full suite: `npm test`
- [ ] Run typecheck: `npm run typecheck`
- [ ] Run build: `npm run build`
