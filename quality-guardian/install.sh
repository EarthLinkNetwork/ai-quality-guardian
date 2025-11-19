#!/bin/bash

# Quality Guardian インストーラー
# 任意のプロジェクトに品質管理システムを導入
# version: "1.3.52"

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
    # Personal Mode: .claude/ とQuality Guardian本体は親ディレクトリへ
    # プロジェクトディレクトリには何も作成しない
    GIT_PROJECT_DIR="$(select_git_repository_for_personal_mode)"

    if [ -z "$GIT_PROJECT_DIR" ] || [ ! -d "$GIT_PROJECT_DIR" ]; then
        echo "[エラー] 無効なディレクトリが選択されました: $GIT_PROJECT_DIR"
        exit 1
    fi

    # Personal Mode汚染チェック（Gitプロジェクト内に誤って作成されたファイルを検出）
    echo ""
    echo "📋 Personal Mode汚染チェック..."
    POLLUTION_FOUND=false
    POLLUTION_FILES=()

    # チェック対象のファイル
    if [ -e "$GIT_PROJECT_DIR/quality-guardian" ]; then
        POLLUTION_FILES+=("quality-guardian")
        POLLUTION_FOUND=true
    fi
    if [ -e "$GIT_PROJECT_DIR/.quality-guardian.json" ]; then
        POLLUTION_FILES+=(".quality-guardian.json")
        POLLUTION_FOUND=true
    fi
    if [ -e "$GIT_PROJECT_DIR/.quality-baseline.json" ]; then
        POLLUTION_FILES+=(".quality-baseline.json")
        POLLUTION_FOUND=true
    fi
    if [ -e "$GIT_PROJECT_DIR/.quality-guardian" ]; then
        POLLUTION_FILES+=(".quality-guardian/")
        POLLUTION_FOUND=true
    fi

    if [ "$POLLUTION_FOUND" = true ]; then
        echo ""
        echo "⚠️  警告: 以前のPersonalモードインストールで誤って作成されたファイルを検出しました:"
        for file in "${POLLUTION_FILES[@]}"; do
            echo "  - $file"
        done
        echo ""
        echo "これらのファイルは削除してから再インストールします。"

        if [ "$NON_INTERACTIVE" = false ]; then
            read -p "クリーンアップを実行してよろしいですか？ [Y/n]: " confirm
            if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
                echo "クリーンアップをスキップしました。"
                echo "注意: これらのファイルが残ったまま再インストールすると、問題が発生する可能性があります。"
            else
                # クリーンアップ実行
                echo ""
                echo "🧹 クリーンアップ開始..."
                BACKUP_DIR="$GIT_PROJECT_DIR/.quality-guardian-backup-$(date +%Y%m%d-%H%M%S)"
                mkdir -p "$BACKUP_DIR"

                for file in "${POLLUTION_FILES[@]}"; do
                    if [ -e "$GIT_PROJECT_DIR/$file" ]; then
                        echo "  削除: $file"
                        # バックアップ
                        if [ -d "$GIT_PROJECT_DIR/$file" ]; then
                            cp -r "$GIT_PROJECT_DIR/$file" "$BACKUP_DIR/"
                        else
                            cp "$GIT_PROJECT_DIR/$file" "$BACKUP_DIR/"
                        fi
                        # 削除
                        rm -rf "$GIT_PROJECT_DIR/$file"
                    fi
                done

                echo "  ✅ クリーンアップ完了"
                echo "  バックアップ: $BACKUP_DIR"
            fi
        else
            # 非対話モードの場合は自動的にクリーンアップ
            echo ""
            echo "🧹 クリーンアップ実行中（非対話モード）..."
            for file in "${POLLUTION_FILES[@]}"; do
                if [ -e "$GIT_PROJECT_DIR/$file" ]; then
                    echo "  削除: $file"
                    rm -rf "$GIT_PROJECT_DIR/$file"
                fi
            done
            echo "  ✅ クリーンアップ完了"
        fi
        echo ""
    else
        echo "  ✅ 汚染は検出されませんでした"
        echo ""
    fi

    # .claude/ と本体は親ディレクトリに配置
    PARENT_DIR="$(dirname "$GIT_PROJECT_DIR")"
    CLAUDE_DIR="$PARENT_DIR"
    PROJECT_DIR="$PARENT_DIR"

    echo ""
    echo "[Personal Mode] インストール先:"
    echo "  Gitプロジェクト: $GIT_PROJECT_DIR"
    echo "  .claude/: $CLAUDE_DIR/.claude"
    echo "  quality-guardian本体: $PROJECT_DIR/.quality-guardian"
    echo ""
    echo "  ※ Gitプロジェクト内には何も作成されません"
    echo ""
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

echo "Quality Guardian インストール開始"
echo "対象プロジェクト: $PROJECT_DIR"
if [ "$INSTALL_MODE" = "personal" ]; then
    echo "インストールモード: Personal (他の開発者に影響なし)"
    echo "   - Git hooks有効（ローカルのみ）"
    echo "   - package.json変更なし"
    echo "   - GitHub Actions workflowなし"
else
    echo "インストールモード: Team (フルCI/CD統合)"
    echo "   - Git hooks有効"
    echo "   - package.json変更"
    echo "   - GitHub Actions workflow作成"
fi
if [ -d "$PROJECT_DIR/.claude" ]; then
    echo "Claude Code実行ディレクトリを検出しました"
fi
echo ""

# プロジェクトディレクトリ確認
if [ ! -d "$PROJECT_DIR" ]; then
    echo "エラー: ディレクトリが存在しません: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# 既存インストールの確認とバージョンチェック
