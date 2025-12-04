#!/bin/bash
# _pmOrchestratorManaged: true
# PM Orchestrator hook script
# Version: 1.0.21

set -e

# プロジェクトディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RULES_FILE="$PROJECT_DIR/.claude/rules/critical-must.md"

# ========================================
# CRITICAL MUST Rules（外部ファイルから読み込み）
# ========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CRITICAL MUST Rules（絶対厳守）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "$RULES_FILE" ]; then
  cat "$RULES_FILE"
else
  # フォールバック: ファイルがない場合は直接出力
  cat <<'EOF'
## MUST 3: ユーザー指示の厳守
- 指示されたことだけを実行
- 「良かれと思って」の追加作業は全て禁止

## MUST 7: 不可逆な操作の事前確認
- Slack通知、ファイル削除、DB操作、デプロイ等は必ずユーザーに確認

## MUST 9: Git操作時に意図しないファイルの混入を防ぐ
- git add . 禁止、ファイルを明示的に指定

## MUST 10: AIの透明性と誠実性
- 推測で回答しない、証拠に基づいて説明

## MUST 21: 確認指示の厳守と表示義務
- 「確認してください」等の指示があったら必ず表示

## MUST 22: 過去の合意・仕様の確認義務
- 実装前に過去の合意を確認

## MUST 24: PM Orchestrator 100% Always-On
- 全てのユーザー入力でPM Orchestratorを起動すること
EOF
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ========================================
# TaskType推定ロジック
# ========================================

# ユーザー入力を取得（JSON形式または従来形式両方に対応）
if [ $# -eq 0 ]; then
  # 引数がない場合、stdinからJSON入力を試みる
  INPUT_JSON=$(cat)
  if [ -n "$INPUT_JSON" ]; then
    # jqが利用可能ならJSON解析
    if command -v jq &> /dev/null; then
      USER_INPUT=$(echo "$INPUT_JSON" | jq -r '.prompt // empty')
    fi
    # jqがないか、解析に失敗した場合は全体を入力として扱う
    if [ -z "$USER_INPUT" ]; then
      USER_INPUT="$INPUT_JSON"
    fi
  fi
else
  # 引数がある場合は従来通り
  USER_INPUT="$*"
fi

# TaskType判定
TASK_TYPE="UNKNOWN"

# 危険操作キーワード
if echo "$USER_INPUT" | grep -iE '(force.?push|git reset --hard|削除|本番|production|rm -rf|drop table)' > /dev/null; then
  TASK_TYPE="DANGEROUS_OP"

# 設定・CI変更キーワード
elif echo "$USER_INPUT" | grep -iE '(hooks|settings|CI|GitHub Actions|\.yml|\.github|lefthook|eslint設定)' > /dev/null; then
  TASK_TYPE="CONFIG_CI_CHANGE"

# レビュー対応キーワード
elif echo "$USER_INPUT" | grep -iE '(CodeRabbit|PR指摘|レビュー対応|resolve)' > /dev/null; then
  TASK_TYPE="REVIEW_RESPONSE"

# 実装キーワード
elif echo "$USER_INPUT" | grep -iE '(実装|作成|追加|機能|リファクタ|複数ファイル|設計)' > /dev/null; then
  TASK_TYPE="IMPLEMENTATION"

# 軽微編集キーワード
elif echo "$USER_INPUT" | grep -iE '(typo|コメント追加|1箇所修正)' > /dev/null; then
  TASK_TYPE="LIGHT_EDIT"

# デフォルト（最も安全）
else
  TASK_TYPE="READ_INFO"
fi

# ========================================
# PM Orchestrator 起動トリガー
# ========================================
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PM Orchestrator 起動（必須）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【TaskType推定】
  $TASK_TYPE

Main AIへ:
  Task tool で pm-orchestrator を即座に起動せよ
  検出・確認は不要
  毎回起動する

起動方法:
  subagent_type: "pm-orchestrator"
  description: "タスク管理（TaskType: $TASK_TYPE）"
  prompt: |
    TaskType推定: $TASK_TYPE

    ユーザー入力:
    $USER_INPUT

    このタスクを分析し、以下を実行してください:
    1. TaskType判定（READ_INFO/LIGHT_EDIT/IMPLEMENTATION/REVIEW_RESPONSE/CONFIG_CI_CHANGE/DANGEROUS_OP）
    2. write許可判定
    3. 必要なサブエージェントチェーン決定
    4. サブエージェント起動または直接実行
    5. 結果をJSON形式で報告

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

exit 0
