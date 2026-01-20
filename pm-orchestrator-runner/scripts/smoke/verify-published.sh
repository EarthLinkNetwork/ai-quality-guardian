#!/usr/bin/env bash
#
# Smoke test: Verify pm command works from PUBLISHED npm package
#
# Usage:
#   ./scripts/smoke/verify-published.sh [version]
#
# Arguments:
#   version  - Optional: specific version to install (default: latest)
#
# IMPORTANT: This script verifies the PUBLISHED package from npm registry.
#            DO NOT use 'npm install -g .' - that tests local, not published.
#
# This script verifies:
#   1. Uninstall any existing version
#   2. Install from npm registry (NOT local)
#   3. pm --help shows 'web' command
#   4. pm web starts and /api/health responds

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# Get version to install (default: latest)
VERSION="${1:-latest}"

echo "============================================"
echo "PM Orchestrator Runner - Published Package Verification"
echo "============================================"
echo ""
log_info "Target version: $VERSION"
echo ""

# Track failures
FAILURES=0

# Step 1: Uninstall any existing version
echo "--- Step 1: Uninstall existing version ---"
npm uninstall -g pm-orchestrator-runner 2>/dev/null || true
log_pass "Uninstalled existing version (if any)"
echo ""

# Step 2: Clean npm cache
echo "--- Step 2: Verify npm cache ---"
npm cache verify >/dev/null 2>&1 || true
log_pass "npm cache verified"
echo ""

# Step 3: Install from npm registry
echo "--- Step 3: Install from npm registry ---"
log_info "Installing pm-orchestrator-runner@$VERSION from registry..."
if [ "$VERSION" = "latest" ]; then
  npm install -g pm-orchestrator-runner
else
  npm install -g "pm-orchestrator-runner@$VERSION"
fi

INSTALLED_VERSION=$(npm list -g --depth=0 2>/dev/null | grep pm-orchestrator-runner | sed 's/.*@//')
log_pass "Installed version: $INSTALLED_VERSION"
echo ""

# Step 4: asdf reshim (if applicable)
echo "--- Step 4: Reshim (asdf/nvm) ---"
if command -v asdf &>/dev/null; then
  log_info "asdf detected - running reshim..."
  rm -f ~/.asdf/shims/pm-orchestrator 2>/dev/null || true
  rm -f ~/.asdf/shims/pm-orchestrator-runner 2>/dev/null || true
  asdf reshim nodejs
  log_pass "asdf reshim completed"
else
  log_info "asdf not detected, skipping reshim"
fi
echo ""

# Step 5: Clear shell hash cache
echo "--- Step 5: Clear shell cache ---"
hash -r
log_pass "Shell cache cleared"
echo ""

# Step 6: Verify pm command location
echo "--- Step 6: Verify pm command ---"
if command -v pm &>/dev/null; then
  PM_PATH=$(which pm)
  log_pass "pm found at: $PM_PATH"

  # Show all pm locations
  log_info "All pm locations:"
  which -a pm 2>/dev/null || which pm
else
  log_fail "pm command not found in PATH"
  ((FAILURES++))
fi
echo ""

# Step 7: Verify pm --help contains 'web'
echo "--- Step 7: Verify pm --help contains 'web' ---"
if command -v pm &>/dev/null; then
  HELP_OUTPUT=$(pm --help 2>&1 || true)

  if echo "$HELP_OUTPUT" | grep -q "web"; then
    log_pass "pm --help contains 'web' command"
  else
    log_fail "pm --help does NOT contain 'web' command"
    log_info "Help output:"
    echo "$HELP_OUTPUT" | head -30
    ((FAILURES++))
  fi

  # Also verify no "Unknown command: web"
  WEB_HELP=$(pm web --help 2>&1 || true)
  if echo "$WEB_HELP" | grep -qi "unknown command"; then
    log_fail "pm web returns 'Unknown command'"
    ((FAILURES++))
  else
    log_pass "pm web is a valid command"
  fi
else
  log_fail "pm command not available"
  ((FAILURES++))
fi
echo ""

# Step 8: Verify pm web starts and /api/health responds
echo "--- Step 8: Verify pm web /api/health ---"
TEST_PORT=13580  # Fixed port for testing

if command -v pm &>/dev/null; then
  # Start web server in background
  log_info "Starting pm web on port $TEST_PORT..."
  pm web --port $TEST_PORT --namespace test-published &>/dev/null &
  WEB_PID=$!

  # Wait for server to start (max 10 seconds)
  HEALTH_OK=false
  for i in {1..20}; do
    sleep 0.5
    if curl -s "http://localhost:$TEST_PORT/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
      HEALTH_OK=true
      break
    fi
  done

  # Kill the server
  kill $WEB_PID 2>/dev/null || true
  wait $WEB_PID 2>/dev/null || true

  if $HEALTH_OK; then
    log_pass "pm web /api/health returns 200 with status:ok"
  else
    log_fail "pm web /api/health did not respond"
    log_info "Server may have failed to start on port $TEST_PORT"
    ((FAILURES++))
  fi
else
  log_fail "pm command not available"
  ((FAILURES++))
fi
echo ""

# Step 9: Show installed package info
echo "--- Step 9: Installed Package Info ---"
log_info "npm list -g --depth=0 | grep pm-orchestrator-runner:"
npm list -g --depth=0 2>/dev/null | grep pm-orchestrator-runner || true

NPM_PREFIX=$(npm prefix -g)
log_info "Package location: $NPM_PREFIX/lib/node_modules/pm-orchestrator-runner"

# Show actual installed version from package.json
if [ -f "$NPM_PREFIX/lib/node_modules/pm-orchestrator-runner/package.json" ]; then
  ACTUAL_VERSION=$(node -p "require('$NPM_PREFIX/lib/node_modules/pm-orchestrator-runner/package.json').version")
  log_info "Actual installed version (from package.json): $ACTUAL_VERSION"
fi
echo ""

# Summary
echo "============================================"
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}All verification tests passed!${NC}"
  echo ""
  echo "Published package verification successful:"
  echo "  - pm command is available"
  echo "  - pm --help shows 'web' command"
  echo "  - pm web starts and /api/health responds"
  exit 0
else
  echo -e "${RED}$FAILURES test(s) failed${NC}"
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Verify package was published: npm view pm-orchestrator-runner version"
  echo "  2. Try specific version: ./scripts/smoke/verify-published.sh 1.0.9"
  echo "  3. Check npm registry: https://www.npmjs.com/package/pm-orchestrator-runner"
  exit 1
fi
