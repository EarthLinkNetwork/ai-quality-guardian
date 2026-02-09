/**
 * Auto E2E Runner
 *
 * Runs AI-driven E2E tests against the Web API.
 * Tests are generated dynamically and evaluated by AI judge.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AITestConfig,
  TestCase,
  TestResult,
  AutoE2EReport,
} from './types';
import { judge, containsQuestions } from './judge';
import { getApiKey } from '../config/global-config';

/**
 * Default config path
 */
const CONFIG_PATH = path.join(__dirname, '../../config/ai-test-config.json');

/**
 * Load AI test config
 */
export function loadAITestConfig(): AITestConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Fall through to defaults
  }

  return {
    passThreshold: 0.72,
    strictMode: false,
    maxAutoFixIterations: 5,
    sandboxDir: 'testsandbox',
    enableAutoE2E: true,
    judgeModel: 'gpt-4o-mini',
    testGeneratorModel: 'gpt-4o-mini',
    timeoutMs: 30000,
    retryDelayMs: 1000,
  };
}

/**
 * Generate unique run ID
 */
function generateRunId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `auto-e2e-${timestamp}-${random}`;
}

/**
 * Submit task to Web API and get response
 */
async function submitTask(
  baseUrl: string,
  taskGroupId: string,
  prompt: string,
  timeoutMs: number
): Promise<{ taskId: string; response: string; status: string }> {
  // Enqueue task
  const enqueueRes = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_group_id: taskGroupId,
      prompt,
    }),
  });

  if (!enqueueRes.ok) {
    throw new Error(`Failed to enqueue task: ${enqueueRes.status}`);
  }

  const enqueueData = await enqueueRes.json() as { task_id: string };
  const taskId = enqueueData.task_id;

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const statusRes = await fetch(`${baseUrl}/api/tasks/${taskId}`);
    if (!statusRes.ok) {
      throw new Error(`Failed to get task status: ${statusRes.status}`);
    }

    const taskData = await statusRes.json() as { status: string; output?: string; error_message?: string };
    const status = taskData.status;

    if (status === 'COMPLETE' || status === 'AWAITING_RESPONSE' || status === 'ERROR') {
      return {
        taskId,
        response: taskData.output || taskData.error_message || '',
        status,
      };
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Task timed out after ${timeoutMs}ms`);
}

/**
 * Run a single test case
 */
async function runTestCase(
  baseUrl: string,
  testCase: TestCase,
  config: AITestConfig
): Promise<TestResult> {
  const startTime = Date.now();
  const taskGroupId = `auto-test-${testCase.id}-${Date.now()}`;

  try {
    const { response, status } = await submitTask(
      baseUrl,
      taskGroupId,
      testCase.prompt,
      config.timeoutMs
    );

    // Check if response contains questions when it shouldn't
    if (testCase.expectedBehavior.includes('no questions') && containsQuestions(response)) {
      return {
        testCase,
        response,
        judgeResult: {
          pass: false,
          score: 0.3,
          reason: 'Response contains questions when direct answer was expected',
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Use AI judge for evaluation
    const judgeResult = await judge(
      {
        prompt: testCase.prompt,
        response,
        context: testCase.context,
        expectedBehavior: testCase.expectedBehavior,
      },
      config
    );

    return {
      testCase,
      response,
      judgeResult,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      testCase,
      response: '',
      judgeResult: {
        pass: false,
        score: 0,
        reason: `Test execution error: ${(error as Error).message}`,
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run all test cases
 */
export async function runAutoE2E(
  baseUrl: string,
  testCases: TestCase[],
  config?: AITestConfig
): Promise<AutoE2EReport> {
  const effectiveConfig = config || loadAITestConfig();
  const runId = generateRunId();
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    const result = await runTestCase(baseUrl, testCase, effectiveConfig);
    results.push(result);

    // Delay between tests
    await new Promise(resolve => setTimeout(resolve, effectiveConfig.retryDelayMs));
  }

  const passed = results.filter(r => r.judgeResult.pass).length;

  return {
    runId,
    timestamp: new Date().toISOString(),
    config: effectiveConfig,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length > 0 ? passed / results.length : 0,
    },
    results,
    overallPass: passed === results.length,
  };
}

/**
 * Generate standard test cases for a given functionality
 */
export function generateStandardTestCases(functionality: string): TestCase[] {
  return [
    {
      id: `${functionality}-basic`,
      description: `Basic functionality test for ${functionality}`,
      prompt: `Test the ${functionality} feature with a simple case.`,
      expectedBehavior: 'Should work correctly with basic input',
    },
    {
      id: `${functionality}-edge`,
      description: `Edge case test for ${functionality}`,
      prompt: `Test the ${functionality} feature with edge cases (empty input, special characters).`,
      expectedBehavior: 'Should handle edge cases gracefully',
    },
  ];
}

/**
 * Save report to file
 */
export function saveReport(report: AutoE2EReport, outputDir: string): string {
  const filename = `${report.runId}.json`;
  const filepath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

  return filepath;
}

/**
 * Check if auto E2E is enabled and API key is available
 */
export function isAutoE2EAvailable(): boolean {
  const config = loadAITestConfig();
  if (!config.enableAutoE2E) {
    return false;
  }

  const apiKey = getApiKey('openai');
  return !!apiKey;
}
