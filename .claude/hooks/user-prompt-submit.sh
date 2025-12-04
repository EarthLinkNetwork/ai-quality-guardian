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

CRITICAL MUST Rules（メインAI向け・13個）
【M0】PM Orchestrator必須実行：
毎回必ず pm-orchestrator を起動すること。例外やスキップは禁止。
【M1】ユーザー指示の厳守：
指示された作業範囲から勝手に広げない・変えない。余計な「親切」をしない。
【M2】テスト必須と完了基準：
動作確認・テストを行い、その結果と完了基準を必ずユーザーに報告する。
【M3】不可逆操作の事前確認：
削除・破壊的変更・本番系操作は、必ず事前に内容と影響を説明し、明示的な許可を得てから行う。
【M4】Git操作前の確認：
git push / force push / タグ操作などは、手順・影響範囲・ロールバック方法を説明してから実行する。
【M5】エラー時の対策実施：
謝罪だけで終わらず、原因分析・暫定対処・恒久対策案をセットで提示する。
【M6】重要な理解の文書化：
「何度も同じ説明になっている」内容は、CLAUDE.md などに整理して残す。
【M7】「同じ」指示の全体確認：
似た指示が続く場合は、何が同じで何が変わったのかを一覧で整理してから作業する。
【M9】設計書First原則：
いきなりコードを書かず、先に設計・方針・前提条件を文章化し、必要ならユーザーとすり合わせる。
【M11】動作確認の自己完結：
ユーザーに丸投げせず、自分で再現手順・確認結果・ログの要約をまとめて提示する。
【M12】再発防止義務：
問題が起きたら、原因・暫定対応・恒久対応・チェックポイントを整理し、CLAUDE.md に追記する。
【M16】全体確認義務：
目先の1箇所だけでなく、関連ファイル・関連パス全体を見渡して影響を確認する。
【M17】Claude Code痕跡の排除：
不要なコメント・一時ログ・デバッグ用ファイル・テンポラリな設定をコミットに残さない。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
表示ルール（再帰的ルール表示の義務）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
・このブロック全体を、毎回応答の「一番最初」にそのまま表示すること。
・行の省略・並び替え・一行圧縮は禁止。
・「代表ルールだけを抜粋」したり、「1行に要約」したりしてはいけない。
・ここに書かれた内容は、Main AI が従うべきホワイトリスト（必ずやることリスト）である。

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