CURRENT_VERSION="1.3.52"
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

    echo "Quality Guardian は既にインストール済みです"
    echo "   現在のバージョン: $INSTALLED_VERSION"
    echo "   最新バージョン: $CURRENT_VERSION"
    echo ""

    # バージョン比較
    if [ "$INSTALLED_VERSION" = "$CURRENT_VERSION" ]; then
        echo "既に最新バージョンです"
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
            echo "強制再インストールを実行します..."
            echo ""
        fi
    else
        echo "アップデートを実行します..."
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

echo "プロジェクト種別を検出中..."

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

echo "検出されたプロジェクト種別: $PROJECT_TYPE"

if [ "$PROJECT_TYPE" = "Unknown" ] && [ "$NON_INTERACTIVE" = false ]; then
    echo "プロジェクト種別を自動検出できませんでした"
    read -p "続行しますか？ (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Quality Guardianディレクトリをプロジェクトにコピー
echo "Quality Guardianモジュールをインストール..."

# .quality-guardianディレクトリ作成
mkdir -p .quality-guardian
mkdir -p .quality-guardian/modules

# curlから実行されているかチェック（modulesディレクトリの存在確認）
if [ -d "$SCRIPT_DIR/modules" ] && [ -f "$SCRIPT_DIR/quality-guardian.js" ]; then
    # ローカル実行の場合
    echo "ローカルファイルからコピー中..."
    cp -r "$SCRIPT_DIR/modules/"* .quality-guardian/modules/
    cp "$SCRIPT_DIR/quality-guardian.js" .quality-guardian/
else
    # curlから実行されている場合、GitHubからダウンロード
    echo "GitHubから最新版をダウンロード中..."

    GITHUB_BASE="https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian"

    # メインスクリプト
    curl -sSL -o .quality-guardian/quality-guardian.js "$GITHUB_BASE/quality-guardian.js" || {
        echo "エラー: quality-guardian.jsのダウンロードに失敗しました"
        exit 1
    }

    # 各モジュールをダウンロード
    curl -sSL -o .quality-guardian/modules/baseline-monitor.js "$GITHUB_BASE/modules/baseline-monitor.js" || echo "警告: baseline-monitor.jsのダウンロードに失敗"
    curl -sSL -o .quality-guardian/modules/context-analyzer.js "$GITHUB_BASE/modules/context-analyzer.js" || echo "警告: context-analyzer.jsのダウンロードに失敗"
    curl -sSL -o .quality-guardian/modules/deep-quality-analyzer.js "$GITHUB_BASE/modules/deep-quality-analyzer.js" || echo "警告: deep-quality-analyzer.jsのダウンロードに失敗"
    curl -sSL -o .quality-guardian/modules/invariant-checker.js "$GITHUB_BASE/modules/invariant-checker.js" || echo "警告: invariant-checker.jsのダウンロードに失敗"
    curl -sSL -o .quality-guardian/modules/pr-reviewer.js "$GITHUB_BASE/modules/pr-reviewer.js" || echo "警告: pr-reviewer.jsのダウンロードに失敗"

    echo "GitHubからのダウンロード完了"
fi

# quality-guardianスクリプト作成（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ]; then
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
    echo "✅ quality-guardianスクリプトを作成しました"
else
    echo "📝 quality-guardianスクリプトの作成をスキップ (Personal Mode)"
fi

# 依存関係インストール（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ]; then
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
            echo "パッケージマネージャーが見つかりません"
        fi
    fi
else
    echo "📝 依存関係のインストールをスキップ (Personal Mode)"
fi

# 設定ファイル生成（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ]; then
    echo "設定ファイルを生成..."

    if [ ! -f ".quality-guardian.json" ]; then
    # 新規インストール
    cat > .quality-guardian.json << 'EOF'
{
  "version": "1.3.47",
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
    echo ".quality-guardian.json を作成しました"
else
    # アップデート時：バージョンのみ更新（ユーザー設定を保持）
    if [ "$IS_INSTALLED" = true ] && [ "$INSTALLED_VERSION" != "$CURRENT_VERSION" ]; then
        echo "設定ファイルのバージョンを更新..."

        # バックアップ作成
        cp .quality-guardian.json .quality-guardian.json.backup

        # jqがあればJSONとして処理
        if command -v jq &> /dev/null; then
            jq ".version = \"$CURRENT_VERSION\"" .quality-guardian.json > .quality-guardian.json.tmp && \
            mv .quality-guardian.json.tmp .quality-guardian.json
            echo "バージョンを更新しました ($INSTALLED_VERSION → $CURRENT_VERSION)"
            echo "   バックアップ: .quality-guardian.json.backup"
        else
            # jqがない場合はsedで置換
            sed -i.backup "s/\"version\": \"$INSTALLED_VERSION\"/\"version\": \"$CURRENT_VERSION\"/" .quality-guardian.json
            echo "バージョンを更新しました ($INSTALLED_VERSION → $CURRENT_VERSION)"
        fi
    else
        echo "設定ファイルは既に存在します（保持）"
    fi
    fi
else
    echo "📝 .quality-guardian.json の作成をスキップ (Personal Mode)"
fi

# .gitignoreに追加
if [ -f ".gitignore" ]; then
    if ! grep -q ".quality-baseline.json" .gitignore; then
        echo "" >> .gitignore
        echo "# Quality Guardian" >> .gitignore
        echo ".quality-baseline.json" >> .gitignore
        echo ".quality-guardian/*.log" >> .gitignore
        echo ".gitignore を更新しました"
    fi
fi

# package.jsonにスクリプト追加（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ] && [ -f "package.json" ] && command -v jq &> /dev/null; then
    echo "package.json にスクリプトを追加..."

    # jqを使ってスクリプトを追加
    jq '.scripts += {
        "quality:init": "./quality-guardian init",
        "quality:baseline": "./quality-guardian baseline",
        "quality:check": "./quality-guardian check",
        "quality:pr": "./quality-guardian pr",
        "quality:fix": "./quality-guardian fix"
    }' package.json > package.json.tmp && mv package.json.tmp package.json

    echo "npm scripts を追加しました"
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo " package.json の変更をスキップ (Personal Mode)"
fi

