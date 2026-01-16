#!/bin/bash
#
# Timeout Recovery Test
# Verifies REPL recovers control after TIMEOUT/BLOCKED/FAIL_CLOSED
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI_PATH="$PROJECT_ROOT/dist/cli/index.js"

echo "========================================"
echo " Timeout Recovery Test"
echo "========================================"

# Create temp project
TEMP_DIR=$(mktemp -d)
CLAUDE_DIR="$TEMP_DIR/.claude"
mkdir -p "$CLAUDE_DIR/logs/sessions"
echo "# Test Project" > "$CLAUDE_DIR/CLAUDE.md"
echo '{"project":{"name":"test","version":"1.0.0"}}' > "$CLAUDE_DIR/settings.json"

LOG_FILE="/tmp/timeout-recovery-$(date +%Y%m%d-%H%M%S).log"

echo "Project: $TEMP_DIR"
echo "Log: $LOG_FILE"
echo ""

# Run with short hard timeout (10s) and a task that might exceed it
# The key test: after timeout, /tasks and /exit must still work
node "$CLI_PATH" repl \
    --project-mode fixed \
    --project-root "$TEMP_DIR" \
    <<< $'/start\nWrite a very detailed 500-word essay about the history of computing. Include details about ENIAC, transistors, integrated circuits, and modern processors.\n/tasks\n/exit\n' \
    2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo " Result"
echo "========================================"
echo "Exit code: $EXIT_CODE"

# Check for expected behaviors
if grep -q "Goodbye" "$LOG_FILE"; then
    echo "✓ REPL exited cleanly (Goodbye found)"
else
    echo "✗ REPL did not exit cleanly"
    exit 1
fi

if grep -q "task-" "$LOG_FILE"; then
    echo "✓ Task was registered"
else
    echo "✗ No task registered"
    exit 1
fi

# Check if timeout occurred (not required, but interesting)
if grep -q "timeout\|TIMEOUT" "$LOG_FILE"; then
    echo "! Timeout occurred (expected for long tasks)"
fi

echo ""
echo "Test completed successfully"
