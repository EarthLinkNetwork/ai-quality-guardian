# Quality Guardian 詳細ドキュメント

このドキュメントは、Quality Guardianのルール詳細・実装パターン・過去の違反事例を記載します。
CLAUDE.mdの4メタルールを具体化した詳細仕様です。

---

## 1. ルール詳細

### 1.1 編集許可判定（permission_to_edit）

**概要**: ユーザー指示を正確に解釈し、指示された範囲のみ実行する。

#### 判定基準

**編集許可あり（permission_to_edit: true）の場合:**
- 「実装してください」「追加してください」「修正してください」等の明示的な実装指示
- 「はい、お願いします」「OK、進めてください」等の明示的な承認
- 「このファイルの〜を〜に変えて」等の具体的なコード変更要求

**編集許可なし（permission_to_edit: false）の場合:**
- 「〜とは何ですか？」「〜はどこにありますか？」等の質問・調査系
- 「〜について提案してください」「どうすればいいですか？」等の提案・計画系
- 「コードをレビューしてください」「分析してください」等のレビュー・分析系
- 意図が不明確、複数の解釈が可能な曖昧な要求

#### 厳守事項

```
# 絶対禁止
- 指示にない追加作業を実行
- 「良かれと思って」余計なことをする
- 「ついでに」関連作業を実行
- 指示を拡大解釈する
- 勝手に機能を追加する
- 勝手にコメントを追加する
- 勝手にドキュメントを作成する
- 勝手に最適化する
- 勝手にリファクタリングする

# 必ず実行
- 指示されたことだけを実行
- 指示の範囲が不明な場合は確認
- 追加作業が必要な場合は提案して承認を得る
- 指示通りに実装（過不足なく）
```

#### 過去の違反例

**違反例1: PR approve時に勝手にコメント追加**
```
ユーザー指示: 「一旦このPR以外のモノをapprovedにできますか?」

[誤った実行]
gh pr review 1000 --approve --body "LGTM. sharedディレクトリのテスト整備と..."

問題点: ユーザーは「approveするだけ」を指示、--body オプションは指示に含まれていない

[正しい実行]
gh pr review 1000 --approve
```

**違反例2: ファイル追加時に勝手にテストを追加**
```
ユーザー指示: 「RepeatBlock.test.tsxを追加」

[誤った実行]
RepeatBlock.test.tsx を追加
RepeatBlock.stories.tsx も追加（指示にない）
README.md にドキュメント追加（指示にない）

[正しい実行]
RepeatBlock.test.tsx のみ追加
他のファイルが必要なら「Storybookファイルも追加しますか？」と確認
```

---

### 1.2 破壊的操作の確認（destructive_operation_confirmation）

**概要**: 不可逆な操作・影響範囲の大きい操作を実行する前に、必ずユーザーに確認を取り、影響範囲を説明する。

#### 不可逆な操作の例

- **外部サービスへのデータ送信**: Slack通知、メール送信、Webhook呼び出し、API呼び出し等
- **ファイル・ディレクトリの削除**: 重要なファイル、設定ファイル、データファイル等
- **データベース操作**: レコード削除、テーブル削除、スキーマ変更等
- **デプロイ・リリース操作**: 本番環境へのデプロイ、リリース作成、パッケージ公開等
- **危険なGit操作**: git filter-branch --all、git push --force、git reset --hard、git rebase、git amend、タグ削除等
- **クラウドリソースの削除**: AWS、GCP、Azure等のリソース削除
- **課金が発生する操作**: 有料APIの呼び出し、クラウドリソースの作成等

#### 影響範囲の大きい操作の例

- **環境変数の変更**: .env、.env.local、.env.production等のファイル変更
- **データベース接続先の変更**: DATABASE_URL等の接続文字列変更
- **API接続先の変更**: API_ENDPOINT、NEXT_PUBLIC_API_URL等の変更
- **認証設定の変更**: AUTH_SECRET、JWT_SECRET、OAuth設定等の変更
- **インフラ設定の変更**: Docker設定、docker-compose.yml、Kubernetes設定等
- **CI/CD設定の変更**: GitHub Actions、Jenkins、CircleCI等のワークフロー変更
- **スキーマファイルの変更**: Prisma schema、GraphQL schema等のデータベーススキーマ変更

