/**
 * Task Model
 * Based on 05_DATA_MODELS.md L23-37
 */
import { TaskStatus } from './enums';
/**
 * Granularity limits for task execution
 */
export interface GranularityLimits {
    max_files: number;
    max_tests: number;
    max_seconds: number;
}
/**
 * Task data structure
 * Per spec 05_DATA_MODELS.md L108-142
 */
export interface Task {
    task_id: string;
    /** 所属スレッドの識別子 */
    thread_id?: string;
    /** 所属 Run の識別子 */
    run_id?: string;
    description: string;
    requirements: string[];
    status: TaskStatus;
    assigned_executor?: string;
    evidence_refs: string[];
    files_modified: string[];
    tests_run: string[];
    tests_required_before_implementation: boolean;
    granularity_limits: GranularityLimits;
    decomposition_approved_by_runner: boolean;
    parent_task_id?: string;
    subtask_ids?: string[];
    started_at?: string;
    completed_at?: string;
    /** 当該タスクに対応する TaskLog の識別子 */
    log_ref?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Task validation error
 */
export declare class TaskValidationError extends Error {
    constructor(message: string);
}
/**
 * Create a new task
 */
export declare function createTask(description: string, requirements: string[], granularityLimits?: Partial<GranularityLimits>): Task;
/**
 * Validate a task object
 * @throws TaskValidationError if validation fails
 */
export declare function validateTask(task: Task): boolean;
/**
 * Update task status
 */
export declare function updateTaskStatus(task: Task, newStatus: TaskStatus): Task;
/**
 * Assign executor to task
 */
export declare function assignExecutor(task: Task, executorId: string): Task;
/**
 * Add evidence reference to task
 */
export declare function addEvidenceRef(task: Task, evidenceRef: string): Task;
/**
 * Add modified file to task
 */
export declare function addModifiedFile(task: Task, filePath: string): Task;
/**
 * Add test run to task
 */
export declare function addTestRun(task: Task, testId: string): Task;
/**
 * Mark task decomposition as approved
 */
export declare function approveDecomposition(task: Task): Task;
//# sourceMappingURL=task.d.ts.map