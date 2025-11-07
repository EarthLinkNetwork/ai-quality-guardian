# 3層階層化ルールシステム - アーキテクチャガイド

**Version 1.3.0**

## 概要

このシステムは、AI開発において「ルールが多すぎると守られない」という問題を解決するため、ルールを3層に階層化した設計です。

### 設計の背景

**問題:** 従来は23個のMUST Rulesをメインファイル（CLAUDE.md）に列挙していました。しかし、LLMは多数のルールを同時に意識することができず、重要なルールを見落とす問題が頻発していました。

**解決策:** 3層階層化により、Main AIは5個の核心ルールのみに集中し、詳細なチェックは専門サブエージェントに委譲することで、確実なルール遵守を実現します。

---

## 3層階層化の構成

### Layer 1: Main AI（CLAUDE.md）

**責務:** 5個の核心ルールのみに集中

1. ユーザー指示の厳守
2. テスト必須
3. 不可逆な操作の事前確認
4. **サブエージェント呼び出し義務**（新規）
5. エラー時の対策実施

**メリット:**
- Main AIの認知負荷を78%削減（23個 → 5個）
- 核心ルールに確実に集中できる
- サブエージェント呼び出しを義務化

**ファイル:** `.claude/CLAUDE.md`

---

### Layer 2: 専門サブエージェント（.claude/agents/）

**責務:** 特定の状況・操作を監視し、詳細なルールチェックを実施

#### 主要サブエージェント

| エージェント | 責務 | 自動起動タイミング |
|------------|------|------------------|
| `pre-commit-guardian` | コミット前の全チェック | `git add` 実行後、`git commit` 前 |
| `git-operation-guardian` | Git操作の安全性確保 | Git操作（checkout、commit、push等） |
| `confirmation-guardian` | 確認指示の厳守 | 「確認してください」等のキーワード検出 |
| `memory-guardian` | 実装前のメモリー確認 | 実装開始前、TodoWrite時 |
| `production-guardian` | 本番環境での安全な操作 | 「production」「本番」キーワード検出 |
| `rule-advisor` | ルール選択と自動起動 | 全タスク開始時 |

**メリット:**
- 各エージェントは3-5個のルールに特化
- 自動起動により確実にチェック
- パターンマッチングによる柔軟な検出

**ディレクトリ:** `.claude/agents/`

#### エージェントの判定システム

各エージェントは以下の判定を返します：

- **BLOCKER:** 操作を即座に停止（重大な違反）
- **WARNING:** ユーザー承認必須（危険な操作）
- **PASS:** 操作続行可能（問題なし）

---

### Layer 3: 詳細ルール（.claude/rules/）

**責務:** 各MUST Ruleの詳細仕様・過去の問題例・対策を記載

#### 主要ルールファイル

| ファイル | 対応MUST Rule | 内容 |
|---------|--------------|------|
| `user-instruction-rules.md` | MUST Rule 1 | ユーザー指示の厳守の詳細 |
| `test-rules.md` | MUST Rule 2 | テスト必須、Test First原則 |
| `irreversible-operation-rules.md` | MUST Rule 3 | 不可逆な操作の事前確認 |
| `git-rules.md` | Git操作詳細 | 重要ブランチ保護、危険な操作 |
| `error-handling-rules.md` | MUST Rule 5 | エラー時の対策実施 |

**メリット:**
- 詳細な仕様・過去の問題例を集約
- サブエージェントが必要時に参照
- Main AIの負担にならない

**ディレクトリ:** `.claude/rules/`

---

## 動作フロー

### 1. タスク開始時

```
ユーザー: 「機能を実装してください」
    ↓
Main AI: MUST Rule 4を確認
    ↓
rule-advisor を自動起動
    ↓
rule-advisor: タスク内容を分析
    ↓
rule-advisor: 必要なサブエージェントを選択
    - memory-guardian（実装前の確認）
    - pre-commit-guardian（コミット前のチェック）
    ↓
memory-guardian: 実装前チェック実施
    - トリガーフレーズ検出
    - 過去の合意確認
    - PASS/BLOCKER判定
    ↓
Main AI: 判定結果に従って実装開始/停止
```

### 2. Git操作時

