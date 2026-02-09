/**
 * Mock Executor for Selftest
 *
 * Processes selftest tasks synchronously within the same process.
 * Generates appropriate mock outputs based on scenario expectations.
 */
import { IQueueStore, QueueItem } from '../queue/index';
import { SelftestScenario } from './types';
/**
 * Get mock output for a scenario
 */
export declare function getMockOutput(scenarioId: string, expectedStatus: string): {
    output: string;
    status: string;
};
/**
 * Mock Executor interface
 */
export interface IMockExecutor {
    /**
     * Process a single task
     */
    processTask(taskId: string, scenario: SelftestScenario): Promise<QueueItem>;
}
/**
 * Mock Executor implementation
 * Processes tasks synchronously in the same process
 */
export declare class MockExecutor implements IMockExecutor {
    private queueStore;
    constructor(queueStore: IQueueStore);
    /**
     * Process a single task
     * Updates status and output based on scenario expectations
     */
    processTask(taskId: string, scenario: SelftestScenario): Promise<QueueItem>;
}
/**
 * Create a mock executor
 */
export declare function createMockExecutor(queueStore: IQueueStore): IMockExecutor;
//# sourceMappingURL=mock-executor.d.ts.map