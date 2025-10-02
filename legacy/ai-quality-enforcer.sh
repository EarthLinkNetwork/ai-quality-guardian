#!/bin/bash

################################################################################
# AI Quality Enforcer - Universal Code Quality Guardian for Claude Code
#
# 汎用AIコード品質強制システム
# どのプロジェクトでも使用可能な品質チェック・強制ツール
#
# 使用方法:
#   1. インストール: ~/dev/ai/scripts/install-ai-quality.sh [project-path]
#   2. 実行: ai-quality check
#   3. 監視: ai-quality watch
#   4. レポート: ai-quality report
#
# Author: Claude AI Quality System
# Version: 1.0.0
################################################################################

set -e

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 設定
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_DIR/.ai-quality.log"
VIOLATIONS_FILE="$PROJECT_DIR/.ai-violations.json"
CONFIG_FILE="$PROJECT_DIR/.ai-quality-config.json"

# デフォルト設定
DEFAULT_CONFIG='{
  "checks": {
    "typescript": true,
    "eslint": true,
    "tests": true,
    "build": true,
    "prettier": true
  },
  "thresholds": {
    "test_coverage": 80,
    "test_pass_rate": 100,
    "max_typescript_errors": 0,
    "max_eslint_errors": 0
  },
  "auto_revert": true,
  "block_on_failure": true
}'

# ============================================================================
# 基本機能
# ============================================================================

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        ERROR)
            echo -e "${RED}❌ $message${NC}"
            ;;
        SUCCESS)
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        WARNING)
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        INFO)
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        *)
            echo "$message"
            ;;
    esac

    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# 設定読み込み
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        CONFIG=$(cat "$CONFIG_FILE")
    else
        CONFIG="$DEFAULT_CONFIG"
        echo "$DEFAULT_CONFIG" > "$CONFIG_FILE"
    fi
}

# プロジェクトタイプ検出
detect_project_type() {
    if [ -f "$PROJECT_DIR/package.json" ]; then
        if grep -q '"next"' "$PROJECT_DIR/package.json" 2>/dev/null; then
            echo "nextjs"
        elif grep -q '"react"' "$PROJECT_DIR/package.json" 2>/dev/null; then
            echo "react"
        elif grep -q '"vue"' "$PROJECT_DIR/package.json" 2>/dev/null; then
            echo "vue"
        else
            echo "node"
        fi
    elif [ -f "$PROJECT_DIR/Cargo.toml" ]; then
        echo "rust"
    elif [ -f "$PROJECT_DIR/go.mod" ]; then
        echo "go"
    elif [ -f "$PROJECT_DIR/requirements.txt" ] || [ -f "$PROJECT_DIR/setup.py" ]; then
        echo "python"
    else
        echo "unknown"
    fi
}

# ============================================================================
# 品質チェック機能
# ============================================================================

check_typescript() {
    log INFO "TypeScript構文チェック中..."

    if [ ! -f "$PROJECT_DIR/tsconfig.json" ]; then
        log WARNING "TypeScriptプロジェクトではありません"
        return 0
    fi

    cd "$PROJECT_DIR"

    if npx tsc --noEmit --skipLibCheck 2>&1 | tee /tmp/ts-check.log; then
        log SUCCESS "TypeScript: エラーなし"
        return 0
    else
        local error_count=$(grep -c "error TS" /tmp/ts-check.log || echo "0")
        log ERROR "TypeScript: ${error_count}個のエラー"
        return 1
    fi
}

check_eslint() {
    log INFO "ESLintチェック中..."

    if [ ! -f "$PROJECT_DIR/.eslintrc.json" ] && [ ! -f "$PROJECT_DIR/.eslintrc.js" ]; then
        log WARNING "ESLint設定がありません"
        return 0
    fi

    cd "$PROJECT_DIR"

    if npx eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0 2>&1 | tee /tmp/eslint-check.log; then
        log SUCCESS "ESLint: 問題なし"
        return 0
    else
        local error_count=$(grep -c "error" /tmp/eslint-check.log || echo "0")
        log ERROR "ESLint: ${error_count}個のエラー"
        return 1
    fi
}

check_tests() {
    log INFO "テスト実行中..."

    cd "$PROJECT_DIR"

    # package.jsonがある場合
    if [ -f "package.json" ]; then
        if ! grep -q '"test"' package.json; then
            log WARNING "テストスクリプトが定義されていません"
            return 0
        fi

        if npm test -- --passWithNoTests 2>&1 | tee /tmp/test-check.log; then
            log SUCCESS "テスト: すべて成功"
            return 0
        else
            log ERROR "テスト: 失敗"
            return 1
        fi
    fi

    return 0
}

check_build() {
    log INFO "ビルドチェック中..."

    cd "$PROJECT_DIR"

    # package.jsonがある場合
    if [ -f "package.json" ]; then
        if ! grep -q '"build"' package.json; then
            log WARNING "ビルドスクリプトが定義されていません"
            return 0
        fi

        if npm run build 2>&1 | tee /tmp/build-check.log | tail -5; then
            log SUCCESS "ビルド: 成功"
            return 0
        else
            log ERROR "ビルド: 失敗"
            return 1
        fi
    fi

    return 0
}

# ============================================================================
# 総合チェック
# ============================================================================

