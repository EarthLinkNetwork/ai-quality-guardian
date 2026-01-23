# Installation Verification Guide

Per product stability requirements - Verify `pm` command is available after global installation.

## IMPORTANT: Verify Published Package

**DO NOT use `npm install -g .` for verification.** This only tests local build, not the published package.

Always verify using the **published npm package**:

```bash
# Correct: Install from npm registry
npm install -g pm-orchestrator-runner

# WRONG: This only tests local build, not published package
npm install -g .  # DO NOT USE THIS FOR VERIFICATION
```

## Quick Verification (Published Package)

```bash
# Verify published package works correctly
./scripts/smoke/verify-published.sh

# Or with specific version
./scripts/smoke/verify-published.sh 1.0.9
```

## Quick Verification (Local Build)

```bash
# Run local smoke test (after npm install -g .)
./scripts/smoke/install-global.sh
```

## Manual Verification Steps

### 1. Install Globally (from npm registry)

```bash
npm install -g pm-orchestrator-runner
```

### 2. Clear Shell Cache (Required)

```bash
hash -r
```

### 3. Verify pm Command

```bash
# Check location
which pm

# Check version
pm --version

# Check help
pm --help
```

### 4. Verify Web Command

```bash
# pm web should NOT return "Unknown command"
pm web --help
```

## asdf Users (Required Steps)

If you use asdf for Node.js version management, additional steps are required.

### Why asdf Requires Extra Steps

- asdf uses shims to intercept commands
- Old shims from previous versions may persist
- `pm-orchestrator` shims must be removed

### Required Steps for asdf

```bash
# 1. Remove old shims (if any)
rm -f ~/.asdf/shims/pm-orchestrator
rm -f ~/.asdf/shims/pm-orchestrator-runner

# 2. Reshim Node.js
asdf reshim nodejs

# 3. Clear shell cache
hash -r

# 4. Verify
which pm
pm --version
```

### Verify Clean Namespace

```bash
# These should NOT exist:
which pm-orchestrator 2>/dev/null && echo "ERROR: pm-orchestrator should not exist"
which pm-orchestrator-runner 2>/dev/null && echo "ERROR: pm-orchestrator-runner should not exist"

# Only pm should exist:
which pm  # Should return path
```

## Verification Checklist

| Test | Command | Expected |
|------|---------|----------|
| pm exists | `which pm` | Returns path |
| Version works | `pm --version` | Shows version number |
| Help works | `pm --help` | Shows usage info |
| Web command | `pm web --help` | No "Unknown command" |
| No legacy | `which pm-orchestrator` | Command not found |

## Troubleshooting

### "command not found: pm"

1. Check npm global prefix:
   ```bash
   npm prefix -g
   ```

2. Verify bin directory is in PATH:
   ```bash
   # npm global bin should be in PATH
   echo $PATH | tr ':' '\n' | grep -E "npm|node"
   ```

3. For asdf users, reshim:
   ```bash
   asdf reshim nodejs
   hash -r
   ```

### "Unknown command: web"

This indicates an incomplete or outdated installation.

```bash
# Reinstall
npm uninstall -g pm-orchestrator-runner
npm install -g pm-orchestrator-runner
hash -r
```

### pm-orchestrator Still Exists

Legacy shim from previous version.

```bash
# For asdf
rm -f ~/.asdf/shims/pm-orchestrator
asdf reshim nodejs

# For nvm
# Reinstall should fix this
npm uninstall -g pm-orchestrator-runner
npm install -g pm-orchestrator-runner
```

## Web UI Verification

After `pm` is working:

```bash
# 1. Start Web UI
pm web --port 5678 --namespace stable

# 2. In another terminal, verify health endpoint
curl http://localhost:5678/api/health

# Expected response:
# {"status":"ok","timestamp":"...","namespace":"stable"}
```

## Complete Verification Script

```bash
#!/bin/bash
set -e

echo "=== PM Installation Verification ==="

# asdf cleanup (if applicable)
if command -v asdf &>/dev/null; then
  echo "asdf detected - cleaning shims..."
  rm -f ~/.asdf/shims/pm-orchestrator
  rm -f ~/.asdf/shims/pm-orchestrator-runner
  asdf reshim nodejs
fi

# Clear cache
hash -r

# Verify
echo "npm prefix: $(npm prefix -g)"
echo "which pm: $(which pm)"
echo "pm version: $(pm --version)"

# Test web command
pm web --help | head -1 || echo "pm web available"

echo "=== Verification Complete ==="
```

## Verify Installed Version (Published Package)

To confirm you have the correct published version installed:

```bash
# 1. Check installed version via npm
npm list -g --depth=0 | grep pm-orchestrator-runner
# Expected: pm-orchestrator-runner@1.0.9

# 2. Verify actual installed version from package.json
NPM_PREFIX=$(npm prefix -g)
node -p "require('$NPM_PREFIX/lib/node_modules/pm-orchestrator-runner/package.json').version"
# Expected: 1.0.9

# 3. Verify version from CLI
pm --version
# Expected: 1.0.9

# 4. Compare with published version
npm view pm-orchestrator-runner version
# Should match installed version
```

## API Key Configuration

The `pm` command requires an API key (OpenAI or Anthropic) by default.

### First Time Setup (Key Setup Mode)

When you run `pm` without an API key configured, you'll enter **Key Setup Mode**:

```
========================================
  KEY SETUP MODE
  API key required to use pm runner
========================================

Available commands in Key Setup Mode:
  /keys set <provider>  - Set API key (openai or anthropic)
  /provider <provider>  - Switch provider
  /help                 - Show help
  /exit                 - Exit
```

### Setting Up API Key

```bash
# Interactive mode (recommended - hidden input)
pm
> /keys set openai
Enter OpenAI API key: ******
Confirm OpenAI API key: ******
Keys match. Validating with openai API...
API key validated and saved successfully!

# Or set via environment variable
export OPENAI_API_KEY=sk-...
pm
```

### Provider Options

| Provider | Flag | API Key Required |
|----------|------|------------------|
| OpenAI | `--provider openai` (default) | Yes (`OPENAI_API_KEY`) |
| Anthropic | `--provider anthropic` | Yes (`ANTHROPIC_API_KEY`) |
| Claude Code | `--provider claude-code` | No (uses Claude login) |

### Using Claude Code Without API Key

If you have Claude Code CLI logged in, you can bypass API key requirement:

```bash
pm --provider claude-code
```

### Security Notes

- API keys are stored locally in `~/.pm-orchestrator/config.json` with mode 0600
- Keys are **NEVER** logged to console or log files
- Double-entry confirmation required when setting keys interactively
- Keys are validated against provider APIs before being saved

## Notes

- **npm prefix -g** is used instead of `npm bin -g` for consistency
- Only `pm` command is exposed; `pm-orchestrator` is deprecated
- Web UI requires `pm web` subcommand (not a separate binary)
- Always verify with the **published package** (`npm install -g pm-orchestrator-runner`), not local build (`npm install -g .`)
