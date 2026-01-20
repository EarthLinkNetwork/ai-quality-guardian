/**
 * Run Model
 * Per spec 05_DATA_MODELS.md L69-104
 *
 * Run は一連のタスク実行単位を表す。1つのスレッド内に複数の Run が存在できる。
 */
import { RunStatus, RunTrigger } from './enums';
/**
 * Run interface
 * Per spec 05_DATA_MODELS.md L69-86
 */
export interface Run {
    /** Run を一意に識別する文字列。形式: run_<連番> */
    run_id: string;
    /** 所属スレッドの識別子 */
    thread_id: string;
    /** 所属セッションの識別子 */
    session_id: string;
    /** ISO 8601 形式の開始時刻 */
    started_at: string;
    /** ISO 8601 形式の完了時刻。未完了の場合は null */
    completed_at: string | null;
    /** Run の現在状態 */
    status: RunStatus;
    /** Run を開始したトリガー種別 */
    trigger: RunTrigger;
}
/**
 * Generate a unique run ID
 * Format: run_<連番>
 */
export declare function generateRunId(): string;
/**
 * Reset run counter (for testing)
 */
export declare function resetRunCounter(): void;
/**
 * Create a new Run
 */
export declare function createRun(threadId: string, sessionId: string, trigger: RunTrigger): Run;
/**
 * Complete a Run successfully
 */
export declare function completeRun(run: Run): Run;
/**
 * Fail a Run
 */
export declare function failRun(run: Run): Run;
/**
 * Cancel a Run
 */
export declare function cancelRun(run: Run): Run;
/**
 * Validate a Run object
 */
export declare function validateRun(run: unknown): run is Run;
/**
 * Check if a run is currently running
 */
export declare function isRunning(run: Run): boolean;
/**
 * Check if a run has completed (either successfully or with failure)
 */
export declare function isCompleted(run: Run): boolean;
/**
 * Check if a run has failed
 */
export declare function isFailed(run: Run): boolean;
/**
 * Check if a run was cancelled
 */
export declare function isCancelled(run: Run): boolean;
/**
 * Check if a run is in a terminal state (completed, failed, or cancelled)
 */
export declare function isTerminal(run: Run): boolean;
/**
 * Get duration of a run in milliseconds
 * Returns null if run is still in progress
 */
export declare function getRunDuration(run: Run): number | null;
//# sourceMappingURL=run.d.ts.map