#### Git操作時の確認義務

**絶対禁止のGit操作（明示的な指示がない限り）:**
```
git filter-branch --all
git filter-branch（ブランチ指定なし）
git push --force origin main
git push --force origin develop
git reset --hard HEAD~N（コミット削除）
git rebase -i（インタラクティブrebase）
git commit --amend（他人のコミットの場合）
```

**Git操作前の必須確認:**
1. 現在のブランチを確認: `git branch --show-current`
2. 重要ブランチ（main/master/develop）ではないことを確認
3. 重要ブランチへの直接操作は絶対禁止

#### 過去の問題例

**問題例: Slack通知の無断送信**
```
ユーザー: 「Slack通知してほしい」
AI: 確認なしに本番チャンネルへテスト通知を送信
結果: 送信後に削除できないことが判明

本来すべきだったこと:
1. 「Slack通知機能をGitHub Actionsに追加」なのか「今すぐテスト通知送信」なのか確認
2. 手動送信の場合、削除できないことを事前に警告
3. 影響範囲（誰に届くか）を説明
4. ユーザーの明示的な承認を得てから実行
```

---

### 1.3 テスト完了基準（test_before_completion）

**概要**: 「完了しました」と報告する前に、必ずテスト合格と動作確認を実施する。

#### テストスキップの絶対禁止

```
# 絶対禁止のパターン
- 「E2Eテストを一時的にスキップ」
- test.skip(), it.skip(), xit(), xdescribe()の使用
- test.only(), it.only()の使用（デバッグ時を除く）
- 「エラーが出ているけど、そのままで」
- 「後で直します」
- テストの条件を緩める（例: timeout延長、expect削除）
- テストそのものを削除
- テストコメントアウト
```

#### 完了報告前の必須チェック

```bash
# 修正後は必ず全て実行
pnpm lint        # Lint
pnpm test        # テスト
pnpm typecheck   # 型チェック（TypeScriptの場合）
pnpm build       # ビルド

# 全て通過してから「完了しました」と報告
```

#### Test First原則

```
1. テストを先に書く（実装前）
2. テストが失敗することを確認（Red）
3. 最小限の実装（Green）
4. リファクタリング（Refactor）
5. すべてのテストが通ることを確認
```

#### 動作確認の自己完結義務

**実装完了後、動作確認をユーザーに依頼しない。Playwrightで自分で確認する。**

```typescript
// Playwrightで確認すべき内容
// 1. 画面の表示
await page.goto('http://example.com');
await page.screenshot({ path: 'screenshot.png' });

// 2. console.log の確認
page.on('console', msg => console.log('PAGE LOG:', msg.text()));

// 3. エラーメッセージの確認
page.on('pageerror', error => console.log('PAGE ERROR:', error));

// 4. Network リクエストの確認
page.on('request', request => console.log('REQUEST:', request.url()));
page.on('response', response => console.log('RESPONSE:', response.url(), response.status()));
```

---

### 1.4 誠実性と検証（honesty_and_verification）

**概要**: 検証・テスト・バックアップ等の結果報告時、失敗を隠蔽したり、都合の良い解釈をしない。証拠に基づいて正確に報告する。

#### 厳守事項

```
# 問題発生時の必須手順
1. まず自分のコミット履歴を確認
   git log --oneline -20
   git log --oneline -- path/to/problematic/file
   git blame path/to/problematic/file

2. 証拠に基づいて説明
   - 「以前から存在していた」と言う前に、git blameで確認
   - 自分のコミットが原因なら、即座に認める
   - 推測で発言しない

3. 責任転嫁の禁止
   - 「誰かが追加した」と言わない
   - 「以前からあった」と嘘をつかない
   - 自分のミスは自分のミスとして認める
```

