<!--
================================================================================
================================================================================
================================================================================

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

                         CRITICAL INSTRUCTION
                         ABSOLUTELY MANDATORY
                         NO EXCEPTIONS ALLOWED

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

このファイルは階層化されたルールシステムの最上位層です。

- Layer 1（このファイル）: 18個の核心ルール - Main AIが常に意識
- Layer 2（.claude/agents/）: 専門サブエージェント - 自動起動
- Layer 3（.claude/rules/）: 詳細ルール - サブエージェントが参照

================================================================================
================================================================================
================================================================================
-->

---

# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭にCRITICAL Rules（最重要12個）を表示すること：**

UserPromptSubmit hookがsystem-reminderとして表示するCRITICAL Rulesを、
**省略禁止・一字一句そのまま**ユーザーへの応答の最初に表示すること。

**表示形式：**
✅ hookと同じ複数行の詳細版を完全再現
❌ 1行に簡略化（Rule 1:ユーザー指示厳守 | Rule 2:テスト必須 | ...）

**表示内容：**
- 12個のCRITICAL Rules（詳細版）
- 各ルール: タイトル + 簡潔な説明 + 詳細参照先
- 再帰的ルール表示の義務も含める

**理由：**
17個の完全版は「ちょっと多い」（ユーザー指摘）。
最重要12個に絞り込み、詳細版で表示することで、ルールを確実に意識できる。

---

# Claude Code Configuration for AI Scripts Repository

## プロジェクト概要

このリポジトリは、AI開発を支援するための品質管理スクリプト集です。

### 主要コンポーネント

