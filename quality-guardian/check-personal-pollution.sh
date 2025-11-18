#!/bin/bash

# Personal Mode汚染チェックスクリプト
# Personalモードでインストールされたプロジェクトで、
# 誤ってプロジェクトディレクトリに作成されたファイルを検出

set -e

CURRENT_DIR="$(pwd)"

echo "Personal Mode 汚染チェック開始"
echo "対象ディレクトリ: $CURRENT_DIR"
echo ""

FOUND_POLLUTION=false
POLLUTION_FILES=()

# チェック対象のファイル・ディレクトリ
CHECK_ITEMS=(
    "quality-guardian"
    ".quality-guardian.json"
    ".quality-baseline.json"
    ".quality-guardian/"
)

echo "チェック項目:"
for item in "${CHECK_ITEMS[@]}"; do
    if [ -e "$CURRENT_DIR/$item" ]; then
        echo "  ❌ $item が存在します（Personalモードでは作成されるべきではない）"
        POLLUTION_FILES+=("$item")
        FOUND_POLLUTION=true
    else
        echo "  ✅ $item は存在しません"
    fi
done

# package.jsonの依存関係チェック
if [ -f "$CURRENT_DIR/package.json" ]; then
    if grep -q '"glob"' "$CURRENT_DIR/package.json" 2>/dev/null; then
        echo "  ⚠️  package.json に 'glob' パッケージが含まれています（Personalモードでは追加されるべきではない）"
        echo "     ※ただし、元々プロジェクトで使用している可能性もあります"
    fi
fi

# .claude/ ディレクトリの場所チェック
if [ -d "$CURRENT_DIR/.claude" ]; then
    echo ""
    echo "⚠️  警告: .claude/ がプロジェクトディレクトリに存在します"
    echo "   Personalモードでは親ディレクトリに作成されるべきです"
    echo "   場所: $CURRENT_DIR/.claude"

    # quality-guardian関連のファイルがあるか確認
    if [ -f "$CURRENT_DIR/.claude/CLAUDE.md" ]; then
        if grep -q "quality-guardian\|Quality Guardian" "$CURRENT_DIR/.claude/CLAUDE.md" 2>/dev/null; then
            echo "   → .claude/CLAUDE.md にquality-guardian関連の記述があります"
            POLLUTION_FILES+=(".claude/")
            FOUND_POLLUTION=true
        fi
    fi
fi

echo ""
echo "─────────────────────────────────────────"

if [ "$FOUND_POLLUTION" = true ]; then
    echo "❌ Personal Mode汚染が検出されました"
    echo ""
    echo "検出されたファイル:"
    for file in "${POLLUTION_FILES[@]}"; do
        echo "  - $file"
    done
    echo ""
    echo "クリーンアップするには:"
    echo "  bash cleanup-personal-pollution.sh"
    echo ""
    exit 1
else
    echo "✅ Personal Mode汚染は検出されませんでした"
    echo ""
    exit 0
fi