# Git hooks設定（Personal/Team Mode共通）
if [ -d ".git" ]; then
    echo "Git hooks を設定..."

    # Hook管理ツールの検出
    HOOK_MANAGER_DETECTED=false
    HOOK_MANAGER_NAME=""

    if [ -f "lefthook.yml" ] || [ -f ".lefthook.yml" ] || [ -f "lefthook-local.yml" ]; then
        HOOK_MANAGER_DETECTED=true
        HOOK_MANAGER_NAME="lefthook"
    elif [ -d ".husky" ] && [ -f ".husky/pre-commit" ]; then
        HOOK_MANAGER_DETECTED=true
        HOOK_MANAGER_NAME="husky"
    elif [ -f ".pre-commit-config.yaml" ]; then
        HOOK_MANAGER_DETECTED=true
        HOOK_MANAGER_NAME="pre-commit (Python)"
    fi

    # 既存のpre-commit hookを検出
    EXISTING_HOOK=false
    if [ -f ".git/hooks/pre-commit" ]; then
        # Quality Guardianのhookでない場合
        if ! grep -q "Quality Guardian pre-commit hook" .git/hooks/pre-commit 2>/dev/null; then
            EXISTING_HOOK=true
        fi
    fi

    if [ "$HOOK_MANAGER_DETECTED" = true ]; then
        echo " Hook管理ツールを検出: $HOOK_MANAGER_NAME"
        echo ""
        echo "Quality Guardianを$HOOK_MANAGER_NAME に統合する方法:"
        echo ""

        case "$HOOK_MANAGER_NAME" in
            "lefthook")
                echo "lefthook.yml に以下を追加してください:"
                echo ""
                echo "pre-commit:"
                echo "  commands:"
                echo "    quality-guardian:"
                echo "      run: ./quality-guardian check --quick"
                echo ""
                echo "pre-push:"
                echo "  commands:"
                echo "    project-context-check:"
                echo "      run: node ./quality-guardian/modules/project-context-check.js"
                echo ""
                ;;
            "husky")
                echo ".husky/pre-commit に以下を追加してください:"
                echo ""
                echo "# Quality Guardian"
                echo "./quality-guardian check --quick || exit 1"
                echo ""
                echo ".husky/pre-push に以下を追加してください:"
                echo ""
                echo "# Project Context Check"
                echo "node ./quality-guardian/modules/project-context-check.js || exit 1"
                echo ""
                ;;
            "pre-commit (Python)")
                echo ".pre-commit-config.yaml に以下を追加してください:"
                echo ""
                echo "- repo: local"
                echo "  hooks:"
                echo "    - id: quality-guardian"
                echo "      name: Quality Guardian"
                echo "      entry: ./quality-guardian check --quick"
                echo "      language: system"
                echo "      pass_filenames: false"
                echo "      stages: [commit]"
                echo "    - id: project-context-check"
                echo "      name: Project Context Check"
                echo "      entry: node ./quality-guardian/modules/project-context-check.js"
                echo "      language: system"
                echo "      pass_filenames: false"
                echo "      stages: [push]"
                echo ""
                ;;
        esac

        echo "Git hooks のインストールをスキップしました"
        echo "   ($HOOK_MANAGER_NAME を使用してください)"

    elif [ "$EXISTING_HOOK" = true ]; then
        echo " 既存の pre-commit hook を検出しました"
        echo ""

        # バックアップ作成
        cp .git/hooks/pre-commit .git/hooks/pre-commit.backup
        echo "バックアップ作成: .git/hooks/pre-commit.backup"

        if [ "$NON_INTERACTIVE" = false ]; then
            echo ""
            echo "選択してください:"
            echo "1) 既存hookの後に Quality Guardian を追加（推奨）"
            echo "2) 既存hookを上書き（非推奨）"
            echo "3) スキップ（手動で統合）"
            read -p "選択 [1-3]: " hook_choice

            case "$hook_choice" in
                1)
                    # 既存hookに追加
                    echo "" >> .git/hooks/pre-commit
                    echo "# Quality Guardian (Added by installer)" >> .git/hooks/pre-commit
                    echo 'if [ -x "./quality-guardian" ]; then' >> .git/hooks/pre-commit
                    echo '    echo "Quality Guardian チェック実行中..."' >> .git/hooks/pre-commit
                    echo '    ./quality-guardian check --quick' >> .git/hooks/pre-commit
                    echo '    if [ $? -ne 0 ]; then' >> .git/hooks/pre-commit
                    echo '        echo "品質チェックに失敗しました"' >> .git/hooks/pre-commit
                    echo '        echo "修正するには: ./quality-guardian fix"' >> .git/hooks/pre-commit
                    echo '        exit 1' >> .git/hooks/pre-commit
                    echo '    fi' >> .git/hooks/pre-commit
                    echo 'fi' >> .git/hooks/pre-commit

                    chmod +x .git/hooks/pre-commit
                    echo "既存hookに Quality Guardian を追加しました"
                    ;;
                2)
                    # 上書き
                    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Quality Guardian pre-commit hook

