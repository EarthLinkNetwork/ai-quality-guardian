#!/bin/bash

# Quality Guardian インストーラー
# 任意のプロジェクトに品質管理システムを導入
# version: "1.2.33"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

# インストールモード: personal または team
INSTALL_MODE="team"
FORCE_INSTALL=false
NON_INTERACTIVE=false
CLAUDE_DIR=""
GIT_PROJECT_DIR=""

# 引数解析
for arg in "$@"; do
    case $arg in
        --personal|--mode=personal)
            INSTALL_MODE="personal"
            shift
            ;;
        --team|--mode=team)
            INSTALL_MODE="team"
            shift
            ;;
        --force)
            FORCE_INSTALL=true
            shift
            ;;
        --non-interactive|--auto)
            NON_INTERACTIVE=true
            shift
            ;;
    esac
done

# Gitリポジトリを検索する関数
find_git_repositories() {
    local search_dir="${1:-.}"
    local max_depth="${2:-3}"

    # カレントディレクトリ配下のGitリポジトリを検索
    find "$search_dir" -maxdepth "$max_depth" -type d -name ".git" 2>/dev/null | while read -r git_dir; do
        dirname "$git_dir"
    done
}

# Personal Mode: Gitリポジトリを選択
select_git_repository_for_personal_mode() {
    # 非対話モードの場合はカレントディレクトリを返す
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "$CURRENT_DIR"
        return 0
    fi

    echo ""
    echo "[Personal Mode] Gitリポジトリを選択してください"
    echo ""

    # Gitリポジトリを検索
    local repos=()
    while IFS= read -r repo; do
        repos+=("$repo")
    done < <(find_git_repositories "$CURRENT_DIR" 3)

    # カレントディレクトリも選択肢に追加
    local current_option="$CURRENT_DIR (カレントディレクトリ)"

    if [ ${#repos[@]} -eq 0 ]; then
        # Gitリポジトリが見つからない場合
        echo "[警告] Gitリポジトリが見つかりませんでした"
        echo ""
        echo "選択肢:"
        echo "1) $current_option"
        echo "2) その他（手動入力）"
        echo ""
        read -p "選択 [1-2]: " choice

        case $choice in
            1)
                echo "$CURRENT_DIR"
                ;;
            2)
                read -p "インストール先のパスを入力: " manual_path
                echo "$manual_path"
                ;;
            *)
                echo "[エラー] 無効な選択です"
                exit 1
                ;;
        esac
    elif [ ${#repos[@]} -eq 1 ]; then
        # Gitリポジトリが1つだけ見つかった場合
        echo "検出されたGitリポジトリ: ${repos[0]}"
        echo ""
        echo "選択肢:"
        echo "1) ${repos[0]}"
        echo "2) $current_option"
        echo "3) その他（手動入力）"
        echo ""
        read -p "選択 [1-3]: " choice

        case $choice in
            1)
                echo "${repos[0]}"
                ;;
            2)
                echo "$CURRENT_DIR"
                ;;
            3)
                read -p "インストール先のパスを入力: " manual_path
                echo "$manual_path"
                ;;
            *)
                echo "[エラー] 無効な選択です"
                exit 1
                ;;
        esac
    else
        # 複数のGitリポジトリが見つかった場合
        echo "複数のGitリポジトリが見つかりました:"
        echo ""

        local i=1
        for repo in "${repos[@]}"; do
            echo "$i) $repo"
            ((i++))
        done
        echo "$i) $current_option"
        ((i++))
        echo "$i) その他（手動入力）"
        echo ""

        local max_choice=$i
        read -p "選択 [1-$max_choice]: " choice

        if [ "$choice" -eq "${#repos[@]}" ] 2>/dev/null && [ "$choice" -le "${#repos[@]}" ]; then
            echo "${repos[$((choice-1))]}"
        elif [ "$choice" -eq "$((${#repos[@]}+1))" ]; then
            echo "$CURRENT_DIR"
        elif [ "$choice" -eq "$max_choice" ]; then
            read -p "インストール先のパスを入力: " manual_path
            echo "$manual_path"
        else
            echo "[エラー] 無効な選択です"
            exit 1
        fi
    fi
}

