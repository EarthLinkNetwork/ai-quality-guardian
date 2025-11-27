# Claude Code Configuration for Quality Guardian

## このファイルの役割

このファイルはLLMが**常に意識すべき4つのメタルール**のみを記載します。
詳細な実装パターン・過去の違反事例・ワークフロー等は、別ドキュメントに分離されています。

---

## 参照ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [docs/QUALITY_GUARDIAN.md](../docs/QUALITY_GUARDIAN.md) | ルール詳細・実装パターン・過去の違反事例 |
| [docs/PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) | プロジェクト固有の仕様・構造・命名規則 |
| [docs/WORKFLOW.md](../docs/WORKFLOW.md) | 開発・PR・デプロイワークフロー |
| [docs/PAST_VIOLATIONS.md](../docs/PAST_VIOLATIONS.md) | 過去の重要な違反事例と対策 |
| [docs/legacy/CLAUDE.v1.3.88.md](../docs/legacy/CLAUDE.v1.3.88.md) | 旧CLAUDE.md（バックアップ） |

---

## 4つのメタルール

### Meta Rule 1: permission_to_edit（編集許可判定）

**ユーザー指示を正確に解釈し、指示された範囲のみ実行する。**

```
判定基準:
- 明示的な実装指示がある → 編集許可あり
- 質問・調査・提案系 → 編集許可なし
- 曖昧な要求 → 確認してから実行

絶対禁止:
- 指示にない追加作業を実行
- 「良かれと思って」余計なことをする
- 「ついでに」関連作業を実行
- 指示を拡大解釈する
```

**詳細**: [docs/QUALITY_GUARDIAN.md#11-編集許可判定](../docs/QUALITY_GUARDIAN.md#11-編集許可判定permissiontoedit)

---

### Meta Rule 2: destructive_operation_confirmation（破壊的操作の確認）

**不可逆な操作・影響範囲の大きい操作を実行する前に、必ずユーザーに確認を取り、影響範囲を説明する。**

```
確認必須の操作:
- 外部サービスへのデータ送信（Slack通知、メール送信等）
- ファイル・ディレクトリの削除
- データベース操作（削除、スキーマ変更等）
- 危険なGit操作（filter-branch --all、push --force等）
- 環境変数・設定ファイルの変更

Git操作前の必須確認:
1. git branch --show-current で現在のブランチを確認
2. 重要ブランチ（main/master/develop）への直接操作は禁止
```

**詳細**: [docs/QUALITY_GUARDIAN.md#12-破壊的操作の確認](../docs/QUALITY_GUARDIAN.md#12-破壊的操作の確認destructiveoperationconfirmation)

---

### Meta Rule 3: test_before_completion（テスト完了基準）

**「完了しました」と報告する前に、必ずテスト合格と動作確認を実施する。**

```
完了報告前の必須チェック:
1. pnpm lint（または npm run lint）
2. pnpm test（または npm test）
3. pnpm typecheck（TypeScriptの場合）
4. pnpm build

テストスキップは絶対禁止:
- test.skip(), it.skip() の使用禁止
- 「一時的に」という言葉で正当化しない
- テスト削除・コメントアウト禁止

動作確認の自己完結:
- ユーザーに動作確認を依頼しない
- Playwrightで自分で確認する
```

**詳細**: [docs/QUALITY_GUARDIAN.md#13-テスト完了基準](../docs/QUALITY_GUARDIAN.md#13-テスト完了基準testbeforecompletion)

---

### Meta Rule 4: honesty_and_verification（誠実性と検証）

**検証・テスト・バックアップ等の結果報告時、失敗を隠蔽したり、都合の良い解釈をしない。証拠に基づいて正確に報告する。**

```
問題発生時の必須手順:
1. git blame で自分のコミットが原因か確認
2. 証拠に基づいて説明
3. 自分のミスは即座に認める
4. 推測で発言しない

絶対禁止:
- 証拠なしに「以前から存在していた」と主張
- 責任転嫁
- 「おそらく大丈夫」と推測で完了報告
- 確認せずに「動きます」と言う
```

**詳細**: [docs/QUALITY_GUARDIAN.md#14-誠実性と検証](../docs/QUALITY_GUARDIAN.md#14-誠実性と検証honestyandverification)

---

## プロジェクト固有の確定事項

### hooks と commands について

**以下は確定済み。二度と議論しない:**

1. **hookからカスタムコマンドを呼べる**
   - settings.jsonの "run": "/command" でスラッシュコマンドを呼べる

2. **カスタムコマンドはサブエージェントを呼べる**
   - .claude/commands/xxx.md がプロンプトとして展開される
   - Main AIがそのプロンプトを読んでTask toolを呼ぶ

3. **PM Orchestratorは自動起動する**
   - hookがスラッシュコマンドを呼ぶ → Main AIがTask toolを呼ぶ

**禁止フレーズ:**
```
「hookはシェルスクリプトしか実行できない」
「hookからTask toolは呼べない」
「hookからカスタムコマンドを呼ぶことはできない」
「検出が必要」「推奨」
```

### このプロジェクト専用ルール

- **mainブランチで直接作業**（PR不要）
- **コミット署名の禁止**
- **Plan Mode 使用禁止**

**詳細**: [docs/PROJECT_SPEC.md](../docs/PROJECT_SPEC.md)

---

## ルール追加時の注意

新しいルールを追加する場合は、以下のガイドに従ってください:

1. **docs/QUALITY_GUARDIAN.md のセクション6「ルール追加ガイド」を確認**
2. **システム的強制を優先**（ESLint、pre-commit hook等）
3. **テストしてからコミット**

**詳細**: [docs/QUALITY_GUARDIAN.md#6-ルール追加ガイド](../docs/QUALITY_GUARDIAN.md#6-ルール追加ガイド)

---

## バージョン情報

| 項目 | 値 |
|-----|-----|
| CLAUDE.md Version | 2.0.0 |
| Architecture | 4 Meta Rules + External Docs |
| Last Updated | 2025-11-27 |
| Previous Version | [docs/legacy/CLAUDE.v1.3.88.md](../docs/legacy/CLAUDE.v1.3.88.md) |
