#!/bin/bash

# AI Scripts Manager - 統合スクリプト管理システム
# ~/dev/ai/scripts 配下の全スクリプトを管理

set -e

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="2.0.0"

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() { echo -e "${BLUE}[INFO] $1${NC}"; }
log_success() { echo -e "${GREEN}[OK] $1${NC}"; }
log_warning() { echo -e "${YELLOW}[WARN] $1${NC}"; }
log_error() { echo -e "${RED}[ERROR] $1${NC}"; }

# メイン関数
main() {
    case "${1:-help}" in
        "list"|"ls")
            list_scripts
            ;;
        "status")
            check_status
            ;;
        "install")
            install_to_project "${2:-$(pwd)}"
            ;;
        "upgrade")
            upgrade_scripts
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
    log_info "AI Scripts 一覧\n"

    echo "アクティブスクリプト:"
    echo "  quality-guardian/    - 統合品質管理システム"
    echo "    quality-guardian.js"
    echo "    install.sh"
    echo "    modules/"
    echo "  pm-orchestrator/     - PM Orchestratorサブエージェントシステム"
    echo "  script-manager.sh    - このスクリプト"
    echo ""

    echo "統計:"
    local total_files=$(find "$SCRIPTS_DIR/quality-guardian" -name "*.sh" -o -name "*.js" 2>/dev/null | wc -l)
    echo "  Quality Guardianファイル数: $total_files"
}

# ステータス確認
check_status() {
    log_info "システム状態確認\n"

    # Quality Guardian の状態
    if [ -d "$SCRIPTS_DIR/quality-guardian" ]; then
        log_success "Quality Guardian: インストール済み"

        local modules_count=$(find "$SCRIPTS_DIR/quality-guardian/modules" -name "*.js" 2>/dev/null | wc -l)
        echo "  モジュール数: $modules_count"

        if [ -x "$SCRIPTS_DIR/quality-guardian/quality-guardian.js" ]; then
            echo "  実行権限: OK"
        else
            log_warning "  実行権限: NG (修復が必要)"
        fi

        # バージョン表示
        if [ -f "$SCRIPTS_DIR/quality-guardian/VERSION" ]; then
            echo "  バージョン: $(cat "$SCRIPTS_DIR/quality-guardian/VERSION")"
        fi
    else
        log_error "Quality Guardian: 未インストール"
    fi

    echo ""

    # PM Orchestrator の状態
    if [ -d "$SCRIPTS_DIR/pm-orchestrator" ]; then
        log_success "PM Orchestrator: 利用可能"
    else
        log_warning "PM Orchestrator: 未設定"
    fi

    echo ""

    # 使用可能性チェック
    log_info "実行環境:"
    if command -v node >/dev/null 2>&1; then
        echo "  Node.js: OK $(node --version)"
    else
        log_warning "  Node.js: NG (Quality Guardian に必要)"
    fi

    if command -v npm >/dev/null 2>&1; then
        echo "  npm: OK $(npm --version)"
    else
        log_warning "  npm: NG (依存関係管理に必要)"
    fi
}

# プロジェクトにインストール
install_to_project() {
    local project_dir="$1"

    log_info "プロジェクトに Quality Guardian をインストール"
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
    log_info "スクリプト更新中...\n"

    # Quality Guardian の更新チェック
    if [ -f "$SCRIPTS_DIR/quality-guardian/VERSION" ]; then
        echo "現在のバージョン: $(cat "$SCRIPTS_DIR/quality-guardian/VERSION")"
    fi

    # モジュール確認
    if [ -f "$SCRIPTS_DIR/quality-guardian/modules/baseline-monitor.js" ]; then
        log_success "全モジュールが最新状態です"
    else
        log_warning "一部モジュールが不足している可能性があります"
    fi

    # 実行権限の確認と修正
    chmod +x "$SCRIPTS_DIR/quality-guardian/quality-guardian.js" 2>/dev/null || true
    chmod +x "$SCRIPTS_DIR/quality-guardian/install.sh" 2>/dev/null || true

    log_success "更新確認完了"
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
  install <dir>        プロジェクトに Quality Guardian をインストール
  upgrade              スクリプトを最新状態に更新
  help, -h, --help     このヘルプを表示

例:
  $0 list                           # スクリプト一覧
  $0 status                         # 状態確認
  $0 install /path/to/project       # インストール

詳細:
  Quality Guardian: ~/dev/ai/scripts/quality-guardian/README.md
  PM Orchestrator:  ~/dev/ai/scripts/pm-orchestrator/README.md
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
