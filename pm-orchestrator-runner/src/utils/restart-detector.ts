/**
 * Restart Detection Utility
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-RESUME-1, AC-RESUME-2:
 * - Detects when executor process has terminated
 * - Supports "Resume = Replay" principle
 * - Default is rollback → replay for safety
 */

import { QueueItem, QueueItemStatus, ProgressEvent } from '../queue/index';

/**
 * Extended task with progress events for restart detection
 */
export interface PersistedTask extends QueueItem {
  events?: ProgressEvent[];
  attempt?: number;
}

/**
 * Restart detection result
 */
export interface RestartDetectionResult {
  isStale: boolean;
  reason: 'no_events' | 'timeout' | 'executor_absent' | 'none';
  elapsedMs: number;
  lastEventTimestamp?: string;
  recommendedAction: 'rollback_replay' | 'soft_resume' | 'none';
}

/**
 * Configuration for restart detection
 */
export interface RestartDetectorConfig {
  /** Threshold in ms for considering a task stale (default: 30000 = 30s) */
  staleThresholdMs: number;
  /** Whether to allow soft resume when artifacts are complete */
  allowSoftResume: boolean;
}

const DEFAULT_CONFIG: RestartDetectorConfig = {
  staleThresholdMs: 30000,
  allowSoftResume: true,
};

/**
 * Detects if a task's executor process has likely terminated
 *
 * Per AC-RESUME-1: After Web UI restart, execution processes are assumed terminated
 * Per AC-RESUME-2: Default is rollback → replay when restart detected
 *
 * @param task - The persisted task to check
 * @param config - Optional configuration
 * @returns Detection result with recommended action
 */
export function detectRestartCondition(
  task: PersistedTask,
  config: Partial<RestartDetectorConfig> = {}
): RestartDetectionResult {
  const { staleThresholdMs, allowSoftResume } = { ...DEFAULT_CONFIG, ...config };

  // Only check RUNNING tasks
  if (task.status !== 'RUNNING') {
    return {
      isStale: false,
      reason: 'none',
      elapsedMs: 0,
      recommendedAction: 'none',
    };
  }

  const events = task.events || [];
  const lastEvent = events[events.length - 1];

  // Calculate elapsed time since last progress
  const lastProgressTime = lastEvent?.timestamp || task.updated_at;
  const elapsed = Date.now() - new Date(lastProgressTime).getTime();

  // Check if task is stale
  if (elapsed > staleThresholdMs) {
    // Determine recommended action
    const hasCompleteArtifacts = checkArtifactsComplete(task, events);
    const recommendedAction = (allowSoftResume && hasCompleteArtifacts)
      ? 'soft_resume'
      : 'rollback_replay';

    return {
      isStale: true,
      reason: events.length === 0 ? 'no_events' : 'timeout',
      elapsedMs: elapsed,
      lastEventTimestamp: lastEvent?.timestamp,
      recommendedAction,
    };
  }

  return {
    isStale: false,
    reason: 'none',
    elapsedMs: elapsed,
    lastEventTimestamp: lastEvent?.timestamp,
    recommendedAction: 'none',
  };
}

/**
 * Checks if a task is a candidate for AWAITING_RESPONSE status
 * Based on stale detection + user needs to respond
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns true if task should show Resume UI
 */
export function shouldShowResumeUI(
  task: PersistedTask,
  config: Partial<RestartDetectorConfig> = {}
): boolean {
  // AWAITING_RESPONSE always shows Resume UI
  if (task.status === 'AWAITING_RESPONSE') {
    return true;
  }

  // Check for stale RUNNING tasks
  const detection = detectRestartCondition(task, config);
  return detection.isStale;
}

/**
 * Determines available resume options for a task
 *
 * Per AC-RESUME-3: Task detail shows Resume/Rollback options
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns Available resume options
 */
export function getResumeOptions(
  task: PersistedTask,
  config: Partial<RestartDetectorConfig> = {}
): {
  canResume: boolean;
  canRollbackReplay: boolean;
  canSoftResume: boolean;
  defaultAction: 'rollback_replay' | 'soft_resume' | 'none';
} {
  const detection = detectRestartCondition(task, config);

  if (!detection.isStale && task.status !== 'AWAITING_RESPONSE') {
    return {
      canResume: false,
      canRollbackReplay: false,
      canSoftResume: false,
      defaultAction: 'none',
    };
  }

  const hasCompleteArtifacts = checkArtifactsComplete(task, task.events || []);

  return {
    canResume: true,
    canRollbackReplay: true,
    canSoftResume: hasCompleteArtifacts && config.allowSoftResume !== false,
    defaultAction: detection.recommendedAction,
  };
}

/**
 * Checks if task artifacts are complete enough for soft resume
 *
 * Per AC-RESUME-2: Soft resume allowed only when artifacts are saved:
 * - Applied patches
 * - Step log
 * - Test failure summary
 *
 * @param task - The task to check
 * @param events - Progress events
 * @returns true if artifacts are complete
 */
function checkArtifactsComplete(task: PersistedTask, events: ProgressEvent[]): boolean {
  // Check for required artifact events
  const hasStepLog = events.some(e =>
    e.type === 'log_chunk' ||
    (e.type === 'tool_progress' && e.data)
  );

  // Check if task has output (partial work saved)
  const hasOutput = !!task.output && task.output.trim() !== '';

  // For now, require both step log and output for soft resume
  return hasStepLog && hasOutput;
}

/**
 * Adds a progress event to a task
 *
 * @param task - The task to update
 * @param event - The event to add (without timestamp)
 * @returns Updated task with new event
 */
export function addProgressEvent(
  task: PersistedTask,
  event: Omit<ProgressEvent, 'timestamp'>
): PersistedTask {
  const newEvent: ProgressEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  return {
    ...task,
    events: [...(task.events || []), newEvent],
    updated_at: newEvent.timestamp,
  };
}

/**
 * Creates a heartbeat event
 */
export function createHeartbeatEvent(): Omit<ProgressEvent, 'timestamp'> {
  return { type: 'heartbeat' };
}

/**
 * Creates a tool progress event
 */
export function createToolProgressEvent(data: unknown): Omit<ProgressEvent, 'timestamp'> {
  return { type: 'tool_progress', data };
}

/**
 * Creates a log chunk event
 */
export function createLogChunkEvent(data: string): Omit<ProgressEvent, 'timestamp'> {
  return { type: 'log_chunk', data };
}