# 品質チェックを実行
if [ -x "./quality-guardian" ]; then
    echo "Quality Guardian チェック実行中..."
    ./quality-guardian check --quick

    if [ $? -ne 0 ]; then
        echo "品質チェックに失敗しました"
        echo "修正するには: ./quality-guardian fix"
        exit 1
    fi
fi
EOF
                    chmod +x .git/hooks/pre-commit
                    echo "Git pre-commit hook を上書きしました"
                    echo "   元のhook: .git/hooks/pre-commit.backup"
                    ;;
                3)
                    echo " Git hooks のインストールをスキップしました"
                    echo ""
                    echo "手動で以下を .git/hooks/pre-commit に追加してください:"
                    echo ""
                    echo "# Quality Guardian"
                    echo "./quality-guardian check --quick || exit 1"
                    ;;
                *)
                    echo " 無効な選択です。スキップします。"
                    ;;
            esac
        else
            # 非対話モードでは既存hookに追加
            echo "" >> .git/hooks/pre-commit
            echo "# Quality Guardian (Added by installer)" >> .git/hooks/pre-commit
            echo 'if [ -x "./quality-guardian" ]; then' >> .git/hooks/pre-commit
            echo '    ./quality-guardian check --quick || exit 1' >> .git/hooks/pre-commit
            echo 'fi' >> .git/hooks/pre-commit

            chmod +x .git/hooks/pre-commit
            echo "既存hookに Quality Guardian を追加しました"
        fi

    else
        # 既存hookがない場合は新規作成
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Quality Guardian pre-commit hook

# 品質チェックを実行
if [ -x "./quality-guardian" ]; then
    echo "Quality Guardian チェック実行中..."
    ./quality-guardian check --quick

    if [ $? -ne 0 ]; then
        echo "品質チェックに失敗しました"
        echo "修正するには: ./quality-guardian fix"
        exit 1
    fi
fi
EOF

        chmod +x .git/hooks/pre-commit
        echo "Git pre-commit hook を設定しました"
    fi
fi

# GitHub Actions workflow生成（Team Modeのみ）
if [ "$INSTALL_MODE" = "team" ] && [ ! -f ".github/workflows/quality-guardian.yml" ]; then
    echo "GitHub Actions workflow を生成..."
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

    echo "GitHub Actions workflow を作成しました"
elif [ "$INSTALL_MODE" = "personal" ]; then
    echo " GitHub Actions workflow の生成をスキップ (Personal Mode)"
fi

# エージェント設定のインストール（Personal/Team Mode共通）
echo ""
echo "サブエージェント設定をインストール中..."

# .claude/agentsディレクトリを作成（CLAUDE_DIRに配置）
mkdir -p "$CLAUDE_DIR/.claude/agents"

# ローカルまたはGitHubからのインストール
if [ -d "$SCRIPT_DIR/agents" ]; then
    # ローカル実行の場合
    echo "ローカルファイルからコピー中..."

    # エージェント設定をコピー
    if [ -f "$SCRIPT_DIR/agents/rule-advisor.md" ]; then
        cp "$SCRIPT_DIR/agents/rule-advisor.md" "$CLAUDE_DIR/.claude/agents/"
        echo "rule-advisor (必須) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/quality-fixer.md" ]; then
        cp "$SCRIPT_DIR/agents/quality-fixer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "quality-fixer (必須) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-executor.md" ]; then
        cp "$SCRIPT_DIR/agents/task-executor.md" "$CLAUDE_DIR/.claude/agents/"
        echo "task-executor (必須) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/requirement-analyzer.md" ]; then
        cp "$SCRIPT_DIR/agents/requirement-analyzer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "requirement-analyzer (有用) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/technical-designer.md" ]; then
        cp "$SCRIPT_DIR/agents/technical-designer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "technical-designer (有用) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/code-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/code-reviewer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "code-reviewer (有用) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/work-planner.md" ]; then
        cp "$SCRIPT_DIR/agents/work-planner.md" "$CLAUDE_DIR/.claude/agents/"
        echo "work-planner (状況による) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/task-decomposer.md" ]; then
        cp "$SCRIPT_DIR/agents/task-decomposer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "task-decomposer (状況による) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/document-reviewer.md" ]; then
        cp "$SCRIPT_DIR/agents/document-reviewer.md" "$CLAUDE_DIR/.claude/agents/"
        echo "document-reviewer (状況による) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/prd-creator.md" ]; then
        cp "$SCRIPT_DIR/agents/prd-creator.md" "$CLAUDE_DIR/.claude/agents/"
        echo "prd-creator (限定的) をインストール"
    fi

    if [ -f "$SCRIPT_DIR/agents/e2e-test-generator.md" ]; then
        cp "$SCRIPT_DIR/agents/e2e-test-generator.md" "$CLAUDE_DIR/.claude/agents/"
        echo "e2e-test-generator (限定的) をインストール"
    fi
