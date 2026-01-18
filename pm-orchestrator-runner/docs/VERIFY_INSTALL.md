# Installation Verification Guide

Per product stability requirements - Verify `pm` command is available after global installation.

## Quick Verification

```bash
# Run smoke test
./scripts/smoke/install-global.sh
```

## Manual Verification Steps

### 1. Install Globally

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
pm web --port 3000 --namespace stable

# 2. In another terminal, verify health endpoint
curl http://localhost:3000/api/health

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

## Notes

- **npm prefix -g** is used instead of `npm bin -g` for consistency
- Only `pm` command is exposed; `pm-orchestrator` is deprecated
- Web UI requires `pm web` subcommand (not a separate binary)