# インストール先を決定
if [ "$INSTALL_MODE" = "personal" ]; then
    # Personal Mode: .claude/ はカレント、Quality Guardian本体はGitリポジトリへ
    CLAUDE_DIR="$CURRENT_DIR"
    GIT_PROJECT_DIR="$(select_git_repository_for_personal_mode)"

    if [ -z "$GIT_PROJECT_DIR" ] || [ ! -d "$GIT_PROJECT_DIR" ]; then
        echo "[エラー] 無効なディレクトリが選択されました: $GIT_PROJECT_DIR"
        exit 1
    fi

    PROJECT_DIR="$GIT_PROJECT_DIR"
else
    # Team Mode: すべて同じディレクトリ（従来通り）
    if [ -n "$1" ]; then
        PROJECT_DIR="$1"
    elif [ -d "$CURRENT_DIR/.claude" ]; then
        PROJECT_DIR="$CURRENT_DIR"
    elif [ -f "$CURRENT_DIR/package.json" ] || [ -f "$CURRENT_DIR/go.mod" ] || \
         [ -f "$CURRENT_DIR/Cargo.toml" ] || [ -f "$CURRENT_DIR/pyproject.toml" ]; then
        PROJECT_DIR="$CURRENT_DIR"
    else
        PROJECT_DIR="$CURRENT_DIR"
    fi

    CLAUDE_DIR="$PROJECT_DIR"
    GIT_PROJECT_DIR="$PROJECT_DIR"
fi

echo "🚀 Quality Guardian インストール開始"
echo "対象プロジェクト: $PROJECT_DIR"
if [ "$INSTALL_MODE" = "personal" ]; then
    echo "🔒 インストールモード: Personal (他の開発者に影響なし)"
    echo "   - Git hooks有効（ローカルのみ）"
    echo "   - package.json変更なし"
    echo "   - GitHub Actions workflowなし"
else
    echo "👥 インストールモード: Team (フルCI/CD統合)"
    echo "   - Git hooks有効"
    echo "   - package.json変更"
    echo "   - GitHub Actions workflow作成"
fi
if [ -d "$PROJECT_DIR/.claude" ]; then
    echo "💡 Claude Code実行ディレクトリを検出しました"
fi
echo ""

# プロジェクトディレクトリ確認
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ エラー: ディレクトリが存在しません: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# 既存インストールの確認とバージョンチェック
CURRENT_VERSION="1.2.33"
INSTALLED_VERSION=""
IS_INSTALLED=false

if [ -f ".quality-guardian.json" ]; then
    IS_INSTALLED=true
    # jqがあればJSONから、なければgrepでバージョンを取得
    if command -v jq &> /dev/null; then
        INSTALLED_VERSION=$(jq -r '.version // "unknown"' .quality-guardian.json 2>/dev/null || echo "unknown")
    else
        INSTALLED_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' .quality-guardian.json 2>/dev/null || echo "unknown")
    fi

    echo "✅ Quality Guardian は既にインストール済みです"
    echo "   現在のバージョン: $INSTALLED_VERSION"
    echo "   最新バージョン: $CURRENT_VERSION"
    echo ""

    # バージョン比較
    if [ "$INSTALLED_VERSION" = "$CURRENT_VERSION" ]; then
        echo "✨ 既に最新バージョンです"
        echo ""
        echo "次のアクション："
        echo "1. そのまま使用 - 現在の設定で問題なければ、特に作業不要"
        echo "2. Team Modeに変更 - 現在Personal Modeの場合、--teamで再インストール"
        echo "3. Personal Modeに変更 - 現在Team Modeの場合、--personalで再インストール"
        echo "4. 強制再インストール - --forceオプションで再インストール"
        echo ""

        # --forceオプションがない場合は終了
        if [ "$FORCE_INSTALL" = false ]; then
            echo "再インストールする場合は --force オプションを追加してください"
            echo ""
            echo "例："
            echo "  bash ~/dev/ai/scripts/quality-guardian/install.sh --force"
            exit 0
        else
            echo "🔄 強制再インストールを実行します..."
            echo ""
        fi
    else
        echo "🔄 アップデートを実行します..."
        echo "   $INSTALLED_VERSION → $CURRENT_VERSION"
        echo ""
    fi
