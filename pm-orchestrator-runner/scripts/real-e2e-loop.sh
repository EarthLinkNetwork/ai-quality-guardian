#!/bin/bash
#
# Real Claude Code E2E Loop Test Script
#
# This script runs the REPL with real Claude Code CLI multiple times
# to verify stability and catch intermittent hangs.
#
# Usage:
#   ./scripts/real-e2e-loop.sh [iterations] [timeout_seconds]
#
# Examples:
#   ./scripts/real-e2e-loop.sh           # Run 10 iterations with 60s timeout
#   ./scripts/real-e2e-loop.sh 5         # Run 5 iterations
#   ./scripts/real-e2e-loop.sh 10 120    # Run 10 iterations with 120s timeout
#
# Prerequisites:
#   - Claude Code CLI must be installed and authenticated
#   - Run 'npm run build' first
#
# Output:
#   - Summary at the end showing pass/fail count
#   - Log files in /tmp/real-e2e-loop-<timestamp>/
#

set -e

# Configuration
ITERATIONS=${1:-10}
TIMEOUT_SECONDS=${2:-60}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI_PATH="$PROJECT_ROOT/dist/cli/index.js"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="/tmp/real-e2e-loop-$TIMESTAMP"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================================================"
echo " Real Claude Code E2E Loop Test"
echo "========================================================================"
echo " Iterations: $ITERATIONS"
echo " Timeout: ${TIMEOUT_SECONDS}s per iteration"
echo " CLI Path: $CLI_PATH"
echo " Log Dir: $LOG_DIR"
echo "========================================================================"
echo ""

# Verify prerequisites
if [ ! -f "$CLI_PATH" ]; then
    echo -e "${RED}ERROR: CLI not found at $CLI_PATH${NC}"
    echo "Run 'npm run build' first"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}WARNING: Claude Code CLI not found in PATH${NC}"
    echo "Tests may fail if Claude Code is not available"
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Counters
PASS_COUNT=0
FAIL_COUNT=0
TIMEOUT_COUNT=0

# Run iterations
for i in $(seq 1 $ITERATIONS); do
    echo -n "[$i/$ITERATIONS] "

    # Create temp project directory
    TEMP_DIR=$(mktemp -d)
    CLAUDE_DIR="$TEMP_DIR/.claude"
    mkdir -p "$CLAUDE_DIR/logs/sessions"
    echo "# Test Project" > "$CLAUDE_DIR/CLAUDE.md"
    echo '{"project":{"name":"test","version":"1.0.0"}}' > "$CLAUDE_DIR/settings.json"

    # Log file for this iteration
    LOG_FILE="$LOG_DIR/run-$i.log"

    # Run REPL with timeout
    START_TIME=$(date +%s)

    set +e
    # Test with actual Claude Code task execution (create README.md)
    timeout ${TIMEOUT_SECONDS}s node "$CLI_PATH" repl \
        --project-mode fixed \
        --project-root "$TEMP_DIR" \
        <<< $'/start\nCreate a file called README.md with content "# Test"\n/tasks\n/exit\n' \
        > "$LOG_FILE" 2>&1
    EXIT_CODE=$?
    set -e

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Check result
    if [ $EXIT_CODE -eq 124 ]; then
        # timeout command returns 124 on timeout
        echo -e "${RED}TIMEOUT${NC} (${DURATION}s) - see $LOG_FILE"
        TIMEOUT_COUNT=$((TIMEOUT_COUNT + 1))
        FAIL_COUNT=$((FAIL_COUNT + 1))
    elif [ $EXIT_CODE -eq 0 ]; then
        # Check for expected output
        if grep -q "Goodbye" "$LOG_FILE" && grep -q "Session started\|session-" "$LOG_FILE"; then
            echo -e "${GREEN}PASS${NC} (${DURATION}s, exit=$EXIT_CODE)"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo -e "${YELLOW}INCOMPLETE${NC} (${DURATION}s, exit=$EXIT_CODE) - missing expected output"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    else
        echo -e "${RED}FAIL${NC} (${DURATION}s, exit=$EXIT_CODE) - see $LOG_FILE"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Cleanup temp directory
    rm -rf "$TEMP_DIR"

    # Small delay between iterations
    sleep 1
done

echo ""
echo "========================================================================"
echo " Summary"
echo "========================================================================"
echo -e " Total:    $ITERATIONS"
echo -e " ${GREEN}Passed:   $PASS_COUNT${NC}"
echo -e " ${RED}Failed:   $FAIL_COUNT${NC}"
if [ $TIMEOUT_COUNT -gt 0 ]; then
    echo -e " ${RED}Timeouts: $TIMEOUT_COUNT${NC}"
fi
echo " Logs:     $LOG_DIR"
echo "========================================================================"

# Exit with failure if any tests failed
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "\n${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
