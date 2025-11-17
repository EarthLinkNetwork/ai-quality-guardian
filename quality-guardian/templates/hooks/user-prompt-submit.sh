#!/bin/bash
# 各プロジェクト用 user-prompt-submit hook テンプレート
# このファイルを各プロジェクトの .claude/hooks/ にコピーして使用する
#
# インストール方法:
#   1. このファイルを各プロジェクトの .claude/hooks/user-prompt-submit.sh にコピー
#   2. chmod +x .claude/hooks/user-prompt-submit.sh
#   （編集不要 - プロジェクト名とパスは自動検出されます）

set -e

USER_MESSAGE=$(cat)

# ============================================================================
# プロジェクト情報の自動検出
# ============================================================================

# このスクリプトのパス: .claude/hooks/user-prompt-submit.sh
# プロジェクトルート: .claude/hooks/../../
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_PATH")"

# ============================================================================
# CLAUDE.md確認の強制
# ============================================================================

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 このプロジェクトで作業を開始します
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

プロジェクト名: ${PROJECT_NAME}
プロジェクトパス: ${PROJECT_PATH}

【必須】作業開始前に以下を実行してください：

1. CLAUDE.mdを読む
   Read("${PROJECT_PATH}/.claude/CLAUDE.md")

2. MUST Rulesを確認
   特に以下を確認：
   - 🚨 Git Worktree Usage (MUST Rule)
   - 🚨 Branch Naming Convention
   - 🚨 Database Authentication
   - 🚨 API Configuration
   - その他のプロジェクト固有ルール

3. 過去に教えられた手順を確認
   - 「昨日教えた」「何回も言っている」と言われないために
   - memory-guardianのトリガーフレーズを意識

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【重要な確認事項】

□ CLAUDE.mdを読みましたか？
□ Git Worktree使用ルールを確認しましたか？
□ ブランチ命名規則を確認しましたか？
□ データベース認証情報を確認しましたか？
□ 過去の教えられた手順を確認しましたか？

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

# メッセージを標準出力に渡す（AIは処理を継続）
echo "$USER_MESSAGE"
exit 0
