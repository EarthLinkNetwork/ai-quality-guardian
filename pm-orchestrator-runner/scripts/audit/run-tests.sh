#!/usr/bin/env bash
# run-tests.sh — npm test の exit code と failing 数の整合性を証跡化
# 出力: .tmp/npm-test.full.log, .tmp/npm-test.summary.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$ROOT/.tmp"
LOG="$TMP/npm-test.full.log"
JSON="$TMP/npm-test.summary.json"
mkdir -p "$TMP"

echo "=== run-tests audit  $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# --- run npm test, capture exit code ---
set +e
npm test --prefix "$ROOT" > "$LOG" 2>&1
EXIT_CODE=$?
set -e

echo "exit_code=$EXIT_CODE"

# --- parse mocha output (末尾から抽出、取れなければ null) ---
PASSING_RAW=$(grep -oE '[0-9]+ passing' "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
FAILING_RAW=$(grep -oE '[0-9]+ failing'  "$LOG" | tail -1 | grep -oE '[0-9]+' || true)
PENDING_RAW=$(grep -oE '[0-9]+ pending'  "$LOG" | tail -1 | grep -oE '[0-9]+' || true)

PASSING_JSON="${PASSING_RAW:-null}"
FAILING_JSON="${FAILING_RAW:-null}"
PENDING_JSON="${PENDING_RAW:-null}"

echo "passing=$PASSING_JSON  failing=$FAILING_JSON  pending=$PENDING_JSON"

# --- consistency check: failing>0 かつ exitCode==0 は「誤認」 ---
FAILING_NUM="${FAILING_RAW:-0}"
if [ "$FAILING_NUM" -gt 0 ] 2>/dev/null && [ "$EXIT_CODE" -eq 0 ]; then
  echo "MISDETECTION: failing=$FAILING_NUM but exit_code=0"
  cat > "$JSON" <<EOF
{
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exitCode": $EXIT_CODE,
  "passing": $PASSING_JSON,
  "failing": $FAILING_JSON,
  "pending": $PENDING_JSON,
  "verdict": "MISDETECTION",
  "fullLog": "$LOG"
}
EOF
  echo "=> $JSON"
  exit 2
fi

# --- mocha 失敗 ---
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: mocha exited with $EXIT_CODE"
  cat > "$JSON" <<EOF
{
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exitCode": $EXIT_CODE,
  "passing": $PASSING_JSON,
  "failing": $FAILING_JSON,
  "pending": $PENDING_JSON,
  "verdict": "FAIL",
  "fullLog": "$LOG"
}
EOF
  echo "=> $JSON"
  exit 1
fi

# --- 正常完走 ---
echo "PASS"
cat > "$JSON" <<EOF
{
  "ts": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exitCode": 0,
  "passing": $PASSING_JSON,
  "failing": $FAILING_JSON,
  "pending": $PENDING_JSON,
  "verdict": "PASS",
  "fullLog": "$LOG"
}
EOF
echo "=> $JSON"
exit 0
