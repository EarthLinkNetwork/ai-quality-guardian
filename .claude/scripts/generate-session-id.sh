#!/bin/bash
# ============================================================================
# Session ID Generator
# ============================================================================
# Generates a unique session ID for PM Orchestrator sessions
# Format: session-YYYY-MM-DD-XXXXXX (where X is random hex)
# ============================================================================

set -e

# Get current date
DATE=$(date +%Y-%m-%d)

# Generate random hex string (6 characters)
RANDOM_HEX=$(openssl rand -hex 3)

# Combine to create session ID
SESSION_ID="session-${DATE}-${RANDOM_HEX}"

echo "$SESSION_ID"
