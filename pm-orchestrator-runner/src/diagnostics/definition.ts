/**
 * Diagnostic Definition
 *
 * Declarative specification for a diagnostic check.
 * Definitions are data-only; the DiagnosticRunner executes them.
 *
 * Design:
 * - No code in definitions (pure data)
 * - Each definition describes preconditions, steps, assertions
 * - Runner interprets and executes
 * - New problems only add definition files
 */

/**
 * Precondition that must hold before the diagnostic can run.
 */
export interface DiagnosticPrecondition {
  /** Type of check */
  type: 'file_exists' | 'dir_exists' | 'command_available' | 'custom';
  /** Target path or command name */
  target: string;
  /** Human-readable description */
  description: string;
}

/**
 * A single step in a diagnostic.
 */
export interface DiagnosticStep {
  /** Step identifier (unique within definition) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Action to perform */
  action: DiagnosticAction;
}

/**
 * Action types a step can perform.
 */
export type DiagnosticAction =
  | { type: 'glob'; pattern: string; cwd?: string }
  | { type: 'exec'; command: string; cwd?: string; timeout?: number }
  | { type: 'read_file'; path: string }
  | { type: 'compare'; left: string; right: string; mode: 'exists' | 'content' | 'mtime' }
  | { type: 'custom'; handler: string };

/**
 * Assertion applied to step output.
 */
export interface DiagnosticAssertion {
  /** Which step's output to check */
  stepId: string;
  /** Assertion type */
  type: 'not_empty' | 'matches' | 'count_eq' | 'count_gt' | 'count_lt' | 'exit_code' | 'contains' | 'custom';
  /** Expected value (interpretation depends on type) */
  expected?: string | number;
  /** Severity if assertion fails */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message on failure */
  message: string;
}

/**
 * Artifact produced by the diagnostic.
 */
export interface DiagnosticArtifact {
  /** Artifact label */
  label: string;
  /** How to produce */
  source: 'step_output' | 'file' | 'computed';
  /** Reference (stepId or file path) */
  ref: string;
}

/**
 * Complete diagnostic definition.
 */
export interface DiagnosticDefinition {
  /** Unique identifier (e.g., 'dist-integrity') */
  id: string;
  /** Human-readable title */
  title: string;
  /** Description of what this diagnostic checks */
  description: string;
  /** Category for grouping in UI */
  category?: string;
  /** Preconditions that must hold */
  preconditions: DiagnosticPrecondition[];
  /** Ordered steps to execute */
  steps: DiagnosticStep[];
  /** Assertions on step results */
  assertions: DiagnosticAssertion[];
  /** Artifacts to collect */
  artifacts: DiagnosticArtifact[];
}

/**
 * Result of running a single step.
 */
export interface StepResult {
  stepId: string;
  success: boolean;
  output: string;
  exitCode?: number;
  durationMs: number;
  error?: string;
}

/**
 * Result of evaluating a single assertion.
 */
export interface AssertionResult {
  assertion: DiagnosticAssertion;
  passed: boolean;
  actual?: string | number;
  message: string;
}

/**
 * Complete result of running a diagnostic.
 */
export interface DiagnosticResult {
  definitionId: string;
  title: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  preconditionsMet: boolean;
  preconditionErrors: string[];
  stepResults: StepResult[];
  assertionResults: AssertionResult[];
  passed: boolean;
  summary: string;
}
