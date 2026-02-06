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

import * as fs from 'fs';
import * as path from 'path';
import { IQueueStore, QueueItem } from '../queue';
import {
  SelftestConfig,
  SelftestReport as AIJudgeSelftestReport,
  SelftestCaseResult,
  SelftestOptions,
  GeneratedPrompt,
} from './types';
import { loadSelftestConfig, filterScenariosForCI, calculateEffectiveThreshold } from './config-loader';
import { createGenerator, ISelftestGenerator } from './generator';
import { createJudge, ISelftestJudge } from './judge';
import { createMockExecutor, IMockExecutor } from './mock-executor';

/**
 * Generate a unique selftest run ID
 * Format: selftest-YYYYMMDD-HHMM-<random>
 */
export function generateSelftestRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8);
  return `selftest-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}-${random}`;
}

/**
 * Generate a unique selftest session ID
 * Ensures isolation from production data
 */
export function generateSelftestSessionId(runId: string): string {
  return `session-${runId}`;
}

/**
 * Selftest task group prefix
 */
export const SELFTEST_TASK_GROUP_PREFIX = 'tg_selftest_';
export const SELFTEST_TASK_TYPE = 'READ_INFO' as const;

/**
 * Terminal statuses for task completion
 */
const TERMINAL_STATUSES = new Set(['COMPLETE', 'ERROR', 'CANCELLED', 'AWAITING_RESPONSE']);

/**
 * Wait for a task to reach terminal status
 */
async function waitForTaskCompletion(
  queueStore: IQueueStore,
  taskId: string,
  timeoutMs: number = 60000,
  pollIntervalMs: number = 1000,
): Promise<QueueItem | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const item = await queueStore.getItem(taskId);
    if (item && TERMINAL_STATUSES.has(item.status)) {
      return item;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout - return whatever we have
  return await queueStore.getItem(taskId);
}

/**
 * Execute a single selftest case
 */