fi

# プロジェクト種別の自動検出（setup-quality-workflow.shから統合）
PROJECT_TYPE="Unknown"
TEST_COMMAND=""
LINT_COMMAND=""
TYPE_CHECK_COMMAND=""
BUILD_COMMAND=""

echo "🔍 プロジェクト種別を検出中..."

if [ -f "package.json" ]; then
    # パッケージマネージャー検出
    if [ -f "pnpm-lock.yaml" ]; then
        PKG_MANAGER="pnpm"
    elif [ -f "yarn.lock" ]; then
        PKG_MANAGER="yarn"
    else
        PKG_MANAGER="npm"
    fi

    if [ -f "tsconfig.json" ] || grep -q "typescript" package.json 2>/dev/null; then
        PROJECT_TYPE="TypeScript"
        TEST_COMMAND="$PKG_MANAGER test"
        LINT_COMMAND="$PKG_MANAGER run lint"
        TYPE_CHECK_COMMAND="$PKG_MANAGER exec tsc --noEmit"
        BUILD_COMMAND="$PKG_MANAGER run build"
    else
        PROJECT_TYPE="Node.js"
        TEST_COMMAND="$PKG_MANAGER test"
        LINT_COMMAND="$PKG_MANAGER run lint"
        BUILD_COMMAND="$PKG_MANAGER run build"
    fi
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
    PROJECT_TYPE="Python"
    TEST_COMMAND="python -m pytest"
    LINT_COMMAND="python -m flake8 ."
    TYPE_CHECK_COMMAND="python -m mypy ."
elif [ -f "go.mod" ]; then
    PROJECT_TYPE="Go"
    TEST_COMMAND="go test ./..."
    LINT_COMMAND="golint ./..."
    BUILD_COMMAND="go build ./..."
elif [ -f "Cargo.toml" ]; then
    PROJECT_TYPE="Rust"
    TEST_COMMAND="cargo test"
    LINT_COMMAND="cargo clippy"
    BUILD_COMMAND="cargo build"
fi

echo "✅ 検出されたプロジェクト種別: $PROJECT_TYPE"

if [ "$PROJECT_TYPE" = "Unknown" ] && [ "$NON_INTERACTIVE" = false ]; then
    echo "⚠️ プロジェクト種別を自動検出できませんでした"
    read -p "続行しますか？ (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Quality Guardianディレクトリをプロジェクトにコピー
echo "📦 Quality Guardianモジュールをインストール..."

# .quality-guardianディレクトリ作成
mkdir -p .quality-guardian

# モジュールコピー
cp -r "$SCRIPT_DIR/modules" .quality-guardian/
cp "$SCRIPT_DIR/quality-guardian.js" .quality-guardian/

# ESモジュールプロジェクトの場合、CommonJSとして動作させるため
# .quality-guardianディレクトリにpackage.jsonを作成
if grep -q '"type".*"module"' package.json 2>/dev/null; then
    cat > .quality-guardian/package.json << 'EOF'
{
  "type": "commonjs"
}
EOF
    # .jsを.cjsにリネーム
    mv .quality-guardian/quality-guardian.js .quality-guardian/quality-guardian.cjs

    # 実行可能スクリプト作成（bashラッパー）
    cat > quality-guardian << 'EOF'
#!/bin/bash
exec node "$(dirname "$0")/.quality-guardian/quality-guardian.cjs" "$@"
EOF
else
    # CommonJSプロジェクトの場合は従来通り
    cat > quality-guardian << 'EOF'
#!/usr/bin/env node
require('./.quality-guardian/quality-guardian.js');
EOF
fi

chmod +x quality-guardian

# パッケージマネージャーの自動検出
echo "📚 依存関係をチェック..."

# 必要なパッケージ
REQUIRED_PACKAGES="glob"

