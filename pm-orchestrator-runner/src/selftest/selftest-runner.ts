/**
 * Self-Test Runner
 *
 * Automatically injects test tasks into the queue, waits for completion,
 * and generates a JSON report. No user interaction required.
 *
 * Activated by PM_AUTO_SELFTEST=true environment variable.
 */

import * as fs from 'fs';
import * as path from 'path';
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
export const SELFTEST_TASK_TYPE = 'READ_INFO' as const;

/**
 * Inject selftest tasks into the queue.
 * Returns the enqueued QueueItems.
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
 * Poll the queue until all selftest tasks reach a terminal status.
 * Terminal: COMPLETE, ERROR, CANCELLED, AWAITING_RESPONSE
 */
export async function waitForSelftestCompletion(
  queueStore: IQueueStore,
  taskIds: string[],
  timeoutMs: number = 5 * 60 * 1000,
  pollIntervalMs: number = 2000,
): Promise<QueueItem[]> {
  const terminalStatuses = new Set(['COMPLETE', 'ERROR', 'CANCELLED', 'AWAITING_RESPONSE']);
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
      if (!terminalStatuses.has(item.status)) {
        allDone = false;
      }
    }

    if (allDone && results.length === taskIds.length) {
      return results;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout: return whatever we have
  const finalResults: QueueItem[] = [];
  for (const taskId of taskIds) {
    const item = await queueStore.getItem(taskId);
    if (item) finalResults.push(item);
  }
  return finalResults;
}

/**
 * Judge a single selftest result.
 * SUCCESS: status === COMPLETE && output.length > 0
 * Everything else: FAIL
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
 * Build the selftest report from completed items.
 */
export function buildSelftestReport(
  items: QueueItem[],
  cases: SelftestCase[],
): SelftestReport {
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
 * Write the selftest report to disk.
 * Path: <cwd>/reports/selftest-YYYYMMDD-HHMM.json
 */
export function writeSelftestReport(report: SelftestReport, baseDir: string): string {
  const reportsDir = path.join(baseDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const filePath = path.join(reportsDir, `${report.run_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[selftest] Report written: ${filePath}`);
  return filePath;
}

/**
 * Run the full selftest flow:
 * 1. Inject tasks
 * 2. Wait for completion
 * 3. Judge results
 * 4. Write report
 * 5. Return exit code (0 = all pass, 1 = any fail)
 */
export async function runSelftest(
  queueStore: IQueueStore,
  sessionId: string,
  baseDir: string,
  timeoutMs?: number,
): Promise<{ report: SelftestReport; exitCode: number }> {
  console.log('[selftest] Starting self-test mode...');
  console.log(`[selftest] Injecting ${SELFTEST_CASES.length} test tasks...`);

  const items = await injectSelftestTasks(queueStore, sessionId);
  const taskIds = items.map(i => i.task_id);

  console.log('[selftest] Waiting for task completion...');
  const completedItems = await waitForSelftestCompletion(
    queueStore,
    taskIds,
    timeoutMs,
  );

  const report = buildSelftestReport(completedItems, SELFTEST_CASES);
  writeSelftestReport(report, baseDir);

  // Console summary
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
