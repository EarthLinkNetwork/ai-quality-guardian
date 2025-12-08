#!/bin/bash
# ============================================================================
# PM Orchestrator 100% Always-On - Simplified Hook (v1.4.0)
# ============================================================================
# 
# フルテキストの表示義務は CLAUDE.md の <every_chat> セクションに委譲。
# hookは最小限のトリガーのみを出力。
#
# ============================================================================

set -e

# 入力を読み取る（JSON形式）
INPUT=$(cat)

# デバッグ: 受け取った入力をログに出力
echo "=== HOOK DEBUG $(date) ===" >> /tmp/quality-guardian-hook-debug.log
echo "$INPUT" >> /tmp/quality-guardian-hook-debug.log

# JSONから prompt フィールドを抽出
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

# このプロジェクトのパス（動的解決）
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    THIS_PROJECT="$CLAUDE_PROJECT_DIR"
else
    # フォールバック: hookスクリプトの場所から推測
    # .claude/hooks/user-prompt-submit.sh → ../../（プロジェクトルート）
    THIS_PROJECT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

# ============================================================================
# PM Orchestrator 起動トリガー（最小限）
# ============================================================================

cat <<'TRIGGER_EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 PM Orchestrator 起動トリガー 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【MANDATORY ACTION - 絶対厳守】

あなたは今から「PM Orchestrator」サブエージェントを起動しなければなりません。

【必須手順】
1. CLAUDE.md の <every_chat> セクションを逐語的に表示
2. Task tool を使用
3. subagent_type: "pm-orchestrator"
4. description: "タスク管理とサブエージェント起動"
5. prompt: ユーザー入力 + 以下のパターン検出結果

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRIGGER_EOF

# ============================================================================
# パターン検出（PMに渡すコンテキスト）
# ============================================================================

# 検出パターン初期化
DETECTED=0
CODERABBIT_RESOLVE=0
LIST_MODIFICATION=0
PR_REVIEW_RESPONSE=0
COMPLEX_IMPLEMENTATION=0
QUALITY_CHECK=0

# 1. 別プロジェクトのパス検出
if echo "$USER_MESSAGE" | grep -qE '(/[a-zA-Z0-9_/.+-]+)' && ! echo "$USER_MESSAGE" | grep -qE "$THIS_PROJECT"; then
  DETECTED=1
fi

# 2. データベース・サーバーエラー検出
if echo "$USER_MESSAGE" | grep -qE 'password authentication failed|FATAL.*password|pg_hba.conf|Connection terminated|cloudsqlsuperuser'; then
  DETECTED=1
fi

# 3. Git worktree違反検出
if echo "$USER_MESSAGE" | grep -qE 'git checkout -b|ブランチはw[or]ktreeで対応'; then
  DETECTED=1
fi

# 4. Claude Code実行ログ検出（\xE2\x8F\xBAマーク）
if echo "$USER_MESSAGE" | grep -qE '\xE2\x8F\xBA|Bash\(|Read\(|Edit\(|Write\('; then
  DETECTED=1
fi

# 5. Bitbucket/GitHub URL検出
if echo "$USER_MESSAGE" | grep -qE 'bitbucket\.org|github\.com.*pull/[0-9]+'; then
  DETECTED=1
fi

# 6. CodeRabbit Resolve Pattern Detection
if echo "$USER_MESSAGE" | grep -qiE 'coderabbit|resolve|resolved|review.*comment|PR.*comment|プルリク.*コメント'; then
  CODERABBIT_RESOLVE=1
fi

# 7. List Modification Pattern Detection
if echo "$USER_MESSAGE" | grep -qiE 'バージョン.*更新|version.*update|全.*箇所|5箇所|チェックリスト|一覧.*修正|複数.*ファイル.*更新'; then
  LIST_MODIFICATION=1
fi

# 8. PR Review Response Pattern Detection
if echo "$USER_MESSAGE" | grep -qiE 'PR.*レビュー|プルリク.*レビュー|review.*指摘|レビュー.*指摘|全.*指摘.*対応|指摘.*漏れ'; then
  PR_REVIEW_RESPONSE=1
fi

# 9. Complex Implementation Pattern Detection
if echo "$USER_MESSAGE" | grep -qiE '新機能|新しい機能|リファクタリング|複数ファイル|設計.*必要|アーキテクチャ|実装.*してください|機能.*追加'; then
  COMPLEX_IMPLEMENTATION=1
fi

# 10. Quality Check Pattern Detection
if echo "$USER_MESSAGE" | grep -qiE '品質チェック|quality.*check|lint.*test|全.*チェック|検証.*実行|テスト.*実行|ビルド.*確認'; then
  QUALITY_CHECK=1
fi

# パターン検出結果を表示
cat <<PATTERN_EOF

【パターン検出結果】（PMに渡すコンテキスト）
- 別プロジェクト検出: $DETECTED
- CodeRabbit Resolve: $CODERABBIT_RESOLVE
- List Modification: $LIST_MODIFICATION
- PR Review Response: $PR_REVIEW_RESPONSE
- Complex Implementation: $COMPLEX_IMPLEMENTATION
- Quality Check: $QUALITY_CHECK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PATTERN_EOF

# 別プロジェクト検出時の警告
if [ $DETECTED -eq 1 ]; then
  PROJECT_PATH=$(echo "$USER_MESSAGE" | grep -oE '/[a-zA-Z0-9_/.+-]+' | grep -vE "^$THIS_PROJECT" | head -1 | sed 's:/$::')

  cat <<EOF

🚨 別プロジェクト検出 🚨

このメッセージには、このプロジェクト（scripts）以外の情報が含まれています。

【重要】
- このプロジェクトのパス: $THIS_PROJECT
- 別プロジェクトの問題を修正してはいけません
- PM Orchestratorに分析を委譲してください

EOF

  if [ -n "$PROJECT_PATH" ]; then
    cat <<EOF
【作業開始前に必ず実行】
1. Read ${PROJECT_PATH}/.claude/CLAUDE.md
2. プロジェクト固有のルール・制約を確認
3. 確認完了を応答で明示
4. 確認完了後に作業開始

EOF
  fi

  cat <<'EOF'
【絶対禁止】
❌ 別プロジェクトのファイルを修正
❌ 別プロジェクトのブランチを作成
❌ 別プロジェクトの問題を解決
❌ CLAUDE.md確認なしで作業開始

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

# パターン別の具体的指示
if [ $CODERABBIT_RESOLVE -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: CodeRabbit Resolve
修正完了後、gh api graphql でコメントをResolveする。説明不要。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

if [ $LIST_MODIFICATION -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: List Modification
全箇所を先にカウント、一気に全て完了、途中で停止禁止。

詳細: .claude/agents/pr-review-response-guardian.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

if [ $PR_REVIEW_RESPONSE -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: PR Review Response
全指摘をTodoListにして、全て対応完了まで継続。

詳細: .claude/agents/pr-review-response-guardian.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

exit 0