if [ -f "package.json" ]; then
    # package.jsonが存在する場合は依存関係を追加
    # パッケージマネージャーを自動検出
    if [ -f "pnpm-lock.yaml" ]; then
        echo "pnpm を使用して依存関係をインストール..."
        # pnpm-workspace.yamlがある場合はworkspace rootとして扱う
        if [ -f "pnpm-workspace.yaml" ]; then
            pnpm add -D -w $REQUIRED_PACKAGES
        else
            pnpm add -D $REQUIRED_PACKAGES
        fi
    elif [ -f "yarn.lock" ]; then
        echo "yarn を使用して依存関係をインストール..."
        # yarn workspacesの場合は-Wフラグを使用
        if grep -q "workspaces" package.json 2>/dev/null; then
            yarn add -D -W $REQUIRED_PACKAGES
        else
            yarn add -D $REQUIRED_PACKAGES
        fi
    elif [ -f "package-lock.json" ]; then
        echo "npm を使用して依存関係をインストール..."
        npm install --save-dev $REQUIRED_PACKAGES
    elif command -v pnpm &> /dev/null; then
        echo "pnpm を使用して依存関係をインストール..."
        pnpm add -D -w $REQUIRED_PACKAGES
    elif command -v yarn &> /dev/null; then
        echo "yarn を使用して依存関係をインストール..."
        yarn add -D $REQUIRED_PACKAGES
    elif command -v npm &> /dev/null; then
        echo "npm を使用して依存関係をインストール..."
        npm install --save-dev $REQUIRED_PACKAGES
    else
        echo "⚠️ パッケージマネージャーが見つかりません"
    fi
fi

# 設定ファイル生成
echo "⚙️ 設定ファイルを生成..."

if [ ! -f ".quality-guardian.json" ]; then
    # 新規インストール
    cat > .quality-guardian.json << 'EOF'
{
  "version": "1.2.33",
  "enabled": true,
  "modules": {
    "baseline": {
      "enabled": true,
      "threshold": 0.95
    },
    "context": {
      "enabled": true,
      "strictMode": false
    },
    "invariant": {
      "enabled": true,
      "rules": []
    },
    "deepQuality": {
      "enabled": true,
      "minScore": 60
    },
    "prReview": {
      "enabled": true,
      "autoBlock": true
    }
  },
  "rules": {
    "migration": {
      "allowDeletion": false,
      "allowModification": false,
      "severity": "blocker"
    },
    "testing": {
      "minCoverage": 70,
      "maxMockRatio": 0.4,
      "requireAssertions": true
    },
    "typescript": {
      "allowAny": false,
      "allowTsIgnore": false,
      "strictNullChecks": true
    }
  },
  "hooks": {
    "preCommit": true,
    "prCheck": true,
    "ciIntegration": true
  }
}
EOF
    echo "✅ .quality-guardian.json を作成しました"
else
    # アップデート時：バージョンのみ更新（ユーザー設定を保持）
    if [ "$IS_INSTALLED" = true ] && [ "$INSTALLED_VERSION" != "$CURRENT_VERSION" ]; then
        echo "🔄 設定ファイルのバージョンを更新..."

        # バックアップ作成
        cp .quality-guardian.json .quality-guardian.json.backup

        # jqがあればJSONとして処理
        if command -v jq &> /dev/null; then
            jq ".version = \"$CURRENT_VERSION\"" .quality-guardian.json > .quality-guardian.json.tmp && \
            mv .quality-guardian.json.tmp .quality-guardian.json
            echo "✅ バージョンを更新しました ($INSTALLED_VERSION → $CURRENT_VERSION)"
            echo "   バックアップ: .quality-guardian.json.backup"
        else
            # jqがない場合はsedで置換
            sed -i.backup "s/\"version\": \"$INSTALLED_VERSION\"/\"version\": \"$CURRENT_VERSION\"/" .quality-guardian.json
            echo "✅ バージョンを更新しました ($INSTALLED_VERSION → $CURRENT_VERSION)"
        fi
    else
        echo "✅ 設定ファイルは既に存在します（保持）"
    fi
fi