```
Main AI: git add . を実行しようとする
    ↓
MUST Rule 4: git操作を検出
    ↓
git-operation-guardian を自動起動
    ↓
git-operation-guardian:
    - 現在のブランチ確認
    - 重要ブランチへの直接操作を検出
    - git add . は危険（意図しないファイル混入）
    ↓
判定: BLOCKER
    ↓
Main AI: 操作を中止
    ↓
Main AI: ファイルを明示的に指定
```

### 3. コミット前

```
Main AI: git commit -m "..." を実行しようとする
    ↓
MUST Rule 4: commit操作を検出
    ↓
pre-commit-guardian を自動起動
    ↓
pre-commit-guardian:
    1. pnpm lint → 実行
    2. pnpm test → 実行
    3. pnpm typecheck → 実行
    4. pnpm build → 実行
    5. git status → staged files確認
    6. git diff --cached → changes確認
    ↓
判定:
    - 全て通過 → PASS
    - いずれか失敗 → FAIL
    ↓
Main AI: PASS時のみcommit実行
```

### 4. 確認指示があった時

```
ユーザー: 「まず確認してください」
    ↓
MUST Rule 4: 確認指示を検出
    ↓
confirmation-guardian を自動起動
    ↓
confirmation-guardian:
    - 確認指示キーワード検出
    - Main AIの対応を監視
    ↓
Main AI:
    1. 内容を表示
    2. 「この内容で合っていますか？」と確認
    3. ユーザーの承認を待つ
    4. 承認後に作業開始
```

---

## 自動起動メカニズム

### 1. rule-advisorによる自動判定

**仕組み:**
- タスク内容・状況を分析
- 適切なサブエージェントを自動選択・起動

**例:**
```typescript
タスク: 「FHIRデータを検証してください」
    ↓
rule-advisor:
    - 「検証」「テスト」というキーワードを検出
    - memory-guardian を起動（曖昧な指示チェック）
    - production-guardian を起動（本番環境チェック）
```

### 2. パターンマッチング

**仕組み:**
- キーワード・操作を検出
- 対応するサブエージェントを自動起動

**トリガーキーワード例:**

| キーワード | 起動エージェント |
|-----------|-----------------|
| `git add`, `git commit` | git-operation-guardian |
| `確認してください`, `見せて` | confirmation-guardian |
| `production`, `本番` | production-guardian |
| `〜と思います`, `おそらく` | memory-guardian |

### 3. TodoWrite統合

**仕組み:**
- TodoWriteでタスク作成時に自動起動
- タスク内容を分析してエージェント選択

**例:**
```typescript
TodoWrite: [{ content: "FHIRを検証", status: "in_progress" }]
    ↓
rule-advisor:
    - タスク内容に「検証」を検出
    - memory-guardian を起動
```

---

## トリガーフレーズ一覧

### memory-guardian

**トリガーフレーズ（BLOCKER）:**
- 「〜と思います」
- 「おそらく〜」
- 「〜だろう」
- 「〜かもしれない」

**曖昧な指示（WARNING）:**
- 「検証」（何を検証？）
- 「テスト」（どのテスト？）
- 「ログ」（どの形式？）

### confirmation-guardian

**確認指示キーワード:**
- 「確認してください」
- 「見せてください」
- 「表示してください」
- 「ここに出してください」
- 「まず〜」
- 「先に〜」
- 「おぼえてますか」

### production-guardian

**本番環境キーワード:**
- 「production」
- 「prod」
- 「本番」
- 「本番環境」

### git-operation-guardian

**Git操作:**
- `git add`
- `git commit`
- `git push`
- `git checkout -b`
- `git filter-branch`
- `git reset --hard`
- `git rebase`

---

## 従来システムとの比較

### 従来システム（v1.2.x）

**構成:**
- CLAUDE.md に23個のMUST Rules
- 全てをMain AIが同時に意識

**問題点:**
- 認知負荷が高すぎる
- 重要なルールを見落とす
- 詳細なルールが埋もれる

### 新システム（v1.3.0）

**構成:**
- Layer 1: 5個の核心ルール（Main AI）
- Layer 2: 専門サブエージェント（自動起動）
- Layer 3: 詳細ルール（参照）

**改善点:**
- Main AIの認知負荷78%削減
- サブエージェントが確実にチェック
- 柔軟なパターンマッチング

**定量的な比較:**

