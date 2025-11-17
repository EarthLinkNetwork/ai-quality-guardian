#!/bin/bash

# Personal Mode汚染クリーンアップスクリプト
# Personalモードで誤って作成されたファイルを削除

set -e

CURRENT_DIR="$(pwd)"
DRY_RUN=false

# 引数解析
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "使用方法:"
            echo "  bash cleanup-personal-pollution.sh [--dry-run]"
            echo ""
            echo "オプション:"
            echo "  --dry-run    実際には削除せず、削除対象を表示するのみ"
            echo ""
            exit 0
            ;;
    esac
done

echo "Personal Mode 汚染クリーンアップ"
echo "対象ディレクトリ: $CURRENT_DIR"
if [ "$DRY_RUN" = true ]; then
    echo "モード: Dry Run（削除は実行しません）"
fi
echo ""

# 削除対象のファイル・ディレクトリ
CLEANUP_ITEMS=(
    "quality-guardian"
    ".quality-guardian.json"
    ".quality-baseline.json"
    ".quality-guardian/"
)

FOUND_ITEMS=false

echo "削除対象を検索中..."
for item in "${CLEANUP_ITEMS[@]}"; do
    if [ -e "$CURRENT_DIR/$item" ]; then
        echo "  ❌ $item"
        FOUND_ITEMS=true
    fi
done

if [ "$FOUND_ITEMS" = false ]; then
    echo "  ✅ 削除対象は見つかりませんでした"
    exit 0
fi

echo ""

if [ "$DRY_RUN" = true ]; then
    echo "上記のファイル・ディレクトリが削除対象です"
    echo "実際に削除するには、--dry-runオプションなしで実行してください"
    exit 0
fi

# 確認
read -p "上記のファイル・ディレクトリを削除してよろしいですか？ [y/N]: " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "キャンセルしました"
    exit 0
fi

echo ""
echo "クリーンアップ開始..."

# バックアップディレクトリ作成
BACKUP_DIR=".quality-guardian-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 削除実行（バックアップ付き）
for item in "${CLEANUP_ITEMS[@]}"; do
    if [ -e "$CURRENT_DIR/$item" ]; then
        echo "  削除: $item"

        # バックアップ
        if [ -d "$CURRENT_DIR/$item" ]; then
            cp -r "$CURRENT_DIR/$item" "$BACKUP_DIR/"
        else
            cp "$CURRENT_DIR/$item" "$BACKUP_DIR/"
        fi

        # 削除
        rm -rf "$CURRENT_DIR/$item"
        echo "    → バックアップ: $BACKUP_DIR/$item"
    fi
done

echo ""
echo "✅ クリーンアップ完了"
echo ""
echo "バックアップ: $BACKUP_DIR"
echo "（問題があれば、このディレクトリから復元できます）"
echo ""

# package.jsonのglob依存関係チェック
if [ -f "$CURRENT_DIR/package.json" ]; then
    if grep -q '"glob"' "$CURRENT_DIR/package.json" 2>/dev/null; then
        echo "⚠️  注意: package.json に 'glob' パッケージが残っています"
        echo "   元々プロジェクトで使用していない場合は、手動で削除してください:"
        echo "   - package.jsonから \"glob\" を削除"
        echo "   - npm/pnpm/yarn でアンインストール"
        echo ""
    fi
fi

# .claude/ ディレクトリの警告
if [ -d "$CURRENT_DIR/.claude" ]; then
    echo "⚠️  注意: .claude/ ディレクトリはそのまま残しています"
    echo "   プロジェクトの .claude/ が不要な場合は、手動で削除してください"
    echo ""
fi
