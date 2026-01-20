/**
 * Run Model
 * Per spec 05_DATA_MODELS.md L69-104
 *
 * Run は一連のタスク実行単位を表す。1つのスレッド内に複数の Run が存在できる。
 */

import { RunStatus, RunTrigger } from './enums';

/**
 * Run interface
 * Per spec 05_DATA_MODELS.md L69-86
 */
export interface Run {
  /** Run を一意に識別する文字列。形式: run_<連番> */
  run_id: string;
  /** 所属スレッドの識別子 */
  thread_id: string;
  /** 所属セッションの識別子 */
  session_id: string;
  /** ISO 8601 形式の開始時刻 */
  started_at: string;
  /** ISO 8601 形式の完了時刻。未完了の場合は null */
  completed_at: string | null;
  /** Run の現在状態 */
  status: RunStatus;
  /** Run を開始したトリガー種別 */
  trigger: RunTrigger;
}

/**
 * Run counter for generating unique IDs
 */
let runCounter = 0;

/**
 * Generate a unique run ID
 * Format: run_<連番>
 */
export function generateRunId(): string {
  runCounter++;
  return `run_${runCounter}`;
}

/**
 * Reset run counter (for testing)
 */
export function resetRunCounter(): void {
  runCounter = 0;
}

/**
 * Create a new Run
 */
export function createRun(
  threadId: string,
  sessionId: string,
  trigger: RunTrigger
): Run {
  return {
    run_id: generateRunId(),
    thread_id: threadId,
    session_id: sessionId,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: RunStatus.RUNNING,
    trigger,
  };
}

/**
 * Complete a Run successfully
 */
export function completeRun(run: Run): Run {
  return {
    ...run,
    completed_at: new Date().toISOString(),
    status: RunStatus.COMPLETED,
  };
}

/**
 * Fail a Run
 */
export function failRun(run: Run): Run {
  return {
    ...run,
    completed_at: new Date().toISOString(),
    status: RunStatus.FAILED,
  };
}

/**
 * Cancel a Run
 */
export function cancelRun(run: Run): Run {
  return {
    ...run,
    completed_at: new Date().toISOString(),
    status: RunStatus.CANCELLED,
  };
}

/**
 * Validate a Run object
 */
export function validateRun(run: unknown): run is Run {
  if (typeof run !== 'object' || run === null) {
    return false;
  }

  const r = run as Record<string, unknown>;

  // Required fields
  if (typeof r.run_id !== 'string' || !r.run_id.startsWith('run_')) {
    return false;
  }
  if (typeof r.thread_id !== 'string' || r.thread_id.length === 0) {
    return false;
  }
  if (typeof r.session_id !== 'string' || r.session_id.length === 0) {
    return false;
  }
  if (typeof r.started_at !== 'string') {
    return false;
  }
  if (r.completed_at !== null && typeof r.completed_at !== 'string') {
    return false;
  }
  if (!Object.values(RunStatus).includes(r.status as RunStatus)) {
    return false;
  }
  if (!Object.values(RunTrigger).includes(r.trigger as RunTrigger)) {
    return false;
  }

  return true;
}

/**
 * Check if a run is currently running
 */
export function isRunning(run: Run): boolean {
  return run.status === RunStatus.RUNNING;
}

/**
 * Check if a run has completed (either successfully or with failure)
 */
export function isCompleted(run: Run): boolean {
  return run.status === RunStatus.COMPLETED;
}

/**
 * Check if a run has failed
 */
export function isFailed(run: Run): boolean {
  return run.status === RunStatus.FAILED;
}

/**
 * Check if a run was cancelled
 */
export function isCancelled(run: Run): boolean {
  return run.status === RunStatus.CANCELLED;
}

/**
 * Check if a run is in a terminal state (completed, failed, or cancelled)
 */
export function isTerminal(run: Run): boolean {
  return (
    run.status === RunStatus.COMPLETED ||
    run.status === RunStatus.FAILED ||
    run.status === RunStatus.CANCELLED
  );
}

/**
 * Get duration of a run in milliseconds
 * Returns null if run is still in progress
 */
export function getRunDuration(run: Run): number | null {
  if (run.completed_at === null) {
    return null;
  }
  const start = new Date(run.started_at).getTime();
  const end = new Date(run.completed_at).getTime();
  return end - start;
}
