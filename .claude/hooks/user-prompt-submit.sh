#!/bin/bash
# quality-guardian用 user-prompt-submit hook
# 別プロジェクトのログを検出して、修正ではなく分析を促す

set -e

USER_MESSAGE=$(cat)

# このプロジェクトのパス
THIS_PROJECT="/Users/masa/dev/ai/scripts"

# 検出パターン
DETECTED=0

# 1. 別プロジェクトのパス検出
if echo "$USER_MESSAGE" | grep -qE '/Users/masa/dev/[^/]+/' | grep -qvE '/Users/masa/dev/ai/scripts'; then
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

# 4. Claude Code実行ログ検出（⏺マーク）
if echo "$USER_MESSAGE" | grep -qE '⏺|Bash\(|Read\(|Edit\(|Write\('; then
  DETECTED=1
fi

# 5. Bitbucket/GitHub URL検出
if echo "$USER_MESSAGE" | grep -qE 'bitbucket\.org|github\.com.*pull/[0-9]+'; then
  DETECTED=1
fi

# 検出時の対応
if [ $DETECTED -eq 1 ]; then
  cat <<'EOF'

🚨🚨🚨 BLOCKER: 別プロジェクトのログを検出しました 🚨🚨🚨

このメッセージには、このプロジェクト（quality-guardian）以外の情報が含まれています。

【重要】
- このプロジェクトのパス: /Users/masa/dev/ai/scripts/quality-guardian/
- 別プロジェクトの問題を修正してはいけません
- AI guardianとして分析のみ行ってください

【検出されたパターン】
以下のいずれかが検出されました：
- 別プロジェクトのファイルパス
- データベース・サーバーエラー（password authentication failed等）
- Git worktree使用違反（git checkout -b等）
- Claude Code実行ログ（⏺マーク等）
- Bitbucket/GitHub URL

【正しい対応】
1. 「これは別プロジェクトのログです」と宣言
2. project-context-guardianを起動してルール違反を分析
3. quality-guardian自体を強化（ルール追加、サブエージェント改善）
4. バージョン更新とコミット

【絶対禁止】
❌ 別プロジェクトのファイルを修正
❌ 別プロジェクトのブランチを作成
❌ 別プロジェクトの問題を解決
❌ 「修正します」と反応

EOF
fi

# メッセージを標準出力に渡す（AIは処理を継続）
echo "$USER_MESSAGE"
exit 0
