# Design Document

## Overview

PM Orchestrator Enhancement は、既存のPM Orchestratorシステムに、ai-coding-project-boilerplateプロジェクトで実装されている優れたマルチエージェント並行実行パターンを統合し、より効果的で可視化された開発環境を実現するシステムです。

### 設計目標

1. **並行実行の実現**: 独立したサブエージェントを並行実行し、開発効率を向上
2. **リアルタイム可視化**: 各サブエージェントの実行状況をリアルタイムで表示
3. **拡張可能性**: 新しいサブエージェントを容易に追加できる設計
4. **統一通信**: 全サブエージェント間で統一されたJSON通信プロトコル
5. **品質保証**: 自動品質チェックとエラーハンドリング
6. **参照実装の統合**: 実証済みのパターンを取り込む

### 参照実装からの学び

ai-coding-project-boilerplateの実装から以下のパターンを採用：

- **並行実行パターン**: 独立したサブエージェントの同時実行
- **色分け表示**: 各サブエージェントを色で識別
- **ツール呼び出し可視化**: Read、List、Bash等の実行を表示
- **進捗表示**: リアルタイムで実行状況を更新
- **専門化されたエージェント**: code-analyzer、procurement-validator等の専門エージェント

## Architecture

### システム全体構造

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              UserPromptSubmit Hook                           │
│  - パターン検出（CODERABBIT_RESOLVE等）                      │
│  - system-reminderに起動指示を表示                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Main AI                                 │
│  1. system-reminderを受信                                    │
│  2. Task toolでpm-orchestratorを起動                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            🎯 PM Orchestrator (Yellow)                       │
│  - タスク分析（複雑度判定）                                  │
│  - サブエージェント選択                                      │
│  - 実行戦略決定（並行/直列）                                 │
│  - ExecutionLogger初期化                                     │
└─────────────────────────────────────────────────────────────┘
         ↓              ↓              ↓              ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 🔴 Rule      │ │ 🟣 Code      │ │ 🟢 Implementer│ │ 🔵 Tester    │
│   Checker    │ │   Analyzer   │ │              │ │              │
│   (Red)      │ │   (Purple)   │ │   (Green)    │ │   (Cyan)     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         ↓              ↓              ↓              ↓
    ルールチェック   コード分析      実装実行       テスト作成
         ↓              ↓              ↓              ↓
┌─────────────────────────────────────────────────────────────┐
│                   🔵 Reporter (Blue)                         │
│  - 全サブエージェントの結果を統合                            │
│  - JSON形式でPM Orchestratorに返却                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Main AI                                   │
│  - Reporterの結果を受信                                      │
│  - ユーザーに分かりやすく報告                                │
└─────────────────────────────────────────────────────────────┘
```


### Hub-and-Spoke Architecture

PM Orchestratorを中心（Hub）とし、各サブエージェントを周辺（Spoke）とする設計：

**利点**:
- 全通信がPMを経由するため、状態管理が容易
- サブエージェント間の依存関係を明確化
- エラーハンドリングを一元管理
- 実行ログを統一的に記録

**制約**:
- サブエージェント同士の直接通信は禁止
- 全結果はPMに返却
- PMが実行順序を制御

## Components and Interfaces

### 1. PM Orchestrator (Hub)

**責務**:
- タスク分析と複雑度判定
- サブエージェント選択と実行戦略決定
- ExecutionLoggerの初期化と管理
- サブエージェント起動と結果集約
- エラーハンドリングとリトライ制御

**インターフェース**:

```typescript
interface PMOrchestratorInput {
  userInput: string;
  detectedPattern?: string;
  context?: Record<string, any>;
}

interface PMOrchestratorOutput {
  taskId: string;
  status: 'success' | 'error' | 'partial';
  subagentResults: SubagentResult[];
  executionLog: ExecutionLog;
  summary: string;
  nextSteps: string[];
}

