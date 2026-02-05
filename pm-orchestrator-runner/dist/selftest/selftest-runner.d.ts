/**
 * Self-Test Runner
 *
 * Automatically injects test tasks into the queue, waits for completion,
 * and generates a JSON report. No user interaction required.
 *
 * Activated by PM_AUTO_SELFTEST=true environment variable.
 */
import { IQueueStore, QueueItem } from '../queue';
export interface SelftestCase {
    name: string;
    prompt: string;
}
export interface SelftestResult {
    task_id: string;
    name: string;
    status: string;
    ok: boolean;
    reason: string;
    output_length: number;
}
export interface SelftestReport {
    run_id: string;
    timestamp: string;
    total: number;
    success: number;
    fail: number;
    results: SelftestResult[];
}
/**
 * The 5 standard selftest cases.
 * All are READ_INFO, all forbid code changes.
 */
export declare const SELFTEST_CASES: SelftestCase[];
export declare const SELFTEST_TASK_GROUP = "tg_selftest_auto";
export declare const SELFTEST_TASK_TYPE: "READ_INFO";
/**
 * Inject selftest tasks into the queue.
 * Returns the enqueued QueueItems.
 */
export declare function injectSelftestTasks(queueStore: IQueueStore, sessionId: string): Promise<QueueItem[]>;
/**
 * Poll the queue until all selftest tasks reach a terminal status.
 * Terminal: COMPLETE, ERROR, CANCELLED, AWAITING_RESPONSE
 */
export declare function waitForSelftestCompletion(queueStore: IQueueStore, taskIds: string[], timeoutMs?: number, pollIntervalMs?: number): Promise<QueueItem[]>;
/**
 * Judge a single selftest result.
 * SUCCESS: status === COMPLETE && output.length > 0
 * Everything else: FAIL
 */
export declare function judgeResult(item: QueueItem, caseName: string): SelftestResult;
/**
 * Build the selftest report from completed items.
 */
export declare function buildSelftestReport(items: QueueItem[], cases: SelftestCase[]): SelftestReport;
/**
 * Write the selftest report to disk.
 * Path: <cwd>/reports/selftest-YYYYMMDD-HHMM.json
 */
export declare function writeSelftestReport(report: SelftestReport, baseDir: string): string;
/**
 * Run the full selftest flow:
 * 1. Inject tasks
 * 2. Wait for completion
 * 3. Judge results
 * 4. Write report
 * 5. Return exit code (0 = all pass, 1 = any fail)
 */
export declare function runSelftest(queueStore: IQueueStore, sessionId: string, baseDir: string, timeoutMs?: number): Promise<{
    report: SelftestReport;
    exitCode: number;
}>;
//# sourceMappingURL=selftest-runner.d.ts.map