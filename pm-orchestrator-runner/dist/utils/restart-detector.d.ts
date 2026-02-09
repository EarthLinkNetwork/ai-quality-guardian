/**
 * Restart Detection Utility
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-RESUME-1, AC-RESUME-2:
 * - Detects when executor process has terminated
 * - Supports "Resume = Replay" principle
 * - Default is rollback → replay for safety
 */
import { QueueItem } from '../queue/index';
/**
 * Progress event types emitted by executor
 */
export interface ProgressEvent {
    type: 'heartbeat' | 'tool_progress' | 'log_chunk';
    timestamp: string;
    data?: unknown;
}
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
export declare function detectRestartCondition(task: PersistedTask, config?: Partial<RestartDetectorConfig>): RestartDetectionResult;
/**
 * Checks if a task is a candidate for AWAITING_RESPONSE status
 * Based on stale detection + user needs to respond
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns true if task should show Resume UI
 */
export declare function shouldShowResumeUI(task: PersistedTask, config?: Partial<RestartDetectorConfig>): boolean;
/**
 * Determines available resume options for a task
 *
 * Per AC-RESUME-3: Task detail shows Resume/Rollback options
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns Available resume options
 */
export declare function getResumeOptions(task: PersistedTask, config?: Partial<RestartDetectorConfig>): {
    canResume: boolean;
    canRollbackReplay: boolean;
    canSoftResume: boolean;
    defaultAction: 'rollback_replay' | 'soft_resume' | 'none';
};
/**
 * Adds a progress event to a task
 *
 * @param task - The task to update
 * @param event - The event to add (without timestamp)
 * @returns Updated task with new event
 */
export declare function addProgressEvent(task: PersistedTask, event: Omit<ProgressEvent, 'timestamp'>): PersistedTask;
/**
 * Creates a heartbeat event
 */
export declare function createHeartbeatEvent(): Omit<ProgressEvent, 'timestamp'>;
/**
 * Creates a tool progress event
 */
export declare function createToolProgressEvent(data: unknown): Omit<ProgressEvent, 'timestamp'>;
/**
 * Creates a log chunk event
 */
export declare function createLogChunkEvent(data: string): Omit<ProgressEvent, 'timestamp'>;
//# sourceMappingURL=restart-detector.d.ts.map