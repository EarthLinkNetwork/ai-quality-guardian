#!/bin/bash
#
# PM Orchestrator Installation Script
#
# .claude/settings.json と .claude/CLAUDE.md にマーカー付きで設定を追加します。
# アンインストール時は uninstall.sh でマーカー部分を削除できます。
#
# 使用方法:
#   npx pm-orchestrator-enhancement install
#   または
#   ./scripts/install.sh [target-dir]
#

set -e

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# マーカー定義
MARKER_START="_pmOrchestratorManaged"
MD_MARKER_START="<!-- PM-ORCHESTRATOR-START -->"
MD_MARKER_END="<!-- PM-ORCHESTRATOR-END -->"

# ターゲットディレクトリ
TARGET_DIR="${1:-.}"
CLAUDE_DIR="$TARGET_DIR/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

echo -e "${BLUE}=== PM Orchestrator Installation ===${NC}"
echo "Target directory: $TARGET_DIR"
echo ""

# .claudeディレクトリの確認・作成
if [[ ! -d "$CLAUDE_DIR" ]]; then
  echo -e "${YELLOW}Creating .claude directory...${NC}"
  mkdir -p "$CLAUDE_DIR"
fi

# ========================================
# settings.json の更新
# ========================================
update_settings_json() {
  echo "Updating settings.json..."

  if [[ ! -f "$SETTINGS_FILE" ]]; then
    # 新規作成
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

  # 既存ファイルの場合、マーカーが既にあるか確認
  if grep -q "$MARKER_START" "$SETTINGS_FILE" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} PM Orchestrator hook already exists"
    return
  fi

  # jqがあるか確認
  if ! command -v jq &> /dev/null; then
    echo -e "   ${RED}[ERROR]${NC} jq is required to update settings.json"
    echo "   Please install jq: brew install jq"
    exit 1
  fi

  # hooks.UserPromptSubmit 配列に追加
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

  # 追加するコンテンツ
  local CONTENT="
$MD_MARKER_START
_pmOrchestratorCreatedFile: $CLAUDE_MD_CREATED
# PM Orchestrator Integration

このプロジェクトではPM Orchestratorが有効です。

## 自動起動

複雑なタスク（複数ファイル変更、PRレビュー対応、品質チェック等）を検出すると、
PM Orchestratorが自動的に起動し、適切なサブエージェントを調整します。

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

$MD_MARKER_END
"

  if [[ -f "$CLAUDE_MD" ]]; then
    # 既存ファイルに追記
    echo "$CONTENT" >> "$CLAUDE_MD"
    echo -e "   ${GREEN}[UPDATED]${NC} $CLAUDE_MD"
  else
    # 新規作成
    echo "$CONTENT" > "$CLAUDE_MD"
    echo -e "   ${GREEN}[CREATED]${NC} $CLAUDE_MD"
  fi
}

# ========================================
# hookスクリプトの作成
# ========================================
create_hook_script() {
  echo "Creating hook script..."

  local HOOKS_DIR="$CLAUDE_DIR/hooks"
  local HOOK_FILE="$HOOKS_DIR/user-prompt-submit.sh"

  mkdir -p "$HOOKS_DIR"

  if [[ -f "$HOOK_FILE" ]] && grep -q "$MARKER_START" "$HOOK_FILE" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} Hook script already exists"
    return
  fi

  cat > "$HOOK_FILE" << 'HOOKEOF'
#!/bin/bash
# _pmOrchestratorManaged: true
# PM Orchestrator hook script

set -e

cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PM Orchestrator 起動（必須）

Main AIへ:
  Task tool で pm-orchestrator を即座に起動せよ
  検出・確認は不要
  毎回起動する

起動方法:
  subagent_type: "pm-orchestrator"
  description: "タスク管理"
  prompt: ユーザー入力をそのまま渡す
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

exit 0
HOOKEOF

  chmod +x "$HOOK_FILE"
  echo -e "   ${GREEN}[CREATED]${NC} $HOOK_FILE"
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
# メイン処理
# ========================================
update_settings_json
create_hook_script
update_claude_md
create_command_file

echo ""
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo ""
echo "PM Orchestrator has been installed to $TARGET_DIR"
echo ""
echo "To uninstall, run:"
echo "  npx pm-orchestrator-enhancement uninstall"
echo "  or"
echo "  ./scripts/uninstall.sh $TARGET_DIR"
