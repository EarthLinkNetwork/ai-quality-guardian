# PM Orchestrator Enhancement

多段階タスク実行と専門サブエージェントによる開発オーケストレーションシステム

## 概要

PM Orchestrator Enhancementは、複雑な開発タスクを複数の専門サブエージェントに分割し、並列実行・エラーハンドリング・リアルタイム進捗追跡を提供するTypeScriptベースのオーケストレーションシステムです。

## 主要機能

### 1. コア機能
- **ExecutionLogger**: タスク実行ログの記録（JSON形式）
- **MetricsCollector**: メトリクス収集と日次サマリー生成
- **TrendAnalyzer**: メトリクストレンド分析と改善提案
- **PMOrchestrator**: タスク分析・サブエージェント選択・結果集約

### 2. 並行実行
- **ParallelExecutor**: Semaphoreベースの並行実行制御
- 最大並行数の設定
- タイムアウト機能

### 3. エラーハンドリング
- **ErrorHandler**: 自動エラー分類（10+種類）
- **RetryStrategy**: 指数バックオフリトライ
- **RollbackStrategy**: ファイルシステムバックアップ・復元

### 4. 専門サブエージェント（8種類）
- **RuleChecker** (Red): MUST Rules検証
- **CodeAnalyzer** (Purple): コード分析（類似度・品質・アーキテクチャ）
- **Designer** (Purple): 設計書作成
- **Implementer** (Green): 実装実行（ファイル作成・修正・削除）
- **Tester** (Cyan): テスト作成（ユニット・統合・E2E）
- **QA** (Cyan): 品質チェック（lint・test・typecheck・build）
- **CICDEngineer** (Orange): CI/CDパイプライン構築
- **Reporter** (Blue): 統合レポート作成

### 5. リアルタイム可視化
- **ProgressTracker**: 進捗追跡とリスナー機能
- **TerminalUI**: ターミナルUIとプログレスバー表示

## インストール

```bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm build

# テスト実行
pnpm test

# 型チェック
pnpm typecheck
```

## 使用方法

### 基本的な使用例

```typescript
import { PMOrchestrator, ExecutionLogger, ProgressTracker } from 'pm-orchestrator-enhancement';

// 初期化（ログ出力先ディレクトリを指定）
const orchestrator = new PMOrchestrator('/path/to/logs');

// タスク実行
const result = await orchestrator.executeTask({
  userInput: 'Add user authentication feature',
  detectedPattern: 'implementation'
});

console.log(result);
```

### コンポーネントを個別に使用

```typescript
import { ExecutionLogger, ProgressTracker } from 'pm-orchestrator-enhancement';

// ExecutionLogger - タスク実行ログの記録
const logger = new ExecutionLogger('/path/to/logs');
const { taskId } = logger.startTask('user input', 'implementation', 'medium', 'pattern');
logger.completeTask(taskId, { status: 'success' });

// ProgressTracker - 進捗追跡
const tracker = new ProgressTracker();
tracker.startTask('task-1', 'My Task');
tracker.updateProgress('task-1', 50, 'implementer');
tracker.completeTask('task-1');
```

### サブエージェントの直接使用

```typescript
import { RuleChecker, CodeAnalyzer, Designer } from 'pm-orchestrator-enhancement';

// Rule Checker
const ruleChecker = new RuleChecker();
const ruleResult = await ruleChecker.check('implementation', ['src/main.ts'], 'git');

// Code Analyzer
const codeAnalyzer = new CodeAnalyzer();
const analysisResult = await codeAnalyzer.analyze(['src/main.ts'], 'quality');

// Designer
const designer = new Designer();
const designResult = await designer.design(
  'User management system',
  ['Must use TypeScript', 'Must follow SOLID principles']
);
```

### 進捗追跡

```typescript
import { ProgressTracker, TerminalUI } from 'pm-orchestrator-enhancement';

const tracker = new ProgressTracker();
const ui = new TerminalUI();

// リスナー登録
tracker.addListener(progress => {
  ui.displayProgress(progress);
});

// タスク開始
tracker.startTask('task-1', 'Implementation Task');

// 進捗更新
tracker.updateProgress('task-1', 50, 'implementer');

// タスク完了
tracker.completeTask('task-1');

// サマリー表示
ui.displaySummary(tracker.getAllProgress());
```

## アーキテクチャ

```
pm-orchestrator/
├── src/
│   ├── orchestrator/      # PMOrchestrator コア
│   ├── logger/            # 実行ログ
│   ├── metrics/           # メトリクス収集・分析
│   ├── workflow/          # 並行実行
│   ├── error/             # エラーハンドリング
│   ├── subagents/         # 専門サブエージェント（8種類）
│   ├── visualization/     # 進捗追跡・UI
│   └── types/             # 型定義
├── tests/
│   └── unit/              # ユニットテスト（174件）
└── README.md
```

## 型定義

### PMOrchestratorInput

```typescript
interface PMOrchestratorInput {
  taskId: string;
  taskType: string;
  description: string;
  files: string[];
  requirements: string;
  constraints?: string[];
}
```

### PMOrchestratorOutput

```typescript
interface PMOrchestratorOutput {
  status: 'success' | 'partial' | 'error';
  selectedSubagents: string[];
  results: any[];
  summary: string;
  recommendations: string[];
}
```

## テスト

```bash
# 全テスト実行
pnpm test

# カバレッジ付き
pnpm test --coverage

# 特定テストのみ実行
pnpm test -- subagents
```

現在のテストカバレッジ: 174テスト合格

## 開発

### 新しいサブエージェントの追加

1. `src/subagents/` に新しいファイル作成
2. `src/types/subagents.ts` に型定義追加
3. `src/subagents/index.ts` にエクスポート追加
4. `tests/unit/subagents/` にテスト作成

### ビルド

```bash
# TypeScriptビルド
pnpm build

# 型チェックのみ
pnpm typecheck

# Lintとフォーマット
pnpm lint
```

## ライセンス

MIT

## 作者

PM Orchestrator Enhancement Team

## バージョン履歴

- 1.0.0: 初回リリース
  - コア機能実装
  - 8種類のサブエージェント
  - 174テスト合格
