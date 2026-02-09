/**
 * Auto E2E Types
 *
 * Type definitions for the AI-driven auto-test system.
 */
export interface AITestConfig {
    passThreshold: number;
    strictMode: boolean;
    maxAutoFixIterations: number;
    sandboxDir: string;
    enableAutoE2E: boolean;
    judgeModel: string;
    testGeneratorModel: string;
    timeoutMs: number;
    retryDelayMs: number;
}
export interface JudgeInput {
    prompt: string;
    response: string;
    context?: string;
    expectedBehavior?: string;
}
export interface JudgeResult {
    pass: boolean;
    score: number;
    reason: string;
    suggestions?: string[];
}
export interface TestCase {
    id: string;
    description: string;
    prompt: string;
    expectedBehavior: string;
    context?: string;
}
export interface TestResult {
    testCase: TestCase;
    response: string;
    judgeResult: JudgeResult;
    durationMs: number;
    timestamp: string;
}
export interface AutoE2EReport {
    runId: string;
    timestamp: string;
    config: AITestConfig;
    summary: {
        total: number;
        passed: number;
        failed: number;
        passRate: number;
    };
    results: TestResult[];
    overallPass: boolean;
}
export interface AutoFixRequest {
    originalTask: string;
    failedTests: TestResult[];
    iteration: number;
    maxIterations: number;
}
export interface AutoFixResult {
    success: boolean;
    fixDescription: string;
    newCode?: string;
    error?: string;
    patch?: string;
    appliedFiles?: string[];
}
export interface FixApplicationResult {
    success: boolean;
    appliedFiles: string[];
    patch?: string;
    error?: string;
}
export interface AutoDevLoopState {
    taskId: string;
    iteration: number;
    status: 'implementing' | 'testing' | 'fixing' | 'complete' | 'failed';
    implementationResult?: string;
    testResults?: AutoE2EReport;
    fixHistory: AutoFixResult[];
}
//# sourceMappingURL=types.d.ts.map