#### 禁止事項

```
# 絶対禁止
- 証拠なしに「以前から存在していた」と主張
- git blameを確認せずに「誰かが追加した」と主張
- 自分のコミットが原因なのに責任転嫁
- 推測で「おそらく〜」と発言（事実確認してから発言）
- 都合の悪い事実を隠す
- 「気づかなかった」を言い訳にする
- 「本質的な変更とは関係ない」と証拠なしに主張
- 「直接的な原因ではない」と確認せずに主張
- 「おそらく不安定なテスト」と推測で発言
- developで成功しているのに「既存の問題」と主張
```

#### 過去の問題例

**問題: GitHubワークフローに構文エラーを作り込んだ**
```
AI: 「このエラーは以前から存在していました」（確認せずに推測）
ユーザー: 「このプロジェクトはあなた以外が作業していない」

本来すべきだったこと:
1. 問題発生時に即座に git blame .github/workflows/ci.yml で確認
2. 自分のコミットが原因だとわかったら、即座に認める
3. 推測で「以前から〜」と言わない
4. 事実確認してから説明する
```

---

## 2. バージョン管理

### 2.1 バージョンアップ必須箇所

以下の5箇所すべてでバージョンを更新する:

1. `quality-guardian/VERSION`
2. `quality-guardian/install.sh` 内の `# version: "x.x.x"`
3. `quality-guardian/install.sh` 内の `CURRENT_VERSION="x.x.x"`
4. `quality-guardian/quality-guardian.js` 内の `version: 'x.x.x'`
5. `quality-guardian/package.json` 内の `"version": "x.x.x"`

### 2.2 変更前の確認フロー

```bash
# 1. README.mdを読んで現在の仕様を確認
cat quality-guardian/README.md

# 2. 現在のバージョンを確認
cat quality-guardian/VERSION

# 3. 変更実施

# 4. バージョン更新（5箇所すべて）

# 5. README更新
```

### 2.3 禁止事項

- README.md を読まずにコード変更
- バージョンアップせずにコード変更
- ユーザーへの確認なしでの破壊的変更
- バックアップなしでの重要な変更

---

## 3. コーディング規約

### 3.1 ロギング規約

**console.logではなくloggerを使う**

```typescript
// 誤り
console.log('User created:', user);

// 正しい
logger.info('User created:', { user });
```

**loggerがない場合:**
- pinoの導入を提案
- loggerutilの実装を提案

### 3.2 変数宣言規約

**letではなくconstを使う**

```typescript
// 正しい
const user = await getUser(id);
const items = [];

// 誤り（再代入しないのにlet）
let user = await getUser(id);
let items = [];
```

**letは再代入が必要な場合のみ:**
```typescript
// letが正当な場合
let count = 0;
for (const item of items) {
  count++;  // 再代入が必要
}
```

### 3.3 ESLint設定規約

**必須ESLintルール:**

```json
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-param-reassign": ["warn", { "props": true }]
  }
}
```

---

## 4. 機能削除・移行時のチェックリスト

### 削除前の必須確認（すべて完了するまで削除禁止）

- [ ] 削除する機能の全コードを Read ツールで確認した
- [ ] その機能を使っている箇所を Grep ツールで全検索した
- [ ] 移行先を明確に決定した（どのファイルのどの場所か）
- [ ] ユーザーに削除理由と移行先を説明し、承認を得た
- [ ] TodoWrite ツールで「機能削除」タスクを作成し、進捗を追跡している

### 移行時の必須確認（すべて完了するまでコミット禁止）

- [ ] 移行前の機能リストを作成した（箇条書きで）
- [ ] 移行後の機能リストを作成した（箇条書きで）
- [ ] 両方を比較して、漏れがないことを確認した
- [ ] 移行先で実際に動作することをテストした
- [ ] 移行完了をユーザーに報告した（機能リストを添えて）

### コミット前の最終確認（すべて完了するまでコミット禁止）