interface SubagentResult {
  name: string;
  status: 'success' | 'error' | 'warning';
  duration: number;
  output: any;
  error?: string;
}
```

### 2. Core Subagents

#### 2.1 Rule Checker (Red)

**責務**: MUST Rules検証

**カラーコード**: `\033[31m` (Red)

**インターフェース**:

```typescript
interface RuleCheckerInput {
  taskType: string;
  files: string[];
  operation: 'git' | 'file' | 'api';
}

interface RuleCheckerOutput {
  status: 'pass' | 'fail';
  violations: RuleViolation[];
  recommendations: string[];
}

interface RuleViolation {
  ruleNumber: number;
  ruleName: string;
  severity: 'critical' | 'warning';
  description: string;
  location?: string;
}
```

#### 2.2 Code Analyzer (Purple)

**責務**: コード分析・問題診断

**カラーコード**: `\033[35m` (Purple)

**インターフェース**:

```typescript
interface CodeAnalyzerInput {
  files: string[];
  analysisType: 'similarity' | 'quality' | 'architecture';
  context?: string;
}

interface CodeAnalyzerOutput {
  status: 'completed';
  findings: Finding[];
  metrics: CodeMetrics;
  recommendations: string[];
}

interface Finding {
  type: 'duplicate' | 'smell' | 'violation';
  severity: 'high' | 'medium' | 'low';
  location: string;
  description: string;
  suggestion?: string;
}

interface CodeMetrics {
  complexity: number;
  maintainability: number;
  testCoverage: number;
}
```

#### 2.3 Designer (Purple)

**責務**: 技術設計・アーキテクチャ計画

**カラーコード**: `\033[35m` (Purple)

**インターフェース**:

```typescript
interface DesignerInput {
  requirements: string;
  constraints: string[];
  existingArchitecture?: string;
}

interface DesignerOutput {
  status: 'completed';
  designDoc: string;
  architecture: ArchitectureDesign;
  components: ComponentDesign[];
  dataModels: DataModel[];
}

interface ArchitectureDesign {
  pattern: string;
  layers: Layer[];
  dependencies: Dependency[];
}
```


#### 2.4 Implementer (Green)

**責務**: コード実装

**カラーコード**: `\033[32m` (Green)

**インターフェース**:

```typescript
interface ImplementerInput {
  design: string;
  files: FileOperation[];
  tests: boolean;
}

interface ImplementerOutput {
  status: 'success' | 'error';
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  linesAdded: number;
  linesDeleted: number;
  autoFixApplied: boolean;
  errors?: string[];
}

interface FileOperation {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  content?: string;
}
```

#### 2.5 Tester (Cyan)

**責務**: テストケース作成

**カラーコード**: `\033[36m` (Cyan)

**インターフェース**:

```typescript
interface TesterInput {
  implementation: string;
  testType: 'unit' | 'integration' | 'e2e';
  coverage: number;
}

interface TesterOutput {
  status: 'completed';
  testsCreated: string[];
  testCases: TestCase[];
  coverage: number;
}

interface TestCase {
  name: string;
  type: string;
  file: string;
  assertions: number;
}
```

#### 2.6 QA (Cyan)

**責務**: 品質チェック実行

**カラーコード**: `\033[36m` (Cyan)

**インターフェース**:

```typescript
interface QAInput {
  files: string[];
  checks: ('lint' | 'test' | 'typecheck' | 'build')[];
}

interface QAOutput {
  status: 'pass' | 'fail';
  lint: CheckResult;
  test: CheckResult;
  typecheck: CheckResult;
  build: CheckResult;
  qualityScore: number;
}

interface CheckResult {
  passed: boolean;
  errors: number;
  warnings: number;
  details: string[];
}
```

#### 2.7 CICD Engineer (Orange)

**責務**: CI/CDパイプライン設定

**カラーコード**: `\033[33m` (Orange)

**インターフェース**:

```typescript
interface CICDEngineerInput {
  platform: 'github' | 'gitlab' | 'jenkins';
  pipeline: PipelineConfig;
}

interface CICDEngineerOutput {
  status: 'completed';
  configFiles: string[];
  workflows: Workflow[];
  validationResult: ValidationResult;
}

interface PipelineConfig {
  stages: Stage[];
  triggers: Trigger[];
  environment: Record<string, string>;
}
```

#### 2.8 Reporter (Blue)

**責務**: 結果統合・報告

**カラーコード**: `\033[34m` (Blue)

**インターフェース**:

```typescript
interface ReporterInput {
  subagentResults: SubagentResult[];
  executionLog: ExecutionLog;
}

interface ReporterOutput {
  status: 'success' | 'warning' | 'error';
  title: string;
  summary: string;
  details: ReportDetails;
  nextSteps: string[];
  userFriendlyMessage: string;
}

interface ReportDetails {
  taskOverview: string;
  executedSteps: string[];
  changes: string[];
  verification: string[];
  warnings: string[];
  errors: string[];
}
```

### 3. Supporting Components

#### 3.1 ExecutionLogger

**責務**: 実行ログの記録と管理

**インターフェース**:

```typescript
interface ExecutionLogger {
  startTask(userInput: string): { taskId: string; log: ExecutionLog };
  recordSubagent(name: string, status: string, output: string, error?: string): void;
  recordAutoFix(attempted: boolean, success: boolean): void;
  recordRetry(): void;
  recordRollback(): void;
  completeTask(status: string, qualityScore: number, errorType?: string): ExecutionLog;
}

interface ExecutionLog {
  taskId: string;
  startTime: string;
  endTime: string;
  duration: number;
  userInput: string;
  taskType: string;
  complexity: string;
  detectedPattern: string;
  subagents: SubagentExecution[];
  status: 'success' | 'error' | 'rollback';
  errorType?: string;
  autoFixAttempted: boolean;
  autoFixSuccess: boolean;
  retryCount: number;
  rollbackExecuted: boolean;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  testsAdded: number;
  qualityScore: number;
}
```

#### 3.2 MetricsCollector

**責務**: メトリクス収集と集計

**インターフェース**:

```typescript
interface MetricsCollector {
  saveDailySummary(date: Date): void;
  getMetrics(startDate: Date, endDate: Date): Metrics;
}

interface Metrics {
  totalTasks: number;
  successRate: number;
  averageDuration: number;
  averageQualityScore: number;
  errorDistribution: Record<string, number>;
  subagentUsage: Record<string, number>;
}
```


#### 3.3 TrendAnalyzer

**責務**: トレンド分析と改善提案

**インターフェース**:

```typescript
interface TrendAnalyzer {
  analyzeTrends(days: number): TrendAnalysis;
  saveAnalysis(analysis: TrendAnalysis): void;
}

interface TrendAnalysis {
  analyzed: boolean;
  period: { start: string; end: string };
  trends: Trend[];
  suggestions: Suggestion[];
}

interface Trend {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  change: number;
  significance: 'high' | 'medium' | 'low';
}

interface Suggestion {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actions: string[];
}
```

## Data Models

### Task Execution Flow

```typescript
// タスク実行の状態遷移
enum TaskStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

// サブエージェント実行状態
enum SubagentStatus {
  NOT_STARTED = 'not_started',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

// 実行戦略
enum ExecutionStrategy {
  SEQUENTIAL = 'sequential',    // 直列実行
  PARALLEL = 'parallel',        // 並行実行
  CONDITIONAL = 'conditional'   // 条件付き実行
}
```

### Workflow Configuration

```typescript
interface WorkflowConfig {
  name: string;
  pattern: string;
  complexity: 'simple' | 'medium' | 'complex';
  subagents: SubagentConfig[];
  strategy: ExecutionStrategy;
}

interface SubagentConfig {
  name: string;
  required: boolean;
  dependsOn?: string[];
  timeout?: number;
  retryCount?: number;
}
```

### Communication Protocol

全サブエージェント間の通信は統一されたJSON形式を使用：

```typescript
interface SubagentMessage {
  agent: {
    name: string;
    type: string;
    role: string;
    status: 'completed' | 'failed';
  };
  execution: {
    phase: string;
    toolsUsed: ToolUsage[];
    findings: Finding[];
  };
  result: {
    status: 'success' | 'error' | 'warning';
    summary: string;
    details: Record<string, any>;
    recommendations: string[];
  };
  nextStep: string;
}

interface ToolUsage {
  tool: string;
  action: string;
  result: string;
}
```

## Error Handling

### エラー分類

```typescript
enum ErrorType {
  // リトライ可能
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  TEMPORARY_FAILURE = 'temporary_failure',
  
  // 自動修正可能
  LINT_ERROR = 'lint_error',
  FORMAT_ERROR = 'format_error',
  
  // ロールバック必要
  TEST_FAILURE = 'test_failure',
  BUILD_FAILURE = 'build_failure',
  
  // ユーザー介入必要
  RULE_VIOLATION = 'rule_violation',
  DESIGN_MISMATCH = 'design_mismatch',
  DEPENDENCY_ERROR = 'dependency_error'
}
```

### エラーハンドリング戦略

```typescript
interface ErrorHandler {
  classify(error: Error): ErrorType;
  canRetry(errorType: ErrorType): boolean;
  canAutoFix(errorType: ErrorType): boolean;
  needsRollback(errorType: ErrorType): boolean;
  needsUserIntervention(errorType: ErrorType): boolean;
}

interface RetryStrategy {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
}

interface RollbackStrategy {
  createBackup(): string;
  restoreFromBackup(backupId: string): void;
  cleanupBackup(backupId: string): void;
}
```

### エラー処理フロー

```
1. エラー検出
   ↓
2. エラー分類
   ↓
3. 処理戦略決定
   ├─ リトライ可能 → リトライ実行（最大3回）
   ├─ 自動修正可能 → 自動修正実行
   ├─ ロールバック必要 → バックアップから復元
   └─ ユーザー介入必要 → エラー報告
   ↓
4. 結果記録
   ↓
5. PM Orchestratorに報告
```

## Testing Strategy

### テストレベル

1. **Unit Tests**: 各サブエージェントの個別機能
2. **Integration Tests**: サブエージェント間の連携
3. **E2E Tests**: 完全なワークフロー実行
4. **Performance Tests**: 並行実行のパフォーマンス

### テストケース

#### Unit Test Example

```typescript
describe('PM Orchestrator', () => {
  describe('Task Analysis', () => {
    it('should detect simple task correctly', () => {
      const input = 'Fix typo in README.md';
      const result = pmOrchestrator.analyzeTask(input);
      expect(result.complexity).toBe('simple');
      expect(result.requiredSubagents).toEqual(['implementer']);
    });

    it('should detect complex task correctly', () => {
      const input = 'Implement new authentication system';
      const result = pmOrchestrator.analyzeTask(input);
      expect(result.complexity).toBe('complex');
      expect(result.requiredSubagents).toContain('designer');
      expect(result.requiredSubagents).toContain('implementer');
      expect(result.requiredSubagents).toContain('tester');
    });
  });
});
```


#### Integration Test Example

```typescript
describe('Subagent Communication', () => {
  it('should execute subagents in correct order', async () => {
    const workflow = {
      pattern: 'PR_REVIEW_RESPONSE',
      subagents: ['rule-checker', 'implementer', 'qa', 'reporter']
    };

    const results = await pmOrchestrator.executeWorkflow(workflow);

    expect(results[0].name).toBe('rule-checker');
    expect(results[1].name).toBe('implementer');
    expect(results[2].name).toBe('qa');
    expect(results[3].name).toBe('reporter');
  });

  it('should handle parallel execution', async () => {
    const workflow = {
      pattern: 'QUALITY_CHECK',
      subagents: [
        { name: 'rule-checker', parallel: true },
        { name: 'code-analyzer', parallel: true }
      ]
    };

    const startTime = Date.now();
    const results = await pmOrchestrator.executeWorkflow(workflow);
    const duration = Date.now() - startTime;

    // 並行実行なので、直列実行より速いはず
    expect(duration).toBeLessThan(sequentialDuration);
  });
});
```

#### E2E Test Example

```typescript
describe('Complete Workflow', () => {
  it('should complete PR review response workflow', async () => {
    const userInput = 'Address all PR review comments';
    
    // 1. Hook detection
    const pattern = detectPattern(userInput);
    expect(pattern).toBe('PR_REVIEW_RESPONSE');

    // 2. PM Orchestrator activation
    const result = await pmOrchestrator.execute({
      userInput,
      detectedPattern: pattern
    });

    // 3. Verify execution
    expect(result.status).toBe('success');
    expect(result.subagentResults).toHaveLength(4);
    
    // 4. Verify logging
    const log = await executionLogger.getLog(result.taskId);
    expect(log.subagents).toHaveLength(4);
    expect(log.status).toBe('success');

    // 5. Verify metrics
    const metrics = await metricsCollector.getMetrics(new Date(), new Date());
    expect(metrics.totalTasks).toBeGreaterThan(0);
  });
});
```

### テスト実行戦略

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage

# Performance tests
npm run test:performance
```

## Visualization and Monitoring

### リアルタイム可視化

各サブエージェントの実行状況をリアルタイムで表示：

```
[🎯 PM Orchestrator] タスク分析中...
  Pattern: PR_REVIEW_RESPONSE
  Complexity: medium
  Required subagents: 4

[🔴 Rule Checker] MUST Rules検証中...
  ├─ Read: .git/HEAD
  ├─ Check: MUST Rule 1, 4, 14
  └─ Result: ✅ All rules passed

[🟢 Implementer] 実装実行中...
  ├─ Read: src/components/Button.tsx (120 lines)
  ├─ Edit: src/components/Button.tsx
  ├─ Bash: npm run lint -- --fix
  └─ Result: ✅ Implementation completed

[🔵 QA] 品質検証中...
  ├─ Bash: npm test (20/20 passed)
  ├─ Bash: npm run lint (0 errors)
  ├─ Bash: npm run typecheck (0 errors)
  └─ Result: ✅ All quality checks passed

[🔵 Reporter] 結果統合中...
  └─ Result: ✅ Task completed successfully
```

### メトリクスダッシュボード

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PM Orchestrator Metrics (Last 7 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Tasks: 42
Success Rate: 95.2% (40/42)
Average Duration: 12.3s
Average Quality Score: 92/100

Error Distribution:
  - Test Failure: 1 (2.4%)
  - Lint Error: 1 (2.4%)

Subagent Usage:
  - rule-checker: 42 (100%)
  - implementer: 38 (90.5%)
  - qa: 40 (95.2%)
  - reporter: 42 (100%)
  - designer: 8 (19.0%)

Top Patterns:
  1. PR_REVIEW_RESPONSE: 15 (35.7%)
  2. LIST_MODIFICATION: 12 (28.6%)
  3. CODERABBIT_RESOLVE: 10 (23.8%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Performance Considerations

### 並行実行の最適化

```typescript
interface ParallelExecutionConfig {
  maxConcurrency: number;        // 最大同時実行数
  timeout: number;               // タイムアウト（ms）
  resourceLimits: {
    cpu: number;                 // CPU使用率制限
    memory: number;              // メモリ使用量制限
  };
}

// 並行実行の実装例
async function executeParallel(
  subagents: SubagentConfig[],
  config: ParallelExecutionConfig
): Promise<SubagentResult[]> {
  const semaphore = new Semaphore(config.maxConcurrency);
  
  const promises = subagents.map(async (subagent) => {
    await semaphore.acquire();
    try {
      return await executeSubagent(subagent, config.timeout);
    } finally {
      semaphore.release();
    }
  });

  return Promise.all(promises);
}
```

### キャッシング戦略

```typescript
interface CacheStrategy {
  // ファイル内容のキャッシュ
  fileCache: Map<string, { content: string; timestamp: number }>;
  
  // 分析結果のキャッシュ
  analysisCache: Map<string, AnalysisResult>;
  
  // キャッシュの有効期限
  ttl: number;
}

// キャッシュの実装例
class FileCache {
  private cache = new Map<string, CachedFile>();
  private ttl = 60000; // 60秒

  async get(path: string): Promise<string | null> {
    const cached = this.cache.get(path);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.ttl) {
      this.cache.delete(path);
      return null;
    }

    return cached.content;
  }

  set(path: string, content: string): void {
    this.cache.set(path, {
      content,
      timestamp: Date.now()
    });
  }
}
```

## Security Considerations

### サブエージェント権限管理

```typescript
interface SubagentPermissions {
  canRead: string[];           // 読み取り可能なパス
  canWrite: string[];          // 書き込み可能なパス
  canExecute: string[];        // 実行可能なコマンド
  canAccessNetwork: boolean;   // ネットワークアクセス可否
}

// 権限チェックの実装例
class PermissionChecker {
  check(subagent: string, operation: Operation): boolean {
    const permissions = this.getPermissions(subagent);
    
    switch (operation.type) {
      case 'read':
        return this.canRead(permissions, operation.path);
      case 'write':
        return this.canWrite(permissions, operation.path);
      case 'execute':
        return this.canExecute(permissions, operation.command);
      default:
        return false;
    }
  }
}
```

### 入力検証

```typescript
interface InputValidator {
  validateUserInput(input: string): ValidationResult;
  sanitizeInput(input: string): string;
  detectMaliciousPatterns(input: string): boolean;
}

// 検証の実装例
class UserInputValidator implements InputValidator {
  validateUserInput(input: string): ValidationResult {
    // 長さチェック
    if (input.length > 10000) {
      return { valid: false, error: 'Input too long' };
    }

    // 危険なパターンチェック
    if (this.detectMaliciousPatterns(input)) {
      return { valid: false, error: 'Malicious pattern detected' };
    }

    return { valid: true };
  }

  detectMaliciousPatterns(input: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /eval\(/,
      /__import__/,
      /exec\(/
    ];

    return dangerousPatterns.some(pattern => pattern.test(input));
  }
}
```

## Deployment Strategy

### 段階的ロールアウト

```
Phase 1: Core Infrastructure (Week 1-2)
  - PM Orchestrator基盤実装
  - ExecutionLogger実装
  - 基本的なサブエージェント統合

Phase 2: Subagent Implementation (Week 3-4)
  - 全8サブエージェントの実装
  - 統一JSON通信プロトコル実装
  - エラーハンドリング実装

Phase 3: Parallel Execution (Week 5-6)
  - 並行実行機能実装
  - パフォーマンス最適化
  - リソース管理実装

Phase 4: Monitoring & Analytics (Week 7-8)
  - MetricsCollector実装
  - TrendAnalyzer実装
  - ダッシュボード実装

Phase 5: Testing & Refinement (Week 9-10)
  - 統合テスト
  - E2Eテスト
  - パフォーマンステスト
  - バグ修正

Phase 6: Production Deployment (Week 11-12)
  - ドキュメント整備
  - ユーザートレーニング
  - 本番環境デプロイ
  - モニタリング開始
```

### ロールバック計画

```typescript
interface RollbackPlan {
  version: string;
  backupLocation: string;
  rollbackSteps: string[];
  verificationSteps: string[];
}

// ロールバック実行例
async function rollback(plan: RollbackPlan): Promise<void> {
  console.log(`Rolling back to version ${plan.version}`);
  
  for (const step of plan.rollbackSteps) {
    await executeStep(step);
  }

  for (const step of plan.verificationSteps) {
    const result = await verifyStep(step);
    if (!result.success) {
      throw new Error(`Verification failed: ${step}`);
    }
  }

  console.log('Rollback completed successfully');
}
```

## Migration from Existing System

### 既存システムとの互換性

```typescript
interface MigrationStrategy {
  // 既存のサブエージェント定義を新形式に変換
  convertLegacyAgent(legacyAgent: any): SubagentConfig;
  
  // 既存のワークフローを新形式に変換
  convertLegacyWorkflow(legacyWorkflow: any): WorkflowConfig;
  
  // 段階的移行のサポート
  enableHybridMode(): void;
}

// 移行の実装例
class SystemMigrator implements MigrationStrategy {
  convertLegacyAgent(legacyAgent: any): SubagentConfig {
    return {
      name: legacyAgent.name,
      required: legacyAgent.required ?? true,
      dependsOn: legacyAgent.dependencies ?? [],
      timeout: legacyAgent.timeout ?? 30000,
      retryCount: legacyAgent.retryCount ?? 3
    };
  }

  enableHybridMode(): void {
    // 新旧システムを並行稼働
    // 新システムで問題が発生した場合、旧システムにフォールバック
  }
}
```

## Success Metrics

### KPI定義

```typescript
interface SuccessMetrics {
  // 効率性
  averageTaskDuration: number;        // 平均タスク実行時間
  parallelExecutionSpeedup: number;   // 並行実行による高速化率
  
  // 品質
  successRate: number;                // 成功率
  averageQualityScore: number;        // 平均品質スコア
  autoFixSuccessRate: number;         // 自動修正成功率
  
  // 信頼性
  errorRate: number;                  // エラー率
  rollbackRate: number;               // ロールバック率
  retrySuccessRate: number;           // リトライ成功率
  
  // ユーザー満足度
  userSatisfactionScore: number;      // ユーザー満足度スコア
  adoptionRate: number;               // 採用率
}
```

### 目標値

```
Phase 1 (MVP):
  - Success Rate: > 80%
  - Average Duration: < 30s
  - Error Rate: < 20%

Phase 2 (Stable):
  - Success Rate: > 90%
  - Average Duration: < 20s
  - Error Rate: < 10%
  - Auto-fix Success Rate: > 70%

Phase 3 (Optimized):
  - Success Rate: > 95%
  - Average Duration: < 15s
  - Error Rate: < 5%
  - Auto-fix Success Rate: > 85%
  - Parallel Speedup: > 2x
```

