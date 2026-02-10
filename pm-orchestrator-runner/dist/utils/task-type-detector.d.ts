/**
 * Task Type Detector - Detect task type from user input
 * Shared utility for both REPL and Web paths
 *
 * Task types:
 * - READ_INFO: Information requests, questions, analysis (no file changes)
 * - REPORT: Generating reports, summaries (no file changes)
 * - LIGHT_EDIT: Small changes, bug fixes (low risk)
 * - IMPLEMENTATION: Creating/modifying files, significant changes
 * - REVIEW_RESPONSE: Code review responses
 * - CONFIG_CI_CHANGE: Configuration and CI/CD changes
 * - DANGEROUS_OP: Destructive operations requiring confirmation (can be BLOCKED)
 *
 * Design principle: Japanese inputs that don't clearly indicate file
 * creation/modification should default to READ_INFO (not IMPLEMENTATION)
 * to prevent INCOMPLETE -> ERROR misclassification in the executor pipeline.
 *
 * AC D: Guard Responsibility
 * Only DANGEROUS_OP tasks can be BLOCKED. All other task types convert
 * BLOCKED to INCOMPLETE per the Guard responsibility pattern.
 */
export type TaskType = 'READ_INFO' | 'REPORT' | 'LIGHT_EDIT' | 'IMPLEMENTATION' | 'REVIEW_RESPONSE' | 'CONFIG_CI_CHANGE' | 'DANGEROUS_OP';
/**
 * Detect task type from user input.
 * READ_INFO tasks are information requests that don't require file changes.
 * REPORT tasks are report/summary generation requests.
 * IMPLEMENTATION tasks involve creating/modifying files.
 */
export declare function detectTaskType(input: string): TaskType;
//# sourceMappingURL=task-type-detector.d.ts.map