- [ ] git diff で削除したコードを全て確認した
- [ ] 削除された各機能が移行先に存在することを確認した
- [ ] コミットメッセージに「削除」ではなく「移行」と書いた
- [ ] バージョンを更新した（5箇所）
- [ ] README.md に変更内容を記載した

---

## 5. Breaking Change時のデータ移行

### Migrationスクリプトの例

```typescript
// app起動時に自動実行
export async function migrateConfigToSettings() {
  const oldConfigPath = '~/.app/config.json'
  const newSettingsPath = '~/.app/settings.json'

  // 1. 旧形式の存在確認
  if (!await exists(oldConfigPath)) {
    return // Migration不要
  }

  console.log('Migrating config.json → settings.json')

  try {
    // 2. バックアップ作成
    await backup(oldConfigPath, `${oldConfigPath}.backup`)

    // 3. 旧形式を読み込み
    const oldConfig = await readJSON(oldConfigPath)

    // 4. 新形式に変換
    const newSettings = convertToNewFormat(oldConfig)

    // 5. 新形式で保存
    await writeJSON(newSettingsPath, newSettings)

    // 6. 旧ファイルをアーカイブに移動
    await move(oldConfigPath, '~/.app/archive/config.json')

    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    // ロールバック
    await restore(oldConfigPath, `${oldConfigPath}.backup`)
    throw error
  }
}
```

---

## 6. ルール追加ガイド

### 6.1 ルール追加の基本方針

#### カテゴリ分類

ルールを追加・変更する前に、必ず以下の3カテゴリのどれに該当するかを決めてください。

| カテゴリ | 内容 | 実装場所 |
|---------|------|---------|
| **A: LLMの振る舞い（メタルール）** | AIが判断すべき行動原則 | `.claude/CLAUDE.md`（参照のみ）+ `docs/QUALITY_GUARDIAN.md`（詳細） |
| **B: ツールで強制する技術ルール** | 機械的にチェック可能なルール | `quality-guardian/` スクリプト、ESLint設定、CI/CD |
| **C: プロジェクト固有の仕様・プロセス** | このプロジェクト特有の規約 | `docs/PROJECT_SPEC.md`、`docs/WORKFLOW.md`、`docs/PAST_VIOLATIONS.md` |

#### 一次ソースの原則

- **すべてのルールは `docs/QUALITY_GUARDIAN.md` に登録する**（一次ソース）
- `.claude/CLAUDE.md` には「4メタルール＋参照リンク」以外のルールを書かない
- `.claude/rules/*.md` は deprecated であり、新規ルールは絶対に追加しない

#### システム的強制を優先

「気をつけます」系のルールは効果がありません。可能な限りシステム的に強制してください。

```
優先度:
1. ESLintルール（最優先）- コード品質の自動チェック
2. pre-commit hook - コミット前の自動検証
3. CI/CD - プッシュ後の自動検証
4. 自動チェックスクリプト - quality-guardianモジュール
5. ドキュメントルール（最後の手段）- AIの判断に依存
```

---

### 6.2 新しいルール追加の手順（チェックリスト）

新しいルールを追加するときは、以下の手順を順番に実行してください。

#### Step 1: ルールの目的と背景を明確にする

- [ ] **問題の具体例を特定した**
  - 何が起きたのか？
  - なぜ問題なのか？
  - 誰が困るのか？

- [ ] **既存ルールで対応できないか確認した**
  - 既存ルールの改訂で対応できる場合、新規追加は不要
  - `docs/QUALITY_GUARDIAN.md` のセクション8「旧MUST Rules対応表」を確認

#### Step 2: カテゴリを決定する

- [ ] **A/B/C のどのカテゴリか決定した**
  - A: LLMの振る舞い → `docs/QUALITY_GUARDIAN.md` のメタルール説明
  - B: ツールで強制 → `quality-guardian/` または ESLint/CI
  - C: プロジェクト固有 → `docs/PROJECT_SPEC.md` / `docs/WORKFLOW.md`

