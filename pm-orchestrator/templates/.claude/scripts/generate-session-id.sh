#!/bin/bash
# Generate a unique session ID for PM Orchestrator
# Format: session-YYYY-MM-DD-XXXXXX (where X is random hex)

date_part=$(date +%Y-%m-%d)
random_part=$(head -c 3 /dev/urandom | xxd -p)
echo "session-${date_part}-${random_part}"
