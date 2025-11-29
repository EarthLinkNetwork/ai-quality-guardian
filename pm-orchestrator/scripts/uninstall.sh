#!/bin/bash
#
# PM Orchestrator Uninstallation Script
#
# install.sh で追加したマーカー部分を削除します。
#
# 使用方法:
#   npx pm-orchestrator-enhancement uninstall
#   または
#   ./scripts/uninstall.sh [target-dir]
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
COMMAND_FILE="$CLAUDE_DIR/commands/pm.md"
HOOK_FILE="$CLAUDE_DIR/hooks/user-prompt-submit.sh"

echo -e "${BLUE}=== PM Orchestrator Uninstallation ===${NC}"
echo "Target directory: $TARGET_DIR"
echo ""

# ========================================
# settings.json からマーカー付きエントリを削除
# ========================================
clean_settings_json() {
  echo "Cleaning settings.json..."

  if [[ ! -f "$SETTINGS_FILE" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} settings.json not found"
    return
  fi

  # マーカーが存在するか確認
  if ! grep -q "$MARKER_START" "$SETTINGS_FILE" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} No PM Orchestrator entries found"
    return
  fi

  # jqがあるか確認
  if ! command -v jq &> /dev/null; then
    echo -e "   ${RED}[ERROR]${NC} jq is required to update settings.json"
    echo "   Please install jq: brew install jq"
    exit 1
  fi

  # _pmOrchestratorManaged フラグを持つエントリを削除（ネスト構造対応）
  # 新構造: hooks.UserPromptSubmit[].hooks[] の中にマーカーがある
  jq 'if .hooks.UserPromptSubmit then .hooks.UserPromptSubmit |= map(
    if .hooks then
      .hooks |= map(select(._pmOrchestratorManaged != true)) |
      if .hooks == [] then empty else . end
    elif ._pmOrchestratorManaged == true then empty
    else .
    end
  ) else . end' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"

  # 空の配列になったら hooks.UserPromptSubmit を削除
  jq 'if .hooks.UserPromptSubmit == [] then del(.hooks.UserPromptSubmit) else . end' "$SETTINGS_FILE.tmp" > "$SETTINGS_FILE.tmp2"

  # hooks が空になったら hooks を削除
  jq 'if .hooks == {} then del(.hooks) else . end' "$SETTINGS_FILE.tmp2" > "$SETTINGS_FILE.tmp3"

  mv "$SETTINGS_FILE.tmp3" "$SETTINGS_FILE"
  rm -f "$SETTINGS_FILE.tmp" "$SETTINGS_FILE.tmp2"

  # ファイルが空のJSONオブジェクトになったか確認
  if [[ "$(cat "$SETTINGS_FILE")" == "{}" ]]; then
    rm "$SETTINGS_FILE"
    echo -e "   ${GREEN}[REMOVED]${NC} $SETTINGS_FILE (was empty)"
  else
    echo -e "   ${GREEN}[CLEANED]${NC} $SETTINGS_FILE"
  fi
}

# ========================================
# CLAUDE.md からマーカー間を削除
# ========================================
clean_claude_md() {
  echo "Cleaning CLAUDE.md..."

  if [[ ! -f "$CLAUDE_MD" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} CLAUDE.md not found"
    return
  fi

  # マーカーが存在するか確認
  if ! grep -q "$MD_MARKER_START" "$CLAUDE_MD" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} No PM Orchestrator section found"
    return
  fi

  # このファイルがPM Orchestratorによって作成されたものかチェック
  local WAS_CREATED_BY_PM=false
  if grep -q "_pmOrchestratorCreatedFile: true" "$CLAUDE_MD" 2>/dev/null; then
    WAS_CREATED_BY_PM=true
  fi

  # マーカー間を削除（sedを使用）
  # macOSとLinuxの両方に対応
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "/$MD_MARKER_START/,/$MD_MARKER_END/d" "$CLAUDE_MD"
  else
    # Linux
    sed -i "/$MD_MARKER_START/,/$MD_MARKER_END/d" "$CLAUDE_MD"
  fi

  # 先頭と末尾の空行を整理
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - 先頭の空行を削除
    sed -i '' '/./,$!d' "$CLAUDE_MD" 2>/dev/null || true
    # 末尾の連続空行を1つに
    sed -i '' -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$CLAUDE_MD" 2>/dev/null || true
  else
    # Linux - 先頭の空行を削除
    sed -i '/./,$!d' "$CLAUDE_MD" 2>/dev/null || true
    # 末尾の連続空行を1つに
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$CLAUDE_MD" 2>/dev/null || true
  fi

  # ファイルがPM Orchestratorによって作成され、空になった場合は削除
  if [[ "$WAS_CREATED_BY_PM" == "true" ]]; then
    # ファイルが空または空白のみか確認
    if [[ ! -s "$CLAUDE_MD" ]] || [[ -z "$(cat "$CLAUDE_MD" | tr -d '[:space:]')" ]]; then
      rm "$CLAUDE_MD"
      echo -e "   ${GREEN}[REMOVED]${NC} $CLAUDE_MD (was created by PM Orchestrator)"
      return
    fi
  fi

  echo -e "   ${GREEN}[CLEANED]${NC} $CLAUDE_MD"
}

# ========================================
# hookスクリプトの削除
# ========================================
remove_hook_script() {
  echo "Removing hook script..."

  if [[ ! -f "$HOOK_FILE" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Hook script not found"
    return
  fi

  # PM Orchestratorが作成したものか確認
  if ! grep -q "$MARKER_START" "$HOOK_FILE" 2>/dev/null; then
    echo -e "   ${YELLOW}[SKIP]${NC} Hook script not managed by PM Orchestrator"
    return
  fi

  rm "$HOOK_FILE"
  echo -e "   ${GREEN}[REMOVED]${NC} $HOOK_FILE"

  # hooks ディレクトリが空なら削除
  if [[ -d "$CLAUDE_DIR/hooks" ]] && [[ -z "$(ls -A "$CLAUDE_DIR/hooks")" ]]; then
    rmdir "$CLAUDE_DIR/hooks"
    echo -e "   ${GREEN}[REMOVED]${NC} $CLAUDE_DIR/hooks/ (was empty)"
  fi
}

# ========================================
# コマンドファイルの削除
# ========================================
remove_command_file() {
  echo "Removing command file..."

  if [[ ! -f "$COMMAND_FILE" ]]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Command file not found"
    return
  fi

  rm "$COMMAND_FILE"
  echo -e "   ${GREEN}[REMOVED]${NC} $COMMAND_FILE"

  # commands ディレクトリが空なら削除
  if [[ -d "$CLAUDE_DIR/commands" ]] && [[ -z "$(ls -A "$CLAUDE_DIR/commands")" ]]; then
    rmdir "$CLAUDE_DIR/commands"
    echo -e "   ${GREEN}[REMOVED]${NC} $CLAUDE_DIR/commands/ (was empty)"
  fi
}

# ========================================
# メイン処理
# ========================================
clean_settings_json
remove_hook_script
clean_claude_md
remove_command_file

echo ""
echo -e "${GREEN}=== Uninstallation Complete ===${NC}"
echo ""
echo "PM Orchestrator has been removed from $TARGET_DIR"
echo ""
echo "Note: The npm package is still installed."
echo "To completely remove, also run:"
echo "  npm uninstall pm-orchestrator-enhancement"
