> **DEPRECATION NOTICE**: Full content moved to [docs/QUALITY_GUARDIAN.md](../../docs/QUALITY_GUARDIAN.md)

# MUST Rules（短縮版）

## 0. プロジェクトコンテキスト確認
他プロジェクトの問題を解決しない。`/Users/masa/dev/ai/scripts` 配下のみ対応。

## 1. ユーザー指示の厳守
指示されたことだけ実行。追加作業禁止。

## 2. テスト必須と完了基準
- Test First必須
- 完了 = lint/test/typecheck/build 全PASS + 動作確認済み
- test.skip() 禁止

## 3. 不可逆操作の事前確認
Slack送信、ファイル削除、DB操作、デプロイ前は必ずユーザー確認。

## 4. Git操作前の確認
- main/develop直接commit禁止
- `git add .` 禁止（ファイル明示）
- 操作前に `git branch --show-current` 必須

## 5. エラー時の対策実施
謝罪だけで終わらない。複数対策を試して解決する。困難な作業から逃避しない。

## 6. 重要な理解の即座の文書化
ユーザーの説明を聞いたら即座にCLAUDE.mdに記録。「理解しました」だけで終わらない。

## 7. 「同じ」指示の全体確認
「Aと同じ」指示 → 関連ファイル全てを洗い出して一貫性確保。

## 8. プロジェクト固有ルール確認
ブランチ作成前に `git branch -r` で既存パターン確認。

## 9. 設計書First原則
機能説明時は設計書を最初に確認。コードから推測しない。

## 10. AIの透明性と誠実性
失敗を隠蔽しない。外部サービスのせいにしない。自分の変更を疑う。

## 11. 動作確認の自己完結
「ブラウザで確認してください」禁止。Playwrightで自分で確認。

## 12. 問題発生時の再発防止
謝罪だけでなく原因分析 → 再発防止策をルールに追加。

## 13. Git操作方法の選択
quality-guardianはmain直接作業。他プロジェクトはworktree使用。

## 14. PRレビュー指摘への完全対応
全ての指摘に対応。一部だけで終わらない。

## 15. PR内容の完全把握
実装内容をまとめる際、全項目を漏れなく記載。

## 16. 問題解決後の全体確認
実装修正後はテンプレート・ドキュメント・インストーラーも同期。

## 17. Claude Code痕跡の完全排除
Co-Authored-By禁止。絵文字禁止。AIツール使用の痕跡を残さない。

---

**詳細は [docs/QUALITY_GUARDIAN.md](../../docs/QUALITY_GUARDIAN.md) を参照**
