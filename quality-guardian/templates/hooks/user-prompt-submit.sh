#!/bin/bash
# 各プロジェクト用 user-prompt-submit hook テンプレート
# このファイルを各プロジェクトの .claude/hooks/ にコピーして使用する
#
# インストール方法:
#   1. このファイルを各プロジェクトの .claude/hooks/user-prompt-submit.sh にコピー
#   2. chmod +x .claude/hooks/user-prompt-submit.sh
#   （編集不要 - プロジェクト名とパスは自動検出されます）

set -e

# 入力を読み取る（JSON形式）
INPUT=$(cat)

# JSONから prompt フィールドを抽出
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

# ============================================================================
# プロジェクト情報の自動検出
# ============================================================================

# このスクリプトのパス: .claude/hooks/user-prompt-submit.sh
# プロジェクトルート: .claude/hooks/../../
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_PATH")"

# ============================================================================
# 全CRITICAL Rulesを毎回プロンプトに再表示（再帰的ルール表示）
# ============================================================================

cat <<'EOF'

# 🔴 CRITICAL Rules（最重要・13個）- 毎回確認

【Rule 1: ユーザー指示の厳守】
指示されたことだけを実行。指示以外は一切禁止。

【Rule 2: テスト必須と完了基準】
Test First原則厳守。全テスト合格まで「完了」禁止。
詳細: `.claude/rules/must-rules.md` Rule 2

【Rule 3: 不可逆な操作の事前確認】
Slack通知・削除・Git危険操作は事前にユーザー確認必須。
詳細: `.claude/rules/must-rules.md` Rule 3

【Rule 4: Git操作前の確認義務】
git-operation-guardian サブエージェント利用
タイミング: git add/commit/push/checkout -b 等の前
詳細: `.claude/agents/git-operation-guardian.md`

【Rule 5: エラー時の対策実施と作業継続】
謝罪ではなく対策実施。困難な作業から逃避禁止。

【Rule 6: 重要な理解の即座の文書化】
「何回も言っている」→ 即座にCLAUDE.mdに記録。
トリガー: 「〜すべき」「〜してはいけない」「困っている」

【Rule 7: 「同じ」指示の全体確認】
「Aと同じ」→ 関連ファイル全て洗い出し、一貫性確保。
詳細: `.claude/rules/must-rules.md` Rule 7

【Rule 9: 設計書First原則】
設計書firstプロジェクトでは、必ず設計書を最初に確認。
詳細: `.claude/rules/must-rules.md` Rule 9

【Rule 11: 動作確認の自己完結義務】
Playwrightで自分で確認。ユーザーに依頼禁止。
詳細: `.claude/agents/memory-guardian.md` Section 1.9

【Rule 12: 問題発生時の再発防止義務】
問題発生 → 原因分析 → CLAUDE.mdにルール追加 → バージョン更新 → コミット
詳細: `.claude/agents/memory-guardian.md`

【Rule 16: 問題解決後の全体確認義務】
実装修正 → テンプレート・インストーラー・ドキュメントも同期。
`.claude/hooks/*` ⟷ `templates/hooks/*`
詳細: `.claude/rules/must-rules.md` Rule 16

【Rule 17: Claude Code痕跡の完全排除】
コミット署名禁止。絵文字禁止。ドキュメント勝手に作成禁止。
詳細: `.claude/rules/must-rules.md` Rule 17

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【再帰的ルール表示の義務】
このCRITICAL Rulesを応答の最初に毎回表示すること。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

# 元のJSON入力を標準出力に渡す（AIは処理を継続）
echo "$INPUT"
exit 0
