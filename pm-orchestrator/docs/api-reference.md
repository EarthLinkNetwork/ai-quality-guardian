# PM Orchestrator Enhancement - API Reference

完全なAPIリファレンスドキュメント

## 目次

- [PMOrchestrator](#pmorchestrator)
- [Subagents](#subagents)
  - [RuleChecker](#rulechecker)
  - [CodeAnalyzer](#codeanalyzer)
  - [Designer](#designer)
  - [Implementer](#implementer)
  - [Tester](#tester)
  - [QA](#qa)
  - [CICDEngineer](#cicdengineer)
  - [Reporter](#reporter)
- [Workflow](#workflow)
  - [ParallelExecutor](#parallelexecutor)
- [Error Handling](#error-handling)
  - [ErrorHandler](#errorhandler)
  - [RetryStrategy](#retrystrategy)
  - [RollbackStrategy](#rollbackstrategy)
- [Logger](#logger)
  - [ExecutionLogger](#executionlogger)
- [Metrics](#metrics)
  - [MetricsCollector](#metricscollector)
  - [TrendAnalyzer](#trendanalyzer)
- [Visualization](#visualization)
  - [ProgressTracker](#progresstracker)
  - [TerminalUI](#terminalui)

---

## PMOrchestrator

タスク分析、サブエージェント起動、結果集約を担当するコアクラス。

### コンストラクタ

```typescript
constructor(baseDir: string = process.cwd())
```

**パラメータ:**
- `baseDir` (optional): ベースディレクトリ（デフォルト: カレントディレクトリ）

### メソッド

#### executeTask

タスクを実行します。

```typescript
async executeTask(input: PMOrchestratorInput): Promise<PMOrchestratorOutput>
```

**パラメータ:**
- `input`: PMOrchestratorInput
  - `userInput` (string): ユーザーからの入力
  - `detectedPattern` (string | undefined): 検出されたパターン

**戻り値:**
- `PMOrchestratorOutput`
  - `taskId` (string): タスクID
  - `status` ('success' | 'error' | 'partial'): ステータス
  - `subagentResults` (SubagentResult[]): サブエージェント実行結果
  - `executionLog` (ExecutionLog): 実行ログ
  - `summary` (string): サマリー
  - `nextSteps` (string[]): 次のステップ

**例:**

```typescript
const orchestrator = new PMOrchestrator();

const result = await orchestrator.executeTask({
  userInput: 'Add user authentication feature',
  detectedPattern: undefined
});

console.log(result.status);        // 'success'
console.log(result.summary);       // タスクのサマリー
console.log(result.nextSteps);     // ['Deploy to staging', ...]
```

---

## Subagents

### RuleChecker

MUST Rulesの違反を検出します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### check

ルールチェックを実行します。

```typescript
async check(
  taskType: string,
  files: string[],
  operation: 'git' | 'file' | 'api'
): Promise<RuleCheckerOutput>
```

**パラメータ:**
- `taskType`: タスクタイプ（'implementation', 'design'等）
- `files`: チェック対象ファイル
- `operation`: 操作タイプ（'git', 'file', 'api'）

**戻り値:**
- `RuleCheckerOutput`
  - `status` ('pass' | 'fail'): ステータス
  - `violations` (RuleViolation[]): ルール違反リスト
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const ruleChecker = new RuleChecker();

const result = await ruleChecker.check(
  'implementation',
  ['src/auth/login.ts'],
  'git'
);

if (result.status === 'fail') {
  result.violations.forEach(v => {
    console.log(`${v.rule}: ${v.message} (${v.severity})`);
  });
}
```

---

### CodeAnalyzer

コード品質、類似度、アーキテクチャを分析します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### analyze

コード分析を実行します。

```typescript
async analyze(
  files: string[],
  analysisType: 'similarity' | 'quality' | 'architecture',
  context?: string
): Promise<CodeAnalyzerOutput>
```

**パラメータ:**
- `files`: 分析対象ファイル
- `analysisType`: 分析タイプ
  - `'similarity'`: コード類似度分析
  - `'quality'`: コード品質分析
  - `'architecture'`: アーキテクチャ分析
- `context` (optional): 分析コンテキスト

**戻り値:**
- `CodeAnalyzerOutput`
  - `status` ('completed' | 'error'): ステータス
  - `findings` (Finding[]): 発見事項
  - `metrics` (CodeMetrics): メトリクス
    - `linesOfCode` (number): コード行数
    - `complexity` (number): 複雑度
    - `duplications` (number): 重複コード数
    - `qualityScore` (number): 品質スコア（0-100）
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const codeAnalyzer = new CodeAnalyzer();

const result = await codeAnalyzer.analyze(
  ['src/auth/login.ts', 'src/auth/register.ts'],
  'quality'
);

console.log(`Quality Score: ${result.metrics.qualityScore}`);
console.log(`Complexity: ${result.metrics.complexity}`);
```

---

### Designer

設計書を作成します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### design

設計書を作成します。

```typescript
async design(
  requirements: string,
  constraints: string[]
): Promise<DesignerOutput>
```

**パラメータ:**
- `requirements`: 要件（自然言語）
- `constraints`: 制約条件

**戻り値:**
- `DesignerOutput`
  - `status` ('completed' | 'error'): ステータス
  - `architecture` (ArchitectureDesign): アーキテクチャ設計
    - `pattern` (string): アーキテクチャパターン
    - `layers` (Layer[]): レイヤー定義
  - `components` (Component[]): コンポーネント定義
  - `dataModels` (DataModel[]): データモデル定義
  - `dependencies` (Dependency[]): 依存関係
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const designer = new Designer();

const result = await designer.design(
  'User authentication system with JWT tokens',
  ['Must use TypeScript', 'Must follow SOLID principles']
);

console.log(`Architecture: ${result.architecture.pattern}`);
console.log(`Components: ${result.components.length}`);
```

---

### Implementer

ファイルの作成、修正、削除を実行します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### implement

実装を実行します。

```typescript
async implement(
  design: string,
  files: FileOperation[],
  tests: boolean
): Promise<ImplementerOutput>
```

**パラメータ:**
- `design`: 設計書
- `files`: ファイル操作リスト
  - `path` (string): ファイルパス
  - `operation` ('create' | 'modify' | 'delete'): 操作タイプ
  - `content` (string | undefined): ファイル内容
- `tests`: テストを含めるか

**戻り値:**
- `ImplementerOutput`
  - `status` ('success' | 'error'): ステータス
  - `filesCreated` (string[]): 作成されたファイル
  - `filesModified` (string[]): 修正されたファイル
  - `filesDeleted` (string[]): 削除されたファイル
  - `linesAdded` (number): 追加行数
  - `linesDeleted` (number): 削除行数
  - `autoFixApplied` (boolean): 自動修正適用
  - `errors` (string[] | undefined): エラーリスト

**例:**

```typescript
const implementer = new Implementer();

const result = await implementer.implement(
  'Create authentication module',
  [
    {
      path: 'src/auth/index.ts',
      operation: 'create',
      content: 'export * from "./login";'
    }
  ],
  true
);

console.log(`Files Created: ${result.filesCreated.length}`);
console.log(`Lines Added: ${result.linesAdded}`);
```

---

### Tester

テストを作成します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### createTests

テストを作成します。

```typescript
async createTests(
  files: string[],
  testType: 'unit' | 'integration' | 'e2e',
  coverage: number
): Promise<TesterOutput>
```

**パラメータ:**
- `files`: テスト対象ファイル
- `testType`: テストタイプ
  - `'unit'`: ユニットテスト
  - `'integration'`: 統合テスト
  - `'e2e'`: E2Eテスト
- `coverage`: 目標カバレッジ（0-100）

**戻り値:**
- `TesterOutput`
  - `status` ('completed' | 'error'): ステータス
  - `testsCreated` (number): 作成されたテスト数
  - `testFiles` (string[]): テストファイルリスト
  - `coverage` (number): 達成カバレッジ
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const tester = new Tester();

const result = await tester.createTests(
  ['src/auth/login.ts'],
  'unit',
  80
);

console.log(`Tests Created: ${result.testsCreated}`);
console.log(`Coverage: ${result.coverage}%`);
```

---

### QA

品質チェックを実行します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### check

品質チェックを実行します。

```typescript
async check(
  files: string[],
  checks: ('lint' | 'test' | 'typecheck' | 'build')[]
): Promise<QAOutput>
```

**パラメータ:**
- `files`: チェック対象ファイル
- `checks`: チェックタイプ
  - `'lint'`: Lintチェック
  - `'test'`: テスト実行
  - `'typecheck'`: 型チェック
  - `'build'`: ビルドチェック

**戻り値:**
- `QAOutput`
  - `status` ('pass' | 'fail'): ステータス
  - `lint` (CheckResult): Lint結果
  - `test` (CheckResult): テスト結果
  - `typecheck` (CheckResult): 型チェック結果
  - `build` (CheckResult): ビルド結果
  - `qualityScore` (number): 品質スコア（0-100）

各CheckResultの型：
- `passed` (boolean): 合格/不合格
- `errors` (number): エラー数
- `warnings` (number): 警告数
- `coverage` (number | undefined): カバレッジ（testのみ）

**例:**

```typescript
const qa = new QA();

const result = await qa.check(
  ['src/auth/login.ts'],
  ['lint', 'test', 'typecheck', 'build']
);

console.log(`Quality Score: ${result.qualityScore}`);
console.log(`Lint: ${result.lint.passed ? '✓' : '✗'}`);
console.log(`Test: ${result.test.passed ? '✓' : '✗'} (${result.test.coverage}%)`);
```

---

### CICDEngineer

CI/CDパイプラインを構築します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### buildPipeline

CI/CDパイプラインを構築します。

```typescript
async buildPipeline(
  platform: 'github' | 'gitlab' | 'jenkins',
  config: PipelineConfig
): Promise<CICDEngineerOutput>
```

**パラメータ:**
- `platform`: CI/CDプラットフォーム
  - `'github'`: GitHub Actions
  - `'gitlab'`: GitLab CI
  - `'jenkins'`: Jenkins
- `config`: パイプライン設定
  - `stages` (string[]): ステージリスト
  - `environment` (string): 環境名
  - `triggers` (string[]): トリガー条件

**戻り値:**
- `CICDEngineerOutput`
  - `status` ('completed' | 'error'): ステータス
  - `pipelineFile` (string): パイプラインファイル名
  - `pipelineContent` (string): パイプライン定義
  - `stages` (Stage[]): ステージ定義
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const cicdEngineer = new CICDEngineer();

const result = await cicdEngineer.buildPipeline(
  'github',
  {
    stages: ['build', 'test', 'deploy'],
    environment: 'production',
    triggers: ['push', 'pull_request']
  }
);

console.log(`Pipeline File: ${result.pipelineFile}`);
console.log(`Stages: ${result.stages.length}`);
```

---

### Reporter

実行結果を統合レポートにまとめます。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### createReport

統合レポートを作成します。

```typescript
async createReport(
  subagentResults: any[],
  executionLog: any
): Promise<ReporterOutput>
```

**パラメータ:**
- `subagentResults`: サブエージェント実行結果
- `executionLog`: 実行ログ

**戻り値:**
- `ReporterOutput`
  - `status` ('success' | 'warning' | 'error'): ステータス
  - `title` (string): レポートタイトル
  - `summary` (string): サマリー
  - `details` (Record<string, any>): 詳細情報
  - `nextSteps` (string[]): 次のステップ
  - `userFriendlyMessage` (string): ユーザー向けメッセージ

**例:**

```typescript
const reporter = new Reporter();

const result = await reporter.createReport(
  [ruleCheckerResult, implementerResult, qaResult],
  executionLog
);

console.log(result.title);
console.log(result.summary);
console.log(result.userFriendlyMessage);
```

---

## Workflow

### ParallelExecutor

タスクを並列実行します。

#### コンストラクタ

```typescript
constructor(maxConcurrent: number = 5)
```

**パラメータ:**
- `maxConcurrent`: 最大並列数（デフォルト: 5）

#### メソッド

##### addTask

タスクを追加します。

```typescript
addTask(
  id: string,
  task: () => Promise<any>,
  timeout?: number
): void
```

**パラメータ:**
- `id`: タスクID
- `task`: タスク関数
- `timeout` (optional): タイムアウト（ミリ秒）

##### waitAll

全タスクの完了を待ちます。

```typescript
async waitAll(): Promise<PromiseSettledResult<any>[]>
```

**戻り値:**
- `PromiseSettledResult[]`: 各タスクの結果

**例:**

```typescript
const executor = new ParallelExecutor(3);

executor.addTask('task-1', async () => {
  // タスク1の処理
  return { result: 'success' };
}, 5000);

executor.addTask('task-2', async () => {
  // タスク2の処理
  return { result: 'success' };
});

const results = await executor.waitAll();

results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`Task ${index + 1}: ${result.value.result}`);
  } else {
    console.log(`Task ${index + 1}: ${result.reason}`);
  }
});
```

---

## Error Handling

### ErrorHandler

エラーを分類し、処理方針を決定します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### classifyError

エラーを分類します。

```typescript
classifyError(error: Error): ErrorType
```

**パラメータ:**
- `error`: エラーオブジェクト

**戻り値:**
- `ErrorType`: エラータイプ
  - `NETWORK_ERROR`: ネットワークエラー（リトライ可能）
  - `TIMEOUT`: タイムアウト（リトライ可能）
  - `TEMPORARY_FAILURE`: 一時的な失敗（リトライ可能）
  - `LINT_ERROR`: Lintエラー（自動修正可能）
  - `FORMAT_ERROR`: フォーマットエラー（自動修正可能）
  - `TEST_FAILURE`: テスト失敗（ロールバック必要）
  - `BUILD_FAILURE`: ビルド失敗（ロールバック必要）
  - `RULE_VIOLATION`: ルール違反（ユーザー介入必要）
  - `DESIGN_MISMATCH`: 設計不一致（ユーザー介入必要）
  - `DEPENDENCY_ERROR`: 依存関係エラー（ユーザー介入必要）
  - `UNKNOWN`: 不明なエラー

##### isRetryable

リトライ可能か判定します。

```typescript
isRetryable(errorType: ErrorType): boolean
```

##### isAutoFixable

自動修正可能か判定します。

```typescript
isAutoFixable(errorType: ErrorType): boolean
```

##### needsRollback

ロールバックが必要か判定します。

```typescript
needsRollback(errorType: ErrorType): boolean
```

**例:**

```typescript
const errorHandler = new ErrorHandler();

try {
  // 何か処理
} catch (error) {
  const errorType = errorHandler.classifyError(error as Error);

  if (errorHandler.isRetryable(errorType)) {
    // リトライ
  } else if (errorHandler.isAutoFixable(errorType)) {
    // 自動修正
  } else if (errorHandler.needsRollback(errorType)) {
    // ロールバック
  } else {
    // ユーザー介入
  }
}
```

---

### RetryStrategy

指数バックオフでリトライします。

#### コンストラクタ

```typescript
constructor(maxRetries: number = 3, baseDelay: number = 1000)
```

**パラメータ:**
- `maxRetries`: 最大リトライ回数（デフォルト: 3）
- `baseDelay`: 基本遅延時間（ミリ秒、デフォルト: 1000）

#### メソッド

##### execute

リトライしながら処理を実行します。

```typescript
async execute<T>(fn: () => Promise<T>): Promise<T>
```

**パラメータ:**
- `fn`: 実行する関数

**戻り値:**
- 関数の戻り値

**例:**

```typescript
const retryStrategy = new RetryStrategy(3, 1000);

const result = await retryStrategy.execute(async () => {
  // 不安定な処理
  const response = await fetch('https://api.example.com/data');
  return response.json();
});
```

---

### RollbackStrategy

ファイルをバックアップし、ロールバックします。

#### コンストラクタ

```typescript
constructor(backupDir: string)
```

**パラメータ:**
- `backupDir`: バックアップディレクトリ

#### メソッド

##### backup

ファイルをバックアップします。

```typescript
async backup(filePath: string): Promise<void>
```

##### rollback

ファイルをロールバックします。

```typescript
async rollback(filePath: string): Promise<void>
```

**例:**

```typescript
const rollbackStrategy = new RollbackStrategy('/tmp/backup');

try {
  // バックアップ
  await rollbackStrategy.backup('src/auth/login.ts');

  // 何か変更
  // ...

  // エラーが発生
  throw new Error('Something went wrong');
} catch (error) {
  // ロールバック
  await rollbackStrategy.rollback('src/auth/login.ts');
}
```

---

## Logger

### ExecutionLogger

タスク実行ログを記録します。

#### コンストラクタ

```typescript
constructor(logDir: string)
```

**パラメータ:**
- `logDir`: ログディレクトリ

#### メソッド

##### startTask

タスクを開始します。

```typescript
startTask(
  userInput: string,
  taskType: string,
  complexity: string,
  detectedPattern: string
): { taskId: string; startTime: string }
```

##### completeTask

タスクを完了します。

```typescript
completeTask(
  taskId: string,
  status: 'success' | 'error' | 'rollback',
  subagents: SubagentExecution[]
): void
```

##### addError

エラーを記録します。

```typescript
addError(taskId: string, error: ErrorLog): void
```

**例:**

```typescript
const logger = new ExecutionLogger('./logs');

const { taskId } = logger.startTask(
  'Add authentication',
  'implementation',
  'medium',
  'none'
);

// 処理

logger.completeTask(taskId, 'success', subagentResults);
```

---

## Metrics

### MetricsCollector

メトリクスを収集します。

#### コンストラクタ

```typescript
constructor(metricsDir: string)
```

#### メソッド

##### collect

メトリクスを収集します。

```typescript
async collect(executionLog: ExecutionLog): Promise<void>
```

##### getDailySummary

日次サマリーを取得します。

```typescript
async getDailySummary(date: string): Promise<DailySummary | null>
```

**例:**

```typescript
const metricsCollector = new MetricsCollector('./metrics');

await metricsCollector.collect(executionLog);

const summary = await metricsCollector.getDailySummary('2025-01-01');
console.log(`Tasks: ${summary.totalTasks}`);
console.log(`Success Rate: ${summary.successRate}%`);
```

---

### TrendAnalyzer

メトリクストレンドを分析します。

#### コンストラクタ

```typescript
constructor(metricsDir: string)
```

#### メソッド

##### analyze

トレンドを分析します。

```typescript
async analyze(days: number): Promise<TrendAnalysis>
```

**パラメータ:**
- `days`: 分析対象日数

**戻り値:**
- `TrendAnalysis`
  - `period` (string): 期間
  - `totalTasks` (number): 総タスク数
  - `avgSuccessRate` (number): 平均成功率
  - `avgDuration` (number): 平均実行時間
  - `mostUsedSubagents` (string[]): 最も使用されたサブエージェント
  - `recommendations` (string[]): 推奨事項

**例:**

```typescript
const trendAnalyzer = new TrendAnalyzer('./metrics');

const trend = await trendAnalyzer.analyze(7);

console.log(`Period: ${trend.period}`);
console.log(`Avg Success Rate: ${trend.avgSuccessRate}%`);
console.log(`Avg Duration: ${trend.avgDuration}ms`);
```

---

## Visualization

### ProgressTracker

タスクの進捗を追跡します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### startTask

タスクを開始します。

```typescript
startTask(taskId: string, taskName: string): void
```

##### updateProgress

進捗を更新します。

```typescript
updateProgress(taskId: string, progress: number, currentSubagent?: string): void
```

##### completeTask

タスクを完了します。

```typescript
completeTask(taskId: string): void
```

##### failTask

タスクを失敗にします。

```typescript
failTask(taskId: string): void
```

##### addListener

リスナーを追加します。

```typescript
addListener(listener: (progress: TaskProgress) => void): void
```

##### getProgress

進捗を取得します。

```typescript
getProgress(taskId: string): TaskProgress | undefined
```

##### getAllProgress

全進捗を取得します。

```typescript
getAllProgress(): TaskProgress[]
```

**例:**

```typescript
const tracker = new ProgressTracker();

tracker.addListener(progress => {
  console.log(`${progress.taskName}: ${progress.progress}%`);
});

tracker.startTask('task-1', 'Build Application');
tracker.updateProgress('task-1', 50, 'implementer');
tracker.completeTask('task-1');
```

---

### TerminalUI

ターミナルUIを表示します。

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### displayProgress

進捗を表示します。

```typescript
displayProgress(progress: TaskProgress): void
```

##### displaySummary

サマリーを表示します。

```typescript
displaySummary(allProgress: TaskProgress[]): void
```

**例:**

```typescript
const ui = new TerminalUI();
const tracker = new ProgressTracker();

tracker.addListener(progress => {
  ui.displayProgress(progress);
});

// タスク実行

ui.displaySummary(tracker.getAllProgress());
```

---

## 型定義

詳細な型定義については、以下のファイルを参照してください：

- `src/types/core.ts`: コア型定義
- `src/types/subagents.ts`: サブエージェント型定義

---

**最終更新: 2025-01-25**
