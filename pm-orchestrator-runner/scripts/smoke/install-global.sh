#!/usr/bin/env bash
#
# Smoke test: Verify pm command is available after npm install -g
#
# Usage:
#   ./scripts/smoke/install-global.sh
#
# This script verifies:
#   1. pm command exists in npm global prefix
#   2. pm --version works
#   3. pm --help works
#   4. pm web command exists (no Unknown command)
#   5. pm-orchestrator is NOT exposed (clean bin namespace)
#   6. which pm shows correct path
#   7. pm web /api/health endpoint responds

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "============================================"
echo "PM Orchestrator Runner - Install Smoke Test"
echo "============================================"
echo ""

# Get npm global prefix (not npm bin -g)
NPM_PREFIX="$(npm prefix -g)"
NPM_BIN_DIR="$NPM_PREFIX/bin"

log_info "npm global prefix: $NPM_PREFIX"
log_info "npm bin directory: $NPM_BIN_DIR"
log_info "Project root: $PROJECT_ROOT"
echo ""

# Track failures
FAILURES=0

# Test 1: Check pm exists in npm bin directory
echo "--- Test 1: pm command exists ---"
if [ -f "$NPM_BIN_DIR/pm" ] || [ -L "$NPM_BIN_DIR/pm" ]; then
  log_pass "pm exists at $NPM_BIN_DIR/pm"
  # Show symlink target if symlink
  if [ -L "$NPM_BIN_DIR/pm" ]; then
    log_info "  -> $(readlink "$NPM_BIN_DIR/pm")"
  fi
else
  log_fail "pm not found at $NPM_BIN_DIR/pm"
  log_info "Hint: Run 'npm install -g pm-orchestrator-runner' first"
  ((FAILURES++))
fi
echo ""

# Test 2: pm --version works
echo "--- Test 2: pm --version ---"
if command -v pm &>/dev/null; then
  VERSION_OUTPUT=$(pm --version 2>&1 || true)
  if [[ "$VERSION_OUTPUT" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    log_pass "pm --version: $VERSION_OUTPUT"
  else
    log_fail "pm --version returned unexpected output: $VERSION_OUTPUT"
    ((FAILURES++))
  fi
else
  log_fail "pm command not found in PATH"
  log_info "Hint: Ensure npm bin directory is in PATH, or run 'hash -r'"
  ((FAILURES++))
fi
echo ""

# Test 3: pm --help works
echo "--- Test 3: pm --help ---"
if command -v pm &>/dev/null; then
  HELP_OUTPUT=$(pm --help 2>&1 || true)
  if [[ "$HELP_OUTPUT" == *"Usage:"* ]] || [[ "$HELP_OUTPUT" == *"pm"* ]]; then
    log_pass "pm --help shows usage information"
  else
    log_fail "pm --help returned unexpected output"
    echo "$HELP_OUTPUT" | head -5
    ((FAILURES++))
  fi
else
  log_fail "pm command not found in PATH"
  ((FAILURES++))
fi
echo ""

# Test 4: pm web --help (check web subcommand exists)
echo "--- Test 4: pm web command exists ---"
if command -v pm &>/dev/null; then
  WEB_OUTPUT=$(pm web --help 2>&1 || true)
  if [[ "$WEB_OUTPUT" == *"Unknown command"* ]]; then
    log_fail "pm web returns 'Unknown command'"
    ((FAILURES++))
  elif [[ "$WEB_OUTPUT" == *"web"* ]] || [[ "$WEB_OUTPUT" == *"port"* ]] || [[ "$WEB_OUTPUT" == *"Web"* ]]; then
    log_pass "pm web command is available"
  else
    # Even if help output is minimal, as long as it doesn't say "Unknown command", it's OK
    log_pass "pm web command exists (no Unknown command error)"
  fi
else
  log_fail "pm command not found in PATH"
  ((FAILURES++))
fi
echo ""

# Test 5: pm-orchestrator is NOT exposed
echo "--- Test 5: pm-orchestrator is NOT exposed ---"
if [ -f "$NPM_BIN_DIR/pm-orchestrator" ] || [ -L "$NPM_BIN_DIR/pm-orchestrator" ]; then
  log_fail "pm-orchestrator should NOT exist (clean namespace)"
  log_info "Found: $NPM_BIN_DIR/pm-orchestrator"
  log_info "This may be a leftover from a previous version. Remove it manually."
  ((FAILURES++))
else
  log_pass "pm-orchestrator is not exposed (clean)"
fi
echo ""

# Test 6: which pm shows correct path
echo "--- Test 6: which pm ---"
if command -v pm &>/dev/null; then
  WHICH_PM=$(which pm 2>&1)
  log_pass "which pm: $WHICH_PM"

  # Check if it's in the expected npm bin directory or a shim
  if [[ "$WHICH_PM" == *"$NPM_BIN_DIR"* ]]; then
    log_info "  Direct npm global bin"
  elif [[ "$WHICH_PM" == *"asdf"* ]] || [[ "$WHICH_PM" == *"shim"* ]]; then
    log_info "  asdf shim detected"
  elif [[ "$WHICH_PM" == *"nvm"* ]]; then
    log_info "  nvm installation detected"
  fi
else
  log_fail "which pm failed"
  ((FAILURES++))
fi
echo ""

# Test 7: pm web /api/health endpoint (optional, requires port availability)
echo "--- Test 7: pm web /api/health ---"
TEST_PORT=13579  # Use unusual port to avoid conflicts
if command -v pm &>/dev/null; then
  # Start web server in background
  pm web --port $TEST_PORT --namespace smoke-test &>/dev/null &
  WEB_PID=$!

  # Wait for server to start (max 5 seconds)
  HEALTH_OK=false
  for i in {1..10}; do
    sleep 0.5
    if curl -s "http://localhost:$TEST_PORT/api/health" | grep -q '"status":"ok"'; then
      HEALTH_OK=true
      break
    fi
  done

  # Kill the server
  kill $WEB_PID 2>/dev/null || true
  wait $WEB_PID 2>/dev/null || true

  if $HEALTH_OK; then
    log_pass "pm web /api/health returns ok"
  else
    log_fail "pm web /api/health did not respond"
    log_info "Server may have failed to start on port $TEST_PORT"
    ((FAILURES++))
  fi
else
  log_fail "pm command not found in PATH"
  ((FAILURES++))
fi
echo ""

# Summary
echo "============================================"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}$FAILURES test(s) failed${NC}"
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. npm install -g pm-orchestrator-runner"
  echo "  2. hash -r  (refresh shell command cache)"
  echo "  3. For asdf users: asdf reshim nodejs"
  echo "  4. See docs/VERIFY_INSTALL.md for detailed instructions"
  exit 1
fi
