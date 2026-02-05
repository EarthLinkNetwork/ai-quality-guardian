/**
 * TaskEvents Data Access Layer
 */
import { TaskEvent, TaskEventType } from "./types";
/**
 * Create a task event
 */
export declare function createTaskEvent(orgId: string, taskId: string, eventType: TaskEventType, data?: Record<string, unknown>): Promise<TaskEvent>;
/**
 * Get events for a task
 */
export declare function getTaskEvents(orgId: string, taskId: string, options?: {
    limit?: number;
    ascending?: boolean;
}): Promise<TaskEvent[]>;
/**
 * Get recent events across all tasks in org
 */
export declare function getRecentEvents(orgId: string, options?: {
    limit?: number;
}): Promise<TaskEvent[]>;
export declare function logTaskCreated(orgId: string, taskId: string, prompt: string): Promise<TaskEvent>;
export declare function logTaskQueued(orgId: string, taskId: string): Promise<TaskEvent>;
export declare function logTaskStarted(orgId: string, taskId: string, agentId: string): Promise<TaskEvent>;
export declare function logTaskProgress(orgId: string, taskId: string, message: string): Promise<TaskEvent>;
export declare function logTaskAwaitingResponse(orgId: string, taskId: string, question: string): Promise<TaskEvent>;
export declare function logTaskResponseReceived(orgId: string, taskId: string, response: string): Promise<TaskEvent>;
export declare function logTaskCompleted(orgId: string, taskId: string, result?: string): Promise<TaskEvent>;
export declare function logTaskFailed(orgId: string, taskId: string, error: string): Promise<TaskEvent>;
export declare function logTaskCancelled(orgId: string, taskId: string): Promise<TaskEvent>;
export declare function logTaskRetried(orgId: string, taskId: string): Promise<TaskEvent>;
//# sourceMappingURL=task-events.d.ts.map