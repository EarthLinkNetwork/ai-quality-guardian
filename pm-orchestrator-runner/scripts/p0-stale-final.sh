#!/usr/bin/env bash
set -euo pipefail

# ─── P0 Stale Filter Final Verification ───
# One command: start → submit 3 tasks → collect logs → verify → evidence → exit
# Any failure = immediate FAIL exit.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NAMESPACE="p0-stale-final-$(date +%s)"
EVIDENCE_PATH="/tmp/p0-stale-final.json"
SERVER_PID=""

# ─── Auto-select free port ───
find_free_port() {
  local port
  for port in $(seq 15700 15799); do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
  done
  echo "ERROR: No free port found in 15700-15799" >&2
  return 1
}

# ─── Cleanup on exit (always) ───
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ─── Step 1: Build (ensure dist is fresh) ───
echo "[p0] Building project..." >&2
(cd "$PROJECT_DIR" && npm run build --silent) >&2

# ─── Step 2: Find free port ───
PORT=$(find_free_port)
export P0_PORT="$PORT"
echo "[p0] Using port $PORT, namespace $NAMESPACE" >&2

# ─── Step 3: Start web server ───
echo "[p0] Starting web server..." >&2
node "$PROJECT_DIR/dist/cli/index.js" web \
  --namespace "$NAMESPACE" \
  --port "$PORT" \
  >/tmp/p0-stale-final-server.log 2>&1 &
SERVER_PID=$!

# ─── Step 4: Wait for health check (max 30 retries, 1s each) ───
echo "[p0] Waiting for server health..." >&2
RETRIES=0
MAX_RETRIES=30
until curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "[p0] FAIL: Server did not become healthy after $MAX_RETRIES attempts" >&2
    cat /tmp/p0-stale-final-server.log >&2
    echo ""
    echo "P0 STALE FINAL REPORT"
    echo "verdict: FAIL"
    echo "violations: 1"
    echo "sessionCount: 0"
    echo "staleFiltered: 0"
    echo "totalChunks: 0"
    echo "evidencePath: $EVIDENCE_PATH"
    echo ""
    echo "  [FAIL] SERVER_START: Server failed to start within ${MAX_RETRIES}s"
    exit 1
  fi
  sleep 1
done
echo "[p0] Server healthy on port $PORT (PID $SERVER_PID)" >&2

# ─── Step 5: Run task runner (submits tasks, waits, collects logs) ───
echo "[p0] Running task runner..." >&2
RUNNER_OUTPUT=$(node "$SCRIPT_DIR/p0-stale-final-runner.js" 2>/tmp/p0-stale-final-runner.log)
RUNNER_EXIT=$?

if [ "$RUNNER_EXIT" -ne 0 ]; then
  echo "[p0] Runner failed (exit $RUNNER_EXIT)" >&2
  cat /tmp/p0-stale-final-runner.log >&2
  echo ""
  echo "P0 STALE FINAL REPORT"
  echo "verdict: FAIL"
  echo "violations: 1"
  echo "sessionCount: 0"
  echo "staleFiltered: 0"
  echo "totalChunks: 0"
  echo "evidencePath: $EVIDENCE_PATH"
  echo ""
  echo "  [FAIL] RUNNER: Task runner failed with exit code $RUNNER_EXIT"
  exit 1
fi

# ─── Step 6: Verify (reads runner output, validates, saves evidence) ───
echo "[p0] Running verification..." >&2
echo "$RUNNER_OUTPUT" | node "$SCRIPT_DIR/p0-stale-final-verify.js"
VERIFY_EXIT=$?

# ─── Step 7: Server shutdown (via trap) ───
echo "[p0] Verification exit code: $VERIFY_EXIT" >&2
exit "$VERIFY_EXIT"
