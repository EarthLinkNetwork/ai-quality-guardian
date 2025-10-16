#!/bin/bash

# Quality Guardian インストーラー
# 任意のプロジェクトに品質管理システムを導入
# version: "1.2.4"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

# インストールモード: personal または team
INSTALL_MODE="team"

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
    esac
done

# Claude Codeの実行ディレクトリを検出
# .claudeディレクトリが現在のディレクトリにあればここにインストール
# なければ、引数で指定されたディレクトリまたは現在のディレクトリにインストール
detect_installation_target() {
    local target_dir="${1:-$CURRENT_DIR}"

    # 現在のディレクトリに.claudeディレクトリがあるかチェック
    if [ -d "$CURRENT_DIR/.claude" ]; then
        echo "$CURRENT_DIR"
        return
    fi

    # 引数で明示的に指定された場合はそれを優先
    if [ -n "$1" ]; then
        echo "$target_dir"
        return
    fi

    # package.jsonがあればカレントディレクトリがプロジェクトルート
    if [ -f "$CURRENT_DIR/package.json" ] || [ -f "$CURRENT_DIR/go.mod" ] || \
       [ -f "$CURRENT_DIR/Cargo.toml" ] || [ -f "$CURRENT_DIR/pyproject.toml" ]; then
        echo "$CURRENT_DIR"
        return
    fi

    # それ以外はカレントディレクトリ
    echo "$CURRENT_DIR"
}

PROJECT_DIR="$(detect_installation_target "$1")"

echo "🚀 Quality Guardian インストール開始"
echo "対象プロジェクト: $PROJECT_DIR"
if [ "$INSTALL_MODE" = "personal" ]; then
    echo "🔒 インストールモード: Personal (他の開発者に影響なし)"
else
    echo "👥 インストールモード: Team (Git hooks/CI統合)"
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

if [ "$PROJECT_TYPE" = "Unknown" ]; then
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
    cat > .quality-guardian.json << 'EOF'
{
  "version": "1.2.4",
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

# Git hooks設定（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ] && [ -d ".git" ]; then
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
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo "⏭️  Git hooks の設定をスキップ (Personal Mode)"
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

# CLAUDE.md安全更新（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ]; then
    echo ""
    echo "📝 CLAUDE.mdを更新中..."

    # .claudeディレクトリの作成
    mkdir -p .claude

# CLAUDE.mdの安全な更新
if [ -f .claude/CLAUDE.md ]; then
    # Quality Guardian設定セクションが既に存在するかチェック
    if grep -q "# Quality Guardian Configuration" .claude/CLAUDE.md; then
        echo "✅ Quality Guardian設定は既に存在します"
    else
        echo "⚠️ 既存CLAUDE.mdにQuality Guardian設定を追加します"
        # バックアップ作成
        cp .claude/CLAUDE.md .claude/CLAUDE.md.backup
        # セパレーターと設定追加
        echo "" >> .claude/CLAUDE.md
        echo "# ================================================================" >> .claude/CLAUDE.md
        echo "# Quality Guardian Configuration (Auto-generated)" >> .claude/CLAUDE.md
        echo "# ================================================================" >> .claude/CLAUDE.md
        cat >> .claude/CLAUDE.md << EOF

## Quality Guardian 品質管理設定

**プロジェクト種別**: $PROJECT_TYPE

### 品質チェックコマンド
\`\`\`bash
$([ -n "$TEST_COMMAND" ] && echo "# テスト実行: $TEST_COMMAND")
$([ -n "$LINT_COMMAND" ] && echo "# リント: $LINT_COMMAND")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "# 型チェック: $TYPE_CHECK_COMMAND")
$([ -n "$BUILD_COMMAND" ] && echo "# ビルド: $BUILD_COMMAND")
\`\`\`

### Quality Guardian コマンド
\`\`\`bash
./quality-guardian baseline    # ベースライン記録
./quality-guardian check       # 品質チェック実行
./quality-guardian pr          # PR分析
./quality-guardian fix         # 自動修復
\`\`\`

### AI開発ルール
- 実装後必ず \`./quality-guardian check\` を実行
- 全てのチェックがPASSするまで完了とみなさない
- ベースライン劣化を検出した場合は要修正
- Migration削除等の不変式違反は自動ブロック

## AI回答表示ルール

ユーザーからの質問や確認が必要な場合：

1. **即座に要約を表示**
   - 最初の1-2文で核心を伝える
   - ユーザーが見逃さないように

2. **ツール実行**
   - 必要な調査・確認を実行
   - ログが流れることを前提

3. **最後に詳細回答を再表示**
   - 📌 マークで目立たせる
   - ツール実行後の画面に残るように
   - ユーザーが読みやすい形で再度まとめる

**例：**
\`\`\`
要約：はい、Personal Modeは他の開発者に影響しません。

（ファイル確認・検証のログ...）

📌 回答まとめ：
Personal Modeの特徴：
- ✅ 自分だけが使える
- ❌ Git hooksなし
- ❌ package.json変更なし
\`\`\`

---
*Quality Guardian by Claude Code - AI品質管理システム*
EOF
        echo "✅ CLAUDE.mdを安全に更新しました"
    fi
else
    echo "📄 新しいCLAUDE.mdを作成します"
    cat > .claude/CLAUDE.md << EOF
# Claude Code Quality Configuration

## Quality Guardian 品質管理設定

**プロジェクト種別**: $PROJECT_TYPE

### 品質チェックコマンド
\`\`\`bash
$([ -n "$TEST_COMMAND" ] && echo "# テスト実行: $TEST_COMMAND")
$([ -n "$LINT_COMMAND" ] && echo "# リント: $LINT_COMMAND")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "# 型チェック: $TYPE_CHECK_COMMAND")
$([ -n "$BUILD_COMMAND" ] && echo "# ビルド: $BUILD_COMMAND")
\`\`\`

### Quality Guardian コマンド
\`\`\`bash
./quality-guardian baseline    # ベースライン記録
./quality-guardian check       # 品質チェック実行
./quality-guardian pr          # PR分析
./quality-guardian fix         # 自動修復
\`\`\`

### AI開発ルール
- 実装後必ず \`./quality-guardian check\` を実行
- 全てのチェックがPASSするまで完了とみなさない
- ベースライン劣化を検出した場合は要修正
- Migration削除等の不変式違反は自動ブロック

## AI回答表示ルール

ユーザーからの質問や確認が必要な場合：

1. **即座に要約を表示**
   - 最初の1-2文で核心を伝える
   - ユーザーが見逃さないように

2. **ツール実行**
   - 必要な調査・確認を実行
   - ログが流れることを前提

3. **最後に詳細回答を再表示**
   - 📌 マークで目立たせる
   - ツール実行後の画面に残るように
   - ユーザーが読みやすい形で再度まとめる

**例：**
\`\`\`
要約：はい、Personal Modeは他の開発者に影響しません。

（ファイル確認・検証のログ...）

📌 回答まとめ：
Personal Modeの特徴：
- ✅ 自分だけが使える
- ❌ Git hooksなし
- ❌ package.json変更なし
\`\`\`

---
*Quality Guardian by Claude Code - AI品質管理システム*
EOF
    echo "✅ CLAUDE.mdを作成しました"
fi
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo "⏭️  CLAUDE.md の更新をスキップ (Personal Mode)"
fi

# 初期ベースライン記録
echo ""
echo "📊 初期ベースラインを記録しますか？"
read -p "今の状態を基準として記録します (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./quality-guardian baseline
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