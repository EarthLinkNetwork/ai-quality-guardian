/**
 * Trace Pack - Minimal JSONL logging for session/task state transitions
 *
 * Per spec:
 * - JSONL format (one JSON object per line)
 * - Records: session_id, task_group_id, task_id, state transitions, verification results
 * - Verify function for output format compliance
 */
/**
 * Trace entry types
 */
export type TraceEventType = 'SESSION_START' | 'SESSION_END' | 'TASK_GROUP_START' | 'TASK_GROUP_END' | 'TASK_START' | 'TASK_STATE_CHANGE' | 'TASK_END' | 'EXECUTOR_CALL' | 'EXECUTOR_RESULT' | 'VERIFICATION_START' | 'VERIFICATION_RESULT' | 'ERROR' | 'WARNING';
/**
 * Base trace entry structure
 */
export interface TraceEntry {
    /** ISO timestamp */
    timestamp: string;
    /** Event type */
    event: TraceEventType;
    /** Session identifier */
    session_id: string;
    /** Task group identifier (optional) */
    task_group_id?: string;
    /** Task identifier (optional) */
    task_id?: string;
    /** Previous state (for state transitions) */
    from_state?: string;
    /** New state (for state transitions) */
    to_state?: string;
    /** Additional data */
    data?: Record<string, unknown>;
    /** Verification result (for verification events) */
    verification_result?: {
        passed: boolean;
        checks: Array<{
            name: string;
            passed: boolean;
            message?: string;
        }>;
    };
    /** Error information */
    error?: {
        message: string;
        code?: string;
        stack?: string;
    };
}
/**
 * Trace Pack configuration
 */
export interface TracePackConfig {
    /** Output directory for trace files */
    outputDir: string;
    /** Session ID */
    sessionId: string;
    /** Whether to buffer writes */
    buffered?: boolean;
    /** Max buffer size before flush */
    maxBufferSize?: number;
}
/**
 * Trace Pack - JSONL logger for session/task state transitions
 */
export declare class TracePack {
    private config;
    private outputPath;
    private buffer;
    private writeStream;
    constructor(config: TracePackConfig);
    /**
     * Get the output file path
     */
    getOutputPath(): string;
    /**
     * Log a trace entry
     */
    log(entry: Omit<TraceEntry, 'timestamp' | 'session_id'>): void;
    /**
     * Log session start
     */
    sessionStart(data?: Record<string, unknown>): void;
    /**
     * Log session end
     */
    sessionEnd(data?: Record<string, unknown>): void;
    /**
     * Log task group start
     */
    taskGroupStart(taskGroupId: string, data?: Record<string, unknown>): void;
    /**
     * Log task group end
     */
    taskGroupEnd(taskGroupId: string, data?: Record<string, unknown>): void;
    /**
     * Log task start
     */
    taskStart(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void;
    /**
     * Log task state change
     */
    taskStateChange(taskGroupId: string, taskId: string, fromState: string, toState: string, data?: Record<string, unknown>): void;
    /**
     * Log task end
     */
    taskEnd(taskGroupId: string, taskId: string, finalState: string, data?: Record<string, unknown>): void;
    /**
     * Log executor call
     */
    executorCall(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void;
    /**
     * Log executor result
     */
    executorResult(taskGroupId: string, taskId: string, status: string, data?: Record<string, unknown>): void;
    /**
     * Log verification start
     */
    verificationStart(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void;
    /**
     * Log verification result
     */
    verificationResult(taskGroupId: string, taskId: string, passed: boolean, checks: Array<{
        name: string;
        passed: boolean;
        message?: string;
    }>, data?: Record<string, unknown>): void;
    /**
     * Log error
     */
    error(message: string, code?: string, taskGroupId?: string, taskId?: string): void;
    /**
     * Log warning
     */
    warning(message: string, taskGroupId?: string, taskId?: string): void;
    /**
     * Flush buffer to file
     */
    flush(): void;
    /**
     * Write single entry to file
     */
    private writeEntry;
    /**
     * Close the trace pack
     */
    close(): void;
}
/**
 * Verify trace file format compliance
 */
export interface VerifyResult {
    valid: boolean;
    entryCount: number;
    errors: Array<{
        line: number;
        error: string;
    }>;
    warnings: Array<{
        line: number;
        warning: string;
    }>;
    summary: {
        sessionStarts: number;
        sessionEnds: number;
        taskGroupStarts: number;
        taskGroupEnds: number;
        taskStarts: number;
        taskEnds: number;
        stateChanges: number;
        verificationResults: number;
        errors: number;
    };
}
/**
 * Verify a trace file for format compliance
 */
export declare function verifyTraceFile(filePath: string): VerifyResult;
/**
 * Read and parse a trace file
 */
export declare function readTraceFile(filePath: string): TraceEntry[];
//# sourceMappingURL=trace-pack.d.ts.map