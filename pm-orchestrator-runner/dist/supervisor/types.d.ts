/**
 * Supervisor System Types
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */
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
export interface ComposedPrompt {
    globalTemplate: string;
    projectTemplate: string;
    userPrompt: string;
    composed: string;
}
export interface FormattedOutput {
    raw: string;
    formatted: string;
    templateApplied: boolean;
}
export type ViolationType = 'missing_required_section' | 'incorrect_format' | 'skipped_validation' | 'direct_execution_attempt';
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
export type RestartAction = 'none' | 'continue' | 'resume' | 'rollback_replay';
export interface RestartState {
    action: RestartAction;
    reason: string;
    taskId: string;
}
export interface SupervisedResult {
    success: boolean;
    output: FormattedOutput;
    validation: ValidationResult;
    executionTimeMs: number;
    retryCount: number;
}
export interface ISupervisor {
    compose(userPrompt: string, projectId: string): ComposedPrompt;
    execute(composed: ComposedPrompt): Promise<SupervisedResult>;
    validate(output: string): ValidationResult;
    format(output: string, projectId: string): FormattedOutput;
}
export declare const DEFAULT_GLOBAL_CONFIG: GlobalConfig;
export declare const DEFAULT_PROJECT_CONFIG: ProjectConfig;
export declare const TIMEOUT_PROFILES: Record<string, number>;
//# sourceMappingURL=types.d.ts.map