else
    # curlから実行されている場合、GitHubからダウンロード
    echo "GitHubからダウンロード中..."

    GITHUB_AGENTS="https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/agents"

    # 各エージェントをダウンロード
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/rule-advisor.md" "$GITHUB_AGENTS/rule-advisor.md" && echo "rule-advisor (必須) をインストール" || echo "警告: rule-advisor.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/quality-fixer.md" "$GITHUB_AGENTS/quality-fixer.md" && echo "quality-fixer (必須) をインストール" || echo "警告: quality-fixer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/task-executor.md" "$GITHUB_AGENTS/task-executor.md" && echo "task-executor (必須) をインストール" || echo "警告: task-executor.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/requirement-analyzer.md" "$GITHUB_AGENTS/requirement-analyzer.md" && echo "requirement-analyzer (有用) をインストール" || echo "警告: requirement-analyzer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/technical-designer.md" "$GITHUB_AGENTS/technical-designer.md" && echo "technical-designer (有用) をインストール" || echo "警告: technical-designer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/code-reviewer.md" "$GITHUB_AGENTS/code-reviewer.md" && echo "code-reviewer (有用) をインストール" || echo "警告: code-reviewer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/work-planner.md" "$GITHUB_AGENTS/work-planner.md" && echo "work-planner (状況による) をインストール" || echo "警告: work-planner.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/task-decomposer.md" "$GITHUB_AGENTS/task-decomposer.md" && echo "task-decomposer (状況による) をインストール" || echo "警告: task-decomposer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/document-reviewer.md" "$GITHUB_AGENTS/document-reviewer.md" && echo "document-reviewer (状況による) をインストール" || echo "警告: document-reviewer.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/prd-creator.md" "$GITHUB_AGENTS/prd-creator.md" && echo "prd-creator (限定的) をインストール" || echo "警告: prd-creator.mdのダウンロードに失敗"
    curl -sSL -o "$CLAUDE_DIR/.claude/agents/e2e-test-generator.md" "$GITHUB_AGENTS/e2e-test-generator.md" && echo "e2e-test-generator (限定的) をインストール" || echo "警告: e2e-test-generator.mdのダウンロードに失敗"
fi

echo "サブエージェント設定（全11個）をインストールしました"
if [ "$INSTALL_MODE" = "personal" ] && [ "$CLAUDE_DIR" != "$PROJECT_DIR" ]; then
    echo "   配置先: $CLAUDE_DIR/.claude/agents/"
fi

# Claude Code hooks登録（Personal/Team Mode共通）
echo ""
echo "Claude Code hooks を .claude/settings.json に登録中..."

SETTINGS_FILE="$CLAUDE_DIR/.claude/settings.json"

# hookスクリプトのインストール
HOOK_SCRIPT="$CLAUDE_DIR/.claude/hooks/user-prompt-submit.sh"
mkdir -p "$CLAUDE_DIR/.claude/hooks"

# テンプレートhookをコピー（ローカルまたはGitHubから）
if [ -f "$SCRIPT_DIR/templates/hooks/user-prompt-submit.sh" ]; then
    # ローカルファイルを使用
    cp "$SCRIPT_DIR/templates/hooks/user-prompt-submit.sh" "$HOOK_SCRIPT"
    chmod +x "$HOOK_SCRIPT"
    echo "hook script をインストール: $HOOK_SCRIPT"
else
    # GitHubからダウンロード
    echo "GitHubからhook scriptをダウンロード中..."
    GITHUB_HOOK="https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/templates/hooks/user-prompt-submit.sh"
    curl -sSL -o "$HOOK_SCRIPT" "$GITHUB_HOOK" || {
        echo "警告: hook scriptのダウンロードに失敗しました"
    }
    chmod +x "$HOOK_SCRIPT"
fi