| 指標 | 従来 | 新システム | 改善率 |
|------|------|-----------|-------|
| Main AIが意識するルール数 | 23個 | 5個 | 78%削減 |
| ルール見落としリスク | 高 | 低 | 自動起動により削減 |
| 詳細ルールへのアクセス | 全て読む | 必要時のみ | 効率化 |

---

## 導入方法

### 既存プロジェクトへの導入

1. **バックアップ作成**
   ```bash
   cp .claude/CLAUDE.md .claude/CLAUDE.md.backup-v1.2.x
   ```

2. **新しいCLAUDE.mdを配置**
   - 5個の核心ルールのみを記載

3. **サブエージェントを配置**
   ```bash
   mkdir -p .claude/agents
   # 必要なエージェントをコピー
   ```

4. **詳細ルールを配置**
   ```bash
   mkdir -p .claude/rules
   # 必要なルールファイルをコピー
   ```

5. **動作確認**
   - タスク実行時にサブエージェントが自動起動するか確認

---

## カスタマイズ

### 新しいサブエージェントの追加

1. `.claude/agents/` に新しいエージェントファイルを作成
2. 以下の構成で記述：
   - 責務
   - 自動起動タイミング
   - チェック項目
   - 出力形式（BLOCKER/WARNING/PASS）
   - トリガーキーワード

3. `rule-advisor.md` に起動ロジックを追加

### 新しい詳細ルールの追加

1. `.claude/rules/` に新しいルールファイルを作成
2. 以下の構成で記述：
   - ルールの説明
   - 厳守事項
   - 禁止事項
   - 過去の問題例
   - 対策

3. 対応するサブエージェントから参照

---

## トラブルシューティング

### サブエージェントが起動しない

**原因:**
- トリガーキーワードが検出されていない
- rule-advisorの判定ロジックに該当しない

**対策:**
1. トリガーキーワードを確認
2. 明示的にサブエージェントを呼び出す
3. rule-advisorのロジックを調整

### BLOCKER判定が多すぎる

**原因:**
- 判定基準が厳しすぎる
- 過去の問題例が多すぎる

**対策:**
1. 判定基準を調整（BLOCKER → WARNING）
2. 過去の問題例を見直し
3. ユーザーの作業パターンに合わせて調整

### Main AIがサブエージェントを呼び出さない

**原因:**
- MUST Rule 4を認識していない
- サブエージェント呼び出し義務を忘れている

**対策:**
1. CLAUDE.mdのMUST Rule 4を強調
2. 自動起動メカニズムを強化
3. Git hooks等で強制的に起動

---

## ベストプラクティス

### 1. サブエージェントは自動起動を原則とする

**理由:** Main AIが呼び出しを忘れるリスクを排除

**実装:**
- パターンマッチング
- TodoWrite統合
- Git hooks連携

### 2. 判定基準は明確に

**理由:** 曖昧な判定はMain AIを混乱させる

**実装:**
- BLOCKER: 即座に停止（重大な違反）
- WARNING: ユーザー承認必須（危険な操作）
- PASS: 続行可能（問題なし）

### 3. 過去の問題例を必ず記載

**理由:** 同じ問題を繰り返さないため

**実装:**
- 各ルールファイルに「過去の問題例」セクション
- ユーザーの指摘を引用
- 対策を明記

### 4. トリガーキーワードは網羅的に

**理由:** 検出漏れを防ぐため

**実装:**
- 同義語を全て列挙
- 日本語・英語の両方
- 略語も含める

---

## 今後の拡張

### Phase 6: さらなる専門エージェント

- `security-guardian` - セキュリティチェック
- `performance-guardian` - パフォーマンス最適化
- `documentation-guardian` - ドキュメント整合性

### Phase 7: AI学習機能

- 過去の違反パターンを学習
- ユーザー固有のルールを学習
- 判定精度の向上

### Phase 8: IDE統合

- VSCode拡張機能
- リアルタイムチェック
- コード補完連携

---

## まとめ

この3層階層化ルールシステムは、「ルールが多すぎると守られない」という問題を解決するため、以下の特徴を持ちます：

1. **Main AIの認知負荷を78%削減**（23個 → 5個）
2. **専門サブエージェントによる確実なチェック**
3. **柔軟なパターンマッチングによる自動起動**
4. **詳細ルールは必要時のみ参照**

この設計により、AI開発における品質を確実に守ることができます。

---

**Version: 1.3.0**
**Last Updated: 2025-01-07**
**Author: AI Development Team**
