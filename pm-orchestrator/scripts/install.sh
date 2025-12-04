#!/bin/bash
#
# PM Orchestrator Installation Script
#
# .claude/settings.json と .claude/CLAUDE.md にマーカー付きで設定を追加します。
# アンインストール時は uninstall.sh でマーカー部分を削除できます。
#
# 使用方法:
#   npx pm-orchestrator-enhancement install [--team|--personal]
#   または
#   ./scripts/install.sh [target-dir] [--team|--personal]
#
# モード:
#   --team     : プロジェクト直接インストール（デフォルト）
#   --personal : 親ディレクトリにインストール（プロジェクトを汚さない）
#
# Version: 1.0.22

set -e

# ========================================
# 自己インストール防止ガード
# ========================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PM_ORCHESTRATOR_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CURRENT_DIR="$(pwd)"
if [[ "$CURRENT_DIR" == "$PM_ORCHESTRATOR_ROOT" ]] || [[ "$CURRENT_DIR" == "$PM_ORCHESTRATOR_ROOT"/* ]]; then
  echo ""
  echo -e "\033[0;31m ERROR: Self-installation is prohibited\033[0m"
  echo ""
  echo "pm-orchestrator の開発ディレクトリ内にはインストールできません。"
  echo ""
  echo "このパッケージは他のプロジェクトで使用するためのライブラリです。"
  echo "インストールするには、対象のプロジェクトディレクトリに移動してから実行してください。"
  echo ""
  echo "例:"
  echo "  cd /path/to/your/project"
  echo "  npx pm-orchestrator-enhancement install"
  echo ""
  exit 1
fi

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# マーカー定義
MARKER_START="_pmOrchestratorManaged"
MD_MARKER_START="<!-- PM-ORCHESTRATOR-START -->"
MD_MARKER_END="<!-- PM-ORCHESTRATOR-END -->"

# インストールモード
INSTALL_MODE=""

# 引数解析
TARGET_DIR="."
for arg in "$@"; do
  case $arg in
    --team)
      INSTALL_MODE="team"
      ;;
    --personal)
      INSTALL_MODE="personal"
      ;;
    *)
      if [[ ! "$arg" == --* ]]; then
        TARGET_DIR="$arg"
      fi
      ;;
  esac
done

# ========================================
# モード選択（インタラクティブ）
# ========================================
select_mode() {
  if [[ -n "$INSTALL_MODE" ]]; then
    return
  fi

  echo -e "${CYAN}インストールモードを選択してください:${NC}"
  echo ""
  echo "  1) Team     - このプロジェクトに直接インストール"
  echo "               .claude/ フォルダに設定を追加します"
  echo "               チーム全体で共有する場合に推奨"
  echo ""
  echo "  2) Personal - 親ディレクトリにインストール"
  echo "               プロジェクトのリポジトリを汚しません"
  echo "               個人利用の場合に推奨"
  echo ""

  while true; do
    read -p "選択 [1/2]: " choice
    case $choice in
      1)
        INSTALL_MODE="team"
        break
        ;;
      2)
        INSTALL_MODE="personal"
        break
        ;;
      *)
        echo -e "${RED}1 または 2 を入力してください${NC}"
        ;;
    esac
  done
  echo ""
}

# ========================================
# 既存インストールの検出とアンインストール
# ========================================
check_existing_installation() {
  local TEAM_CLAUDE_DIR="$TARGET_DIR/.claude"
  local TEAM_SETTINGS="$TEAM_CLAUDE_DIR/settings.json"
  local TEAM_CLAUDE_MD="$TEAM_CLAUDE_DIR/CLAUDE.md"

  local PARENT_DIR="$(cd "$TARGET_DIR" && cd .. && pwd)"
  local PERSONAL_CLAUDE_DIR="$PARENT_DIR/.claude"
  local PERSONAL_CLAUDE_MD="$PERSONAL_CLAUDE_DIR/CLAUDE.md"

  local EXISTING_MODE=""
  local EXISTING_DIR=""

  # Teamモードの既存インストールをチェック
  if [[ -f "$TEAM_SETTINGS" ]] && grep -q "$MARKER_START" "$TEAM_SETTINGS" 2>/dev/null; then
    EXISTING_MODE="team"
    EXISTING_DIR="$TEAM_CLAUDE_DIR"
  elif [[ -f "$TEAM_CLAUDE_MD" ]] && grep -q "$MD_MARKER_START" "$TEAM_CLAUDE_MD" 2>/dev/null; then
    EXISTING_MODE="team"
    EXISTING_DIR="$TEAM_CLAUDE_DIR"
  fi

  # Personalモードの既存インストールをチェック
  if [[ -f "$PERSONAL_CLAUDE_MD" ]] && grep -q "_pmOrchestratorMode: personal" "$PERSONAL_CLAUDE_MD" 2>/dev/null; then
    EXISTING_MODE="personal"
    EXISTING_DIR="$PERSONAL_CLAUDE_DIR"
  fi

  # 既存インストールが見つかった場合
  if [[ -n "$EXISTING_MODE" ]]; then
    echo -e "${YELLOW}既存のインストールを検出しました (${EXISTING_MODE} mode)${NC}"
    echo "Location: $EXISTING_DIR"
    echo ""
    echo -e "${CYAN}自動的にアンインストールしてから再インストールします...${NC}"
    echo ""

    # uninstall.sh を実行
    if [[ -f "$SCRIPT_DIR/uninstall.sh" ]]; then
      bash "$SCRIPT_DIR/uninstall.sh" "$TARGET_DIR"
      echo ""
    else
      echo -e "${RED}[ERROR]${NC} uninstall.sh not found at $SCRIPT_DIR"
      exit 1
    fi
  fi
}

# 既存インストールのチェックと自動アンインストール
check_existing_installation

# モード選択を実行
select_mode

# Personalモードの場合、親ディレクトリを使用
if [[ "$INSTALL_MODE" == "personal" ]]; then
  PARENT_DIR="$(cd "$TARGET_DIR" && cd .. && pwd)"
  CLAUDE_DIR="$PARENT_DIR/.claude"
  PROJECT_NAME="$(basename "$(cd "$TARGET_DIR" && pwd)")"
  echo -e "${BLUE}=== PM Orchestrator Installation (Personal Mode) ===${NC}"
  echo "Project directory: $TARGET_DIR"
  echo "Install directory: $PARENT_DIR/.claude/"
  echo ""
else
  CLAUDE_DIR="$TARGET_DIR/.claude"
  echo -e "${BLUE}=== PM Orchestrator Installation (Team Mode) ===${NC}"
  echo "Target directory: $TARGET_DIR"
  echo ""
fi

SETTINGS_FILE="$CLAUDE_DIR/settings.json"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

# .claudeディレクトリの確認・作成
if [[ ! -d "$CLAUDE_DIR" ]]; then
  echo -e "${YELLOW}Creating .claude directory...${NC}"
  mkdir -p "$CLAUDE_DIR"
fi

# ========================================
# 既存エントリの存在チェック（jqを使った正確な検査）
# ========================================
check_pm_hook_exists() {
  local settings_file="$1"
  
  if [[ ! -f "$settings_file" ]]; then
    return 1  # ファイルが存在しない = エントリなし
  fi

  if ! command -v jq &> /dev/null; then
    # jqがない場合は単純なgrep検索にフォールバック
    grep -q "$MARKER_START" "$settings_file" 2>/dev/null
    return $?
  fi

  # jqで構造的に検査
  # hooks.UserPromptSubmit配列を再帰的に調べる
  local has_hook=$(jq -r '
    def find_pm_hook:
      if type == "array" then
        .[] | find_pm_hook
      elif type == "object" then
        if ._pmOrchestratorManaged == true then
          true
        elif .hooks then
          .hooks | find_pm_hook
        elif .command and (.command | contains("user-prompt-submit.sh") or contains("pm-orchestrator-hook.sh")) then
          true
        else
          false
        end
      else
        false
      end;
    
    .hooks.UserPromptSubmit // [] | find_pm_hook
  ' "$settings_file" 2>/dev/null)

  if [[ "$has_hook" == "true" ]]; then
    return 0  # エントリあり
  else
    return 1  # エントリなし
  fi
}

# ========================================
# settings.json の更新
# ========================================
update_settings_json() {
  echo "Updating settings.json..."

  if [[ ! -f "$SETTINGS_FILE" ]]; then
    # 新規作成 - 正しいネスト構造で作成
    cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "_pmOrchestratorManaged": true,
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo -e "   ${GREEN}[CREATED]${NC} $SETTINGS_FILE"
    return
  fi

  # 既存ファイルの場合、エントリが既にあるか確認
  if check_pm_hook_exists "$SETTINGS_FILE"; then
    echo -e "   ${YELLOW}[SKIP]${NC} PM Orchestrator hook already exists"
    return
  fi

  # jqがあるか確認
  if ! command -v jq &> /dev/null; then
    echo -e "   ${RED}[ERROR]${NC} jq is required to update settings.json"
    echo "   Please install jq: brew install jq"
    exit 1
  fi

  # hooks.UserPromptSubmit 配列に追加（正しいネスト構造）
  local NEW_HOOK='{"hooks":[{"_pmOrchestratorManaged":true,"type":"command","command":"$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh"}]}'

  # UserPromptSubmit が存在するか確認
  if jq -e '.hooks.UserPromptSubmit' "$SETTINGS_FILE" > /dev/null 2>&1; then
    # 既存の配列に追加
    jq ".hooks.UserPromptSubmit += [$NEW_HOOK]" "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  else
    # hooks.UserPromptSubmit を新規作成
    jq ".hooks.UserPromptSubmit = [$NEW_HOOK]" "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  fi

  echo -e "   ${GREEN}[UPDATED]${NC} $SETTINGS_FILE"
}

# ========================================
# hookスクリプトの作成（templates/から読み込む）
# ========================================
create_hook_script() {
  echo "Creating hook script from template..."

  local HOOKS_DIR="$CLAUDE_DIR/hooks"
  local HOOK_FILE="$HOOKS_DIR/user-prompt-submit.sh"
  local TEMPLATE_FILE="$PM_ORCHESTRATOR_ROOT/templates/.claude/hooks/user-prompt-submit.sh"

  mkdir -p "$HOOKS_DIR"

  if [[ -f "$HOOK_FILE" ]] && grep -q "$MARKER_START" "$HOOK_FILE" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} Hook script already exists"
    return
  fi

  # テンプレートファイルの存在確認
  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    echo -e "   ${RED}[ERROR]${NC} Template file not found: $TEMPLATE_FILE"
    exit 1
  fi

  # テンプレートをコピー
  cp "$TEMPLATE_FILE" "$HOOK_FILE"
  chmod +x "$HOOK_FILE"
  echo -e "   ${GREEN}[CREATED]${NC} $HOOK_FILE (from template)"
}

# ========================================
# rulesディレクトリのコピー
# ========================================
copy_rules_directory() {
  echo "Copying rules directory from template..."

  local RULES_DIR="$CLAUDE_DIR/rules"
  local TEMPLATE_RULES_DIR="$PM_ORCHESTRATOR_ROOT/templates/.claude/rules"

  if [[ ! -d "$TEMPLATE_RULES_DIR" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Template rules directory not found"
    return
  fi

  mkdir -p "$RULES_DIR"

  # rulesディレクトリ内のファイルをコピー
  for file in "$TEMPLATE_RULES_DIR"/*; do
    if [[ -f "$file" ]]; then
      local filename=$(basename "$file")
      cp "$file" "$RULES_DIR/$filename"
      echo -e "   ${GREEN}[CREATED]${NC} $RULES_DIR/$filename"
    fi
  done
}

# ========================================
# CLAUDE.md の更新
# ========================================
update_claude_md() {
  echo "Updating CLAUDE.md..."

  # マーカーが既にあるか確認
  if [[ -f "$CLAUDE_MD" ]] && grep -q "$MD_MARKER_START" "$CLAUDE_MD" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} PM Orchestrator section already exists"
    return
  fi

  # CLAUDE.mdが新規作成されたかどうかを記録
  local CLAUDE_MD_CREATED=false
  if [[ ! -f "$CLAUDE_MD" ]]; then
    CLAUDE_MD_CREATED=true
  fi

  # 追加するコンテンツ（モード情報も記録 + 強制起動指示）
  # CRITICAL Rules は外部ファイル(.claude/rules/critical-must.md)で管理
  # hookが毎回catして出力するため、CLAUDE.mdには記載不要
  local CONTENT="# PM Orchestrator - 100% Always-On（毎回起動）

**重要: このプロジェクトでは、全てのユーザー入力でPM Orchestratorを起動する。**

CRITICAL MUST Rulesは \`.claude/rules/critical-must.md\` に定義されており、
hookが毎回出力するため、必ずMain AIに伝達される。

---

## System Enforcement

### Main AIへの指示

user-prompt-submit.sh hookがPM Orchestrator起動トリガーを出力した場合、
Main AIは即座にTask toolでpm-orchestratorを起動しなければならない。

**絶対禁止:**
- PM Orchestratorを起動せずに回答する
- 「今後は起動します」と言う（口約束は無効）
- 「hookからは起動できない」と言う（現に動作している）
- 「制約でできない」と言う

**必須手順:**
1. hookの出力を確認
2. Task toolを呼び出す
3. subagent_type: \"pm-orchestrator\"
4. prompt: ユーザー入力をそのまま渡す

### hookの出力例

hookは以下のような出力をsystem-reminderに送る:

\`\`\`
PM Orchestrator 起動（必須）
Main AIへ:
  Task tool で pm-orchestrator を即座に起動せよ
\`\`\`

この出力を見たら、**今すぐ**Task toolを呼ぶ。説明や確認は不要。

## 利用可能なサブエージェント

- **rule-checker**: MUSTルール検証
- **implementer**: 実装実行
- **qa**: 品質チェック（lint/test/typecheck/build）
- **reporter**: 統合レポート作成
- **designer**: 設計書作成
- **tester**: テスト作成

## 手動起動

\`\`\`
/pm [タスク説明]
\`\`\`

## アンインストール

\`\`\`bash
npx pm-orchestrator-enhancement uninstall
\`\`\`

$MD_MARKER_START
_pmOrchestratorCreatedFile: $CLAUDE_MD_CREATED
_pmOrchestratorMode: $INSTALL_MODE
$MD_MARKER_END
"

  if [[ -f "$CLAUDE_MD" ]]; then
    # 既存ファイルの先頭に挿入（Claude Codeは先頭の指示を優先する）
    local TEMP_FILE="$CLAUDE_MD.tmp"
    echo "$CONTENT" > "$TEMP_FILE"
    echo "" >> "$TEMP_FILE"
    cat "$CLAUDE_MD" >> "$TEMP_FILE"
    mv "$TEMP_FILE" "$CLAUDE_MD"
    echo -e "   ${GREEN}[UPDATED]${NC} $CLAUDE_MD (prepended to top)"
  else
    # 新規作成
    echo "$CONTENT" > "$CLAUDE_MD"
    echo -e "   ${GREEN}[CREATED]${NC} $CLAUDE_MD"
  fi
}

# ========================================
# コマンドファイルの作成
# ========================================
create_command_file() {
  echo "Creating command file..."

  local COMMANDS_DIR="$CLAUDE_DIR/commands"
  local COMMAND_FILE="$COMMANDS_DIR/pm.md"

  mkdir -p "$COMMANDS_DIR"

  if [[ -f "$COMMAND_FILE" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Command file already exists"
    return
  fi

  cat > "$COMMAND_FILE" << 'EOF'
# PM Orchestrator - 100% Always-On（毎回起動）

このプロジェクトでは、PM Orchestratorは**100%常時起動**です。

---

## 設計原則

- **全てのユーザー入力でPM Orchestratorを起動する**
- TaskType判定・writeガード・サブエージェントチェーンはPM側で決定
- Main AIは判断せず、PMに全てを委譲する
- hookは「PMを起動せよ」というトリガーのみを出力

---

## Main AIの義務

1. **ユーザー入力を受け取ったら、即座にTask toolでpm-orchestratorを起動**
2. 自分で応答を作成しない
3. PMの判定結果に従う
4. PMの結果をユーザーに報告

---

## Task tool 呼び出し形式

```
subagent_type: "pm-orchestrator"
description: "タスク分析と実行"
prompt: |
  ユーザー入力:
  $ARGUMENTS

  このタスクを分析し、以下を実行してください:
  1. TaskType判定（READ_INFO/LIGHT_EDIT/IMPLEMENTATION/REVIEW_RESPONSE/CONFIG_CI_CHANGE/DANGEROUS_OP）
  2. write許可判定
  3. 必要なサブエージェントチェーン決定
  4. サブエージェント起動または直接実行
  5. 結果をJSON形式で報告
```

---

## 絶対禁止

Main AIは以下を絶対にしてはいけない:

- PM Orchestratorを起動せずに回答する
- 「今後は起動します」と言う（口約束）
- 自分でTaskType判定をする
- 「hookからは起動できない」と言う
- 「制約でできない」と言う

---

## 入力

$ARGUMENTS
EOF

  echo -e "   ${GREEN}[CREATED]${NC} $COMMAND_FILE"
}

# ========================================
# エージェント定義ファイルの作成
# ========================================
create_agent_file() {
  echo "Creating agent definition file..."

  local AGENTS_DIR="$CLAUDE_DIR/agents"
  local AGENT_FILE="$AGENTS_DIR/pm-orchestrator.md"

  mkdir -p "$AGENTS_DIR"

  if [[ -f "$AGENT_FILE" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Agent definition already exists"
    return
  fi

  cat > "$AGENT_FILE" << 'EOF'
---
name: pm-orchestrator
description: 全サブエージェントの中心ハブ。ユーザー入力を分析し、適切なサブエージェントチェーンを起動・管理する。
tools: Task, Read, Bash, Grep, Glob, LS, TodoWrite
---

# PM Orchestrator - プロジェクトマネージャーサブエージェント

**役割**: 全サブエージェントの中心ハブ。ユーザー入力を分析し、適切なサブエージェントチェーンを起動・管理する。

## 起動タイミング

UserPromptSubmit hook がパターンを検出した時、自動的に起動される。

**起動条件**:
- 複雑なタスク（複数ステップ、複数ファイル変更）
- ルールチェックが必要なタスク（Git操作、不可逆な操作）
- 品質保証が必要なタスク（実装、テスト）

## PM の責務

### 1. タスク分析

ユーザー入力を分析し、以下を決定：

- **タスクの種類**: 実装 / 修正 / 調査 / ドキュメント作成
- **複雑度**: Simple / Medium / Complex
- **必要なサブエージェント**: Designer / RuleChecker / QA / Implementer / Reporter
- **実行順序**: 直列 / 並列

### 2. サブエージェント起動

決定した順序でサブエージェントを起動

### 3. チェックポイント管理

各サブエージェントの結果を集約し、次に進むべきか判断

### 4. 最終報告

全サブエージェントの結果をまとめてユーザーに報告

## 厳守事項

1. **全サブエージェントはPMを経由** - サブエージェント同士の直接通信は禁止
2. **チェックポイントの強制** - 全チェックがOKになるまで次に進まない
3. **責任の明確化** - どのサブエージェントが何をチェックしたか記録
4. **透明性** - 現在どのサブエージェントを実行中か表示
EOF

  echo -e "   ${GREEN}[CREATED]${NC} $AGENT_FILE"
}

# ========================================
# メイン処理
# ========================================
update_settings_json
create_hook_script
copy_rules_directory
update_claude_md
create_command_file
create_agent_file

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo "PM Orchestrator has been installed to $CLAUDE_DIR"
echo "Mode: $INSTALL_MODE"
echo ""
echo "To uninstall, run:"
echo "  npx pm-orchestrator-enhancement uninstall"
echo "  or"
echo "  ./scripts/uninstall.sh $TARGET_DIR"
echo ""