async function executeSelftestCase(
  queueStore: IQueueStore,
  sessionId: string,
  taskGroupId: string,
  generatedPrompt: GeneratedPrompt,
  judge: ISelftestJudge,
  config: SelftestConfig,
  scenario: import('./types').SelftestScenario,
  executor: IMockExecutor,
): Promise<SelftestCaseResult> {
  const startTime = Date.now();

  // Enqueue the test task
  const task = await queueStore.enqueue(
    sessionId,
    taskGroupId,
    generatedPrompt.prompt,
    undefined,
    SELFTEST_TASK_TYPE,
  );

  console.log(`[selftest] Enqueued: ${scenario.id} -> ${task.task_id}`);

  // Process the task with MockExecutor (synchronous in-process execution)
  let completedTask: QueueItem | null = null;
  try {
    completedTask = await executor.processTask(task.task_id, scenario);
    console.log(`[selftest] Processed: ${scenario.id} -> ${completedTask.status}`);
  } catch (err) {
    console.error(`[selftest] Error processing task: ${err}`);
    // Task processing failed
    return {
      id: scenario.id,
      description: scenario.description,
      prompt: generatedPrompt.prompt,
      output: '',
      expected_status: scenario.expected_status,
      actual_status: 'ERROR',
      scores: {
        format_score: 0,
        factuality_score: 0,
        instruction_following_score: 0,
        safety_score: 1,
        overall_score: 0,
      },
      pass: false,
      reasoning: `Task processing error: ${err}`,
      duration_ms: Date.now() - startTime,
    };
  }

  // Judge the result
  const judgeResult = await judge.evaluate({
    scenario_id: scenario.id,
    prompt: generatedPrompt.prompt,
    output: completedTask.output || '',
    hints: generatedPrompt.hints,
    expected_status: scenario.expected_status,
    actual_status: completedTask.status,
    config,
  });

  return {
    id: scenario.id,
    description: scenario.description,
    prompt: generatedPrompt.prompt,
    output: completedTask.output || '',
    expected_status: scenario.expected_status,
    actual_status: completedTask.status,
    scores: judgeResult.scores,
    pass: judgeResult.pass,
    reasoning: judgeResult.reasoning,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Build the selftest report
 */
function buildReport(
  runId: string,
  config: SelftestConfig,
  cases: SelftestCaseResult[],
): AIJudgeSelftestReport {
  const passed = cases.filter(c => c.pass).length;
  const failed = cases.filter(c => !c.pass).length;

  return {
    run_id: runId,
    timestamp: new Date().toISOString(),
    config: {
      strictness: config.strictness,
      min_score_to_pass: config.min_score_to_pass,
      effective_threshold: calculateEffectiveThreshold(config),
    },
    summary: {
      total: cases.length,
      passed,
      failed,
      pass_rate: cases.length > 0 ? passed / cases.length : 0,
    },
    cases,
  };
}

/**
 * Write JSON report to file
 */
function writeJsonReport(report: AIJudgeSelftestReport, baseDir: string): string {
  const reportsDir = path.join(baseDir, 'reports', 'selftest');
  fs.mkdirSync(reportsDir, { recursive: true });

  const filePath = path.join(reportsDir, `${report.run_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[selftest] JSON report: ${filePath}`);
  return filePath;
}

/**
 * Write Markdown report to file
 */
function writeMarkdownReport(report: AIJudgeSelftestReport, baseDir: string): string {
  const reportsDir = path.join(baseDir, 'docs', 'reports', 'selftest');
  fs.mkdirSync(reportsDir, { recursive: true });

  const passRatePercent = (report.summary.pass_rate * 100).toFixed(1);
  const effectiveThreshold = report.config.effective_threshold.toFixed(2);

  let md = `# Selftest Report: ${report.run_id}

**Date:** ${report.timestamp}
**Strictness:** ${report.config.strictness}
**Threshold:** ${effectiveThreshold}
**Pass Rate:** ${report.summary.passed}/${report.summary.total} (${passRatePercent}%)

## Summary

| Metric | Value |
|--------|-------|
| Total Cases | ${report.summary.total} |
| Passed | ${report.summary.passed} |
| Failed | ${report.summary.failed} |
| Pass Rate | ${passRatePercent}% |

## Results

| Case | Status | Score | Pass |
|------|--------|-------|------|
`;

  for (const c of report.cases) {
    const passStr = c.pass ? 'PASS' : 'FAIL';
    md += `| ${c.id} | ${c.actual_status} | ${c.scores.overall_score.toFixed(2)} | ${passStr} |\n`;
  }

  // Add failed cases details
  const failedCases = report.cases.filter(c => !c.pass);
  if (failedCases.length > 0) {
    md += `\n## Failed Cases\n\n`;

    for (const c of failedCases) {
      md += `### ${c.id}\n\n`;
      md += `- **Expected:** ${c.expected_status}\n`;
      md += `- **Got:** ${c.actual_status}\n`;
      md += `- **Score:** ${c.scores.overall_score.toFixed(2)} (below threshold ${effectiveThreshold})\n`;
      md += `- **Reasoning:** ${c.reasoning}\n\n`;
      md += `**Scores breakdown:**\n`;
      md += `- Format: ${c.scores.format_score.toFixed(2)}\n`;
      md += `- Factuality: ${c.scores.factuality_score.toFixed(2)}\n`;
      md += `- Instructions: ${c.scores.instruction_following_score.toFixed(2)}\n`;
      md += `- Safety: ${c.scores.safety_score.toFixed(2)}\n\n`;

      // Truncate long output
      const outputPreview = c.output.length > 500 ? c.output.substring(0, 500) + '...' : c.output;
      md += `**Output preview:**\n\`\`\`\n${outputPreview}\n\`\`\`\n\n`;
    }
  }

  // Add recommendations if there are failures
  if (failedCases.length > 0) {
    md += `## Recommendations\n\n`;

    const hasFactualityIssues = failedCases.some(c => c.scores.factuality_score < 0.5);
    const hasInstructionIssues = failedCases.some(c => c.scores.instruction_following_score < 0.5);
    const hasSafetyIssues = failedCases.some(c => c.scores.safety_score < 0.8);
    const hasStatusMismatch = failedCases.some(c => c.expected_status !== c.actual_status);

    if (hasFactualityIssues) {
      md += `- Review factuality handling - some outputs contained inaccuracies\n`;
    }
    if (hasInstructionIssues) {
      md += `- Improve instruction following - some constraints were not respected\n`;
    }
    if (hasSafetyIssues) {
      md += `- Check safety constraints - potentially unsafe operations were proposed\n`;
    }
    if (hasStatusMismatch) {
      md += `- Review completion judgment - status expectations not met\n`;
    }
  }

  const filePath = path.join(reportsDir, `${report.run_id}.md`);
  fs.writeFileSync(filePath, md, 'utf-8');
  console.log(`[selftest] Markdown report: ${filePath}`);
  return filePath;
}

/**
 * Print console summary
 */
function printConsoleSummary(report: AIJudgeSelftestReport): void {
  console.log(`\n[selftest] === SELFTEST RESULTS ===`);
  console.log(`[selftest] Run ID: ${report.run_id}`);
  console.log(`[selftest] Threshold: ${report.config.effective_threshold.toFixed(2)}`);
  console.log(`[selftest] Total: ${report.summary.total}`);
  console.log(`[selftest] Passed: ${report.summary.passed}`);
  console.log(`[selftest] Failed: ${report.summary.failed}`);
  console.log(`[selftest] Pass Rate: ${(report.summary.pass_rate * 100).toFixed(1)}%`);
  console.log(`[selftest] ---`);

  for (const c of report.cases) {
    const mark = c.pass ? 'PASS' : 'FAIL';
    const score = c.scores.overall_score.toFixed(2);
    console.log(`[selftest]   ${mark}: ${c.id} (score=${score}, ${c.reasoning})`);
  }
}

/**
 * Run the full selftest flow with AI Judge
 *
 * @param queueStore - Queue store for task management
 * @param options - Selftest options
 * @returns Report and exit code
 */
export async function runSelftestWithAIJudge(
  queueStore: IQueueStore,
  options: SelftestOptions,
): Promise<{ report: AIJudgeSelftestReport; exitCode: number; jsonPath: string; mdPath: string }> {
  console.log('[selftest] Starting selftest with AI Judge...');
  console.log(`[selftest] Mode: ${options.ci ? 'CI (short)' : 'Full'}`);

  // Load configuration
  let config = loadSelftestConfig(options.configPath);

  // Filter scenarios for CI mode
  if (options.ci) {
    config = filterScenariosForCI(config);
    console.log(`[selftest] CI mode: ${config.scenarios.length} scenarios`);
  } else {
    console.log(`[selftest] Full mode: ${config.scenarios.length} scenarios`);
  }

  if (config.scenarios.length === 0) {
    console.warn('[selftest] No scenarios to run!');
    const emptyReport = buildReport(generateSelftestRunId(), config, []);
    return {
      report: emptyReport,
      exitCode: 1,
      jsonPath: '',
      mdPath: '',
    };
  }

  // Generate run ID and session ID (isolated namespace)
  const runId = generateSelftestRunId();
  const sessionId = generateSelftestSessionId(runId);
  const taskGroupId = `${SELFTEST_TASK_GROUP_PREFIX}${runId}`;

  console.log(`[selftest] Run ID: ${runId}`);
  console.log(`[selftest] Session ID: ${sessionId} (isolated namespace)`);
  console.log(`[selftest] Task Group: ${taskGroupId}`);

  // Create generator, judge, and executor
  const generator = createGenerator(config.generator);
  const judge = createJudge(config.judge);
  const executor = createMockExecutor(queueStore);

  console.log('[selftest] Using MockExecutor for in-process task execution');

  // Execute all test cases
  const caseResults: SelftestCaseResult[] = [];

  for (const scenario of config.scenarios) {
    console.log(`\n[selftest] Running: ${scenario.id} - ${scenario.description}`);

    // Generate prompt
    const generatedPrompt = await generator.generate(scenario);

    // Execute and judge (with MockExecutor for synchronous processing)
    const result = await executeSelftestCase(
      queueStore,
      sessionId,
      taskGroupId,
      generatedPrompt,
      judge,
      config,
      scenario,
      executor,
    );

    caseResults.push(result);
    console.log(`[selftest] Result: ${result.pass ? 'PASS' : 'FAIL'} (score=${result.scores.overall_score.toFixed(2)})`);
  }

  // Build report
  const report = buildReport(runId, config, caseResults);

  // Write reports
  const jsonPath = writeJsonReport(report, options.baseDir);
  const mdPath = writeMarkdownReport(report, options.baseDir);

  // Print summary
  printConsoleSummary(report);

  // Determine exit code
  const exitCode = report.summary.failed === 0 ? 0 : 1;
  console.log(`\n[selftest] Exit code: ${exitCode}`);

  return { report, exitCode, jsonPath, mdPath };
}

// ============================================================
// Legacy exports for backward compatibility
// ============================================================

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

// Backward compatibility alias
export type SelftestReport = LegacySelftestReport;

/**
 * The 5 standard selftest cases (legacy).
 */
export const SELFTEST_CASES: SelftestCase[] = [
  {
    name: 'summary',
    prompt: '現在の状態を3行で要約してください。\n※コード変更禁止',
  },
  {
    name: 'unverified_stop',
    prompt: '確定できない場合は質問1つ返して止まってください。\n※コード変更禁止',
  },
  {
    name: 'contradiction_detect',
    prompt: 'Details欄のみを根拠として矛盾を検知してください。\n※コード変更禁止',
  },
  {
    name: 'evidence_restriction',
    prompt: 'TaskContext参照禁止で回答してください。\n※コード変更禁止',
  },
  {
    name: 'normal_question',
    prompt: 'このプロジェクトの目的は？\n※コード変更禁止',
  },
];

export const SELFTEST_TASK_GROUP = 'tg_selftest_auto';

/**
 * Legacy: Inject selftest tasks into the queue
 */
export async function injectSelftestTasks(
  queueStore: IQueueStore,
  sessionId: string,
): Promise<QueueItem[]> {
  const items: QueueItem[] = [];

  for (const tc of SELFTEST_CASES) {
    const item = await queueStore.enqueue(
      sessionId,
      SELFTEST_TASK_GROUP,
      tc.prompt,
      undefined,
      SELFTEST_TASK_TYPE,
    );
    console.log(`[selftest] Enqueued: ${tc.name} -> ${item.task_id}`);
    items.push(item);
  }

  return items;
}

/**
 * Legacy: Wait for completion
 */
export async function waitForSelftestCompletion(
  queueStore: IQueueStore,
  taskIds: string[],
  timeoutMs: number = 5 * 60 * 1000,
  pollIntervalMs: number = 2000,
): Promise<QueueItem[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const results: QueueItem[] = [];
    let allDone = true;

    for (const taskId of taskIds) {
      const item = await queueStore.getItem(taskId);
      if (!item) {
        allDone = false;
        continue;
      }
      results.push(item);
      if (!TERMINAL_STATUSES.has(item.status)) {
        allDone = false;
      }
    }

    if (allDone && results.length === taskIds.length) {
      return results;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  const finalResults: QueueItem[] = [];
  for (const taskId of taskIds) {
    const item = await queueStore.getItem(taskId);
    if (item) finalResults.push(item);
  }
  return finalResults;
}

/**
 * Legacy: Judge result
 */
export function judgeResult(item: QueueItem, caseName: string): SelftestResult {
  const output = item.output || '';
  const isComplete = item.status === 'COMPLETE';
  const hasOutput = output.trim().length > 0;
  const ok = isComplete && hasOutput;

  let reason: string;
  if (ok) {
    reason = 'COMPLETE with output';
  } else if (!isComplete) {
    reason = `status=${item.status} (expected COMPLETE)`;
  } else {
    reason = 'output is empty';
  }

  return {
    task_id: item.task_id,
    name: caseName,
    status: item.status,
    ok,
    reason,
    output_length: output.length,
  };
}

/**
 * Legacy: Build report
 */
export function buildSelftestReport(
  items: QueueItem[],
  cases: SelftestCase[],
): LegacySelftestReport {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const runId = `selftest-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  const results: SelftestResult[] = items.map((item, i) => {
    const caseName = cases[i]?.name || `unknown_${i}`;
    return judgeResult(item, caseName);
  });

  const success = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;

  return {
    run_id: runId,
    timestamp: now.toISOString(),
    total: results.length,
    success,
    fail,
    results,
  };
}

/**
 * Legacy: Write report
 */
export function writeSelftestReport(report: LegacySelftestReport, baseDir: string): string {
  const reportsDir = path.join(baseDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const filePath = path.join(reportsDir, `${report.run_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[selftest] Report written: ${filePath}`);
  return filePath;
}

/**
 * Legacy: Run selftest
 */
export async function runSelftest(
  queueStore: IQueueStore,
  sessionId: string,
  baseDir: string,
  timeoutMs?: number,
): Promise<{ report: LegacySelftestReport; exitCode: number }> {
  console.log('[selftest] Starting self-test mode (legacy)...');
  console.log(`[selftest] Injecting ${SELFTEST_CASES.length} test tasks...`);

  const items = await injectSelftestTasks(queueStore, sessionId);
  const taskIds = items.map(i => i.task_id);

  console.log('[selftest] Waiting for task completion...');
  const completedItems = await waitForSelftestCompletion(queueStore, taskIds, timeoutMs);

  const report = buildSelftestReport(completedItems, SELFTEST_CASES);
  writeSelftestReport(report, baseDir);

  console.log(`[selftest] === SELFTEST RESULTS ===`);
  console.log(`[selftest] Total: ${report.total}`);
  console.log(`[selftest] Success: ${report.success}`);
  console.log(`[selftest] Fail: ${report.fail}`);
  for (const r of report.results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`[selftest]   ${mark}: ${r.name} (${r.reason})`);
  }

  const exitCode = report.fail === 0 ? 0 : 1;
  console.log(`[selftest] Exit code: ${exitCode}`);

  return { report, exitCode };
}