# .gitignoreに追加
if [ -f ".gitignore" ]; then
    if ! grep -q ".quality-baseline.json" .gitignore; then
        echo "" >> .gitignore
        echo "# Quality Guardian" >> .gitignore
        echo ".quality-baseline.json" >> .gitignore
        echo ".quality-guardian/*.log" >> .gitignore
        echo "✅ .gitignore を更新しました"
    fi
fi

# package.jsonにスクリプト追加（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ] && [ -f "package.json" ] && command -v jq &> /dev/null; then
    echo "📝 package.json にスクリプトを追加..."

    # jqを使ってスクリプトを追加
    jq '.scripts += {
        "quality:init": "./quality-guardian init",
        "quality:baseline": "./quality-guardian baseline",
        "quality:check": "./quality-guardian check",
        "quality:pr": "./quality-guardian pr",
        "quality:fix": "./quality-guardian fix"
    }' package.json > package.json.tmp && mv package.json.tmp package.json

    echo "✅ npm scripts を追加しました"
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo "⏭️  package.json の変更をスキップ (Personal Mode)"
fi

# Git hooks設定（Personal/Team Mode共通）
if [ -d ".git" ]; then
    echo "🔗 Git hooks を設定..."

    # pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Quality Guardian pre-commit hook

# 品質チェックを実行
if [ -x "./quality-guardian" ]; then
    echo "🔍 Quality Guardian チェック実行中..."
    ./quality-guardian check --quick

    if [ $? -ne 0 ]; then
        echo "❌ 品質チェックに失敗しました"
        echo "修正するには: ./quality-guardian fix"
        exit 1
    fi
fi
EOF

    chmod +x .git/hooks/pre-commit
    echo "✅ Git pre-commit hook を設定しました"
fi

# GitHub Actions workflow生成（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ] && [ ! -f ".github/workflows/quality-guardian.yml" ]; then
    echo "🔄 GitHub Actions workflow を生成..."
    mkdir -p .github/workflows

    cat > .github/workflows/quality-guardian.yml << 'EOF'
name: Quality Guardian

on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main, master, develop]