- [ ] **システム的強制が可能か検討した**
  - ESLintルールで検出できるか？
  - pre-commit hookで防げるか？
  - CIで自動チェックできるか？

#### Step 3: docs/QUALITY_GUARDIAN.md にルールを登録する

- [ ] **対応するセクションにルールを追加した**

追加時の記載フォーマット:
```markdown
### X.X ルール名（rule_name）

**概要**: 1〜2行でルールの目的を説明

#### 判定基準（または厳守事項）
- 具体的な条件や手順

#### 過去の違反例（該当する場合）
問題内容と正しい対応を記載
```

- [ ] **Rule IDを採番した**（既存の番号体系に合わせる）
- [ ] **カテゴリを明記した**（A/B/C）
- [ ] **概要を1〜2行で書いた**
- [ ] **実装・参照先を記載した**（後から更新可）

#### Step 4: カテゴリごとの実装場所を更新する

**カテゴリA（LLMの振る舞い）の場合:**
- [ ] 必要に応じて `.claude/CLAUDE.md` の説明にリンクを追加
- [ ] 細則は `docs/QUALITY_GUARDIAN.md` に置き、CLAUDE.mdは参照のみにする
- [ ] CLAUDE.mdの4メタルール構造を維持する（詳細を直接書かない）

**カテゴリB（ツールで強制）の場合:**
- [ ] `quality-guardian/` のスクリプトを更新
- [ ] または ESLint設定（`.eslintrc.json`）を更新
- [ ] または pre-commit hook（`templates/hooks/pre-commit`）を更新
- [ ] 「機械的にチェックできる状態」になっていることを確認

**カテゴリC（プロジェクト固有）の場合:**
- [ ] `docs/PROJECT_SPEC.md` の該当セクションを更新
- [ ] または `docs/WORKFLOW.md` の該当セクションを更新
- [ ] または `docs/PAST_VIOLATIONS.md` に事例を追加

#### Step 5: テストと検証

- [ ] **関連する quality-guardian コマンドを実行した**
  ```bash
  bash -n quality-guardian/install.sh
  bash -n quality-guardian/templates/hooks/user-prompt-submit.sh
  ```

- [ ] **lint/test/typecheck/build を実行した**
  ```bash
  npm run lint
  npm run test
  npm run typecheck
  npm run build
  ```

- [ ] **過去の失敗パターンで新ルールが防げることを確認した**
  - 失敗パターンを再現
  - 新ルール/新チェックで検出されることを確認

#### Step 6: 整合性の確認

