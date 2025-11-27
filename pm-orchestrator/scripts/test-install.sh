#!/bin/bash
#
# Installation Test Script
#
# 新しい環境でのインストール・動作・アンインストールを検証します。
# npm publish 前に実行することを推奨します。
#
# 使用方法:
#   ./scripts/test-install.sh
#   ./scripts/test-install.sh --keep  # テスト後にディレクトリを保持
#

set -e

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# オプション解析
KEEP_DIR=false
if [[ "$1" == "--keep" ]]; then
  KEEP_DIR=true
fi

# テスト用一時ディレクトリ
TEST_DIR=$(mktemp -d)
PACKAGE_NAME="pm-orchestrator-enhancement"

echo "=== Installation Test Suite ==="
echo "Test directory: $TEST_DIR"
echo ""

# クリーンアップ関数
cleanup() {
  if [[ "$KEEP_DIR" == "false" ]]; then
    echo ""
    echo "Cleaning up test directory..."
    rm -rf "$TEST_DIR"
  else
    echo ""
    echo -e "${YELLOW}Test directory preserved: $TEST_DIR${NC}"
  fi
}
trap cleanup EXIT

cd "$TEST_DIR"

# 1. npm init
echo "1. Creating test project..."
npm init -y > /dev/null 2>&1
echo -e "   ${GREEN}[PASS]${NC} npm init"

# 2. Install from npm registry
echo "2. Installing $PACKAGE_NAME from npm..."
if npm install "$PACKAGE_NAME" > /dev/null 2>&1; then
  echo -e "   ${GREEN}[PASS]${NC} npm install"
else
  echo -e "   ${RED}[FAIL]${NC} npm install"
  exit 1
fi

# 3. Import test
echo "3. Testing module import..."
if node -e "require('$PACKAGE_NAME')" > /dev/null 2>&1; then
  echo -e "   ${GREEN}[PASS]${NC} Module import"
else
  echo -e "   ${RED}[FAIL]${NC} Module import"
  exit 1
fi

# 4. Component instantiation test
echo "4. Testing component instantiation..."
node -e "
const pkg = require('$PACKAGE_NAME');
const os = require('os');
const path = require('path');

const tmpDir = path.join(os.tmpdir(), 'pm-test');

// PMOrchestrator
new pkg.PMOrchestrator(tmpDir);

// ExecutionLogger
new pkg.ExecutionLogger(tmpDir);

// ProgressTracker
const tracker = new pkg.ProgressTracker();
tracker.startTask('test', 'Test');
tracker.completeTask('test');

// Subagents
new pkg.RuleChecker();
new pkg.CodeAnalyzer();
new pkg.Designer();

console.log('All components instantiated successfully');
" && echo -e "   ${GREEN}[PASS]${NC} Component instantiation" || {
  echo -e "   ${RED}[FAIL]${NC} Component instantiation"
  exit 1
}

# 5. CLI test
echo "5. Testing CLI..."
if npx pm-orchestrator --help > /dev/null 2>&1; then
  echo -e "   ${GREEN}[PASS]${NC} CLI execution"
else
  echo -e "   ${RED}[FAIL]${NC} CLI execution"
  exit 1
fi

# 6. Uninstall test
echo "6. Testing uninstall..."
BEFORE_UNINSTALL=$(ls -la node_modules/ | wc -l)
npm uninstall "$PACKAGE_NAME" > /dev/null 2>&1
AFTER_UNINSTALL=$(ls -la node_modules/ 2>/dev/null | wc -l || echo "0")

# パッケージディレクトリが残っていないことを確認
if [[ -d "node_modules/$PACKAGE_NAME" ]]; then
  echo -e "   ${RED}[FAIL]${NC} Uninstall - package directory remains"
  exit 1
fi

echo -e "   ${GREEN}[PASS]${NC} Uninstall (clean removal)"

# 7. 残留ファイルチェック
echo "7. Checking for leftover files..."
LEFTOVER_FILES=$(find . -name ".pm-orchestrator*" -o -name "pm-orchestrator-*" 2>/dev/null | wc -l)
if [[ "$LEFTOVER_FILES" -gt 0 ]]; then
  echo -e "   ${YELLOW}[WARN]${NC} Found leftover files:"
  find . -name ".pm-orchestrator*" -o -name "pm-orchestrator-*"
else
  echo -e "   ${GREEN}[PASS]${NC} No leftover files"
fi

# サマリー
echo ""
echo "==================================="
echo -e "${GREEN}All installation tests passed!${NC}"
echo "==================================="
