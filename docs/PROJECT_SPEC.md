# Quality Guardian プロジェクト仕様書

このドキュメントは、Quality Guardianプロジェクト固有の仕様・構造・命名規則を記載します。

---

## 1. プロジェクト概要

このリポジトリは、AI開発を支援するための品質管理スクリプト集です。

### 主要コンポーネント

- **quality-guardian/**: 統合品質管理システム
- **legacy/**: 旧バージョンのスクリプト
- **tools/**: 各種ユーティリティ
- **pm-orchestrator/**: PM Orchestrator TypeScript実装

---

## 2. ディレクトリ構造

```
<AI_SCRIPTS_PATH>/
├── .claude/
│   ├── CLAUDE.md          # メタルール（4個）
│   ├── agents/            # 専門サブエージェント
│   ├── rules/             # 詳細ルール（deprecation notice付き）
│   ├── hooks/             # フック設定
│   └── commands/          # カスタムコマンド
├── docs/
│   ├── QUALITY_GUARDIAN.md  # ルール詳細
│   ├── PROJECT_SPEC.md      # このファイル
│   ├── WORKFLOW.md          # ワークフロー
│   ├── PAST_VIOLATIONS.md   # 過去の違反事例
│   └── legacy/              # 旧バージョンのバックアップ
├── quality-guardian/
│   ├── VERSION            # バージョン番号
│   ├── README.md          # 必読ドキュメント
│   ├── install.sh         # インストーラー
│   ├── quality-guardian.js # メインスクリプト
│   ├── modules/           # 各種モジュール
│   ├── templates/         # インストール用テンプレート
│   └── INTEGRATION.md     # 統合ガイド
├── pm-orchestrator/       # PM Orchestrator TypeScript実装
├── legacy/                # 旧スクリプト
├── tools/                 # ユーティリティ
└── README.md              # リポジトリ全体の説明
```

---

## 3. ブランチ戦略

### 3.1 ブランチ命名規則（厳守）

**全ての機能開発・修正は `feature/xxx` で行う:**

```
feature/add-new-feature
feature/fix-bug-in-auth
feature/improve-performance
```

**禁止:**
```
fix/auth-bug          （fixは使わない）
bugfix/login-error    （bugfixは使わない）
test/verify-something （testは使わない）
```

### 3.2 このプロジェクト専用ルール: mainブランチ直接運用

**このai-quality-guardianプロジェクト専用の特別ルール:**

このプロジェクトでは、**PRを作成せず、直接mainブランチを伸ばすこと**。

**理由:**
- quality-guardian自体が品質管理ツール
- PRレビューの代わりに、徹底的なテストで品質を保証
- シンプルな開発フロー

**必須手順:**

1. **mainブランチで直接作業**
   ```bash
   git branch --show-current  # → main であることを確認
   # ファイル編集
   git add <files>
   git commit -m "..."
   ```

2. **pushの前に必ずテストを実行**
   ```bash
   bash -n quality-guardian/install.sh
   bash -n quality-guardian/templates/hooks/user-prompt-submit.sh
   npm test  # 該当する場合
   npm run lint
   npm run typecheck
   ```

3. **全テスト合格後にpush**
   ```bash
   git push origin main
   ```

**重要:**
- この直接mainブランチを伸ばす運用は、**このai-quality-guardianプロジェクトのみ**の特別ルール
- 他のプロジェクトでは必ずPR経由でマージ

### 3.3 ブランチ継続/新規作成の確認フロー

**今までの機能と毛色が違うオーダーが来た時、必ず確認する:**

1. 現在のブランチ名を表示
2. ユーザーに確認（継続 or 新規作成）
3. 確認後に作業開始

### 3.4 Push前の確認

**作業後に勝手にpushしない:**
- 実装内容を報告
- ユーザーの承認を得てからpush

---

## 4. コミット署名の禁止

**Pull RequestやCommitで署名を付加しない:**

```
# 禁止
Co-Authored-By: [AI名] <noreply@[email]>
Generated with [AI Tool](https://[url])

# 正しい
git commit -m "feat: Add new feature"
```

**理由:**
- Claudeが作成したことが分からないようにする
- プロフェッショナルなコミット履歴を維持

---

## 5. Personal Mode時のドキュメント作成規約

**Personal Mode（親ディレクトリインストール）の場合、ドキュメントは `.claude` フォルダーに作成すること:**

```
# 禁止: プロジェクトリポジトリ内にドキュメント作成
<PROJECT_PATH>/eventsystem/quality-guardian-report.md

# 正しい: .claude フォルダーにドキュメント作成
<PROJECT_PATH>/.claude/quality-guardian-report.md
```

**対象ドキュメント:**
- 品質レポート
- 分析結果
- ログファイル
- 一時ファイル
- その他quality-guardian関連のドキュメント全て

---

## 6. PM Orchestrator

### 6.1 概要

PM Orchestratorは、複雑なタスクを管理し、適切なサブエージェントを起動するハブです。

### 6.2 サブエージェント一覧

| サブエージェント | 役割 |
|----------------|------|
| pm-orchestrator | タスク分析・サブエージェント起動 |
| rule-checker | MUST Rules違反の検出 |
| implementer | コード実装 |
| reporter | 結果の統合・報告 |
| designer | 設計・計画作成 |
| qa | 品質検証 |

### 6.3 自動起動ルール

**system-reminderに「PM Orchestrator 起動」が表示されたら、即座にTask toolでpm-orchestratorを起動する。**

**起動すべきパターン:**
- 複雑な実装要求（複数ファイルにまたがる実装）
- PRレビュー対応
- バージョン更新・一括修正
- 品質チェック・検証タスク

**起動不要なパターン:**
- 単純な質問
- 単一ファイルの小規模修正
- 情報確認のみ

---

## 7. hooks と commands

### 7.1 確定事実

**以下は確定済み。二度と議論しない:**

1. **hookからカスタムコマンドを呼べる**
   - settings.jsonの "run": "/command" でスラッシュコマンドを呼べる
   - shinpr/ai-coding-project-boilerplate で実装済み

2. **カスタムコマンドはサブエージェントを呼べる**
   - .claude/commands/xxx.md がプロンプトとして展開される
   - Main AIがそのプロンプトを読んでTask toolを呼ぶ

3. **PM Orchestratorは自動起動する**
   - hookがスラッシュコマンドを呼ぶ → Main AIがTask toolを呼ぶ

### 7.2 禁止フレーズ

```
「hookはシェルスクリプトしか実行できない」
「hookからTask toolは呼べない」
「hookからカスタムコマンドを呼ぶことはできない」
「カスタムコマンドはシェルコマンドしか実行できない」
「検出が必要」
「推奨」
```

### 7.3 Meta Rules

- Plan Mode を使用しません
- Plan Mode を開始しないこと
- Plan Mode の利用を提案しないこと

---

## 8. シェルスクリプト規約

- bashの慣習に従う
- `set -e` で エラー時即座に終了
- 全てのエラーに適切なメッセージ

---

## 9. JavaScript規約

- CommonJS形式
- Node.js標準モジュール優先
- loggerを使用（console.log禁止）
- constを使用（let禁止、varは絶対禁止）

---

## 10. ヘッドレスモード

**Chromatic、Playwright、Puppeteer等のブラウザテストは、必ずheadlessモードで実行する。**

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    headless: true,  // 必須
  },
});
```

---

**Current Version: 1.0.0**
**Last Updated: 2025-11-27**
