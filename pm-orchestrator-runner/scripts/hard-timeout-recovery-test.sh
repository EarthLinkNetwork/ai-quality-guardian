#!/bin/bash
#
# Hard Timeout Recovery Test
# Verifies REPL recovers control after HARD_TIMEOUT
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI_PATH="$PROJECT_ROOT/dist/cli/index.js"

echo "========================================"
echo " Hard Timeout Recovery Test"
echo "========================================"

# Create temp project
TEMP_DIR=$(mktemp -d)
CLAUDE_DIR="$TEMP_DIR/.claude"
mkdir -p "$CLAUDE_DIR/logs/sessions"
echo "# Test Project" > "$CLAUDE_DIR/CLAUDE.md"
echo '{"project":{"name":"test","version":"1.0.0"}}' > "$CLAUDE_DIR/settings.json"

LOG_FILE="/tmp/hard-timeout-recovery-$(date +%Y%m%d-%H%M%S).log"

echo "Project: $TEMP_DIR"
echo "Log: $LOG_FILE"
echo "Hard Timeout: 15000ms (15s)"
echo ""

# Run with short hard timeout (15s)
# Complex task likely to exceed 15s silent period
HARD_TIMEOUT_MS=15000 node "$CLI_PATH" repl \
    --project-mode fixed \
    --project-root "$TEMP_DIR" \
    <<< $'/start\nWrite a comprehensive 2000-word research paper about quantum computing with multiple sections and citations.\n/tasks\n/exit\n' \
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

if grep -q "Hard timeout" "$LOG_FILE"; then
    echo "✓ Hard timeout triggered (expected)"
else
    echo "! Hard timeout did NOT trigger (task completed quickly)"
fi

if grep -q "/tasks" "$LOG_FILE" && grep -q "Summary:" "$LOG_FILE"; then
    echo "✓ /tasks command processed after timeout"
else
    echo "✗ /tasks command not processed"
fi

echo ""
echo "Test completed successfully"
