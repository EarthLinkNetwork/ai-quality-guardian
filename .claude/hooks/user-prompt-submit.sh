#!/usr/bin/env bash
set -euo pipefail

# PM Orchestrator 強制起動 hook (v1.3.84)
# Main AIが「口約束」を守らないため、システム的強制を実装

# 入力を読み取る（JSON形式）
INPUT=$(cat)

# JSONから prompt フィールドを抽出
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

# プロジェクトパス（動的解決）
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    THIS_PROJECT="$CLAUDE_PROJECT_DIR"
else
    THIS_PROJECT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

# ============================================================================
# TaskType判定（Phase 9-3準拠）
# ============================================================================

TASK_TYPE="READ_INFO"  # デフォルト

# DANGEROUS_OP（最優先）
if echo "$USER_MESSAGE" | grep -qiE 'force.*push|--force|ファイル.*削除|rm -rf|本番.*操作|production.*deploy|git.*reset.*--hard|drop.*table|データベース.*削除' 2>/dev/null; then
  TASK_TYPE="DANGEROUS_OP"
# CONFIG_CI_CHANGE
elif echo "$USER_MESSAGE" | grep -qiE 'hook.*変更|settings.*変更|CI.*設定|workflow.*変更|\.github|lefthook|husky|eslint.*設定|tsconfig|package\.json.*変更' 2>/dev/null; then
  TASK_TYPE="CONFIG_CI_CHANGE"
# REVIEW_RESPONSE
elif echo "$USER_MESSAGE" | grep -qiE 'coderabbit|resolve|review.*comment|PR.*comment|PR.*レビュー|review.*指摘|レビュー.*指摘' 2>/dev/null; then
  TASK_TYPE="REVIEW_RESPONSE"
# IMPLEMENTATION
elif echo "$USER_MESSAGE" | grep -qiE '実装|作成|追加.*機能|リファクタ|複数.*ファイル|設計|バージョン.*更新|version.*update|全.*箇所|チェックリスト|一覧.*修正' 2>/dev/null; then
  TASK_TYPE="IMPLEMENTATION"
# LIGHT_EDIT
elif echo "$USER_MESSAGE" | grep -qiE 'typo|タイポ|コメント.*追加|コメント.*修正|1.*ファイル.*修正|軽微.*修正|簡単.*修正' 2>/dev/null; then
  TASK_TYPE="LIGHT_EDIT"
# READ_INFO（明示的に読み取り/調査の場合）
elif echo "$USER_MESSAGE" | grep -qiE '教えて|説明|確認|調査|検索|どこ|なに|何|表示|見せて|読んで|内容' 2>/dev/null; then
  TASK_TYPE="READ_INFO"
fi

# TaskTypeごとの属性設定
case "$TASK_TYPE" in
  "READ_INFO")
    WRITE_ALLOWED="false"
    CONFIRMATION_REQUIRED="不要"
    SUBAGENT_CHAIN="（なし）"
    PM_BOOT_REQUIRED="false"
    ;;
  "LIGHT_EDIT")
    WRITE_ALLOWED="true"
    CONFIRMATION_REQUIRED="不要"
    SUBAGENT_CHAIN="Implementer"
    PM_BOOT_REQUIRED="false"
    ;;
  "IMPLEMENTATION")
    WRITE_ALLOWED="true"
    CONFIRMATION_REQUIRED="設計確認"
    SUBAGENT_CHAIN="RuleChecker → Designer → Implementer → QA → Reporter"
    PM_BOOT_REQUIRED="true"
    ;;
  "REVIEW_RESPONSE")
    WRITE_ALLOWED="true"
    CONFIRMATION_REQUIRED="対応計画"
    SUBAGENT_CHAIN="RuleChecker → Implementer → QA → Reporter"
    PM_BOOT_REQUIRED="true"
    ;;
  "CONFIG_CI_CHANGE")
    WRITE_ALLOWED="true"
    CONFIRMATION_REQUIRED="影響確認"
    SUBAGENT_CHAIN="RuleChecker → Implementer → QA"
    PM_BOOT_REQUIRED="true"
    ;;
  "DANGEROUS_OP")
    WRITE_ALLOWED="true"
    CONFIRMATION_REQUIRED="必須"
    SUBAGENT_CHAIN="RuleChecker → （ユーザー確認） → Implementer"
    PM_BOOT_REQUIRED="true"
    ;;
esac

# ============================================================================
# 🚨 MANDATORY ACTIONS - 強制ブロック（Main AIを強制的に停止）
# ============================================================================

if [ "$PM_BOOT_REQUIRED" = "true" ]; then
  cat <<'EOF'
================================================================================
🚨🚨🚨 STOP - 以下を読むまで応答禁止 🚨🚨🚨
================================================================================

【MANDATORY ACTION - 絶対厳守】

あなたは今から「PM Orchestrator」サブエージェントを起動しなければなりません。

以下の説明をすることは禁止:
  ❌ 「hookからは起動できない」
  ❌ 「制約でできない」
  ❌ 「動いていないかもしれない」
  ❌ 「今後は〜します」（口約束）
  
これらの言い訳をする代わりに、今すぐ以下を実行してください:

【必須手順】
1. Task tool を使用
2. subagent_type: "pm-orchestrator"
3. description: "タスク管理とサブエージェント起動"
4. prompt: 以下の内容を含める

────────────────────────────────────────────────────────

EOF

  cat <<EOF
ユーザー入力:
$USER_MESSAGE

TaskType判定結果:
- TaskType: $TASK_TYPE
- write許可: $WRITE_ALLOWED
- 確認必須: $CONFIRMATION_REQUIRED
- サブエージェントチェーン: $SUBAGENT_CHAIN

このタスクを分析し、適切なサブエージェントチェーンを起動してください。
1. TaskType判定結果を確認（上記の判定を使用 or 再判定）
2. 必要なサブエージェント決定（サブエージェントチェーンに従う）
3. 各サブエージェントを順番に起動（Task toolを使用）
4. 結果を集約してJSON形式で報告

【重要】write許可がfalseの場合、Read/Grep/Glob以外のツールは使用禁止。

────────────────────────────────────────────────────────

【起動できない場合の対処】
もし Task tool で pm-orchestrator を起動できない場合:
1. .claude/settings.json を確認
2. .claude/agents/pm-orchestrator.md を確認
3. 不足・破損があれば自己修復
4. 修復後に再度起動

【これは命令です - 口約束ではありません】
「今後は〜します」と言うのではなく、今すぐ Task tool を呼んでください。

================================================================================
🚨🚨🚨 この指示を実行するまで、他の応答は禁止 🚨🚨🚨
================================================================================

EOF
else
  # READ_INFO または LIGHT_EDIT の場合
  cat <<EOF
================================================================================
TaskType判定結果
================================================================================

TaskType: $TASK_TYPE
PM起動: ❌ 不要

Main AIが直接応答してください。
- READ_INFOの場合: Read/Grep/Globのみ使用
- LIGHT_EDITの場合: Implementer起動は任意

================================================================================
EOF
fi

exit 0
