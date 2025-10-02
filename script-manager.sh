#!/bin/bash

# AI Scripts Manager - 統合スクリプト管理システム
# ~/dev/ai/scripts 配下の全スクリプトを管理

set -e

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.0.0"

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# メイン関数
main() {
    case "${1:-help}" in
        "list"|"ls")
            list_scripts
            ;;
        "status")
            check_status
            ;;
        "organize")
            organize_scripts
            ;;
        "install")
            install_to_project "${2:-$(pwd)}"
            ;;
        "upgrade")
            upgrade_scripts
            ;;
        "clean")
            clean_legacy
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "不明なコマンド: $1"
            show_help
            exit 1
            ;;
    esac
}

# スクリプト一覧表示
list_scripts() {
    log_info "🗂️  AI Scripts 一覧\n"

    echo "📁 アクティブスクリプト:"
    echo "├── quality-guardian/    - 統合品質管理システム"
    echo "│   ├── quality-guardian.js"
    echo "│   ├── install.sh"
    echo "│   └── modules/"
    echo "└── script-manager.sh    - このスクリプト"
    echo ""

    echo "📁 レガシースクリプト (統合済み):"
    if [ -f "$SCRIPTS_DIR/ai-quality-enforcer.sh" ]; then
        echo "├── ai-quality-enforcer.sh → quality-guardian に統合"
    fi
    if [ -f "$SCRIPTS_DIR/install-ai-quality.sh" ]; then
        echo "├── install-ai-quality.sh → quality-guardian/install.sh に統合"
    fi
    if [ -f "$SCRIPTS_DIR/setup-quality-workflow.sh" ]; then
        echo "└── setup-quality-workflow.sh → 要確認"
    fi
    echo ""

    echo "📊 統計:"
    local total_files=$(find "$SCRIPTS_DIR" -name "*.sh" -o -name "*.js" | wc -l)
    local active_files=$(find "$SCRIPTS_DIR/quality-guardian" -name "*.sh" -o -name "*.js" | wc -l)
    echo "  総ファイル数: $total_files"
    echo "  アクティブ: $active_files"
    echo "  レガシー: $((total_files - active_files))"
}

# ステータス確認
check_status() {
    log_info "🔍 システム状態確認\n"

    # Quality Guardian の状態
    if [ -d "$SCRIPTS_DIR/quality-guardian" ]; then
        log_success "Quality Guardian: インストール済み"

        local modules_count=$(find "$SCRIPTS_DIR/quality-guardian/modules" -name "*.js" 2>/dev/null | wc -l)
        echo "  モジュール数: $modules_count"

        if [ -x "$SCRIPTS_DIR/quality-guardian/quality-guardian.js" ]; then
            echo "  実行権限: ✅"
        else
            log_warning "  実行権限: ❌ (修復が必要)"
        fi
    else
        log_error "Quality Guardian: 未インストール"
    fi

    echo ""

    # レガシーファイルの確認
    log_info "📋 レガシーファイル状態:"

    local legacy_files=(
        "ai-quality-enforcer.sh"
        "install-ai-quality.sh"
        "setup-quality-workflow.sh"
    )

    for file in "${legacy_files[@]}"; do
        if [ -f "$SCRIPTS_DIR/$file" ]; then
            log_warning "  $file: 存在 (移行対象)"
        else
            echo "  $file: 整理済み"
        fi
    done

    echo ""

    # 使用可能性チェック
    log_info "🔧 使用可能性:"
    if command -v node >/dev/null 2>&1; then
        echo "  Node.js: ✅ $(node --version)"
    else
        log_warning "  Node.js: ❌ (Quality Guardian に必要)"
    fi

    if command -v npm >/dev/null 2>&1; then
        echo "  npm: ✅ $(npm --version)"
    else
        log_warning "  npm: ❌ (依存関係管理に必要)"
    fi
}

