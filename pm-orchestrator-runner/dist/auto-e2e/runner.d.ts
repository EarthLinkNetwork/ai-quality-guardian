/**
 * Auto E2E Runner
 *
 * Runs AI-driven E2E tests against the Web API.
 * Tests are generated dynamically and evaluated by AI judge.
 */
import { AITestConfig, TestCase, AutoE2EReport } from './types';
/**
 * Load AI test config
 */
export declare function loadAITestConfig(): AITestConfig;
/**
 * Run all test cases
 */
export declare function runAutoE2E(baseUrl: string, testCases: TestCase[], config?: AITestConfig): Promise<AutoE2EReport>;
/**
 * Generate standard test cases for a given functionality
 */
export declare function generateStandardTestCases(functionality: string): TestCase[];
/**
 * Save report to file
 */
export declare function saveReport(report: AutoE2EReport, outputDir: string): string;
/**
 * Check if auto E2E is enabled and API key is available
 */
export declare function isAutoE2EAvailable(): boolean;
//# sourceMappingURL=runner.d.ts.map