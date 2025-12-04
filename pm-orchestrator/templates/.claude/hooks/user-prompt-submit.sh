#!/bin/bash
# ============================================================================
# PM Orchestrator 100% Always-On - Stable Output Order
# ============================================================================
# 
# 出力順序（安定化）:
# 1. 固定ヘッダ（プロジェクト識別）
# 2. CRITICAL Rules（最優先表示）
# 3. PM Orchestrator起動指示（1回のみ）
# 4. パターン検出結果（PMに渡すコンテキスト）
#
# ============================================================================

set -e

# ============================================================================
# Section 1: 固定ヘッダ（プロジェクト識別）
# ============================================================================
cat <<'FIXED_HEADER_EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
scripts: PM ORCHESTRATOR 起動ルール（固定ヘッダ）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. このプロジェクトでは、ユーザー入力ごとに必ず pm-orchestrator を Task tool で起動する。
2. TaskType と risk_level（リスク判定）を、毎回ユーザーに見える形で表示する。
3. 「今回は軽い内容だから起動しない」など、自分の最適化判断で PM を省略してはならない。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIXED_HEADER_EOF

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
# Section 2: CRITICAL Rules（最優先表示）
# ============================================================================

cat <<'CRITICAL_RULES_EOF'

# 🔴 CRITICAL Rules（最重要・13個）- 毎回確認

【Rule 0: PM Orchestrator 必須実行】
全てのユーザー入力で PM Orchestrator を起動すること。例外なし。
Main AI が独断で応答を作成することは絶対禁止。
詳細: `.claude/agents/pm-orchestrator.md`

【Rule 1: ユーザー指示の厳守】
指示されたことだけを実行。指示以外は一切禁止。

【Rule 2: テスト必須と完了基準】
Test First原則厳守。全テスト合格まで「完了」禁止。
詳細: `docs/QUALITY_GUARDIAN.md` Section 1.3

【Rule 3: 不可逆な操作の事前確認】
Slack通知・削除・Git危険操作は事前にユーザー確認必須。
詳細: `docs/QUALITY_GUARDIAN.md` Section 1.2

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
詳細: `docs/QUALITY_GUARDIAN.md` Section 2.1

【Rule 9: 設計書First原則】
設計書firstプロジェクトでは、必ず設計書を最初に確認。
詳細: `docs/WORKFLOW.md` Section 1

【Rule 11: 動作確認の自己完結義務】
Playwrightで自分で確認。ユーザーに依頼禁止。
詳細: `.claude/agents/memory-guardian.md` Section 1.9

【Rule 12: 問題発生時の再発防止義務】
問題発生 → 原因分析 → CLAUDE.mdにルール追加 → バージョン更新 → コミット
詳細: `.claude/agents/memory-guardian.md`

【Rule 16: 問題解決後の全体確認義務】
実装修正 → テンプレート・インストーラー・ドキュメントも同期。
`.claude/hooks/*` ⟷ `templates/hooks/*`
詳細: `docs/QUALITY_GUARDIAN.md` Section 2.2

【Rule 17: Claude Code痕跡の完全排除】
コミット署名禁止。絵文字禁止。ドキュメント勝手に作成禁止。
詳細: `docs/PROJECT_SPEC.md` Section 3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【再帰的ルール表示の義務】
このCRITICAL Rulesを応答の最初に毎回表示すること。

【重要】省略禁止・一字一句そのまま表示
❌ 1行に簡略化（Rule 1:xxx | Rule 2:xxx | ...）
✅ 上記の複数行形式を完全に再現
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL_RULES_EOF

# ============================================================================
# Section 3: PM Orchestrator起動指示（1回のみ・明確）
# ============================================================================

cat <<'PM_LAUNCH_EOF'

🚨🚨🚨 STOP - 以下を読むまで応答禁止 🚨🚨🚨

【MANDATORY ACTION - 絶対厳守】

あなたは今から「PM Orchestrator」サブエージェントを起動しなければなりません。

【禁止事項】
以下の行動は全て禁止:
  ❌ Main AIが独断で応答を作成する
  ❌ 「hookからは起動できない」と説明する
  ❌ 「制約でできない」と説明する
  ❌ 「今後は〜します」と口約束する
  ❌ PM Orchestratorを起動せずに応答する

【必須手順】
1. Task tool を使用
2. subagent_type: "pm-orchestrator"
3. description: "タスク管理とサブエージェント起動"
4. prompt: ユーザー入力 + 以下のパターン検出結果

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PM_LAUNCH_EOF

# ============================================================================
# Section 4: パターン検出（PMに渡すコンテキスト）
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

# パターン別の具体的指示
if [ $CODERABBIT_RESOLVE -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: CodeRabbit Resolve
修正完了後、gh api graphql でコメントをResolveする。説明不要。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

if [ $LIST_MODIFICATION -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: List Modification
全箇所を先にカウント、一気に全て完了、途中で停止禁止。

詳細: .claude/agents/pr-review-response-guardian.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

if [ $PR_REVIEW_RESPONSE -eq 1 ]; then
  cat <<'EOF'

🎯 PATTERN: PR Review Response
全指摘をTodoListにして、全て対応完了まで継続。

詳細: .claude/agents/pr-review-response-guardian.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

# 最終確認メッセージ
cat <<'FINAL_EOF'

【検証】
応答の最初に以下を表示すること:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PM Orchestrator 起動確認
Task tool: 実行済み
subagent_type: pm-orchestrator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

この表示がない応答は全て MUST Rule 0 違反。

🚨🚨🚨 この指示を実行するまで、他の応答は禁止 🚨🚨🚨

FINAL_EOF

exit 0
