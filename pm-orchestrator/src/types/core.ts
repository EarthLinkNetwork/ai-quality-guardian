/**
 * PM Orchestrator Enhancement - Core Type Definitions
 *
 * このファイルは、PM Orchestratorシステムのコア型定義を提供します。
 * 全てのサブエージェントとコンポーネントがこれらの型を使用します。
 */

// ============================================================================
// Task Execution Flow
// ============================================================================

/**
 * タスク実行の状態遷移
 */
export enum TaskStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

/**
 * サブエージェント実行状態
 */
export enum SubagentStatus {
  NOT_STARTED = 'not_started',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * 実行戦略
 */
export enum ExecutionStrategy {
  SEQUENTIAL = 'sequential',    // 直列実行
  PARALLEL = 'parallel',        // 並行実行
  CONDITIONAL = 'conditional'   // 条件付き実行
}

// ============================================================================
// PM Orchestrator Interfaces
// ============================================================================

/**
 * PM Orchestratorへの入力
 */
export interface PMOrchestratorInput {
  userInput: string;
  detectedPattern?: string;
  context?: Record<string, any>;
}

/**
 * PM Orchestratorからの出力
 */
export interface PMOrchestratorOutput {
  taskId: string;
  status: 'success' | 'error' | 'partial';
  subagentResults: SubagentResult[];
  executionLog: ExecutionLog;
  summary: string;
  nextSteps: string[];
}

/**
 * サブエージェント実行結果
 */
export interface SubagentResult {
  name: string;
  status: 'success' | 'error' | 'warning';
  duration: number;
  output: any;
  error?: string;
}

// ============================================================================
// Execution Log
// ============================================================================

/**
 * タスク実行ログ
 *
 * 全てのタスク実行の詳細を記録し、メトリクス収集とトレンド分析に使用されます。
 */
export interface ExecutionLog {
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

/**
 * サブエージェント実行詳細
 */
export interface SubagentExecution {
  name: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: SubagentStatus;
  toolsUsed: ToolUsage[];
  output: any;
  error?: string;
}

/**
 * ツール使用記録
 */
export interface ToolUsage {
  tool: string;
  action: string;
  result: string;
}

// ============================================================================
// Communication Protocol
// ============================================================================

/**
 * サブエージェント間の統一メッセージ形式
 *
 * 全サブエージェントがこの形式でPM Orchestratorと通信します。
 */
export interface SubagentMessage {
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

/**
 * 発見事項（Code Analyzer等で使用）
 */
export interface Finding {
  type: 'duplicate' | 'smell' | 'violation';
  severity: 'high' | 'medium' | 'low';
  location: string;
  description: string;
  suggestion?: string;
}

// ============================================================================
// Workflow Configuration
// ============================================================================

/**
 * ワークフロー設定
 *
 * タスクパターンごとの実行戦略を定義します。
 */
export interface WorkflowConfig {
  name: string;
  pattern: string;
  complexity: 'simple' | 'medium' | 'complex';
  subagents: SubagentConfig[];
  strategy: ExecutionStrategy;
}

/**
 * サブエージェント設定
 */
export interface SubagentConfig {
  name: string;
  required: boolean;
  dependsOn?: string[];
  timeout?: number;
  retryCount?: number;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * エラー分類
 */
export enum ErrorType {
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
  DEPENDENCY_ERROR = 'dependency_error',

  // 不明なエラー
  UNKNOWN = 'unknown'
}
