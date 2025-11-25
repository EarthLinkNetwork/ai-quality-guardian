# PM Orchestrator Enhancement - ユーザーガイド

PM Orchestrator Enhancementの使用方法を説明します。

## 目次

- [はじめに](#はじめに)
- [インストール](#インストール)
- [基本的な使い方](#基本的な使い方)
- [ワークフロー設定](#ワークフロー設定)
- [トラブルシューティング](#トラブルシューティング)

---

## はじめに

PM Orchestrator Enhancementは、複数のサブエージェントを統合管理し、複雑なタスクを効率的に実行するためのシステムです。

### 主な機能

- **タスク分析**: ユーザー入力を分析し、適切なサブエージェントを自動選択
- **並行実行**: 複数のサブエージェントを同時実行してパフォーマンス向上
- **エラーハンドリング**: 自動リトライ、ロールバック、エスカレーション
- **実行ログ記録**: 全ての実行履歴を記録し、トレンド分析を提供
- **リアルタイム可視化**: 進捗状況をANSI色コードで見やすく表示

### 対象ユーザー

- 開発者
- DevOpsエンジニア
- QAエンジニア
- プロジェクトマネージャー

---

## インストール

### 必要な環境

- Node.js 18以上
- npm または pnpm
- TypeScript 5.0以上

### インストール手順

```bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm build

# テスト実行
pnpm test
```

### グローバルインストール（オプション）

```bash
# CLIをグローバルにインストール
npm install -g .

# 実行
pm-orchestrator "Add user authentication feature"
```

---

## 基本的な使い方

### 1. プログラムから使用する

```typescript
import { PMOrchestrator } from 'pm-orchestrator-enhancement';

async function main() {
  const orchestrator = new PMOrchestrator();

  const result = await orchestrator.executeTask({
    userInput: 'Add user authentication feature',
    detectedPattern: undefined
  });

  console.log(`Status: ${result.status}`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Next Steps:`, result.nextSteps);
}

main();
```

### 2. CLIから使用する

```bash
# 基本的な実行
pm-orchestrator "Add user authentication feature"

# ヘルプ表示
pm-orchestrator --help

# バージョン表示
pm-orchestrator --version

# 例: PRレビュー対応
pm-orchestrator "Resolve PR review comments"

# 例: バージョン更新
pm-orchestrator "Update version from 1.2.0 to 1.3.0"

# 例: 品質チェック
pm-orchestrator "Run all quality checks and fix errors"
```

### 3. タスクパターンの自動検出

PM Orchestratorは以下のパターンを自動検出します：

| パターン | 説明 | 例 |
|---------|------|-----|
| PR_REVIEW_RESPONSE | PRレビュー対応 | "Resolve PR comments" |
| VERSION_UPDATE | バージョン更新 | "Update to v1.3.0" |
| LIST_MODIFICATION | 一覧修正 | "Update all version numbers" |
| QUALITY_CHECK | 品質チェック | "Run lint, test, build" |
| COMPLEX_IMPLEMENTATION | 複雑な実装 | "Add authentication system" |

---

## ワークフロー設定

### ワークフロー設定ファイル

`.pm-orchestrator/workflows.yml`:

```yaml
workflows:
  - name: "PR Review Response"
    pattern: "pr_review_response"
    subagents:
      - rule-checker
      - implementer
      - qa
      - reporter
    options:
      parallel: false
      timeout: 3600000  # 1時間

  - name: "Quality Check"
    pattern: "quality_check"
    subagents:
      - qa
      - reporter
    options:
      parallel: true
      timeout: 600000  # 10分
```

### カスタムワークフローの作成

1. `.pm-orchestrator/workflows.yml`ファイルを作成
2. ワークフロー定義を追加
3. PM Orchestratorが自動的に読み込み

**例: カスタムワークフロー**

```yaml
workflows:
  - name: "Custom Feature Development"
    pattern: "feature_dev"
    subagents:
      - rule-checker
      - designer
      - implementer
      - tester
      - qa
      - reporter
    options:
      parallel: false
      timeout: 7200000  # 2時間
      retryOnError: true
      rollbackOnFailure: true
```

### ワークフロー実行オプション

- `parallel`: サブエージェントを並行実行（デフォルト: false）
- `timeout`: タイムアウト時間（ミリ秒）
- `retryOnError`: エラー時に自動リトライ（デフォルト: true）
- `rollbackOnFailure`: 失敗時にロールバック（デフォルト: false）

---

## トラブルシューティング

### 問題1: タスクが完了しない

**症状**: タスクがずっと実行中のまま進まない

**原因**:
- タイムアウト時間が短すぎる
- サブエージェントがエラーで停止している

**解決方法**:
```typescript
// タイムアウトを延長
const orchestrator = new PMOrchestrator();
orchestrator.setTimeout(3600000); // 1時間

// エラーログを確認
const log = await orchestrator.getExecutionLog(taskId);
console.log(log.errors);
```

### 問題2: サブエージェントが起動しない

**症状**: PM Orchestratorは起動するが、サブエージェントが実行されない

**原因**:
- Task toolが正しく設定されていない
- サブエージェント定義ファイルが見つからない

**解決方法**:
```bash
# サブエージェント定義ファイルの確認
ls .claude/agents/

# 必要なファイル:
# - pm-orchestrator.md
# - rule-checker.md
# - implementer.md
# - qa.md
# - reporter.md
# (その他のサブエージェント)
```

### 問題3: エラーハンドリングが動作しない

**症状**: エラーが発生してもリトライやロールバックが実行されない

**原因**:
- エラータイプが正しく分類されていない
- リトライ・ロールバック設定が無効

**解決方法**:
```typescript
import { ErrorHandler, RetryStrategy, RollbackStrategy } from 'pm-orchestrator-enhancement';

const errorHandler = new ErrorHandler();
const retryStrategy = new RetryStrategy(3, 1000); // 3回リトライ、1秒間隔
const rollbackStrategy = new RollbackStrategy('/backup');

// エラータイプを確認
const errorType = errorHandler.classifyError(error);
console.log(`Error Type: ${errorType}`);
console.log(`Retryable: ${errorHandler.isRetryable(errorType)}`);
console.log(`Needs Rollback: ${errorHandler.needsRollback(errorType)}`);
```

### 問題4: 実行ログが記録されない

**症状**: タスク実行後、ログファイルが作成されない

**原因**:
- ログディレクトリが存在しない
- 書き込み権限がない

**解決方法**:
```bash
# ログディレクトリを作成
mkdir -p .pm-orchestrator/logs

# 権限を確認
ls -la .pm-orchestrator/

# 権限を修正
chmod 755 .pm-orchestrator/
chmod 644 .pm-orchestrator/logs/*
```

### 問題5: メトリクスが正しく表示されない

**症状**: トレンド分析やメトリクスが0または空

**原因**:
- 実行履歴が不足している
- メトリクス集計期間が短すぎる

**解決方法**:
```typescript
import { TrendAnalyzer } from 'pm-orchestrator-enhancement';

const analyzer = new TrendAnalyzer('.pm-orchestrator/logs');

// 週次トレンドを分析（最低7日分の実行履歴が必要）
const trends = await analyzer.analyzeTrends(7);
console.log(trends);

// 日次サマリーを確認
const summaries = await analyzer.getDailySummaries(7);
summaries.forEach(summary => {
  console.log(`Date: ${summary.date}, Success Rate: ${summary.successRate}%`);
});
```

---

## よくある質問

### Q1: どのタスクでPM Orchestratorを使うべきですか？

**A**: 以下のようなタスクに最適です：
- 複数のステップを含む複雑なタスク
- PRレビュー対応
- バージョン更新
- 一括修正作業
- 品質チェック・検証タスク

単純な質問や1ファイルの小規模修正には不要です。

### Q2: サブエージェントの実行順序は変更できますか？

**A**: はい、ワークフロー設定ファイルで定義できます。

```yaml
workflows:
  - name: "Custom Order"
    pattern: "custom"
    subagents:
      - rule-checker   # 1番目
      - designer       # 2番目
      - implementer    # 3番目
      - qa             # 4番目
      - reporter       # 5番目（最後）
    options:
      parallel: false  # 順番に実行
```

### Q3: 並行実行の同時実行数は制御できますか？

**A**: はい、Semaphoreクラスで制御できます。

```typescript
import { ParallelExecutor } from 'pm-orchestrator-enhancement';

// 最大3並列
const executor = new ParallelExecutor(3);

executor.addTask('task-1', async () => { /* ... */ });
executor.addTask('task-2', async () => { /* ... */ });
executor.addTask('task-3', async () => { /* ... */ });
executor.addTask('task-4', async () => { /* ... */ }); // 3つ完了するまで待機

await executor.waitAll();
```

### Q4: カスタムサブエージェントを追加できますか？

**A**: はい、可能です。詳細は[開発者ガイド](./developer-guide.md)を参照してください。

### Q5: 実行ログはどのくらい保存されますか？

**A**: デフォルトでは無期限に保存されます。定期的にクリーンアップすることを推奨します。

```bash
# 30日以上前のログを削除
find .pm-orchestrator/logs -name "*.json" -mtime +30 -delete
```

---

## サポート

問題が解決しない場合は、以下をご確認ください：

1. **実行ログの確認**: `.pm-orchestrator/logs/`
2. **エラーログの確認**: `console.error`の出力
3. **GitHub Issues**: https://github.com/pm-orchestrator/pm-orchestrator-enhancement/issues

---

## 次のステップ

- [開発者ガイド](./developer-guide.md) - カスタマイズ方法
- [API リファレンス](./api-reference.md) - 詳細なAPI仕様
- [Examples](../examples/README.md) - サンプルコード
