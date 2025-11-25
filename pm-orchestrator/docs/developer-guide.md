# PM Orchestrator Enhancement - 開発者ガイド

PM Orchestrator Enhancementの拡張・カスタマイズ方法を説明します。

## 目次

- [アーキテクチャ概要](#アーキテクチャ概要)
- [新しいサブエージェントの追加](#新しいサブエージェントの追加)
- [カスタムワークフローの作成](#カスタムワークフローの作成)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [テストの書き方](#テストの書き方)

---

## アーキテクチャ概要

### システム構成

```
┌─────────────────────────────────────────────────────────┐
│                    PM Orchestrator                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │ Task       │→ │ Subagent   │→ │ Result     │       │
│  │ Analysis   │  │ Selection  │  │ Aggregation│       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
           ↓                ↓                ↓
  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
  │ Execution      │ │ Metrics        │ │ Visualization  │
  │ Logger         │ │ Collector      │ │ (Terminal UI)  │
  └────────────────┘ └────────────────┘ └────────────────┘
           ↓
  ┌─────────────────────────────────────────────────────┐
  │              Subagent Layer                         │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │  │ Rule     │ │ Code     │ │ Designer │ ...       │
  │  │ Checker  │ │ Analyzer │ │          │           │
  │  └──────────┘ └──────────┘ └──────────┘           │
  └─────────────────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────────────────┐
  │            Error Handling Layer                     │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │  │ Retry    │ │ Rollback │ │ Error    │           │
  │  │ Strategy │ │ Strategy │ │ Handler  │           │
  │  └──────────┘ └──────────┘ └──────────┘           │
  └─────────────────────────────────────────────────────┘
```

### コアコンポーネント

#### 1. PM Orchestrator

タスク分析、サブエージェント選択、結果集約を担当。

**主要メソッド:**
- `executeTask(input)`: タスク実行のエントリーポイント
- `analyzeTask(userInput)`: タスクタイプと複雑度の判定
- `selectSubagents(taskType)`: 必要なサブエージェントの決定

#### 2. Subagents

特定の責務を持つ専門エージェント。

**実装済みサブエージェント:**
- RuleChecker: MUST Rules違反検出
- CodeAnalyzer: コード品質分析
- Designer: 技術設計生成
- Implementer: コード実装
- Tester: テスト生成
- QA: 品質チェック実行
- CICDEngineer: CI/CDパイプライン設定
- Reporter: 結果統合・レポート生成

#### 3. Execution Logger

全ての実行履歴を記録。

**ログファイル構造:**
```
.pm-orchestrator/
├── logs/
│   ├── task-{taskId}.json       # 個別タスクログ
│   ├── daily-{date}.json        # 日次サマリー
│   └── weekly-{date}.json       # 週次トレンド
```

#### 4. Metrics Collector

メトリクス集計と分析。

**集計項目:**
- 成功率
- 平均実行時間
- エラー分布
- サブエージェント使用統計

---

## 新しいサブエージェントの追加

### 1. サブエージェント定義ファイルの作成

`.claude/agents/my-custom-agent.md`:

```markdown
# Custom Agent

あなたは Custom Agent です。〇〇の責務を持ちます。

## 責務

- 〇〇の実行
- △△の検証
- □□の生成

## 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[36m🔧 **Custom Agent**\033[0m - 〇〇の実行

## JSON出力形式（必須）

**全ての応答の末尾に以下のJSON形式で結果を出力すること：**

\`\`\`json
{
  "agent": {
    "name": "custom-agent",
    "type": "専門サブエージェント",
    "role": "〇〇の実行",
    "status": "completed"
  },
  "execution": {
    "phase": "完了",
    "toolsUsed": ["Read", "Bash"],
    "findings": []
  },
  "result": {
    "status": "success",
    "summary": "実行完了",
    "details": {},
    "recommendations": []
  },
  "nextStep": "次のステップ"
}
\`\`\`

## 実行手順

1. 〇〇を確認
2. △△を実行
3. □□を検証
4. 結果をJSON形式で出力
```

### 2. TypeScript型定義の追加

`src/types/core.ts`:

```typescript
export interface CustomAgentInput {
  // 入力パラメータ
  targetFiles: string[];
  options: CustomAgentOptions;
}

export interface CustomAgentOptions {
  // オプション
  verbose: boolean;
  timeout: number;
}

export interface CustomAgentOutput {
  status: 'success' | 'error';
  findings: Finding[];
  metrics: CustomMetrics;
}

export interface CustomMetrics {
  // メトリクス
  processedCount: number;
  successCount: number;
  errorCount: number;
}
```

### 3. サブエージェントクラスの実装

`src/subagents/custom-agent.ts`:

```typescript
import { SubagentResult } from '../types/core';

export class CustomAgent {
  constructor() {}

  async execute(input: CustomAgentInput): Promise<SubagentResult> {
    const startTime = Date.now();

    try {
      // 1. 入力検証
      this.validateInput(input);

      // 2. メイン処理
      const findings = await this.process(input);

      // 3. メトリクス計算
      const metrics = this.calculateMetrics(findings);

      // 4. 結果を返す
      return {
        name: 'custom-agent',
        status: 'success',
        executionTime: Date.now() - startTime,
        output: {
          status: 'success',
          findings,
          metrics
        }
      };
    } catch (error) {
      return {
        name: 'custom-agent',
        status: 'error',
        executionTime: Date.now() - startTime,
        output: {
          status: 'error',
          findings: [],
          metrics: { processedCount: 0, successCount: 0, errorCount: 1 }
        },
        error: (error as Error).message
      };
    }
  }

  private validateInput(input: CustomAgentInput): void {
    if (!input.targetFiles || input.targetFiles.length === 0) {
      throw new Error('targetFiles is required');
    }
  }

  private async process(input: CustomAgentInput): Promise<Finding[]> {
    const findings: Finding[] = [];

    // メイン処理
    for (const file of input.targetFiles) {
      // ファイル処理
      const result = await this.processFile(file, input.options);
      findings.push(...result);
    }

    return findings;
  }

  private async processFile(file: string, options: CustomAgentOptions): Promise<Finding[]> {
    // ファイル処理の実装
    return [];
  }

  private calculateMetrics(findings: Finding[]): CustomMetrics {
    return {
      processedCount: findings.length,
      successCount: findings.filter(f => f.severity !== 'error').length,
      errorCount: findings.filter(f => f.severity === 'error').length
    };
  }
}
```

### 4. PM Orchestratorへの登録

`src/orchestrator/pm-orchestrator.ts`:

```typescript
private selectSubagents(taskType: TaskType): string[] {
  const subagentMap: Record<TaskType, string[]> = {
    // 既存のマッピング...
    CUSTOM_TASK: ['rule-checker', 'custom-agent', 'reporter']
  };

  return subagentMap[taskType] || ['rule-checker', 'implementer', 'qa', 'reporter'];
}
```

### 5. ユニットテストの作成

`tests/subagents/custom-agent.test.ts`:

```typescript
import { CustomAgent } from '../../src/subagents/custom-agent';

describe('CustomAgent', () => {
  let agent: CustomAgent;

  beforeEach(() => {
    agent = new CustomAgent();
  });

  it('should execute successfully', async () => {
    const input = {
      targetFiles: ['file1.ts', 'file2.ts'],
      options: { verbose: true, timeout: 5000 }
    };

    const result = await agent.execute(input);

    expect(result.status).toBe('success');
    expect(result.output.findings).toBeDefined();
    expect(result.output.metrics.processedCount).toBeGreaterThan(0);
  });

  it('should throw error for invalid input', async () => {
    const input = {
      targetFiles: [],
      options: { verbose: false, timeout: 5000 }
    };

    const result = await agent.execute(input);

    expect(result.status).toBe('error');
    expect(result.error).toContain('targetFiles is required');
  });
});
```

---

## カスタムワークフローの作成

### ワークフロー定義

`.pm-orchestrator/workflows.yml`:

```yaml
workflows:
  - name: "Custom Feature Development"
    pattern: "feature_dev"
    description: "新機能開発の完全ワークフロー"
    subagents:
      - rule-checker      # ルールチェック
      - designer          # 設計
      - implementer       # 実装
      - tester            # テスト生成
      - qa                # 品質チェック
      - custom-agent      # カスタム処理
      - reporter          # 最終レポート
    options:
      parallel: false
      timeout: 7200000    # 2時間
      retryOnError: true
      maxRetries: 3
      rollbackOnFailure: true

  - name: "Quick Quality Check"
    pattern: "quick_check"
    description: "高速品質チェック"
    subagents:
      - qa
      - reporter
    options:
      parallel: true
      timeout: 300000     # 5分
      retryOnError: false
```

### 条件分岐の実装

`src/workflow/workflow-executor.ts`:

```typescript
export class WorkflowExecutor {
  async execute(workflow: WorkflowConfig, context: ExecutionContext): Promise<WorkflowResult> {
    const results: SubagentResult[] = [];

    for (const subagentName of workflow.subagents) {
      // 条件評価
      if (this.shouldSkip(subagentName, context)) {
        continue;
      }

      // サブエージェント実行
      const result = await this.executeSubagent(subagentName, context);
      results.push(result);

      // エラーハンドリング
      if (result.status === 'error') {
        if (workflow.options.rollbackOnFailure) {
          await this.rollback(results);
        }
        break;
      }
    }

    return {
      status: this.determineStatus(results),
      results,
      summary: this.generateSummary(results)
    };
  }

  private shouldSkip(subagentName: string, context: ExecutionContext): boolean {
    // 条件分岐ロジック
    const conditions = context.workflow.conditions?.[subagentName];
    if (!conditions) return false;

    // 例: 前のサブエージェントの結果に基づいてスキップ
    if (conditions.skipIf) {
      return this.evaluateCondition(conditions.skipIf, context);
    }

    return false;
  }

  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
    // 条件評価（例: "prev.status === 'success'"）
    // 実際には安全な評価エンジンを使用
    return false;
  }
}
```

---

## 開発環境のセットアップ

### 必要なツール

- Node.js 18以上
- pnpm
- TypeScript 5.0以上
- Jest（テスト）
- ESLint + Prettier（コード品質）

### セットアップ手順

```bash
# リポジトリクローン
git clone https://github.com/pm-orchestrator/pm-orchestrator-enhancement.git
cd pm-orchestrator-enhancement

# 依存関係インストール
pnpm install

# ビルド
pnpm build

# テスト実行
pnpm test

# Lint実行
pnpm lint

# 型チェック
pnpm typecheck
```

### 開発サーバーの起動

```bash
# ウォッチモードでビルド
pnpm build --watch

# 別のターミナルでテスト実行
pnpm test --watch
```

---

## テストの書き方

### ユニットテストの例

```typescript
import { PMOrchestrator } from '../../src/orchestrator/pm-orchestrator';
import { TaskType } from '../../src/types/core';

describe('PMOrchestrator', () => {
  let orchestrator: PMOrchestrator;

  beforeEach(() => {
    orchestrator = new PMOrchestrator();
  });

  describe('analyzeTask', () => {
    it('should detect PR review pattern', () => {
      const analysis = orchestrator.analyzeTask('Resolve PR review comments');

      expect(analysis.type).toBe(TaskType.PR_REVIEW_RESPONSE);
      expect(analysis.complexity).toBe('medium');
    });

    it('should detect complex implementation pattern', () => {
      const analysis = orchestrator.analyzeTask('Add user authentication with OAuth2');

      expect(analysis.type).toBe(TaskType.COMPLEX_IMPLEMENTATION);
      expect(analysis.complexity).toBe('high');
    });
  });

  describe('selectSubagents', () => {
    it('should select appropriate subagents for PR review', () => {
      const subagents = orchestrator.selectSubagents(TaskType.PR_REVIEW_RESPONSE);

      expect(subagents).toContain('rule-checker');
      expect(subagents).toContain('implementer');
      expect(subagents).toContain('qa');
      expect(subagents).toContain('reporter');
    });
  });
});
```

### 統合テストの例

```typescript
describe('PM Orchestrator Integration', () => {
  it('should execute full workflow for PR review', async () => {
    const orchestrator = new PMOrchestrator();

    const result = await orchestrator.executeTask({
      userInput: 'Resolve PR comments for PR #123',
      detectedPattern: 'pr_review_response'
    });

    expect(result.status).toBe('success');
    expect(result.subagentResults.length).toBeGreaterThan(0);
    expect(result.executionLog).toBeDefined();
    expect(result.summary).toBeTruthy();
  });
});
```

### E2Eテストの例

```typescript
import { spawn } from 'child_process';

describe('CLI E2E Tests', () => {
  it('should execute task via CLI', (done) => {
    const cli = spawn('node', ['dist/cli/index.js', 'Run quality checks']);

    let output = '';
    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    cli.on('close', (code) => {
      expect(code).toBe(0);
      expect(output).toContain('Task Execution Complete');
      expect(output).toContain('Status: success');
      done();
    });
  });
});
```

---

## ベストプラクティス

### 1. サブエージェント設計

- 単一責任の原則を守る
- JSON出力形式を統一する
- ANSI色コードで視覚的に区別する
- エラーハンドリングを徹底する

### 2. エラーハンドリング

```typescript
try {
  // メイン処理
} catch (error) {
  const errorType = this.errorHandler.classifyError(error as Error);

  if (this.errorHandler.isRetryable(errorType)) {
    // リトライ
    return await this.retryStrategy.execute(operation);
  } else if (this.errorHandler.needsRollback(errorType)) {
    // ロールバック
    await this.rollbackStrategy.rollback(backupPath);
  } else {
    // エスカレーション
    throw error;
  }
}
```

### 3. ログ記録

```typescript
const logger = new ExecutionLogger(baseDir);

// タスク開始
await logger.startTask(taskId, userInput);

// サブエージェント記録
await logger.recordSubagent(taskId, {
  name: 'custom-agent',
  status: 'success',
  executionTime: 1500,
  output: { /* ... */ }
});

// タスク完了
await logger.completeTask(taskId, {
  status: 'success',
  subagentResults: [/* ... */]
});
```

### 4. メトリクス収集

```typescript
const collector = new MetricsCollector(baseDir);

// 日次サマリー保存
await collector.saveDailySummary(date, [/* logs */]);

// トレンド分析
const analyzer = new TrendAnalyzer(baseDir);
const trends = await analyzer.analyzeTrends(7); // 週次
```

---

## コントリビューション

### プルリクエストのガイドライン

1. **ブランチ命名**: `feature/add-xxx` または `fix/bug-xxx`
2. **コミットメッセージ**: Conventional Commits形式
3. **テスト**: 全てのテストが通ること
4. **Lint**: ESLintエラーがないこと
5. **型チェック**: TypeScriptエラーがないこと

### コミットメッセージ例

```
feat: Add custom agent support
fix: Fix retry strategy timeout issue
docs: Update developer guide
test: Add integration tests for PM Orchestrator
```

---

## 参考リソース

- [ユーザーガイド](./user-guide.md)
- [API リファレンス](./api-reference.md)
- [Examples](../examples/README.md)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
