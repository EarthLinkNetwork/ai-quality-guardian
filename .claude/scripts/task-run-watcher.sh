#!/bin/bash
# ============================================================================
# Task Run Watcher
# ============================================================================
# Monitors .claude/sessions/*.json for stale runs
# Runs as a background process for this repository only
# Auto-terminates after inactivity
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SESSIONS_DIR="$PROJECT_DIR/.claude/sessions"
CONFIG_FILE="$PROJECT_DIR/.claude/project-config.json"
PID_FILE="/tmp/claude-task-watcher-$(echo "$PROJECT_DIR" | md5sum | cut -c1-8).pid"
LOG_FILE="/tmp/claude-task-watcher.log"

# Default settings (overridden by project-config.json)
STALE_MINUTES=45
CHECK_INTERVAL=300  # 5 minutes
IDLE_TIMEOUT=3600   # 1 hour of no activity

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        STALE_MINUTES=$(jq -r '.monitor.staleMinutes // 45' "$CONFIG_FILE")
        ENABLED=$(jq -r '.monitor.enabled // true' "$CONFIG_FILE")

        if [ "$ENABLED" != "true" ]; then
            log "Monitor is disabled in project config. Exiting."
            cleanup
            exit 0
        fi
    fi
}

cleanup() {
    log "Cleaning up and exiting..."
    rm -f "$PID_FILE"
}

trap cleanup EXIT

check_stale_runs() {
    local stale_runs=()
    local now=$(date +%s)
    local stale_threshold=$((STALE_MINUTES * 60))

    # Find all session files
    if [ ! -d "$SESSIONS_DIR" ]; then
        return
    fi

    for session_file in "$SESSIONS_DIR"/*.json; do
        [ -f "$session_file" ] || continue

        # Parse each run in the session
        local runs=$(jq -c '.runs[]?' "$session_file" 2>/dev/null)

        while IFS= read -r run; do
            [ -z "$run" ] && continue

            local status=$(echo "$run" | jq -r '.status // "unknown"')
            local updated_at=$(echo "$run" | jq -r '.updatedAt // ""')
            local task_run_id=$(echo "$run" | jq -r '.taskRunId // ""')
            local title=$(echo "$run" | jq -r '.title // "Untitled"')

            # Only check running/partial/blocked statuses
            if [[ "$status" == "running" || "$status" == "partial" || "$status" == "blocked" ]]; then
                if [ -n "$updated_at" ]; then
                    local updated_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$updated_at" +%s 2>/dev/null || date -d "$updated_at" +%s 2>/dev/null || echo "0")
                    local age=$((now - updated_ts))

                    if [ "$age" -gt "$stale_threshold" ]; then
                        stale_runs+=("{\"taskRunId\":\"$task_run_id\",\"title\":\"$title\",\"status\":\"$status\",\"ageMinutes\":$((age / 60))}")
                        log "Found stale run: $task_run_id ($title) - $((age / 60)) minutes old"
                    fi
                fi
            fi
        done <<< "$runs"
    done

    # If we found stale runs, output them
    if [ ${#stale_runs[@]} -gt 0 ]; then
        local json_array=$(printf '%s\n' "${stale_runs[@]}" | jq -s '.')
        echo "$json_array"

        # Write to alert file for task-run-monitor skill to pick up
        echo "$json_array" > "$SESSIONS_DIR/.stale-runs.json"
        log "Wrote ${#stale_runs[@]} stale runs to alert file"
    fi
}

# ============================================================================
# Main
# ============================================================================

# Check if already running
if [ -f "$PID_FILE" ]; then
    old_pid=$(cat "$PID_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
        echo "Watcher already running (PID: $old_pid)"
        exit 0
    else
        log "Stale PID file found, cleaning up"
        rm -f "$PID_FILE"
    fi
fi

# Write PID file
echo $$ > "$PID_FILE"
log "Task Run Watcher started (PID: $$)"
log "Project: $PROJECT_DIR"
log "Stale threshold: $STALE_MINUTES minutes"

# Load configuration
load_config

# Main loop
last_activity=$(date +%s)

while true; do
    # Check for stale runs
    stale_output=$(check_stale_runs)

    if [ -n "$stale_output" ]; then
        last_activity=$(date +%s)
    fi

    # Check for idle timeout
    now=$(date +%s)
    idle_time=$((now - last_activity))

    if [ "$idle_time" -gt "$IDLE_TIMEOUT" ]; then
        log "Idle timeout reached ($IDLE_TIMEOUT seconds). Exiting."
        exit 0
    fi

    # Check if sessions directory has been modified
    if [ -d "$SESSIONS_DIR" ]; then
        # Update last_activity if sessions were modified recently
        latest_mod=$(find "$SESSIONS_DIR" -name "*.json" -mmin -5 2>/dev/null | head -1)
        if [ -n "$latest_mod" ]; then
            last_activity=$(date +%s)
        fi
    fi

    # Sleep before next check
    sleep $CHECK_INTERVAL
done
