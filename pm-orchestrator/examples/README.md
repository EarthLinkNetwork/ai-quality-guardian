# PM Orchestrator Enhancement - Examples

このディレクトリには、PM Orchestrator Enhancementの使用例が含まれています。

## 📚 使用例一覧

### 1. basic-workflow.ts

**基本的なワークフロー例**

最もシンプルなPM Orchestratorの使用方法を示します。

```bash
pnpm ts-node examples/basic-workflow.ts
```

**学べること:**
- PM Orchestratorの初期化
- タスクの実行
- 結果の取得と表示

---

### 2. parallel-execution.ts

**並列実行の例**

複数のタスクを同時に実行する方法を示します。

```bash
pnpm ts-node examples/parallel-execution.ts
```

**学べること:**
- ParallelExecutorの使用
- 並行数の制御
- タイムアウト設定
- 進捗追跡

---

### 3. error-handling.ts

**エラーハンドリングの例**

リトライ、ロールバック、エラー分類の方法を示します。

```bash
pnpm ts-node examples/error-handling.ts
```

**学べること:**
- ErrorHandlerによるエラー分類
- RetryStrategyによる自動リトライ
- RollbackStrategyによるロールバック
- エラータイプの判定

---

### 4. subagent-usage.ts

**専門サブエージェントの使用例**

各サブエージェントの使い方を示します。

```bash
pnpm ts-node examples/subagent-usage.ts
```

**学べること:**
- RuleChecker: ルール違反のチェック
- CodeAnalyzer: コード品質分析
- Designer: 設計書の作成
- Implementer: ファイル操作
- Tester: テストの作成
- QA: 品質チェック

---

## 🚀 実行方法

### 必要な準備

```bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm build
```

### 個別実行

各例を個別に実行するには:

```bash
# TypeScriptで直接実行（ts-nodeが必要）
pnpm ts-node examples/basic-workflow.ts

# または、ビルド後にJavaScriptで実行
node dist/examples/basic-workflow.js
```

### 全例の実行

全ての例を順番に実行するには:

```bash
pnpm ts-node examples/basic-workflow.ts
pnpm ts-node examples/parallel-execution.ts
pnpm ts-node examples/error-handling.ts
pnpm ts-node examples/subagent-usage.ts
```

---

## 📖 詳細なドキュメント

各例の詳細な説明は、プロジェクトのREADME.mdを参照してください:

- [プロジェクト全体のREADME](../README.md)
- [API リファレンス](../README.md#api-リファレンス)
- [アーキテクチャ](../README.md#アーキテクチャ)

---

## 🔗 関連リソース

- **GitHub**: https://github.com/pm-orchestrator/pm-orchestrator-enhancement
- **Issue Tracker**: https://github.com/pm-orchestrator/pm-orchestrator-enhancement/issues
- **Pull Requests**: https://github.com/pm-orchestrator/pm-orchestrator-enhancement/pulls

---

## 💡 カスタマイズ

各例をベースに、独自のワークフローを作成できます:

```typescript
import { PMOrchestrator } from 'pm-orchestrator-enhancement';

async function myCustomWorkflow() {
  const orchestrator = new PMOrchestrator();

  // あなたのカスタムロジック
  const result = await orchestrator.executeTask({
    userInput: 'My custom task',
    detectedPattern: undefined
  });

  // 結果の処理
  console.log(result);
}
```

---

## 🐛 トラブルシューティング

### ts-nodeが見つからない

```bash
pnpm add -D ts-node
```

### ビルドエラー

```bash
pnpm typecheck
pnpm build
```

### テストエラー

```bash
pnpm test
```

---

**Happy Coding! 🎉**