# Personal Mode時: 子プロジェクトの .claude/settings.json を自動更新
if [ "$INSTALL_MODE" = "personal" ]; then
    echo ""
    echo "📋 Personal Mode: 子プロジェクトのhook設定を更新中..."

    # 親ディレクトリ配下の全ディレクトリを検索（1階層のみ）
    for project_dir in "$CLAUDE_DIR"/*/; do
        # .claude/settings.json が存在するか確認
        if [ -f "${project_dir}.claude/settings.json" ]; then
            PROJECT_NAME=$(basename "$project_dir")
            echo "  - ${PROJECT_NAME} のhook設定を更新..."

            PROJECT_SETTINGS="${project_dir}.claude/settings.json"

            # バックアップ作成
            cp "$PROJECT_SETTINGS" "${PROJECT_SETTINGS}.backup-$(date +%Y%m%d-%H%M%S)"

            # jqがあればJSONとして処理
            if command -v jq &> /dev/null; then
                # 既存のUserPromptSubmit hookを確認
                if jq -e '.hooks.UserPromptSubmit' "$PROJECT_SETTINGS" > /dev/null 2>&1; then
                    # 親ディレクトリのhookが既に登録されているか確認
                    if jq -e '.hooks.UserPromptSubmit[].hooks[] | select(.command == "$CLAUDE_PROJECT_DIR/../.claude/hooks/user-prompt-submit.sh")' "$PROJECT_SETTINGS" > /dev/null 2>&1; then
                        echo "    ✓ 既に登録済み（スキップ）"
                    else
                        # 親ディレクトリのhookを追加
                        jq '.hooks.UserPromptSubmit[0].hooks += [{"type": "command", "command": "$CLAUDE_PROJECT_DIR/../.claude/hooks/user-prompt-submit.sh"}]' \
                            "$PROJECT_SETTINGS" > "${PROJECT_SETTINGS}.tmp" && \
                        mv "${PROJECT_SETTINGS}.tmp" "$PROJECT_SETTINGS"
                        echo "    ✓ hook設定を追加しました"
                    fi
                else
                    # UserPromptSubmit hookセクション自体がない場合は作成
                    jq '.hooks.UserPromptSubmit = [{"hooks": [{"type": "command", "command": "$CLAUDE_PROJECT_DIR/../.claude/hooks/user-prompt-submit.sh"}]}]' \
                        "$PROJECT_SETTINGS" > "${PROJECT_SETTINGS}.tmp" && \
                    mv "${PROJECT_SETTINGS}.tmp" "$PROJECT_SETTINGS"
                    echo "    ✓ hook設定を作成しました"
                fi
            else
                echo "    警告: jq がインストールされていません。手動で設定を追加してください。"
                echo "    ファイル: ${PROJECT_SETTINGS}"
                echo '    追加内容: {"type": "command", "command": "$CLAUDE_PROJECT_DIR/../.claude/hooks/user-prompt-submit.sh"}'
            fi
        fi
    done

    echo "  Personal Mode子プロジェクト設定完了"
fi

# settings.jsonの作成または更新
if [ -f "$SETTINGS_FILE" ]; then
    # 既存settings.jsonがある場合、hooks設定をマージ
    echo "既存の .claude/settings.json にhook設定を追加..."

    # バックアップ作成
    cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup"

    # jqがあればJSONとして処理
    if command -v jq &> /dev/null; then
        # 既存のUserPromptSubmit hookがあるか確認
        if jq -e '.hooks.UserPromptSubmit' "$SETTINGS_FILE" > /dev/null 2>&1; then
            echo "UserPromptSubmit hook は既に登録済み（保持）"
        else
            # UserPromptSubmit hookを追加
            jq '.hooks.UserPromptSubmit = [{"hooks": [{"type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh"}]}]' \
                "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && \
            mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
            echo ".claude/settings.json にhook設定を追加しました"
        fi
    else
        echo "警告: jq がインストールされていません。手動で .claude/settings.json にhook設定を追加してください。"
        echo ""
        echo "追加する内容:"
        echo '  "hooks": {'
        echo '    "UserPromptSubmit": ['
        echo '      {'
        echo '        "hooks": ['
        echo '          {'
        echo '            "type": "command",'
        echo '            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh"'
        echo '          }'
        echo '        ]'
        echo '      }'
        echo '    ]'
        echo '  }'
    fi
else
    # 新規にsettings.jsonを作成
    echo "新しい .claude/settings.json を作成..."
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo ".claude/settings.json を作成しました"
fi

echo ""
echo "IMPORTANT: .claude/settings.json の変更を反映するには、Claude Codeの再起動が必要です。"
echo ""

# CLAUDE.md安全更新（Personal/Team Mode共通）
echo ""
echo "CLAUDE.mdを更新中..."

# .claudeディレクトリの作成（CLAUDE_DIRに配置）
mkdir -p "$CLAUDE_DIR/.claude"
mkdir -p "$CLAUDE_DIR/.claude/rules"

# テンプレートファイルの取得（ローカルまたはGitHubから）
TEMPLATE_FILE=""
if [ -f "$SCRIPT_DIR/.claude-template.md" ]; then
    # ローカルファイルを使用
    TEMPLATE_FILE="$SCRIPT_DIR/.claude-template.md"
else
    # GitHubからダウンロード
    echo "GitHubからテンプレートをダウンロード中..."
    TEMPLATE_FILE="/tmp/claude-template-$$.md"
    curl -sSL -o "$TEMPLATE_FILE" "https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/.claude-template.md" || {
        echo "警告: テンプレートのダウンロードに失敗しました"
        TEMPLATE_FILE=""
    }
fi

# MUST Rulesファイルの取得
MUST_RULES_FILE=""
if [ -f "$SCRIPT_DIR/../.claude/rules/must-rules.md" ]; then
    MUST_RULES_FILE="$SCRIPT_DIR/../.claude/rules/must-rules.md"
else
    echo "GitHubからMUST Rulesをダウンロード中..."
    MUST_RULES_FILE="/tmp/must-rules-$$.md"
    curl -sSL -o "$MUST_RULES_FILE" "https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/.claude/rules/must-rules.md" || {
        echo "警告: MUST Rulesのダウンロードに失敗しました"
        MUST_RULES_FILE=""
    }
fi

# バージョンベースの移行ロジック
if [ -f "$CLAUDE_DIR/.claude/CLAUDE.md" ]; then
    # 既存のCLAUDE.mdが存在する場合、バージョンを検出
    EXISTING_VERSION=""
    if grep -q "Current Version:" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
        EXISTING_VERSION=$(grep "Current Version:" "$CLAUDE_DIR/.claude/CLAUDE.md" | sed 's/.*Current Version: \([0-9.]*\).*/\1/')
        echo "既存CLAUDE.mdのバージョン: $EXISTING_VERSION"
    fi

    # バージョン1.3.37以前の場合、移行が必要
    if [ -z "$EXISTING_VERSION" ] || [ "$EXISTING_VERSION" \< "1.3.38" ]; then
        echo ""
        echo "================================================================"
        echo "🔄 CLAUDE.md構造の大規模変更（v1.3.38）"
        echo "================================================================"
        echo ""
        echo "Quality Guardianのアーキテクチャが改善されました："
        echo ""
        echo "変更内容:"
        echo "  - CLAUDE.md: 2562行 → 625行に簡素化"
        echo "  - MUST Rules詳細を .claude/rules/must-rules.md に移動"
        echo "  - ルールの可読性と保守性が向上"
        echo ""
        echo "影響:"
        echo "  - 既存のCLAUDE.mdは新しい構造に置き換わります"
        echo "  - UserPromptSubmit hookは引き続き全ルールを表示します"
        echo ""
        echo "バックアップ:"
        echo "  - 既存CLAUDE.md → .claude/CLAUDE.md.backup-v$EXISTING_VERSION"
        echo ""
        echo "復旧方法:"
        echo "  もし問題が発生した場合、以下のコマンドで復旧できます："
        echo "  cd $CLAUDE_DIR/.claude"
        echo "  cp CLAUDE.md.backup-v$EXISTING_VERSION CLAUDE.md"
        echo ""
        read -p "移行を実行しますか？ (y/N): " CONFIRM_MIGRATION

        if [ "$CONFIRM_MIGRATION" = "y" ] || [ "$CONFIRM_MIGRATION" = "Y" ]; then
            echo ""
            echo "移行を開始します..."

            # バックアップ作成
            cp "$CLAUDE_DIR/.claude/CLAUDE.md" "$CLAUDE_DIR/.claude/CLAUDE.md.backup-v${EXISTING_VERSION:-unknown}"
            echo "✓ バックアップ作成: CLAUDE.md.backup-v${EXISTING_VERSION:-unknown}"

            # .claude/rules/must-rules.md を配置
            if [ -n "$MUST_RULES_FILE" ] && [ -f "$MUST_RULES_FILE" ]; then
                cp "$MUST_RULES_FILE" "$CLAUDE_DIR/.claude/rules/must-rules.md"
                echo "✓ MUST Rules配置: .claude/rules/must-rules.md"
            fi

            # 新しいCLAUDE.mdを配置
            if [ -f "$SCRIPT_DIR/../.claude/CLAUDE.md" ]; then
                cp "$SCRIPT_DIR/../.claude/CLAUDE.md" "$CLAUDE_DIR/.claude/CLAUDE.md"
                echo "✓ 新しいCLAUDE.md配置（簡素化版、625行）"
            fi

            echo ""
            echo "✅ 移行完了（v1.3.38アーキテクチャ）"
        else
            echo ""
            echo "移行をキャンセルしました。"
            echo "既存のCLAUDE.mdを維持します。"
            echo ""
            echo "注意: Quality Guardian v1.3.38の機能を完全に利用するには移行が必要です。"
            echo "      後で移行する場合は、再度インストールを実行してください。"
        fi
    else
        # v1.3.38以降の場合、通常の更新
        echo "CLAUDE.mdは最新のアーキテクチャです（v$EXISTING_VERSION）"

        # .claude/rules/must-rules.md を更新
        if [ -n "$MUST_RULES_FILE" ] && [ -f "$MUST_RULES_FILE" ]; then
            cp "$MUST_RULES_FILE" "$CLAUDE_DIR/.claude/rules/must-rules.md"
            echo "✓ MUST Rules更新: .claude/rules/must-rules.md"
        fi

        # CLAUDE.mdを更新（Quality Guardian設定セクションのみ）
        if grep -q "# Quality Guardian Configuration" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
            echo "Quality Guardian設定は既に存在します"
        else
            echo "既存CLAUDE.mdにQuality Guardian設定を追加します"

            # 相反ルールチェック
            echo ""
            echo "既存CLAUDE.mdとの相反チェックを実行中..."
            CONFLICTS_FOUND=false
            CONFLICT_DETAILS=""

            # テストコマンドの競合チェック
            if [ -n "$TEST_COMMAND" ] && grep -q "テスト実行:" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
                EXISTING_TEST=$(grep "テスト実行:" "$CLAUDE_DIR/.claude/CLAUDE.md" | head -1)
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n  テストコマンド:"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    既存: $EXISTING_TEST"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    新規: テスト実行: $TEST_COMMAND"
                CONFLICTS_FOUND=true
            fi

            # リントコマンドの競合チェック
            if [ -n "$LINT_COMMAND" ] && grep -q "リント:" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
                EXISTING_LINT=$(grep "リント:" "$CLAUDE_DIR/.claude/CLAUDE.md" | head -1)
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n  リントコマンド:"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    既存: $EXISTING_LINT"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    新規: リント: $LINT_COMMAND"
                CONFLICTS_FOUND=true
            fi

            # 型チェックコマンドの競合チェック
            if [ -n "$TYPE_CHECK_COMMAND" ] && grep -q "型チェック:" "$CLAUDE_DIR/.claude/CLAUDE.md"; then
                EXISTING_TYPE=$(grep "型チェック:" "$CLAUDE_DIR/.claude/CLAUDE.md" | head -1)
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n  型チェックコマンド:"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    既存: $EXISTING_TYPE"
                CONFLICT_DETAILS="$CONFLICT_DETAILS\n    新規: 型チェック: $TYPE_CHECK_COMMAND"
                CONFLICTS_FOUND=true
            fi

            # 相反が見つかった場合、ユーザーに確認
            if [ "$CONFLICTS_FOUND" = true ]; then
                echo ""
                echo "⚠️  既存のCLAUDE.mdに相反する設定があります："
                echo -e "$CONFLICT_DETAILS"
                echo ""
                echo "どちらの設定を採用しますか？"
                echo "  1) 既存の設定を維持（Quality Guardian設定を追加しない）"
                echo "  2) 新規の設定を採用（既存の設定を上書き）"
                echo "  3) マージ（Quality Guardian設定を追加、既存も保持）"
                echo ""
                read -p "選択してください (1/2/3): " CONFLICT_CHOICE

                case "$CONFLICT_CHOICE" in
                    1)
                        echo ""
                        echo "既存の設定を維持します。Quality Guardian設定の追加をスキップします。"
                        echo ""
                        # 追記処理をスキップするため、早期リターン的な処理
                        # このブロック全体をスキップするフラグを設定
                        SKIP_QG_CONFIG=true
                        ;;
                    2)
                        echo ""
                        echo "新規の設定を採用します。既存の相反する設定を削除します。"
                        # 既存の相反する行を削除
                        if [ -n "$TEST_COMMAND" ]; then
                            sed -i.tmp '/テスト実行:/d' "$CLAUDE_DIR/.claude/CLAUDE.md"
                        fi
                        if [ -n "$LINT_COMMAND" ]; then
                            sed -i.tmp '/リント:/d' "$CLAUDE_DIR/.claude/CLAUDE.md"
                        fi
                        if [ -n "$TYPE_CHECK_COMMAND" ]; then
                            sed -i.tmp '/型チェック:/d' "$CLAUDE_DIR/.claude/CLAUDE.md"
                        fi
                        rm -f "$CLAUDE_DIR/.claude/CLAUDE.md.tmp"
                        SKIP_QG_CONFIG=false
                        ;;
                    3|*)
                        echo ""
                        echo "マージモードで追加します。既存の設定とQuality Guardian設定の両方を保持します。"
                        SKIP_QG_CONFIG=false
                        ;;
                esac
            else
                echo "✓ 相反する設定は見つかりませんでした"
                SKIP_QG_CONFIG=false
            fi

            # バックアップ作成
            cp "$CLAUDE_DIR/.claude/CLAUDE.md" "$CLAUDE_DIR/.claude/CLAUDE.md.backup"

            # 相反チェックの結果に応じて追記処理をスキップ
            if [ "$SKIP_QG_CONFIG" = true ]; then
                echo "Quality Guardian設定の追加をスキップしました"
            else
                # テンプレートファイルを読み込んで既存ファイルに追記
            if [ -n "$TEMPLATE_FILE" ] && [ -f "$TEMPLATE_FILE" ]; then
                # プレースホルダーを置換
                TEMPLATE_CONTENT=$(cat "$TEMPLATE_FILE" | \
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

                echo "CLAUDE.mdを安全に更新しました（テンプレート使用）"
            else
                echo "警告: テンプレートファイルが利用できません。CLAUDE.mdの更新をスキップします。"
            fi
            fi  # SKIP_QG_CONFIGのif文終了
        fi
    fi
else
    # 新規インストールの場合
    echo "新しいCLAUDE.mdを作成します（v1.3.38アーキテクチャ）"

    # .claude/rules/must-rules.md を配置
    if [ -n "$MUST_RULES_FILE" ] && [ -f "$MUST_RULES_FILE" ]; then
        cp "$MUST_RULES_FILE" "$CLAUDE_DIR/.claude/rules/must-rules.md"
        echo "✓ MUST Rules配置: .claude/rules/must-rules.md"
    fi

    # テンプレートファイルを読み込んで新規作成
    if [ -n "$TEMPLATE_FILE" ] && [ -f "$TEMPLATE_FILE" ]; then
        # プレースホルダーを置換
        TEMPLATE_CONTENT=$(cat "$TEMPLATE_FILE" | \
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
        echo "✓ CLAUDE.md作成（簡素化版、625行）"
    else
        echo "警告: テンプレートファイルが利用できません。CLAUDE.mdの作成をスキップします。"
    fi
fi

# 一時ファイルのクリーンアップ
if [ -f "/tmp/claude-template-$$.md" ]; then
    rm -f "/tmp/claude-template-$$.md"
fi
if [ -f "/tmp/must-rules-$$.md" ]; then
    rm -f "/tmp/must-rules-$$.md"
fi

# 一時ファイルのクリーンアップ
if [ -f "/tmp/claude-template-$$.md" ]; then
    rm -f "/tmp/claude-template-$$.md"
fi

# Claude Code ルールのコピー
echo ""
echo "Claude Code ルールをプロジェクトにコピー..."

if [ -f "$SCRIPT_DIR/../.claude/CLAUDE.md" ]; then
    # プロジェクトの .claude ディレクトリを作成
    mkdir -p "$PROJECT_DIR/.claude"

    # CLAUDE.md をコピー
    cp "$SCRIPT_DIR/../.claude/CLAUDE.md" "$PROJECT_DIR/.claude/CLAUDE.md"

    if [ -f "$PROJECT_DIR/.claude/CLAUDE.md" ]; then
        echo "✓ Claude Code ルール (CLAUDE.md) をコピーしました"
        echo "  場所: .claude/CLAUDE.md"

        if [ "$INSTALL_MODE" = "personal" ]; then
            echo ""
            echo "Note: Personal Mode では .claude/ 配下のみに設定を配置します"
            echo "      他の開発者には影響しません"
        else
            echo ""
            echo "Note: Team Mode では全ての開発者に適用されます"
            echo "      .gitignore に .claude/ を追加しない限り、Git にコミットされます"
        fi
    else
        echo "✗ CLAUDE.md のコピーに失敗しました"
    fi
else
    echo "✗ CLAUDE.md が見つかりませんでした"
    echo "  期待されるパス: $SCRIPT_DIR/../.claude/CLAUDE.md"
    echo ""
    echo "Note: CLAUDE.md はグローバルルール (~/.claude/CLAUDE.md) として利用可能です"
fi

# 初期ベースライン記録
if [ "$NON_INTERACTIVE" = false ]; then
    echo ""
    echo "初期ベースラインを記録しますか？"
    read -p "今の状態を基準として記録します (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./quality-guardian baseline
    fi
else
    echo ""
    echo "初期ベースライン記録をスキップ (非対話モード)"
fi

echo ""
echo "Quality Guardian のインストールが完了しました！"
echo ""
if [ "$INSTALL_MODE" = "personal" ]; then
    echo "Personal Mode: 他の開発者に影響なくインストールされました"
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