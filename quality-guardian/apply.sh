#!/bin/bash
# apply.sh - ホワイトリストベースの安全なパッチ適用スクリプト
# LLM暴走防止アーキテクチャの一部として、提案モードで生成されたパッチを安全に適用する
#
# version: "1.0.0"

set -e

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ出力関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 使用方法
usage() {
    cat << EOF
Usage: apply.sh [OPTIONS] <patch_file>

ホワイトリストベースの安全なパッチ適用スクリプト

OPTIONS:
  -w, --whitelist FILE    ホワイトリストファイルを指定（デフォルト: .apply-whitelist）
  -d, --dry-run           実際には適用せず、適用される内容を表示
  -f, --force             Git clean check をスキップ（非推奨）
  -y, --yes               確認プロンプトをスキップ
  -h, --help              このヘルプを表示

EXAMPLES:
  apply.sh patch.diff                    # パッチを適用
  apply.sh -d patch.diff                 # dry-run モードで確認
  apply.sh -w my-whitelist patch.diff    # カスタムホワイトリストを使用

WHITELIST FORMAT:
  ホワイトリストファイル（.apply-whitelist）には、変更を許可するパスパターンを記述：

  # コメント行
  src/**/*.ts
  src/**/*.tsx
  tests/**/*.test.ts
  !src/config/secrets.ts   # 除外パターン（先頭に!）

EOF
    exit 0
}

# 引数解析
WHITELIST_FILE=".apply-whitelist"
DRY_RUN=false
FORCE=false
SKIP_CONFIRM=false
PATCH_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--whitelist)
            WHITELIST_FILE="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -y|--yes)
            SKIP_CONFIRM=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            log_error "不明なオプション: $1"
            usage
            ;;
        *)
            PATCH_FILE="$1"
            shift
            ;;
    esac
done

# パッチファイルの確認
if [ -z "$PATCH_FILE" ]; then
    log_error "パッチファイルを指定してください"
    usage
fi

if [ ! -f "$PATCH_FILE" ]; then
    log_error "パッチファイルが見つかりません: $PATCH_FILE"
    exit 1
fi

# Git リポジトリの確認
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    log_error "Gitリポジトリ内で実行してください"
    exit 1
fi

# Git clean check
if [ "$FORCE" != true ]; then
    if ! git diff --quiet; then
        log_error "コミットされていない変更があります"
        log_info "変更をコミットするか、--force オプションを使用してください"
        echo ""
        git status --short
        exit 1
    fi

    if ! git diff --cached --quiet; then
        log_error "ステージングされた変更があります"
        log_info "変更をコミットするか、--force オプションを使用してください"
        echo ""
        git status --short
        exit 1
    fi
fi

# ホワイトリストの読み込み
load_whitelist() {
    local whitelist_file="$1"
    local include_patterns=()
    local exclude_patterns=()

    if [ ! -f "$whitelist_file" ]; then
        log_warning "ホワイトリストファイルが見つかりません: $whitelist_file"
        log_info "デフォルトのホワイトリスト（src/**）を使用します"
        include_patterns=("src/**")
    else
        while IFS= read -r line || [[ -n "$line" ]]; do
            # 空行とコメント行をスキップ
            [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

            # 先頭の空白を削除
            line=$(echo "$line" | sed 's/^[[:space:]]*//')

            if [[ "$line" == !* ]]; then
                # 除外パターン
                exclude_patterns+=("${line:1}")
            else
                # 包含パターン
                include_patterns+=("$line")
            fi
        done < "$whitelist_file"
    fi

    # グローバル変数として設定
    INCLUDE_PATTERNS=("${include_patterns[@]}")
    EXCLUDE_PATTERNS=("${exclude_patterns[@]}")
}

# パスがホワイトリストに含まれているか確認
is_path_allowed() {
    local path="$1"
    local allowed=false

    # 包含パターンのチェック
    for pattern in "${INCLUDE_PATTERNS[@]}"; do
        if [[ "$path" == $pattern ]]; then
            allowed=true
            break
        fi
        # glob展開を試みる
        if [[ "$path" =~ ${pattern//\*\*/.*} ]]; then
            allowed=true
            break
        fi
    done

    # 除外パターンのチェック
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$path" == $pattern ]]; then
            allowed=false
            break
        fi
        if [[ "$path" =~ ${pattern//\*\*/.*} ]]; then
            allowed=false
            break
        fi
    done

    $allowed
}

# パッチからファイルパスを抽出
extract_paths_from_patch() {
    local patch_file="$1"
    grep -E '^(\+\+\+|---) [ab]/' "$patch_file" | sed 's/^[+-]\+ [ab]\///' | sort -u
}

# パッチの検証
validate_patch() {
    local patch_file="$1"
    local paths
    local blocked_paths=()
    local allowed_paths=()

    paths=$(extract_paths_from_patch "$patch_file")

    while IFS= read -r path; do
        [ -z "$path" ] && continue

        if is_path_allowed "$path"; then
            allowed_paths+=("$path")
        else
            blocked_paths+=("$path")
        fi
    done <<< "$paths"

    # 結果を表示
    if [ ${#allowed_paths[@]} -gt 0 ]; then
        log_info "許可されたパス:"
        for path in "${allowed_paths[@]}"; do
            echo -e "  ${GREEN}+${NC} $path"
        done
    fi

    if [ ${#blocked_paths[@]} -gt 0 ]; then
        log_warning "ブロックされたパス:"
        for path in "${blocked_paths[@]}"; do
            echo -e "  ${RED}-${NC} $path"
        done
        return 1
    fi

    return 0
}

# メイン処理
main() {
    log_info "パッチ適用スクリプト v1.0.0"
    echo ""

    # ホワイトリストの読み込み
    load_whitelist "$WHITELIST_FILE"
    log_info "ホワイトリストパターン: ${INCLUDE_PATTERNS[*]}"
    if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
        log_info "除外パターン: ${EXCLUDE_PATTERNS[*]}"
    fi
    echo ""

    # パッチの検証
    log_info "パッチを検証中: $PATCH_FILE"
    echo ""

    if ! validate_patch "$PATCH_FILE"; then
        log_error "ホワイトリスト外のパスが含まれています"
        log_info "ホワイトリストを更新するか、パッチを修正してください"
        exit 1
    fi

    echo ""
    log_success "パッチの検証に成功しました"
    echo ""

    # dry-run モードの場合
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] 以下の変更が適用されます:"
        echo ""
        git apply --stat "$PATCH_FILE"
        echo ""
        log_info "[DRY-RUN] 実際には適用されませんでした"
        exit 0
    fi

    # 確認プロンプト
    if [ "$SKIP_CONFIRM" != true ]; then
        echo ""
        echo -e "${YELLOW}パッチを適用しますか？ (y/N)${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "キャンセルしました"
            exit 0
        fi
    fi

    # パッチの適用
    log_info "パッチを適用中..."

    if git apply "$PATCH_FILE"; then
        log_success "パッチの適用が完了しました"
        echo ""
        log_info "変更内容:"
        git diff --stat
    else
        log_error "パッチの適用に失敗しました"
        exit 1
    fi
}

main "$@"
