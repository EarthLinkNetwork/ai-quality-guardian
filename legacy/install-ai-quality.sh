#!/bin/bash

################################################################################
# AI Quality Enforcer - インストーラー
#
# 任意のプロジェクトにAI品質強制システムをインストール
#
# 使用方法:
#   ~/dev/ai/scripts/install-ai-quality.sh [project-path]
#
# 実行後:
#   - ai-quality コマンドが使用可能
#   - プロジェクトのpackage.jsonに品質チェックスクリプト追加
#   - pre-commitフック設定
################################################################################

set -e

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# パス設定
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
AI_QUALITY_SCRIPT="$SCRIPT_DIR/ai-quality-enforcer.sh"
PROJECT_DIR="${1:-$(pwd)}"

echo -e "${BLUE}🚀 AI Quality Enforcer インストール${NC}"
echo "========================================"
echo "インストール先: $PROJECT_DIR"
echo ""

# プロジェクトディレクトリの確認
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ プロジェクトディレクトリが存在しません: $PROJECT_DIR${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# ============================================================================
# 1. シェルスクリプトのシンボリックリンク作成
# ============================================================================

echo "1. ai-qualityコマンドを設定中..."

# ローカルbinディレクトリ作成
mkdir -p "$HOME/.local/bin"

# シンボリックリンク作成
if [ -L "$HOME/.local/bin/ai-quality" ]; then
    rm "$HOME/.local/bin/ai-quality"
fi
ln -s "$AI_QUALITY_SCRIPT" "$HOME/.local/bin/ai-quality"
chmod +x "$AI_QUALITY_SCRIPT"

# PATHに追加（まだ追加されていない場合）
if ! echo $PATH | grep -q "$HOME/.local/bin"; then
    echo "" >> "$HOME/.bashrc"
    echo "# AI Quality Enforcer" >> "$HOME/.bashrc"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"

    if [ -f "$HOME/.zshrc" ]; then
        echo "" >> "$HOME/.zshrc"
        echo "# AI Quality Enforcer" >> "$HOME/.zshrc"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    fi

    echo -e "${YELLOW}⚠️  PATHに追加しました。新しいターミナルで有効になります${NC}"
fi

echo -e "${GREEN}✅ ai-qualityコマンドを設定しました${NC}"

# ============================================================================
# 2. package.jsonにスクリプト追加（Node.jsプロジェクトの場合）
# ============================================================================

if [ -f "package.json" ]; then
    echo ""
    echo "2. package.jsonにスクリプトを追加中..."

    # jqを使ってpackage.jsonを更新
    if command -v jq > /dev/null; then
        # 既存のスクリプトを読み込み
        SCRIPTS=$(cat package.json | jq '.scripts')

        # AI品質チェックスクリプトを追加
        UPDATED_SCRIPTS=$(echo "$SCRIPTS" | jq '. + {
            "ai:check": "ai-quality check",
            "ai:watch": "ai-quality watch",
            "ai:report": "ai-quality report",
            "quality:enforce": "ai-quality check && echo \"✅ 品質基準クリア\"",
            "pre-commit-check": "ai-quality check"
        }')

        # package.jsonを更新
        cat package.json | jq ".scripts = $UPDATED_SCRIPTS" > package.json.tmp
        mv package.json.tmp package.json

        echo -e "${GREEN}✅ package.jsonにスクリプトを追加しました${NC}"
    else
        echo -e "${YELLOW}⚠️  jqがインストールされていません。手動でpackage.jsonに以下を追加してください:${NC}"
        cat << 'EOF'

"scripts": {
    ...
    "ai:check": "ai-quality check",
    "ai:watch": "ai-quality watch",
    "ai:report": "ai-quality report",
    "quality:enforce": "ai-quality check && echo '✅ 品質基準クリア'",
    "pre-commit-check": "ai-quality check"
}
EOF
    fi
fi

# ============================================================================
# 3. Git hooks設定
# ============================================================================

if [ -d ".git" ]; then
    echo ""
    echo "3. Git hooksを設定中..."

    # Huskyがインストールされているか確認
    if [ -d ".husky" ]; then
        # Huskyのpre-commitフックに追加
        if [ -f ".husky/pre-commit" ]; then
            if ! grep -q "ai-quality" ".husky/pre-commit"; then
                echo "" >> ".husky/pre-commit"
                echo "# AI Quality Check" >> ".husky/pre-commit"
                echo "echo '🛡️  AI品質チェック実行中...'" >> ".husky/pre-commit"
                echo "ai-quality check || exit 1" >> ".husky/pre-commit"
            fi
        else
            cat > ".husky/pre-commit" << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# AI Quality Check
echo "🛡️  AI品質チェック実行中..."
ai-quality check || exit 1
EOF
            chmod +x ".husky/pre-commit"
        fi
        echo -e "${GREEN}✅ Huskyフックを設定しました${NC}"
    else
        # 通常のGit hookを設定
        mkdir -p .git/hooks
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# AI Quality Check
echo "🛡️  AI品質チェック実行中..."
ai-quality check || exit 1
EOF
        chmod +x .git/hooks/pre-commit
        echo -e "${GREEN}✅ Git pre-commitフックを設定しました${NC}"
    fi
fi

# ============================================================================
# 4. 設定ファイル作成
# ============================================================================

echo ""
echo "4. 設定ファイルを作成中..."

if [ ! -f ".ai-quality-config.json" ]; then
    cat > .ai-quality-config.json << 'EOF'
{
  "checks": {
    "typescript": true,
    "eslint": true,
    "tests": true,
    "build": false,
    "prettier": true
  },
  "thresholds": {
    "test_coverage": 80,
    "test_pass_rate": 100,
    "max_typescript_errors": 0,
    "max_eslint_errors": 0
  },
  "auto_revert": true,
  "block_on_failure": true,
  "ignore_patterns": [
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    "*.min.js",
    "*.bundle.js"
  ]
}
EOF
    echo -e "${GREEN}✅ 設定ファイルを作成しました${NC}"
else
    echo -e "${YELLOW}ℹ️  設定ファイルは既に存在します${NC}"
fi

# ============================================================================
# 5. .gitignore更新
# ============================================================================

if [ -f ".gitignore" ]; then
    echo ""
    echo "5. .gitignoreを更新中..."

    # AI品質関連ファイルを.gitignoreに追加
    if ! grep -q ".ai-quality.log" .gitignore; then
        echo "" >> .gitignore
        echo "# AI Quality Enforcer" >> .gitignore
        echo ".ai-quality.log" >> .gitignore
        echo ".ai-violations.json" >> .gitignore
        echo ".ai-code-guard.log" >> .gitignore
        echo -e "${GREEN}✅ .gitignoreを更新しました${NC}"
    else
        echo -e "${YELLOW}ℹ️  .gitignoreは既に設定済みです${NC}"
    fi
fi

# ============================================================================
# 完了
# ============================================================================

echo ""
echo "========================================"
echo -e "${GREEN}✅ インストール完了！${NC}"
echo ""
echo "使用可能なコマンド:"
echo "  ai-quality check   - 品質チェック実行"
echo "  ai-quality watch   - 監視モード開始"
echo "  ai-quality report  - 違反レポート表示"
echo ""

if [ -f "package.json" ]; then
    echo "npm scripts:"
    echo "  npm run ai:check   - 品質チェック"
    echo "  npm run ai:watch   - 監視モード"
    echo "  npm run ai:report  - レポート表示"
    echo ""
fi

echo "設定ファイル: .ai-quality-config.json"
echo ""
echo -e "${BLUE}今すぐ品質チェックを実行: ai-quality check${NC}"

# 現在のシェルでPATHを更新
export PATH="$HOME/.local/bin:$PATH"