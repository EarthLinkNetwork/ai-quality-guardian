#!/bin/bash
# dual-publish.sh - Publish to npm as both pm-orchestrator-enhancement and quality-guardian
#
# Usage: ./scripts/dual-publish.sh [--dry-run]
#
# This script publishes the same package under two names:
# 1. pm-orchestrator-enhancement (primary)
# 2. quality-guardian (alias)
#
# Both packages will have identical content, allowing users to install either:
#   npm install pm-orchestrator-enhancement
#   npm install quality-guardian

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$PROJECT_DIR/package.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}🧪 DRY RUN MODE - No actual publishing will occur${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Dual Publish: pm-orchestrator-enhancement + quality-guardian${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$PROJECT_DIR"

# Verify we're in the right directory
if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo -e "${RED}❌ Error: package.json not found in $PROJECT_DIR${NC}"
  exit 1
fi

# Get current version
VERSION=$(node -p "require('./package.json').version")
echo -e "📦 Version: ${GREEN}$VERSION${NC}"
echo ""

# Backup original package.json
cp "$PACKAGE_JSON" "$PACKAGE_JSON.backup"

# Function to restore package.json on error
cleanup() {
  if [[ -f "$PACKAGE_JSON.backup" ]]; then
    mv "$PACKAGE_JSON.backup" "$PACKAGE_JSON"
    echo -e "${YELLOW}📋 Restored original package.json${NC}"
  fi
}
trap cleanup EXIT

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Build
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo -e "${BLUE}[1/4] Building...${NC}"
npm run build
echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Publish as pm-orchestrator-enhancement
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo -e "${BLUE}[2/4] Publishing as pm-orchestrator-enhancement...${NC}"

# Ensure name is pm-orchestrator-enhancement
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.name = 'pm-orchestrator-enhancement';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}  [DRY RUN] npm publish --dry-run${NC}"
  npm publish --dry-run 2>/dev/null || true
else
  npm publish
fi
echo -e "${GREEN}✅ Published pm-orchestrator-enhancement@$VERSION${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Publish as quality-guardian
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo -e "${BLUE}[3/4] Publishing as quality-guardian...${NC}"

# Change name to quality-guardian
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.name = 'quality-guardian';
pkg.description = 'AI Quality Guardian - Multi-agent orchestration and quality management system for Claude Code projects';
// Update bin commands
pkg.bin = {
  'quality-guardian': './dist/cli/index.js',
  'pm-orchestrator': './dist/cli/index.js'
};
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}  [DRY RUN] npm publish --dry-run${NC}"
  npm publish --dry-run 2>/dev/null || true
else
  npm publish
fi
echo -e "${GREEN}✅ Published quality-guardian@$VERSION${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Restore original package.json
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo -e "${BLUE}[4/4] Restoring original package.json...${NC}"
mv "$PACKAGE_JSON.backup" "$PACKAGE_JSON"
trap - EXIT  # Remove the trap since we restored manually
echo -e "${GREEN}✅ Restored package.json${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Dual Publish Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Users can now install via either:"
echo -e "  ${BLUE}npm install pm-orchestrator-enhancement${NC}"
echo -e "  ${BLUE}npm install quality-guardian${NC}"
echo ""
echo "Both packages contain identical functionality."
echo ""
