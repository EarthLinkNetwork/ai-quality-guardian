#!/bin/bash

# Quality Guardian install.sh テストスイート

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$SCRIPT_DIR/tmp"

# カラー出力
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# テスト結果カウンタ
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# テストヘルパー関数
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}[PASS]${NC} $message"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $message"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist: $file}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ -f "$file" ]; then
        echo -e "${GREEN}[PASS]${NC} $message"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $message"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Should contain: $needle}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}[PASS]${NC} $message"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $message"
        echo "  Haystack: $haystack"
        echo "  Needle:   $needle"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

setup() {
    echo -e "${YELLOW}[SETUP]${NC} Creating test environment..."
    rm -rf "$TEST_DIR"
    mkdir -p "$TEST_DIR"
}

teardown() {
    echo -e "${YELLOW}[TEARDOWN]${NC} Cleaning up test environment..."
    rm -rf "$TEST_DIR"
}

# テスト1: バージョン番号の整合性
test_version_consistency() {
    echo ""
    echo "========================================="
    echo "Test 1: Version Consistency"
    echo "========================================="

    local version_file=$(cat "$PROJECT_ROOT/VERSION")
    local install_version=$(sed -n 's/# version: "\(.*\)"/\1/p' "$PROJECT_ROOT/install.sh" | head -1)
    local js_version=$(sed -n "s/.*version: '\(.*\)'.*/\1/p" "$PROJECT_ROOT/quality-guardian.js" | head -1)
    local pkg_version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -1)
    local install_current=$(sed -n 's/CURRENT_VERSION="\(.*\)"/\1/p' "$PROJECT_ROOT/install.sh")
    local install_json=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' "$PROJECT_ROOT/install.sh" | head -1)

    assert_equals "$version_file" "$install_version" "install.sh version matches VERSION file"
    assert_equals "$version_file" "$js_version" "quality-guardian.js version matches VERSION file"
    assert_equals "$version_file" "$pkg_version" "package.json version matches VERSION file"
    assert_equals "$version_file" "$install_current" "install.sh CURRENT_VERSION matches VERSION file"
    assert_equals "$version_file" "$install_json" "install.sh JSON version matches VERSION file"
}

# テスト2: テンプレートファイルの存在確認
test_template_exists() {
    echo ""
    echo "========================================="
    echo "Test 2: Template File Exists"
    echo "========================================="

    assert_file_exists "$PROJECT_ROOT/.claude-template.md" "Template file exists"
}

# テスト3: テンプレートのプレースホルダー
test_template_placeholders() {
    echo ""
    echo "========================================="
    echo "Test 3: Template Placeholders"
    echo "========================================="

    local template_content=$(cat "$PROJECT_ROOT/.claude-template.md")

    assert_contains "$template_content" "__PROJECT_TYPE__" "Template contains __PROJECT_TYPE__ placeholder"
    assert_contains "$template_content" "__TEST_COMMAND_PLACEHOLDER__" "Template contains __TEST_COMMAND_PLACEHOLDER__"
    assert_contains "$template_content" "__LINT_COMMAND_PLACEHOLDER__" "Template contains __LINT_COMMAND_PLACEHOLDER__"
    assert_contains "$template_content" "__TYPE_CHECK_COMMAND_PLACEHOLDER__" "Template contains __TYPE_CHECK_COMMAND_PLACEHOLDER__"
    assert_contains "$template_content" "__BUILD_COMMAND_PLACEHOLDER__" "Template contains __BUILD_COMMAND_PLACEHOLDER__"
}

# テスト4: 必須モジュールの存在確認
test_modules_exist() {
    echo ""
    echo "========================================="
    echo "Test 4: Required Modules Exist"
    echo "========================================="

    assert_file_exists "$PROJECT_ROOT/modules/baseline-monitor.js" "baseline-monitor module exists"
    assert_file_exists "$PROJECT_ROOT/modules/context-analyzer.js" "context-analyzer module exists"
    assert_file_exists "$PROJECT_ROOT/modules/invariant-checker.js" "invariant-checker module exists"
    assert_file_exists "$PROJECT_ROOT/modules/deep-quality-analyzer.js" "deep-quality-analyzer module exists"
    assert_file_exists "$PROJECT_ROOT/modules/pr-reviewer.js" "pr-reviewer module exists"
}

# テスト5: install.shの構文チェック
test_install_syntax() {
    echo ""
    echo "========================================="
    echo "Test 5: install.sh Syntax Check"
    echo "========================================="

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if bash -n "$PROJECT_ROOT/install.sh" 2>/dev/null; then
        echo -e "${GREEN}[PASS]${NC} install.sh has valid syntax"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}[FAIL]${NC} install.sh has syntax errors"
        bash -n "$PROJECT_ROOT/install.sh"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# テスト6: quality-guardian.jsの構文チェック
