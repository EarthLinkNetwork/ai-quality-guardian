#!/bin/bash

# Quality Guardian 自動セットアップスクリプト
# プロジェクトでの自動実行を設定

set -e

PROJECT_DIR="${1:-$(pwd)}"

echo "🤖 Quality Guardian 自動化セットアップ"
echo "対象: $PROJECT_DIR"

cd "$PROJECT_DIR"

# 1. Git hooks 設定
echo ""
echo "📎 Git hooks 設定中..."

# pre-commit hook (コミット前に自動チェック)
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Quality Guardian 自動品質チェック

echo "🔍 Quality Guardian: コミット前チェック実行中..."

# ベースラインが存在しない場合は記録
if [ ! -f ".quality-baseline.json" ]; then
    echo "📊 初回ベースライン記録中..."
    ./quality-guardian baseline
fi

# 品質チェック実行
./quality-guardian check --quick

if [ $? -ne 0 ]; then
    echo "❌ 品質チェックに失敗しました"
    echo ""
    echo "💡 ヒント:"
    echo "  - ./quality-guardian fix で自動修復を試す"
    echo "  - 品質劣化の詳細を確認してください"
    echo ""
    exit 1
fi

echo "✅ 品質チェック合格"
EOF

chmod +x .git/hooks/pre-commit

# post-merge hook (マージ後に自動ベースライン更新)
cat > .git/hooks/post-merge << 'EOF'
#!/bin/sh
# Quality Guardian ベースライン自動更新

echo "🔄 Quality Guardian: マージ後のベースライン更新..."
./quality-guardian baseline --silent
EOF

chmod +x .git/hooks/post-merge

# post-checkout hook (ブランチ切り替え時)
cat > .git/hooks/post-checkout << 'EOF'
#!/bin/sh
# Quality Guardian ブランチ切り替え時チェック

# ブランチ切り替えの場合のみ実行（ファイルcheckoutは無視）
if [ "$3" = "1" ]; then
    echo "🔄 Quality Guardian: ブランチ切り替え検出"

    # ベースラインがない場合は記録
    if [ ! -f ".quality-baseline.json" ]; then
        echo "📊 ベースライン記録中..."
        ./quality-guardian baseline --silent
    fi
fi
EOF

chmod +x .git/hooks/post-checkout

echo "✅ Git hooks 設定完了"

# 2. npm scripts 追加（既存の場合はスキップ）
echo ""
echo "📦 npm scripts 確認中..."

if [ -f "package.json" ]; then
    # pre/post スクリプト追加
    if ! grep -q '"pretest":' package.json; then
        # jqがある場合
        if command -v jq &> /dev/null; then
            jq '.scripts.pretest = "./quality-guardian check --quick"' package.json > package.json.tmp
            mv package.json.tmp package.json
            echo "✅ pretest スクリプト追加（テスト前に自動実行）"
        fi
    fi

    # watch モード追加
    if ! grep -q '"quality:watch":' package.json; then
        if command -v jq &> /dev/null; then
            jq '.scripts["quality:watch"] = "nodemon --watch src --ext ts,tsx,js,jsx --exec ./quality-guardian check"' package.json > package.json.tmp
            mv package.json.tmp package.json
            echo "✅ quality:watch スクリプト追加（ファイル監視モード）"
        fi
    fi
fi

# 3. VS Code 統合
echo ""
echo "💻 VS Code 統合設定..."

mkdir -p .vscode

# tasks.json 作成
cat > .vscode/tasks.json << 'EOF'
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Quality Guardian: Check",
            "type": "shell",
            "command": "./quality-guardian check",
            "group": {
                "kind": "test",
                "isDefault": false
            },
            "presentation": {
                "reveal": "always",
                "panel": "dedicated"
            },
            "problemMatcher": []
        },
        {
            "label": "Quality Guardian: Baseline",
            "type": "shell",
            "command": "./quality-guardian baseline",
            "presentation": {
                "reveal": "always",
                "panel": "dedicated"
            }
        },
        {
            "label": "Quality Guardian: Auto Fix",
            "type": "shell",
            "command": "./quality-guardian fix",
            "presentation": {
                "reveal": "always",
                "panel": "dedicated"
            }
        }
    ]
}
EOF

echo "✅ VS Code タスク設定完了"

# 4. 初回ベースライン記録
if [ ! -f ".quality-baseline.json" ]; then
    echo ""
    echo "📊 初回ベースライン記録..."
    ./quality-guardian baseline
fi

echo ""
echo "🎉 Quality Guardian 自動化セットアップ完了！"
echo ""
echo "自動実行される場面:"
echo "  📎 git commit時 - 品質チェック"
echo "  🔄 git merge時 - ベースライン更新"
echo "  🌿 ブランチ切り替え時 - ベースライン確認"
echo "  🧪 npm test実行前 - 品質チェック"
echo ""
echo "手動実行コマンド:"
echo "  npm run quality:watch - ファイル変更監視モード"
echo "  ./quality-guardian check - 品質チェック"
echo "  ./quality-guardian fix - 自動修復"
echo ""
echo "VS Code:"
echo "  Cmd+Shift+P → 'Tasks: Run Task' → Quality Guardian を選択"