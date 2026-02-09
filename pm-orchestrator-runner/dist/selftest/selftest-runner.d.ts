/**
 * Selftest Runner with AI Judge
 * Per SELFTEST_AI_JUDGE.md specification
 *
 * Features:
 * - Test isolation with dedicated namespace
 * - Dynamic prompt generation (Generator)
 * - Rubric-based scoring (Judge)
 * - CI mode (2 scenarios) vs Full mode (all scenarios)
 * - JSON + Markdown report output
 */
import { IQueueStore, QueueItem } from '../queue/index';
import { SelftestReport as AIJudgeSelftestReport, SelftestOptions } from './types';
/**
 * Generate a unique selftest run ID
 * Format: selftest-YYYYMMDD-HHMM-<random>
 */
export declare function generateSelftestRunId(): string;
/**
 * Generate a unique selftest session ID
 * Ensures isolation from production data
 */
export declare function generateSelftestSessionId(runId: string): string;
/**
 * Selftest task group prefix
 */
export declare const SELFTEST_TASK_GROUP_PREFIX = "tg_selftest_";
export declare const SELFTEST_TASK_TYPE: "READ_INFO";
/**
 * Run the full selftest flow with AI Judge
 *
 * @param queueStore - Queue store for task management
 * @param options - Selftest options
 * @returns Report and exit code
 */
export declare function runSelftestWithAIJudge(queueStore: IQueueStore, options: SelftestOptions): Promise<{
    report: AIJudgeSelftestReport;
    exitCode: number;
    jsonPath: string;
    mdPath: string;
}>;
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
export interface LegacySelftestReport {
    run_id: string;
    timestamp: string;
    total: number;
    success: number;
    fail: number;
    results: SelftestResult[];
}
export type SelftestReport = LegacySelftestReport;
/**
 * The 5 standard selftest cases (legacy).
 */
export declare const SELFTEST_CASES: SelftestCase[];
export declare const SELFTEST_TASK_GROUP = "tg_selftest_auto";
/**
 * Legacy: Inject selftest tasks into the queue
 */
export declare function injectSelftestTasks(queueStore: IQueueStore, sessionId: string): Promise<QueueItem[]>;
/**
 * Legacy: Wait for completion
 */
export declare function waitForSelftestCompletion(queueStore: IQueueStore, taskIds: string[], timeoutMs?: number, pollIntervalMs?: number): Promise<QueueItem[]>;
/**
 * Legacy: Judge result
 */
export declare function judgeResult(item: QueueItem, caseName: string): SelftestResult;
/**
 * Legacy: Build report
 */
export declare function buildSelftestReport(items: QueueItem[], cases: SelftestCase[]): LegacySelftestReport;
/**
 * Legacy: Write report
 */
export declare function writeSelftestReport(report: LegacySelftestReport, baseDir: string): string;
/**
 * Legacy: Run selftest
 */
export declare function runSelftest(queueStore: IQueueStore, sessionId: string, baseDir: string, timeoutMs?: number): Promise<{
    report: LegacySelftestReport;
    exitCode: number;
}>;
//# sourceMappingURL=selftest-runner.d.ts.map