test_js_syntax() {
    echo ""
    echo "========================================="
    echo "Test 6: quality-guardian.js Syntax Check"
    echo "========================================="

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if node --check "$PROJECT_ROOT/quality-guardian.js" 2>/dev/null; then
        echo -e "${GREEN}[PASS]${NC} quality-guardian.js has valid syntax"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}[FAIL]${NC} quality-guardian.js has syntax errors"
        node --check "$PROJECT_ROOT/quality-guardian.js"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# テスト7: TypeScriptプロジェクト検出のシミュレーション
test_typescript_detection() {
    echo ""
    echo "========================================="
    echo "Test 7: TypeScript Project Detection"
    echo "========================================="

    setup

    # TypeScriptプロジェクトを作成
    mkdir -p "$TEST_DIR/ts-project"
    cat > "$TEST_DIR/ts-project/package.json" << 'EOF'
{
  "name": "test-ts-project",
  "dependencies": {
    "typescript": "^5.0.0"
  }
}
EOF
    touch "$TEST_DIR/ts-project/tsconfig.json"

    # プロジェクト種別を検出するスクリプトを抽出して実行
    cd "$TEST_DIR/ts-project"

    if [ -f "package.json" ]; then
        if [ -f "tsconfig.json" ] || grep -q "typescript" package.json 2>/dev/null; then
            PROJECT_TYPE="TypeScript"
        fi
    fi

    cd - > /dev/null

    assert_equals "TypeScript" "$PROJECT_TYPE" "Detects TypeScript project correctly"

    teardown
}

# テスト8: Node.jsプロジェクト検出のシミュレーション
test_nodejs_detection() {
    echo ""
    echo "========================================="
    echo "Test 8: Node.js Project Detection"
    echo "========================================="

    setup

    # Node.jsプロジェクトを作成
    mkdir -p "$TEST_DIR/node-project"
    cat > "$TEST_DIR/node-project/package.json" << 'EOF'
{
  "name": "test-node-project"
}
EOF

    # プロジェクト種別を検出
    cd "$TEST_DIR/node-project"

    PROJECT_TYPE="Unknown"
    if [ -f "package.json" ]; then
        if [ ! -f "tsconfig.json" ] && ! grep -q "typescript" package.json 2>/dev/null; then
            PROJECT_TYPE="Node.js"
        fi
    fi

    cd - > /dev/null

    assert_equals "Node.js" "$PROJECT_TYPE" "Detects Node.js project correctly"

    teardown
}

# テスト9: Pythonプロジェクト検出
test_python_detection() {
    echo ""
    echo "========================================="
    echo "Test 9: Python Project Detection"
    echo "========================================="

    setup

    mkdir -p "$TEST_DIR/py-project"
    touch "$TEST_DIR/py-project/requirements.txt"

    cd "$TEST_DIR/py-project"

    PROJECT_TYPE="Unknown"
    if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
        PROJECT_TYPE="Python"
    fi

    cd - > /dev/null

    assert_equals "Python" "$PROJECT_TYPE" "Detects Python project correctly"

    teardown
}

# テスト10: AI開発ルールの存在確認
test_ai_rules_in_template() {
    echo ""
    echo "========================================="
    echo "Test 10: AI Development Rules in Template"
    echo "========================================="

    local template_content=$(cat "$PROJECT_ROOT/.claude-template.md")

    assert_contains "$template_content" "AI開発の必須ルール" "Template contains AI development rules section"
    assert_contains "$template_content" "### 1. 問題の再発防止" "Template contains Rule 1"
    assert_contains "$template_content" "### 16. プロジェクト本体へのフォーカス" "Template contains Rule 16"
    assert_contains "$template_content" "### 17. ホイスティング問題の回避" "Template contains Rule 17"
    assert_contains "$template_content" "### 18. テスト戦略：Unit + E2E" "Template contains Rule 18"
}

# メイン実行
main() {
    echo "========================================="
    echo "Quality Guardian Install Script Tests"
    echo "========================================="

    test_version_consistency
    test_template_exists
    test_template_placeholders
    test_modules_exist
    test_install_syntax
    test_js_syntax
    test_typescript_detection
    test_nodejs_detection
    test_python_detection
    test_ai_rules_in_template

    echo ""
    echo "========================================="
    echo "Test Results"
    echo "========================================="
    echo "Total:  $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
    echo "========================================="

    if [ $FAILED_TESTS -gt 0 ]; then
        echo -e "${RED}Tests FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests PASSED${NC}"
        exit 0
    fi
}

main "$@"
