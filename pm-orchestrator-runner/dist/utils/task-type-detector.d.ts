/**
 * Task Type Detector - Detect task type from user input
 * Shared utility for both REPL and Web paths
 *
 * Task types:
 * - READ_INFO: Information requests, questions, analysis (no file changes)
 * - REPORT: Generating reports, summaries (no file changes)
 * - IMPLEMENTATION: Creating/modifying files, fixing bugs
 *
 * Design principle: Japanese inputs that don't clearly indicate file
 * creation/modification should default to READ_INFO (not IMPLEMENTATION)
 * to prevent INCOMPLETE -> ERROR misclassification in the executor pipeline.
 */
export type TaskType = 'READ_INFO' | 'IMPLEMENTATION' | 'REPORT';
/**
 * Detect task type from user input.
 * READ_INFO tasks are information requests that don't require file changes.
 * REPORT tasks are report/summary generation requests.
 * IMPLEMENTATION tasks involve creating/modifying files.
 */
export declare function detectTaskType(input: string): TaskType;
//# sourceMappingURL=task-type-detector.d.ts.map