- **quality-guardian/**: 統合品質管理システム
- **legacy/**: 旧バージョンのスクリプト
- **tools/**: 各種ユーティリティ

### ファイル構成

```
/Users/masa/dev/ai/scripts/
├── .claude/
│   ├── CLAUDE.md          # この設定ファイル（Layer 1）
│   ├── agents/            # 専門サブエージェント（Layer 2）
│   └── rules/             # 詳細ルール（Layer 3）
├── quality-guardian/
│   ├── VERSION            # バージョン番号
│   ├── README.md          # 必読ドキュメント
│   ├── install.sh         # インストーラー
│   ├── quality-guardian.js # メインスクリプト
│   ├── modules/           # 各種モジュール
│   └── INTEGRATION.md     # 統合ガイド
├── legacy/                # 旧スクリプト
├── tools/                 # ユーティリティ
└── README.md              # リポジトリ全体の説明
```

---

# このプロジェクトでの開発ルール

## ブランチ戦略

### ブランチ命名規則（厳守）

**全ての機能開発・修正は `feature/xxx` で行う:**

```
✅ feature/add-new-feature
✅ feature/fix-bug-in-auth
✅ feature/improve-performance

❌ fix/auth-bug          （fixは使わない）
❌ bugfix/login-error    （bugfixは使わない）
❌ test/verify-something （testは使わない）
```

**理由:**
- ブランチの種類を統一することで、履歴が分かりやすくなる
- fix, bugfix, test等の使い分けで混乱を防ぐ
- 全て feature/ に統一

### ブランチ継続/新規作成の確認フロー（必須）

**今までの機能と毛色が違うオーダーが来た時、必ず確認する:**

1. **現在のブランチ名を表示**
   ```
   現在のブランチ: feature/add-authentication
   ```

2. **ユーザーに確認**
   ```
   新しいオーダーは「メール通知機能の追加」です。

   このブランチで作業を継続しますか？
   それとも新しいブランチを作成しますか？

   [現在のブランチで継続する場合]
   feature/add-authentication で作業を継続します。

   [新しいブランチを作成する場合]
   新しいブランチ名の候補: feature/add-email-notification
   このブランチ名で作成してよろしいでしょうか？
   ```

3. **確認後に作業開始**
   - ユーザーの承認を得てから作業開始
   - どのブランチで作業しているか常に明確にする

### Push前の確認（必須）

**作業後に勝手にpushしない:**

```
作業が完了しました。

[実装内容の報告]
- ファイルA: 機能Xを実装
- ファイルB: テストを追加

コミット: a1b2c3d feat: Add feature X

pushしますか？
```

**ユーザーの承認を得てからpush:**
- ユーザー: 「はい」→ push実行
- ユーザー: 「いいえ」→ pushしない、ローカルに残す

### 直接mainブランチを伸ばす（このプロジェクト専用・重要）

**このai-quality-guardianプロジェクト専用の特別ルール:**

このプロジェクトでは、**PRを作成せず、直接mainブランチを伸ばすこと**。

**理由:**
- quality-guardian自体が品質管理ツール
- PRレビューの代わりに、徹底的なテストで品質を保証
- シンプルな開発フロー

**必須手順:**

1. **mainブランチで直接作業**
   ```bash
   # 現在のブランチ確認
   git branch --show-current
   # → main であることを確認

   # ファイル編集
   # ...

   # 変更をステージング
   git add <files>

   # コミット
   git commit -m "..."
   ```

2. **pushの前に必ずテストを実行**
   ```bash
   # syntax check
   bash -n quality-guardian/install.sh
   bash -n quality-guardian/templates/hooks/user-prompt-submit.sh

   # その他のテスト（該当する場合）
   npm test
   npm run lint
   npm run typecheck
   ```

3. **全テスト合格後にpush**
   ```bash
   git push origin main
   ```

**重要な注意点:**
- **この直接mainブランチを伸ばす運用は、このai-quality-guardianプロジェクトのみ**の特別ルール
- 他のプロジェクトでは必ずPR経由でマージ
- テストを徹底すること（quality-guardian自体がバグを持つのは存在意義を揺るがす）

### コミット署名の禁止（重要）

**Pull RequestやCommitで署名を付加しない:**

```
❌ 禁止:
Co-Authored-By: Claude <noreply@anthropic.com>
🤖 Generated with [Claude Code](https://claude.com/claude-code)

✅ 正しい:
git commit -m "feat: Add new feature"
（署名なし、シンプルなコミットメッセージのみ）
```

**理由:**
- Claudeが作成したことが分からないようにする
- プロフェッショナルなコミット履歴を維持
- 余計な情報を追加しない

---

# 🚨 MUST Rules（Main AI - 17個）

**詳細なルールは `.claude/rules/must-rules.md` を参照してください。**
**UserPromptSubmit hookが毎回全てのルールを表示します。**

## ルール一覧（概要のみ）

以下の17個のルールは**絶対に守ること**：

### 0. プロジェクトコンテキスト確認義務（最優先）
ユーザーの入力を見た瞬間に、これが「このプロジェクト」の話か「他のプロジェクト」の話かを判定する。他のプロジェクトの問題を解決しない。

### 1. ユーザー指示の厳守
ユーザーの指示は一字一句守る。指示されたことだけを実行し、指示以外のことは一切行わない。

### 2. テスト必須と完了基準
テストでエラーが発生した場合、全てのエラーを解決するまで作業を続ける。テストのスキップ・無効化は絶対禁止。「完了しました」と報告する前に、必ずテスト合格と動作確認を実施。

### 3. 不可逆な操作・影響範囲の大きい操作の事前確認
不可逆な操作（元に戻せない操作）や影響範囲の大きい操作を実行する前に、必ずユーザーに確認を取り、影響範囲を説明する。

### 4. Git操作前の確認義務（最重要）
Git操作（add, commit, push, checkout -b等）を実行する前に、必ず現在のブランチを確認。重要ブランチへの直接操作は絶対禁止。

### 5. エラー時の対策実施と困難な作業からの逃避禁止
あらゆるエラーに対して、謝罪ではなく対策を実施し、作業を継続する。困難な作業・時間のかかる作業から逃避しない。

### 6. 重要な理解の即座の文書化義務
ユーザーから重要な説明・理由・背景を聞いた時、その場で即座にCLAUDE.mdまたは関連ファイルに記録する。

### 7. 「同じ」指示の全体確認義務
ユーザーが「Aと同じ」「Bと同じように」と指示した場合、関連する全てのファイル・パターンを洗い出し、全体の一貫性を確保する。

### 8. プロジェクト固有ルール確認義務
プロジェクト固有の命名規則・構造・パターンに従う操作を行う前に、必ず既存のパターンを確認し、プロジェクトのルールに従う。

### 9. 設計書First原則の厳守
「仕様書first」「設計書first」プロジェクトでは、機能説明・質問対応時に必ず設計書を最初に確認する。コードから推測して説明しない。

### 10. AIの透明性と誠実性（検証結果の正確な報告）
検証・テスト・バックアップ等の結果報告時、失敗を隠蔽したり、都合の良い解釈をしない。証拠に基づいて正確に報告する。

### 11. 動作確認の自己完結義務（最重要）
実装完了後、動作確認をユーザーに依頼しない。Playwrightで自分で確認する。

### 12. 問題発生時の再発防止義務（最重要）
問題が起きたら、謝罪だけでなく「なぜ起きたか」を分析し、再発防止策を実装する。同じ問題を繰り返さない。

### 13. Git操作方法の選択（プロジェクト別・最重要）
このプロジェクト（quality-guardian）では mainブランチで直接作業。他のプロジェクトでは worktree を使用。

### 14. PRレビュー指摘への完全対応義務（最重要）
Pull Requestのレビュー指摘を受けた場合、全ての指摘に対応する。一部だけ対応して終わることを禁止。

### 15. PR内容の完全把握・まとめ義務（最重要）
Pull Requestの実装内容をまとめる際、全ての実装項目を確認し、漏れなく記載する。一部だけ記載して終わることを禁止。

### 16. 問題解決後の全体確認義務（テンプレート・ドキュメント同期）（最重要）
問題を解決した後、関連する全てのテンプレート・ドキュメント・インストーラーを確認し、同じ問題が他の場所にないか確認する。

### 17. Claude Code痕跡の完全排除（最重要）
Claude Codeの実行痕跡（⏺マーク、内部ログ、ツール呼び出し等）を、ユーザーへの応答・ドキュメント・コミットメッセージ等に一切含めない。

---

**詳細な実装例・過去の問題例・対策等は `.claude/rules/must-rules.md` を参照してください。**

---
# コーディング規約

- **シェルスクリプト**: bashの慣習に従う、set -e で エラー時即座に終了
- **JavaScript**: CommonJS形式、Node.js標準モジュール優先
- **エラーハンドリング**: すべてのエラーに適切なメッセージ
- **ユーザー通知**: 分かりやすいメッセージ（絵文字は禁止）

## ロギング規約（重要）

**console.logではなくloggerを使う**

### 基本原則

- **loggerがあればloggerを使う**（console.logは禁止）
- **loggerがなければpinoの導入を提案**
- **loggerutilの実装を提案**（プロジェクト共通のロガー）

### 厳守事項

1. **プロジェクトのロガーを確認**
   ```bash
   # loggerの存在確認
   grep -r "import.*logger" src/
   grep -r "const logger" src/
   find . -name "logger.ts" -o -name "logger.js"
   ```

2. **loggerがある場合**
   - 必ずloggerを使う
   - console.logは絶対禁止

3. **loggerがない場合**
   - pinoの導入を提案
   - loggerutilの実装を提案
   ```typescript
   // 提案例
   import pino from 'pino';

   export const logger = pino({
     level: process.env.LOG_LEVEL || 'info',
     transport: {
       target: 'pino-pretty',
       options: { colorize: true }
     }
   });
   ```

### 禁止事項

```
❌ console.log() の使用（loggerがあるのに使わない）
❌ console.error() の使用（logger.error()を使う）
❌ console.warn() の使用（logger.warn()を使う）
❌ console.info() の使用（logger.info()を使う）
```

### 正しい対応

```typescript
// ❌ 誤り
console.log('User created:', user);

// ✅ 正しい
logger.info('User created:', { user });
```

## 変数宣言規約（重要）

**letではなくconstを使う**

### 基本原則

- **デフォルトはconst**（再代入しない変数）
- **letは再代入が必要な場合のみ**
- **varは絶対禁止**

### 厳守事項

1. **変数宣言時にconstを優先**
   ```typescript
   // ✅ 正しい
   const user = await getUser(id);
   const items = [];

   // ❌ 誤り
   let user = await getUser(id);  // 再代入しないのにlet
   let items = [];  // 再代入しないのにlet
   ```

2. **letは再代入が必要な場合のみ**
   ```typescript
   // ✅ letが正当な場合
   let count = 0;
   for (const item of items) {
     count++;  // 再代入が必要
   }

   // ✅ constを使うべき場合
   const count = items.length;  // 再代入不要
   ```

### 禁止事項

```
❌ let の無闇な使用（再代入しないのにlet）
❌ var の使用（絶対禁止）
```

### 過去の問題例

**ユーザーの指摘:**
```
「loggerあるのにconsole.logを利用してしまう。loogerを使うのを基本にして、
無かったらpinoの導入とloggerutilの実装を提案してください。
アト、letも利用しないでと言ってあるのに利用します」
```

**検出したトリガーフレーズ:**
- 「loggerあるのにconsole.logを利用してしまう」（問題の指摘）
- 「letも利用しないでと言ってあるのに利用します」（ルール違反の指摘）

**問題の本質:**
- ユーザーが既に「loggerを使う」「letを使わない」と指示していた
- AIがそれを守らず、console.logとletを使い続けた
- MUST Rule 6違反（重要な指示を記録していなかった）

**今後の対応:**
- このルールをCLAUDE.mdに記録（MUST Rule 6の実践）
- logger使用とconst使用を徹底
- 違反時は即座に修正

---

## ESLint設定規約（重要・システム的強制）

**ESLintルール設定でquality-guardianによる自動保護を実現する**

### 基本原則

- **ESLintルール + quality-guardianのlint実行 = システム的な強制**
- quality-guardianが自動的にlintを実行して違反を検出
- 「口約束」ではなく、システムによる強制

### 必須ESLintルール

**1. no-console ルール**

loggerの使用を強制し、console.logを禁止：

```json
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }]
  }
}
```

**理由:**
- console.logではなくloggerを使う（ロギング規約）
- quality-guardianが自動検出
- warnとerrorは許可（緊急時のデバッグ用）

**2. prefer-const ルール**

constの使用を強制し、不要なletを禁止：

```json
{
  "rules": {
    "prefer-const": "error"
  }
}
```

**理由:**
- letではなくconstを使う（変数宣言規約）
- 再代入しない変数は全てconstにする
- quality-guardianが自動検出

**3. Object property mutation 警告**

constオブジェクトのプロパティ再代入を検出：

```json
{
  "rules": {
    "no-param-reassign": ["warn", { "props": true }]
  }
}
```

または、より厳格な制約が必要な場合：

```json
{
  "plugins": ["functional"],
  "rules": {
    "functional/immutable-data": ["warn", {
      "ignoreImmediateMutation": false,
      "ignoreAccessorPattern": []
    }]
  }
}
```

**理由:**
- `const obj = {}; obj.prop = value;` を検出
- イミュータビリティの原則を守る
- 予期しない副作用を防ぐ

### quality-guardianとの統合

**自動保護の仕組み:**

```
ESLintルール設定
  ↓
quality-guardian が lint 実行
  ↓
違反を自動検出
  ↓
エラー・警告を表示
  ↓
コミット前にブロック（pre-commit hook経由）
```

**設定ファイル例:**

`.eslintrc.json`:
```json
{
  "env": {
    "node": true,
    "es2021": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-param-reassign": ["warn", { "props": true }]
  }
}
```

### 禁止事項

```
❌ ESLintルールを無視する（--no-verify等）
❌ ESLintルールを緩める（errorをwarnに変更等）
❌ 「一時的に」ESLintを無効化（// eslint-disable 等）
❌ quality-guardianのlint実行をスキップ
```

### 過去の問題例への対策

**ユーザーの指摘（再掲）:**
```
「loggerあるのにconsole.logを利用してしまう。loogerを使うのを基本にして、
無かったらpinoの導入とloggerutilの実装を提案してください。
アト、letも利用しないでと言ってあるのに利用します」
```

**対策:**
- ESLintルール設定により、システム的に強制
- quality-guardianが自動的にlintを実行
- 違反があればコミット前にブロック
- 「口約束」ではなく、具体的なシステム的強制

**重要な教訓:**
- **「気をつけます」は無効** - ESLintルールでシステム的に強制
- **quality-guardianとの統合** - 自動検出・自動ブロック
- **MUST Rule 6の実践** - この設定自体をCLAUDE.mdに記録

---

# 過去の重要な違反事例（再発防止のための記録）

## MUST Rule 16違反: templates/hooks/ 同期漏れ（v1.3.39 → v1.3.40で修正）

### 違反内容

**発生日**: 2025-01-18
**バージョン**: v1.3.39実装時

v1.3.39でCRITICAL Rules（13個の簡略版）を実装した際：
- ✅ `.claude/hooks/user-prompt-submit.sh` を更新（CRITICAL Rules形式、70行）
- ❌ `templates/hooks/user-prompt-submit.sh` を更新せず（旧形式、75行のまま）

**MUST Rule 16違反**: "`.claude/hooks/* ⟷ templates/hooks/*` 同期義務" を守らなかった

### 根本原因

1. **TodoListの不備**: v1.3.39のTodoListに templates/ 同期タスクが含まれていなかった
2. **Rule 16確認漏れ**: 実装前にMUST Rule 16を確認しなかった
3. **焦点の狭さ**: `.claude/hooks/` のみに集中し、templates/ を見落とした

### 影響範囲

**深刻な影響:**
- 他のプロジェクトが quality-guardian をインストールした場合、旧形式のhookがコピーされる
- CRITICAL Rules（13個簡略版）が表示されない
- v1.3.39の改善が他のプロジェクトに伝わらない
- Quality Guardian自体が品質ルールを違反（深刻な矛盾）

### 対策（v1.3.40で実施）

**即時対応:**
1. ✅ `templates/hooks/user-prompt-submit.sh` を CRITICAL Rules 形式に更新（94行）
2. ✅ `.claude-template.md` に応答テンプレート追加
3. ✅ この違反事例をCLAUDE.mdに記録（MUST Rule 12実践）

**再発防止策:**
1. **実装前チェック**: `.claude/hooks/` 修正時は必ず MUST Rule 16 を確認
2. **TodoList強化**: templates/ 同期を明示的にタスクに含める
3. **ペアチェック**: 実装後に `.claude/` と `templates/` を比較確認
4. **将来的改善**: 自動同期チェックスクリプトの導入を検討

### 教訓

**「Quality Guardian tool itself violated quality rules」**
- 品質管理ツールが自ら品質ルールを違反する深刻な矛盾
- ルール強制システム自体にも強制が必要
- MUST Rule 16（同期義務）の重要性を再認識
- MUST Rule 12（再発防止義務）の実践例

---

# 開発時の心構え

1. **品質管理ツールの開発者として**
   - 自分自身が作るコードも高品質であるべき
   - ユーザーが期待する動作を正確に実現
   - 予期しない動作は絶対に避ける

2. **ドキュメント優先**
   - README.md は常に最新の状態に
   - 変更履歴を明確に記録
   - ユーザーが困らない説明を心がける

3. **後方互換性の維持**
   - 既存の動作を壊さない
   - 破壊的変更は必ず事前確認

---

# 階層化ルールシステムの構成

このプロジェクトは3層のルールシステムを採用しています：

## Layer 1: このファイル（CLAUDE.md）
- 5個の核心ルールのみ
- Main AIが常に意識するルール

## Layer 2: サブエージェント（.claude/agents/）
- 専門分野に特化したエージェント
- 自動起動により確実にチェック
- 各3-5個のルールに集中

**主要サブエージェント:**
- `project-context-guardian.md` - 他のプロジェクトのログ検出（最優先）
- `pre-commit-guardian.md` - コミット前の全チェック
- `git-operation-guardian.md` - Git操作の安全性確保
- `confirmation-guardian.md` - 確認指示の厳守
- `memory-guardian.md` - 実装前のメモリー確認
- `production-guardian.md` - 本番環境での安全な操作
- `verification-guardian.md` - 検証結果の正確性確認（MUST Rule 10）
- `rule-advisor.md` - ルール選択と自動起動

## Layer 3: 詳細ルール（.claude/rules/）
- 各MUST Ruleの詳細仕様
- サブエージェントが参照
- 過去の問題例と対策を含む

**主要ルールファイル:**
- `user-instruction-rules.md` - MUST Rule 1の詳細
- `test-rules.md` - MUST Rule 2の詳細
- `irreversible-operation-rules.md` - MUST Rule 3の詳細
- `git-rules.md` - Git操作の詳細ルール
- `version-rules.md` - バージョン管理の詳細ルール
- その他、各ルールごとのファイル

---

# AI開発時の特記事項

このプロジェクト自体が「AI開発の品質を守る」ツールなので、
**開発者（AI）自身がルールを厳守すること**が極めて重要です。

- 18個の核心ルールを常に意識（特にMUST Rule 0、MUST Rule 4、MUST Rule 11、MUST Rule 12、MUST Rule 13、MUST Rule 17）
- サブエージェントを積極的に活用
- 詳細ルールはサブエージェントに任せる
- 不明な点は必ずユーザーに確認

---

**Current Version: 1.3.44**
**Last Updated: 2025-11-18**
**Architecture: 3-Layer Hierarchical Rule System**
