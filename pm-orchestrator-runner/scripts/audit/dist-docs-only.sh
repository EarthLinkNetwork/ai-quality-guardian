#!/usr/bin/env bash
# dist-docs-only.sh — docs-only 変更で dist/ が動くかを自動検証
# SKIPしない。dirty worktree でも常に観測して証跡を残す。
# 出力: .tmp/audit-docs-only.log, .tmp/audit-docs-only.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$ROOT/.tmp"
LOG="$TMP/audit-docs-only.log"
JSON="$TMP/audit-docs-only.json"
MARKER_FILE="$ROOT/docs/EVIDENCE_SELF_HOSTING.md"
mkdir -p "$TMP"

exec > >(tee "$LOG") 2>&1

echo "=== dist-docs-only audit  $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "ROOT=$ROOT"

# --- detect dirty worktree ---
DIRTY_PORCELAIN=$(git -C "$ROOT" status --porcelain 2>/dev/null || true)
if [ -n "$DIRTY_PORCELAIN" ]; then
  DIRTY_WORKTREE="true"
else
  DIRTY_WORKTREE="false"
fi
echo "dirtyWorktree=$DIRTY_WORKTREE"

# --- decide mode ---
MAKE_DOCS_CHANGE="${AUDIT_MAKE_DOCS_CHANGE:-0}"
if [ "$MAKE_DOCS_CHANGE" = "1" ]; then
  MODE="mutate"
else
  MODE="observe"
fi
echo "mode=$MODE"

# --- snapshot dist status (現在の状態を観測) ---
DIST_STATUS_RAW=$(git -C "$ROOT" status --porcelain -- dist/ 2>/dev/null || true)
DIST_NAMESTATUS_RAW=$(git -C "$ROOT" diff --name-status -- dist/ 2>/dev/null || true)

# build JSON arrays from raw output
build_json_array() {
  local input="$1"
  if [ -z "$input" ]; then
    echo "[]"
    return
  fi
  local result="["
  local first="true"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # escape quotes
    line="${line//\\/\\\\}"
    line="${line//\"/\\\"}"
    if [ "$first" = "true" ]; then
      result="$result\"$line\""
      first="false"
    else
      result="$result,\"$line\""
    fi
  done <<< "$input"
  result="$result]"
  echo "$result"
}

DIST_STATUS_JSON=$(build_json_array "$DIST_STATUS_RAW")
DIST_NAMESTATUS_JSON=$(build_json_array "$DIST_NAMESTATUS_RAW")

echo "distStatusLines=$DIST_STATUS_RAW"
echo "distNameStatus=$DIST_NAMESTATUS_RAW"

GIT_HEAD=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DOCS_CHANGE_MADE="false"

if [ "$MODE" = "mutate" ]; then
  # --- mutate: docs に追記して dist の変化を観測 ---
  UNIX_TS=$(date +%s)
  AUDIT_MARKER="AUDIT_DOCS_ONLY_${UNIX_TS}"
  echo "" >> "$MARKER_FILE"
  echo "<!-- $AUDIT_MARKER -->" >> "$MARKER_FILE"
  DOCS_CHANGE_MADE="true"
  echo "docs probe appended: $AUDIT_MARKER"

  # --- dist の変化を再観測 ---
  DIST_STATUS_AFTER_RAW=$(git -C "$ROOT" status --porcelain -- dist/ 2>/dev/null || true)
  DIST_NAMESTATUS_AFTER_RAW=$(git -C "$ROOT" diff --name-status -- dist/ 2>/dev/null || true)
  DIST_STATUS_AFTER_JSON=$(build_json_array "$DIST_STATUS_AFTER_RAW")
  DIST_NAMESTATUS_AFTER_JSON=$(build_json_array "$DIST_NAMESTATUS_AFTER_RAW")

  # --- revert unless AUDIT_KEEP_DOCS_CHANGE=1 ---
  KEEP="${AUDIT_KEEP_DOCS_CHANGE:-0}"
  if [ "$KEEP" != "1" ]; then
    git -C "$ROOT" checkout -- "$MARKER_FILE"
    echo "docs change reverted"
  else
    echo "docs change KEPT (AUDIT_KEEP_DOCS_CHANGE=1)"
  fi

  cat > "$JSON" <<EOF
{
  "mode": "$MODE",
  "dirtyWorktree": $DIRTY_WORKTREE,
  "docsChangeMade": $DOCS_CHANGE_MADE,
  "distStatusLines": $DIST_STATUS_JSON,
  "distNameStatus": $DIST_NAMESTATUS_JSON,
  "distStatusAfterMutate": $DIST_STATUS_AFTER_JSON,
  "distNameStatusAfterMutate": $DIST_NAMESTATUS_AFTER_JSON,
  "timestamp": "$TS",
  "gitHead": "$GIT_HEAD",
  "branch": "$BRANCH"
}
EOF
else
  # --- observe: 現在の状態を記録するだけ ---
  cat > "$JSON" <<EOF
{
  "mode": "$MODE",
  "dirtyWorktree": $DIRTY_WORKTREE,
  "docsChangeMade": $DOCS_CHANGE_MADE,
  "distStatusLines": $DIST_STATUS_JSON,
  "distNameStatus": $DIST_NAMESTATUS_JSON,
  "timestamp": "$TS",
  "gitHead": "$GIT_HEAD",
  "branch": "$BRANCH"
}
EOF
fi

echo ""
echo "=> $JSON"
exit 0