jobs:
  quality-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect package manager
        id: detect-pm
        run: |
          if [ -f "pnpm-lock.yaml" ]; then
            echo "pm=pnpm" >> $GITHUB_OUTPUT
            echo "lockfile=pnpm-lock.yaml" >> $GITHUB_OUTPUT
          elif [ -f "yarn.lock" ]; then
            echo "pm=yarn" >> $GITHUB_OUTPUT
            echo "lockfile=yarn.lock" >> $GITHUB_OUTPUT
          else
            echo "pm=npm" >> $GITHUB_OUTPUT
            echo "lockfile=package-lock.json" >> $GITHUB_OUTPUT
          fi

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: ${{ steps.detect-pm.outputs.pm }}

      - name: Setup pnpm
        if: steps.detect-pm.outputs.pm == 'pnpm'
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: |
          if [ "${{ steps.detect-pm.outputs.pm }}" = "pnpm" ]; then
            pnpm install --frozen-lockfile
          elif [ "${{ steps.detect-pm.outputs.pm }}" = "yarn" ]; then
            yarn install --frozen-lockfile
          else
            npm ci
          fi

      - name: Run Quality Guardian
        run: |
          chmod +x ./quality-guardian
          ./quality-guardian check

      - name: PR Analysis
        if: github.event_name == 'pull_request'
        run: |
          ./quality-guardian pr ${{ github.base_ref }}

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: quality-report
          path: .quality-guardian/*.log
EOF

    echo "✅ GitHub Actions workflow を作成しました"
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo "⏭️  GitHub Actions workflow の生成をスキップ (Personal Mode)"
fi

# エージェント設定のインストール（Personal/Team Mode共通）
if [ -d "$SCRIPT_DIR/agents" ]; then
    echo ""
    echo "🤖 サブエージェント設定をインストール中..."

    # .claude/agentsディレクトリを作成（CLAUDE_DIRに配置）
    mkdir -p "$CLAUDE_DIR/.claude/agents"

    # エージェント設定をコピー
    if [ -f "$SCRIPT_DIR/agents/rule-advisor.md" ]; then
        cp "$SCRIPT_DIR/agents/rule-advisor.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ rule-advisor (必須⭐⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/quality-fixer.md" ]; then
        cp "$SCRIPT_DIR/agents/quality-fixer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ quality-fixer (必須⭐⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-executor.md" ]; then
        cp "$SCRIPT_DIR/agents/task-executor.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ task-executor (必須⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/requirement-analyzer.md" ]; then
        cp "$SCRIPT_DIR/agents/requirement-analyzer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ requirement-analyzer (有用⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/technical-designer.md" ]; then
        cp "$SCRIPT_DIR/agents/technical-designer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ technical-designer (有用⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/code-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/code-reviewer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ code-reviewer (有用⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/work-planner.md" ]; then
        cp "$SCRIPT_DIR/agents/work-planner.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ work-planner (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-decomposer.md" ]; then
        cp "$SCRIPT_DIR/agents/task-decomposer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ task-decomposer (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/document-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/document-reviewer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ document-reviewer (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/prd-creator.md" ]; then
        cp "$SCRIPT_DIR/agents/prd-creator.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ prd-creator (限定的⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/e2e-test-generator.md" ]; then
        cp "$SCRIPT_DIR/agents/e2e-test-generator.md" "$CLAUDE_DIR/.claude/agents/"
        echo "✅ e2e-test-generator (限定的⭐) をインストール"
    fi

    echo "✅ サブエージェント設定（全11個）をインストールしました"
    if [ "$INSTALL_MODE" = "personal" ] && [ "$CLAUDE_DIR" != "$PROJECT_DIR" ]; then
        echo "   配置先: $CLAUDE_DIR/.claude/agents/"
    fi
fi

# CLAUDE.md安全更新（Personal/Team Mode共通）
echo ""
echo "📝 CLAUDE.mdを更新中..."

# .claudeディレクトリの作成（CLAUDE_DIRに配置）
mkdir -p "$CLAUDE_DIR/.claude"

# CLAUDE.mdの安全な更新
if [ -f "$CLAUDE_DIR/.claude/CLAUDE.md" ]; then
    # Quality Guardian設定セクションが既に存在するかチェック
    if grep -q "# Quality Guardian Configuration" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
        echo "✅ Quality Guardian設定は既に存在します"
    else
        echo "⚠️ 既存CLAUDE.mdにQuality Guardian設定を追加します"
        # バックアップ作成
        cp "$CLAUDE_DIR/.claude/CLAUDE.md" "$CLAUDE_DIR/.claude/CLAUDE.md.backup"

        # テンプレートファイルを読み込んで既存ファイルに追記
        if [ -f "$SCRIPT_DIR/.claude-template.md" ]; then
            # プレースホルダーを置換
            TEMPLATE_CONTENT=$(cat "$SCRIPT_DIR/.claude-template.md" | \
                sed "s|__PROJECT_TYPE__|$PROJECT_TYPE|g")

            # テストコマンドプレースホルダー置換
            if [ -n "$TEST_COMMAND" ]; then
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TEST_COMMAND_PLACEHOLDER__|# テスト実行: $TEST_COMMAND|")
            else
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TEST_COMMAND_PLACEHOLDER__||")
            fi

            # リントコマンドプレースホルダー置換
            if [ -n "$LINT_COMMAND" ]; then
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__LINT_COMMAND_PLACEHOLDER__|# リント: $LINT_COMMAND|")
            else
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__LINT_COMMAND_PLACEHOLDER__||")
            fi

            # 型チェックコマンドプレースホルダー置換
            if [ -n "$TYPE_CHECK_COMMAND" ]; then
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TYPE_CHECK_COMMAND_PLACEHOLDER__|# 型チェック: $TYPE_CHECK_COMMAND|")
            else
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TYPE_CHECK_COMMAND_PLACEHOLDER__||")
            fi

            # ビルドコマンドプレースホルダー置換
            if [ -n "$BUILD_COMMAND" ]; then
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__BUILD_COMMAND_PLACEHOLDER__|# ビルド: $BUILD_COMMAND|")
            else
                TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__BUILD_COMMAND_PLACEHOLDER__||")
            fi

            # セパレーターと設定追加
            echo "" >> "$CLAUDE_DIR/.claude/CLAUDE.md"
            echo "# ================================================================" >> "$CLAUDE_DIR/.claude/CLAUDE.md"
            echo "# Quality Guardian Configuration (Auto-generated)" >> "$CLAUDE_DIR/.claude/CLAUDE.md"
            echo "# ================================================================" >> "$CLAUDE_DIR/.claude/CLAUDE.md"
            echo "$TEMPLATE_CONTENT" >> "$CLAUDE_DIR/.claude/CLAUDE.md"

            echo "✅ CLAUDE.mdを安全に更新しました（テンプレート使用）"
        else
            echo "❌ エラー: テンプレートファイルが見つかりません: $SCRIPT_DIR/.claude-template.md"
            exit 1
        fi
    fi
else
    echo "📄 新しいCLAUDE.mdを作成します"

    # テンプレートファイルを読み込んで新規作成
    if [ -f "$SCRIPT_DIR/.claude-template.md" ]; then
        # プレースホルダーを置換
        TEMPLATE_CONTENT=$(cat "$SCRIPT_DIR/.claude-template.md" | \
            sed "s|__PROJECT_TYPE__|$PROJECT_TYPE|g")

        # テストコマンドプレースホルダー置換
        if [ -n "$TEST_COMMAND" ]; then
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TEST_COMMAND_PLACEHOLDER__|# テスト実行: $TEST_COMMAND|")
        else
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TEST_COMMAND_PLACEHOLDER__||")
        fi

        # リントコマンドプレースホルダー置換
        if [ -n "$LINT_COMMAND" ]; then
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__LINT_COMMAND_PLACEHOLDER__|# リント: $LINT_COMMAND|")
        else
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__LINT_COMMAND_PLACEHOLDER__||")
        fi

        # 型チェックコマンドプレースホルダー置換
        if [ -n "$TYPE_CHECK_COMMAND" ]; then
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TYPE_CHECK_COMMAND_PLACEHOLDER__|# 型チェック: $TYPE_CHECK_COMMAND|")
        else
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__TYPE_CHECK_COMMAND_PLACEHOLDER__||")
        fi

        # ビルドコマンドプレースホルダー置換
        if [ -n "$BUILD_COMMAND" ]; then
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__BUILD_COMMAND_PLACEHOLDER__|# ビルド: $BUILD_COMMAND|")
        else
            TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | sed "s|__BUILD_COMMAND_PLACEHOLDER__||")
        fi

        # ファイルに書き込み
        echo "$TEMPLATE_CONTENT" > "$CLAUDE_DIR/.claude/CLAUDE.md"
        echo "✅ CLAUDE.mdを作成しました（テンプレート使用）"
    else
        echo "❌ エラー: テンプレートファイルが見つかりません: $SCRIPT_DIR/.claude-template.md"
        exit 1
    fi
fi

# 初期ベースライン記録
if [ "$NON_INTERACTIVE" = false ]; then
    echo ""
    echo "📊 初期ベースラインを記録しますか？"
    read -p "今の状態を基準として記録します (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./quality-guardian baseline
    fi
else
    echo ""
    echo "📊 初期ベースライン記録をスキップ (非対話モード)"
fi

echo ""
echo "✨ Quality Guardian のインストールが完了しました！"
echo ""
if [ "$INSTALL_MODE" = "personal" ]; then
    echo "🔒 Personal Mode: 他の開発者に影響なくインストールされました"
    echo ""
fi
echo "使用方法:"
echo "  ./quality-guardian baseline  # ベースライン記録"
echo "  ./quality-guardian check     # 品質チェック"
echo "  ./quality-guardian pr        # PR分析"
echo "  ./quality-guardian fix       # 自動修復"
echo ""
if [ "$INSTALL_MODE" = "team" ]; then
    echo "または npm scripts:"
    echo "  npm run quality:check"
    echo "  npm run quality:baseline"
    echo ""
fi
echo "設定ファイル: .quality-guardian.json"
echo "詳細: $SCRIPT_DIR/README.md"