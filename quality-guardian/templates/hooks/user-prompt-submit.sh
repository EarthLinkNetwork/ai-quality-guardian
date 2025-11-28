#!/usr/bin/env bash
set -euo pipefail

# PM Orchestrator 100% Always-On Hook (v1.3.91)
# 全てのユーザー入力に対してPM Orchestratorを起動する

INPUT=$(cat)
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

cat <<'EOF'
================================================================================
PM ORCHESTRATOR - MANDATORY LAUNCH
================================================================================

Main AI: 今すぐ Task tool で pm-orchestrator を起動せよ。

【禁止事項】
- 自分で応答を作成すること
- PM Orchestratorを起動せずに回答すること
- 「今後は起動します」と言うこと

【必須アクション】
EOF

cat <<EOF

Task tool を使用:
  subagent_type: "pm-orchestrator"
  description: "タスク分析と実行"
  prompt: |
    ユーザー入力:
    $USER_MESSAGE

    このタスクを分析し、以下を実行してください:
    1. TaskType判定（READ_INFO/LIGHT_EDIT/IMPLEMENTATION/REVIEW_RESPONSE/CONFIG_CI_CHANGE/DANGEROUS_OP）
    2. write許可判定
    3. 必要なサブエージェントチェーン決定
    4. サブエージェント起動または直接実行
    5. 結果をJSON形式で報告

================================================================================
EOF

exit 0
