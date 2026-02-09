/**
 * Supervisor System Types
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */

// =============================================================================
// Global Config (SUP-5)
// =============================================================================

export interface SupervisorRules {
  enabled: boolean;
  timeout_default_ms: number;
  max_retries: number;
  fail_on_violation: boolean;
}

export interface GlobalConfig {
  global_input_template: string;
  global_output_template: string;
  supervisor_rules: SupervisorRules;
}

// =============================================================================
// Project Config (SUP-4)
// =============================================================================

export interface ProjectSupervisorRules {
  timeout_profile: 'standard' | 'long' | 'extended';
  allow_raw_output: boolean;
  require_format_validation: boolean;
}

export interface ProjectConfig {
  projectId: string;
  input_template: string;
  output_template: string;
  supervisor_rules: ProjectSupervisorRules;
}

// =============================================================================
// Merged Config
// =============================================================================

export interface MergedConfig {
  globalInputTemplate: string;
  globalOutputTemplate: string;
  projectInputTemplate: string;
  projectOutputTemplate: string;
  supervisorEnabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  failOnViolation: boolean;
  allowRawOutput: boolean;
  requireFormatValidation: boolean;
}

// =============================================================================
// Composed Prompt (SUP-2)
// =============================================================================

export interface ComposedPrompt {
  globalTemplate: string;
  projectTemplate: string;
  userPrompt: string;
  composed: string;  // Final merged prompt
}

// =============================================================================
// Formatted Output (SUP-3)
// =============================================================================

export interface FormattedOutput {
  raw: string;
  formatted: string;
  templateApplied: boolean;
}

// =============================================================================
// Validation (SUP-7)
// =============================================================================

export type ViolationType =
  | 'missing_required_section'
  | 'incorrect_format'
  | 'skipped_validation'
  | 'direct_execution_attempt';

export interface Violation {
  type: ViolationType;
  message: string;
  canAutoCorrect: boolean;
  severity: 'minor' | 'major';
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

// =============================================================================
// Restart State (SUP-6)
// =============================================================================

export type RestartAction =
  | 'none'
  | 'continue'
  | 'resume'
  | 'rollback_replay';

export interface RestartState {
  action: RestartAction;
  reason: string;
  taskId: string;
}

// =============================================================================
// Supervised Result
// =============================================================================

export interface SupervisedResult {
  success: boolean;
  output: FormattedOutput;
  validation: ValidationResult;
  executionTimeMs: number;
  retryCount: number;
}

// =============================================================================
// Supervisor Interface
// =============================================================================

export interface ISupervisor {
  compose(userPrompt: string, projectId: string): ComposedPrompt;
  execute(composed: ComposedPrompt): Promise<SupervisedResult>;
  validate(output: string): ValidationResult;
  format(output: string, projectId: string): FormattedOutput;
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  global_input_template: '',
  global_output_template: '',
  supervisor_rules: {
    enabled: true,
    timeout_default_ms: 60000,
    max_retries: 2,
    fail_on_violation: true,
  },
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  projectId: 'default',
  input_template: '',
  output_template: '',
  supervisor_rules: {
    timeout_profile: 'standard',
    allow_raw_output: false,
    require_format_validation: true,
  },
};

export const TIMEOUT_PROFILES: Record<string, number> = {
  standard: 60000,    // 60s
  long: 120000,       // 2min
  extended: 300000,   // 5min
};