- [ ] **CLAUDE.md と docs/QUALITY_GUARDIAN.md の内容が矛盾していないか確認した**
- [ ] **docs/QUALITY_GUARDIAN.md のセクション8「旧MUST Rules対応表」を更新した**（必要な場合）
- [ ] **.claude/rules/*.md を更新する必要がないことを確認した**（deprecatedのため）

#### Step 7: コミットとドキュメント

- [ ] **コミットメッセージにルール追加の背景を明記した**
  ```
  feat: Add rule for X to prevent Y

  Background:
  - Problem: [問題の説明]
  - Solution: [ルールの説明]
  - Category: [A/B/C]
  - Implementation: [実装場所]
  ```

- [ ] **バージョンを更新した**（5箇所）
- [ ] **README.md に変更内容を記載した**（重要な変更の場合）

---

### 6.3 AIがこのガイドを使うときの注意点

#### 一次ソースの遵守

- **新しいルールを追加するときは、まず `docs/QUALITY_GUARDIAN.md` に登録する**
- `.claude/CLAUDE.md` に細かいルールを直接書き足さない
- 4メタルール＋参照リンクの構造を維持する

#### 既存ルールとの整合性

- **意味が被る場合は「新しいRuleを増やす」のではなく「既存Ruleの改訂」として扱う**
- セクション8「旧MUST Rules対応表」で既存ルールとの対応を確認
- 重複するルールを作らない

#### 曖昧な点の確認

- **曖昧な点がある場合、ユーザーに確認してからルールを確定させる**
- カテゴリが不明な場合は確認
- 実装場所が不明な場合は確認
- 既存ルールとの関係が不明な場合は確認

#### deprecated ファイルの扱い

- `.claude/rules/*.md` は deprecated
- 新規ルールは絶対に `.claude/rules/` には追加しない
- 必要であれば deprecation notice のみ更新

---

### 6.4 ルール追加の要約チェックリスト

最終確認用の簡易チェックリスト:

- [ ] 問題の背景を明確にした
- [ ] A/B/C のカテゴリを決定した
- [ ] システム的強制を検討した
- [ ] `docs/QUALITY_GUARDIAN.md` に登録した（一次ソース）
- [ ] カテゴリに応じた実装場所を更新した
- [ ] テストで防げることを確認した
- [ ] CLAUDE.md との整合性を確認した
- [ ] コミットメッセージに背景を明記した

---

## 7. 同期義務

### テンプレート同期

以下のファイルペアは常に同期を維持する:

```
.claude/hooks/* ⟷ templates/hooks/*
.claude/CLAUDE.md ⟷ templates/.claude-template.md
```

### 同期確認チェックリスト

- [ ] `.claude/hooks/` 修正時は `templates/hooks/` も確認した
- [ ] 両方のファイルを比較して同期されていることを確認した
- [ ] 新しいプロジェクトにインストールしても同じ動作になることを確認した

---

## 8. 旧MUST Rules対応表

| 旧ルール | 新しい場所 |
|---------|-----------|
| MUST Rule 0: プロジェクトコンテキスト確認 | QUALITY_GUARDIAN.md 1.1 |
| MUST Rule 1: ユーザー指示の厳守 | QUALITY_GUARDIAN.md 1.1 |
| MUST Rule 2: テスト必須と完了基準 | QUALITY_GUARDIAN.md 1.3 |
| MUST Rule 3: 不可逆な操作の事前確認 | QUALITY_GUARDIAN.md 1.2 |
| MUST Rule 4: Git操作前の確認義務 | QUALITY_GUARDIAN.md 1.2 |
| MUST Rule 5: エラー時の対策実施 | QUALITY_GUARDIAN.md 1.4 |
| MUST Rule 6: 重要な理解の文書化 | CLAUDE.md メタルール |
| MUST Rule 7: 「同じ」指示の全体確認 | QUALITY_GUARDIAN.md 1.1 |
| MUST Rule 8: プロジェクト固有ルール確認 | PROJECT_SPEC.md |
| MUST Rule 9: 設計書First原則 | PROJECT_SPEC.md |
| MUST Rule 10: AIの透明性と誠実性 | QUALITY_GUARDIAN.md 1.4 |
| MUST Rule 11: 動作確認の自己完結 | QUALITY_GUARDIAN.md 1.3 |
| MUST Rule 12: 問題発生時の再発防止 | QUALITY_GUARDIAN.md 6 |
| MUST Rule 13: Git操作方法の選択 | PROJECT_SPEC.md |
| MUST Rule 14: PRレビュー指摘への完全対応 | WORKFLOW.md |
| MUST Rule 15: PR内容の完全把握・まとめ | WORKFLOW.md |
| MUST Rule 16: テンプレート・ドキュメント同期 | QUALITY_GUARDIAN.md 7 |
| MUST Rule 17: Claude Code痕跡の完全排除 | pre-commit hook |
| MUST Rule 18: developmentブランチ保護 | pre-commit hook |
| MUST Rule 19: 完了報告前の全チェック実行 | QUALITY_GUARDIAN.md 1.3 |
| MUST Rule 20: PR作業完了報告前の確認 | WORKFLOW.md |
| MUST Rule 21: ルール作成時のテスト義務 | QUALITY_GUARDIAN.md 6 |

---

**Current Version: 1.0.0**
**Last Updated: 2025-11-27**
