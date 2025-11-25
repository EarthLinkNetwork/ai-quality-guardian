/**
 * PM Orchestrator Enhancement - Subagent Type Definitions
 *
 * 各専門サブエージェントのインターフェース定義を提供します。
 */

import { Finding } from './core';

// ============================================================================
// Rule Checker (Red) - ANSI Color: \033[31m
// ============================================================================

/**
 * Rule Checkerサブエージェントへの入力
 */
export interface RuleCheckerInput {
  taskType: string;
  files: string[];
  operation: 'git' | 'file' | 'api';
}

/**
 * Rule Checkerサブエージェントからの出力
 */
export interface RuleCheckerOutput {
  status: 'pass' | 'fail';
  violations: RuleViolation[];
  recommendations: string[];
}

/**
 * ルール違反
 */
export interface RuleViolation {
  ruleNumber: number;
  ruleName: string;
  severity: 'critical' | 'warning';
  description: string;
  location?: string;
}

// ============================================================================
// Code Analyzer (Purple) - ANSI Color: \033[35m
// ============================================================================

/**
 * Code Analyzerサブエージェントへの入力
 */
export interface CodeAnalyzerInput {
  files: string[];
  analysisType: 'similarity' | 'quality' | 'architecture';
  context?: string;
}

/**
 * Code Analyzerサブエージェントからの出力
 */
export interface CodeAnalyzerOutput {
  status: 'completed';
  findings: Finding[];
  metrics: CodeMetrics;
  recommendations: string[];
}

/**
 * コードメトリクス
 */
export interface CodeMetrics {
  complexity: number;
  maintainability: number;
  testCoverage: number;
}

// ============================================================================
// Designer (Purple) - ANSI Color: \033[35m
// ============================================================================

/**
 * Designerサブエージェントへの入力
 */
export interface DesignerInput {
  requirements: string;
  constraints: string[];
  existingArchitecture?: string;
}

/**
 * Designerサブエージェントからの出力
 */
export interface DesignerOutput {
  status: 'completed';
  designDoc: string;
  architecture: ArchitectureDesign;
  components: ComponentDesign[];
  dataModels: DataModel[];
}

/**
 * アーキテクチャ設計
 */
export interface ArchitectureDesign {
  pattern: string;
  layers: Layer[];
  dependencies: Dependency[];
}

/**
 * レイヤー定義
 */
export interface Layer {
  name: string;
  purpose: string;
  components: string[];
}

/**
 * 依存関係
 */
export interface Dependency {
  from: string;
  to: string;
  type: 'required' | 'optional';
}

/**
 * コンポーネント設計
 */
export interface ComponentDesign {
  name: string;
  purpose: string;
  interfaces: string[];
}

/**
 * データモデル
 */
export interface DataModel {
  name: string;
  fields: Field[];
}

/**
 * フィールド定義
 */
export interface Field {
  name: string;
  type: string;
  required: boolean;
}

// ============================================================================
// Implementer (Green) - ANSI Color: \033[32m
// ============================================================================

/**
 * Implementerサブエージェントへの入力
 */
export interface ImplementerInput {
  design: string;
  files: FileOperation[];
  tests: boolean;
}

/**
 * Implementerサブエージェントからの出力
 */
export interface ImplementerOutput {
  status: 'success' | 'error';
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  linesAdded: number;
  linesDeleted: number;
  autoFixApplied: boolean;
  errors?: string[];
}

/**
 * ファイル操作
 */
export interface FileOperation {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  content?: string;
}

// ============================================================================
// Tester (Cyan) - ANSI Color: \033[36m
// ============================================================================

/**
 * Testerサブエージェントへの入力
 */
export interface TesterInput {
  implementation: string;
  testType: 'unit' | 'integration' | 'e2e';
  coverage: number;
}

/**
 * Testerサブエージェントからの出力
 */
export interface TesterOutput {
  status: 'completed';
  testsCreated: string[];
  testCases: TestCase[];
  coverage: number;
}

/**
 * テストケース
 */
export interface TestCase {
  name: string;
  type: string;
  file: string;
  assertions: number;
}

// ============================================================================
// QA (Cyan) - ANSI Color: \033[36m
// ============================================================================

/**
 * QAサブエージェントへの入力
 */
export interface QAInput {
  files: string[];
  checks: ('lint' | 'test' | 'typecheck' | 'build')[];
}

/**
 * QAサブエージェントからの出力
 */
export interface QAOutput {
  status: 'pass' | 'fail';
  lint: CheckResult;
  test: CheckResult;
  typecheck: CheckResult;
  build: CheckResult;
  qualityScore: number;
}

/**
 * チェック結果
 */
export interface CheckResult {
  passed: boolean;
  errors: number;
  warnings: number;
  details: string[];
}

// ============================================================================
// CICD Engineer (Orange) - ANSI Color: \033[33m
// ============================================================================

/**
 * CICD Engineerサブエージェントへの入力
 */
export interface CICDEngineerInput {
  platform: 'github' | 'gitlab' | 'jenkins';
  pipeline: PipelineConfig;
}

/**
 * CICD Engineerサブエージェントからの出力
 */
export interface CICDEngineerOutput {
  status: 'completed';
  configFiles: string[];
  workflows: Workflow[];
  validationResult: ValidationResult;
}

/**
 * パイプライン設定
 */
export interface PipelineConfig {
  stages: Stage[];
  triggers: Trigger[];
  environment: Record<string, string>;
}

/**
 * ステージ定義
 */
export interface Stage {
  name: string;
  steps: Step[];
}

/**
 * ステップ定義
 */
export interface Step {
  name: string;
  command: string;
}

/**
 * トリガー定義
 */
export interface Trigger {
  type: 'push' | 'pr' | 'schedule';
  branches?: string[];
}

/**
 * ワークフロー定義
 */
export interface Workflow {
  name: string;
  file: string;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Reporter (Blue) - ANSI Color: \033[34m
// ============================================================================

/**
 * Reporterサブエージェントへの入力
 */
export interface ReporterInput {
  subagentResults: any[];
  executionLog: any;
}

/**
 * Reporterサブエージェントからの出力
 */
export interface ReporterOutput {
  status: 'success' | 'warning' | 'error';
  title: string;
  summary: string;
  details: ReportDetails;
  nextSteps: string[];
  userFriendlyMessage: string;
}

/**
 * レポート詳細
 */
export interface ReportDetails {
  taskOverview: string;
  executedSteps: string[];
  changes: string[];
  verification: string[];
  warnings: string[];
  errors: string[];
}