run_all_checks() {
    local all_passed=true

    echo -e "${BLUE}🛡️  AI Quality Enforcer - 品質チェック開始${NC}"
    echo "========================================"
    echo "プロジェクト: $PROJECT_DIR"
    echo "タイプ: $(detect_project_type)"
    echo "========================================"

    # TypeScriptチェック
    if [ "$(echo $CONFIG | jq -r '.checks.typescript')" = "true" ]; then
        if ! check_typescript; then
            all_passed=false
        fi
    fi

    # ESLintチェック
    if [ "$(echo $CONFIG | jq -r '.checks.eslint')" = "true" ]; then
        if ! check_eslint; then
            all_passed=false
        fi
    fi

    # テストチェック
    if [ "$(echo $CONFIG | jq -r '.checks.tests')" = "true" ]; then
        if ! check_tests; then
            all_passed=false
        fi
    fi

    # ビルドチェック
    if [ "$(echo $CONFIG | jq -r '.checks.build')" = "true" ]; then
        if ! check_build; then
            all_passed=false
        fi
    fi

    echo "========================================"

    if [ "$all_passed" = true ]; then
        log SUCCESS "すべての品質チェックに合格しました！"
        return 0
    else
        log ERROR "品質チェックに失敗しました"

        # 違反を記録
        record_violation "QUALITY_CHECK_FAILED" "$(date)"
        return 1
    fi
}

# ============================================================================
# 違反管理
# ============================================================================

record_violation() {
    local type=$1
    local details=$2

    # 既存の違反を読み込み
    if [ -f "$VIOLATIONS_FILE" ]; then
        VIOLATIONS=$(cat "$VIOLATIONS_FILE")
    else
        VIOLATIONS="[]"
    fi

    # 新しい違反を追加
    NEW_VIOLATION=$(jq -n \
        --arg type "$type" \
        --arg details "$details" \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '{type: $type, details: $details, timestamp: $timestamp}')

    # 違反リストを更新
    UPDATED_VIOLATIONS=$(echo "$VIOLATIONS" | jq ". += [$NEW_VIOLATION]")
    echo "$UPDATED_VIOLATIONS" > "$VIOLATIONS_FILE"

    log WARNING "違反が記録されました: $type"
}

show_report() {
    echo -e "${BLUE}📊 AI Quality Report${NC}"
    echo "========================================"

    if [ ! -f "$VIOLATIONS_FILE" ]; then
        log SUCCESS "違反記録なし"
        return
    fi

    local total=$(cat "$VIOLATIONS_FILE" | jq '. | length')
    echo "総違反数: $total"

    if [ "$total" -gt 0 ]; then
        echo ""
        echo "最近の違反:"
        cat "$VIOLATIONS_FILE" | jq -r '.[-10:] | reverse | .[] | "  \(.timestamp): \(.type)"'
    fi
}

# ============================================================================
# 監視モード
# ============================================================================

watch_mode() {
    log INFO "監視モード開始..."
    log INFO "ファイル変更を監視しています (Ctrl+C で終了)"

    # fswatch または inotifywait を使用
    if command -v fswatch > /dev/null; then
        fswatch -r "$PROJECT_DIR" | while read file; do
            if [[ $file == *.ts || $file == *.tsx || $file == *.js || $file == *.jsx ]]; then
                echo ""
                log INFO "ファイル変更検出: $file"
                run_all_checks
            fi
        done
    elif command -v inotifywait > /dev/null; then
        while true; do
            inotifywait -r -e modify,create,delete "$PROJECT_DIR" --exclude "node_modules|.git|.next|dist|build" 2>/dev/null
            echo ""
            log INFO "ファイル変更検出"
            run_all_checks
        done
    else
        log ERROR "fswatch または inotifywait が必要です"
        echo "インストール方法:"
        echo "  macOS: brew install fswatch"
        echo "  Linux: sudo apt-get install inotify-tools"
        exit 1
    fi
}

# ============================================================================
# メイン処理
# ============================================================================

main() {
    local command=${1:-help}

    # 設定読み込み
    load_config

    case $command in
        check)
            run_all_checks
            ;;
        watch)
            watch_mode
            ;;
        report)
            show_report
            ;;
        config)
            echo "$CONFIG" | jq '.'
            ;;
        init)
            echo "$DEFAULT_CONFIG" > "$CONFIG_FILE"
            log SUCCESS "設定ファイルを初期化しました: $CONFIG_FILE"
            ;;
        help|--help|-h)
            cat << EOF
AI Quality Enforcer - Universal Code Quality Guardian

使用方法: ai-quality [COMMAND]

コマンド:
    check   - すべての品質チェックを実行
    watch   - ファイル変更を監視して自動チェック
    report  - 違反レポートを表示
    config  - 現在の設定を表示
    init    - 設定ファイルを初期化
    help    - このヘルプを表示

設定ファイル: .ai-quality-config.json
ログファイル: .ai-quality.log
違反記録: .ai-violations.json

例:
    ai-quality check        # 品質チェック実行
    ai-quality watch        # 監視モード開始
    ai-quality report       # 違反レポート表示

詳細: https://github.com/yourusername/ai-quality-enforcer
EOF
            ;;
        *)
            log ERROR "不明なコマンド: $command"
            echo "使用方法: ai-quality [check|watch|report|config|init|help]"
            exit 1
            ;;
    esac
}

# スクリプト実行
main "$@"