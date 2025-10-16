#!/bin/bash

# Quality Guardian インストーラー
# 任意のプロジェクトに品質管理システムを導入
# version: "1.2.9"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

# インストールモード: personal または team
INSTALL_MODE="team"
FORCE_INSTALL=false

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

# 既存インストールの確認とバージョンチェック
CURRENT_VERSION="1.2.9"
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
    # 新規インストール
    cat > .quality-guardian.json << 'EOF'
{
  "version": "1.2.9",
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

# エージェント設定のインストール（Personal/Team Mode共通）
if [ -d "$SCRIPT_DIR/agents" ]; then
    echo ""
    echo "🤖 サブエージェント設定をインストール中..."

    # .claude/agentsディレクトリを作成
    mkdir -p .claude/agents

    # エージェント設定をコピー
    if [ -f "$SCRIPT_DIR/agents/rule-advisor.md" ]; then
        cp "$SCRIPT_DIR/agents/rule-advisor.md" .claude/agents/
        echo "✅ rule-advisor (必須⭐⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/quality-fixer.md" ]; then
        cp "$SCRIPT_DIR/agents/quality-fixer.md" .claude/agents/
        echo "✅ quality-fixer (必須⭐⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-executor.md" ]; then
        cp "$SCRIPT_DIR/agents/task-executor.md" .claude/agents/
        echo "✅ task-executor (必須⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/requirement-analyzer.md" ]; then
        cp "$SCRIPT_DIR/agents/requirement-analyzer.md" .claude/agents/
        echo "✅ requirement-analyzer (有用⭐⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/technical-designer.md" ]; then
        cp "$SCRIPT_DIR/agents/technical-designer.md" .claude/agents/
        echo "✅ technical-designer (有用⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/code-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/code-reviewer.md" .claude/agents/
        echo "✅ code-reviewer (有用⭐⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/work-planner.md" ]; then
        cp "$SCRIPT_DIR/agents/work-planner.md" .claude/agents/
        echo "✅ work-planner (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-decomposer.md" ]; then
        cp "$SCRIPT_DIR/agents/task-decomposer.md" .claude/agents/
        echo "✅ task-decomposer (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/document-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/document-reviewer.md" .claude/agents/
        echo "✅ document-reviewer (状況による⭐⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/prd-creator.md" ]; then
        cp "$SCRIPT_DIR/agents/prd-creator.md" .claude/agents/
        echo "✅ prd-creator (限定的⭐) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/e2e-test-generator.md" ]; then
        cp "$SCRIPT_DIR/agents/e2e-test-generator.md" .claude/agents/
        echo "✅ e2e-test-generator (限定的⭐) をインストール"
    fi

    echo "✅ サブエージェント設定（全11個）をインストールしました"
fi

# CLAUDE.md安全更新（Personal/Team Mode共通）
if [ -d "$PROJECT_DIR" ]; then
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

## 🚨 機能削除・移行時の必須確認（絶対厳守）

**LLMは「徹底する」と約束できません。システム的に強制するため、このチェックリストを必ず実行すること：**

### 削除前の必須確認（すべて完了するまで削除禁止）

- [ ] **削除する機能の全コードを Read ツールで確認した**
- [ ] **その機能を使っている箇所を Grep ツールで全検索した**
- [ ] **移行先を明確に決定した（どのファイルのどの場所か）**
- [ ] **ユーザーに削除理由と移行先を説明し、承認を得た**
- [ ] **TodoWrite ツールで「機能削除」タスクを作成し、進捗を追跡している**

### 移行時の必須確認（すべて完了するまでコミット禁止）

- [ ] **移行前の機能リストを作成した（箇条書きで）**
- [ ] **移行後の機能リストを作成した（箇条書きで）**
- [ ] **両方を比較して、漏れがないことを確認した**
- [ ] **移行先で実際に動作することをテストした**
- [ ] **移行完了をユーザーに報告した（機能リストを添えて）**

### コミット前の最終確認（すべて完了するまでコミット禁止）

- [ ] **git diff で削除したコードを全て確認した**
- [ ] **削除された各機能が移行先に存在することを確認した**
- [ ] **コミットメッセージに「削除」ではなく「移行」と書いた**
- [ ] **バージョンを更新した（3箇所：VERSION, install.sh, quality-guardian.js）**
- [ ] **README.md に変更内容を記載した**

### ❌ このチェックリストを完了せずに機能を削除してはいけない

**過去の失敗例：**
- カスタムコマンド \`/quality-check\` のバージョン管理機能を削除
- install.sh への移行を忘れた
- ユーザーが「機能が勝手に切れた」と指摘
- 「徹底します」と約束したが、LLMには不可能

**再発防止策：**
- このチェックリストを毎回実行
- TodoWrite ツールで進捗管理
- 機能削除時は必ず Todo に記録
- すべてのチェックが完了するまで次に進まない

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

## 🚨 機能削除・移行時の必須確認（絶対厳守）

**LLMは「徹底する」と約束できません。システム的に強制するため、このチェックリストを必ず実行すること：**

### 削除前の必須確認（すべて完了するまで削除禁止）

- [ ] **削除する機能の全コードを Read ツールで確認した**
- [ ] **その機能を使っている箇所を Grep ツールで全検索した**
- [ ] **移行先を明確に決定した（どのファイルのどの場所か）**
- [ ] **ユーザーに削除理由と移行先を説明し、承認を得た**
- [ ] **TodoWrite ツールで「機能削除」タスクを作成し、進捗を追跡している**

### 移行時の必須確認（すべて完了するまでコミット禁止）

- [ ] **移行前の機能リストを作成した（箇条書きで）**
- [ ] **移行後の機能リストを作成した（箇条書きで）**
- [ ] **両方を比較して、漏れがないことを確認した**
- [ ] **移行先で実際に動作することをテストした**
- [ ] **移行完了をユーザーに報告した（機能リストを添えて）**

### コミット前の最終確認（すべて完了するまでコミット禁止）

- [ ] **git diff で削除したコードを全て確認した**
- [ ] **削除された各機能が移行先に存在することを確認した**
- [ ] **コミットメッセージに「削除」ではなく「移行」と書いた**
- [ ] **バージョンを更新した（3箇所：VERSION, install.sh, quality-guardian.js）**
- [ ] **README.md に変更内容を記載した**

### ❌ このチェックリストを完了せずに機能を削除してはいけない

**過去の失敗例：**
- カスタムコマンド \`/quality-check\` のバージョン管理機能を削除
- install.sh への移行を忘れた
- ユーザーが「機能が勝手に切れた」と指摘
- 「徹底します」と約束したが、LLMには不可能

**再発防止策：**
- このチェックリストを毎回実行
- TodoWrite ツールで進捗管理
- 機能削除時は必ず Todo に記録
- すべてのチェックが完了するまで次に進まない

---
*Quality Guardian by Claude Code - AI品質管理システム*
EOF
    echo "✅ CLAUDE.mdを作成しました"
fi
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