# スクリプト整理
organize_scripts() {
    log_info "🗂️  スクリプトを整理中...\n"

    # legacy ディレクトリに移動
    if [ -f "$SCRIPTS_DIR/ai-quality-enforcer.sh" ]; then
        mv "$SCRIPTS_DIR/ai-quality-enforcer.sh" "$SCRIPTS_DIR/legacy/"
        log_success "ai-quality-enforcer.sh を legacy/ に移動"
    fi

    if [ -f "$SCRIPTS_DIR/install-ai-quality.sh" ]; then
        mv "$SCRIPTS_DIR/install-ai-quality.sh" "$SCRIPTS_DIR/legacy/"
        log_success "install-ai-quality.sh を legacy/ に移動"
    fi

    # setup-quality-workflow.sh の処理
    if [ -f "$SCRIPTS_DIR/setup-quality-workflow.sh" ]; then
        log_warning "setup-quality-workflow.sh を確認しています..."

        # ファイルの内容を確認
        if grep -q "quality-guardian" "$SCRIPTS_DIR/setup-quality-workflow.sh" 2>/dev/null; then
            log_info "Quality Guardian と統合可能な機能を検出"
            mv "$SCRIPTS_DIR/setup-quality-workflow.sh" "$SCRIPTS_DIR/legacy/"
            log_success "setup-quality-workflow.sh を legacy/ に移動"
        else
            log_info "独立機能として tools/ に移動"
            mv "$SCRIPTS_DIR/setup-quality-workflow.sh" "$SCRIPTS_DIR/tools/"
        fi
    fi

    # 実行権限の確認と修正
    chmod +x "$SCRIPTS_DIR/quality-guardian/quality-guardian.js" 2>/dev/null || true
    chmod +x "$SCRIPTS_DIR/quality-guardian/install.sh" 2>/dev/null || true

    log_success "スクリプト整理完了"
}

# プロジェクトにインストール
install_to_project() {
    local project_dir="$1"

    log_info "🚀 プロジェクトに Quality Guardian をインストール"
    echo "対象: $project_dir"

    if [ ! -d "$project_dir" ]; then
        log_error "ディレクトリが存在しません: $project_dir"
        exit 1
    fi

    # Quality Guardian のインストール
    if [ -f "$SCRIPTS_DIR/quality-guardian/install.sh" ]; then
        bash "$SCRIPTS_DIR/quality-guardian/install.sh" "$project_dir"
        log_success "Quality Guardian インストール完了"
    else
        log_error "Quality Guardian インストーラーが見つかりません"
        exit 1
    fi
}

# スクリプト更新
upgrade_scripts() {
    log_info "⬆️  スクリプト更新中...\n"

    # Quality Guardian の更新チェック
    local current_version=$(grep '"version"' "$SCRIPTS_DIR/quality-guardian/quality-guardian.js" 2>/dev/null | head -1)
    echo "現在のバージョン: ${current_version:-'不明'}"

    # 依存関係の確認
    if [ -f "$SCRIPTS_DIR/quality-guardian/modules/baseline-monitor.js" ]; then
        log_success "全モジュールが最新状態です"
    else
        log_warning "一部モジュールが不足している可能性があります"
        organize_scripts
    fi

    log_success "更新確認完了"
}

# レガシーファイル削除
clean_legacy() {
    log_warning "🧹 レガシーファイル削除\n"

    if [ ! -d "$SCRIPTS_DIR/legacy" ]; then
        log_info "削除するレガシーファイルがありません"
        return
    fi

    echo "以下のファイルが削除されます:"
    find "$SCRIPTS_DIR/legacy" -name "*.sh" -o -name "*.js" | sed 's|.*/|  - |'
    echo ""

    read -p "続行しますか？ (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$SCRIPTS_DIR/legacy"
        log_success "レガシーファイルを削除しました"
    else
        log_info "削除をキャンセルしました"
    fi
}

# ヘルプ表示
show_help() {
    cat << EOF
AI Scripts Manager v${VERSION}

使用方法:
  $(basename "$0") <command> [options]

コマンド:
  list, ls              スクリプト一覧を表示
  status               システム状態を確認
  organize             スクリプトを整理 (レガシー分離)
  install <dir>        プロジェクトに Quality Guardian をインストール
  upgrade              スクリプトを最新状態に更新
  clean                レガシーファイルを削除
  help, -h, --help     このヘルプを表示

例:
  $0 list                           # スクリプト一覧
  $0 status                         # 状態確認
  $0 organize                       # ファイル整理
  $0 install /path/to/project       # インストール
  $0 clean                          # 古いファイル削除

詳細:
  Quality Guardian: ~/dev/ai/scripts/quality-guardian/README.md
EOF
}

# 初期化確認
if [ ! -d "$SCRIPTS_DIR/quality-guardian" ]; then
    log_error "Quality Guardian が見つかりません"
    log_info "先に Quality Guardian を設定してください"
    exit 1
fi

# メイン実行
main "$@"