/**
 * Trace Command
 *
 * Per spec 28_CONVERSATION_TRACE.md Section 5.1:
 * - /trace <task-id|#>: Show conversation trace for a task
 * - /trace <task-id|#> --latest: Show only latest iteration
 * - /trace <task-id|#> --raw: Show raw JSONL data
 *
 * Records all LLM round-trips for post-hoc analysis
 */
/**
 * Trace command result
 */
export interface TraceResult {
    success: boolean;
    message: string;
    output?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Trace options
 */
export interface TraceOptions {
    /** Show only latest iteration */
    latest?: boolean;
    /** Show raw JSONL data */
    raw?: boolean;
}
/**
 * Trace Command class
 * Per spec/28_CONVERSATION_TRACE.md Section 5.1
 */
export declare class TraceCommand {
    /**
     * Get conversation trace for a task
     *
     * @param stateDir - State directory (e.g., .pm-orchestrator)
     * @param taskId - Task ID
     * @param options - Display options (latest, raw)
     * @returns Trace result
     */
    getTrace(stateDir: string, taskId: string, options?: TraceOptions): TraceResult;
    /**
     * List available trace files for a task
     *
     * @param stateDir - State directory
     * @param taskId - Task ID
     * @returns List of trace file paths
     */
    listTraceFiles(stateDir: string, taskId: string): string[];
}
//# sourceMappingURL=trace.d.ts.map