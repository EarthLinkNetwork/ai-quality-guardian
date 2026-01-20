/**
 * Task Group Model
 * Per spec 16_TASK_GROUP.md
 *
 * Task Group は「会話・思考・文脈の単位」である。
 * 05_DATA_MODELS.md の Thread 概念を拡張し、
 * 論理的な会話単位としての役割を明確化する。
 */
import { TaskGroupState } from './enums';
/**
 * Conversation entry in task group history
 * Represents a single input/output pair in the conversation
 */
export interface ConversationEntry {
    /** Entry ID */
    entry_id: string;
    /** Role (user/assistant/system) */
    role: 'user' | 'assistant' | 'system';
    /** Content of the entry */
    content: string;
    /** Timestamp of the entry */
    timestamp: string;
    /** Associated task ID (if applicable) */
    task_id?: string;
}
/**
 * File change record
 * Tracks changes made to files within a task group
 */
export interface FileChange {
    /** Path to the file */
    file_path: string;
    /** Type of change */
    change_type: 'created' | 'modified' | 'deleted';
    /** Task that made the change */
    task_id: string;
    /** Timestamp of the change */
    timestamp: string;
    /** Previous content hash (for modified/deleted) */
    previous_hash?: string;
    /** New content hash (for created/modified) */
    new_hash?: string;
}
/**
 * Task result for context maintenance
 * Summarized result of a task execution
 */
export interface TaskResult {
    /** Task ID */
    task_id: string;
    /** Final status */
    status: string;
    /** Summary of what was done */
    summary: string;
    /** Files that were modified */
    files_modified: string[];
    /** Error if any */
    error?: string;
    /** Completion timestamp */
    completed_at: string;
}
/**
 * Task Group Context
 * Per spec 16_TASK_GROUP.md L100-106
 *
 * Contains all context information that persists within a task group.
 */
export interface TaskGroupContext {
    /** Task Group ID (corresponds to thread_id for main thread) */
    task_group_id: string;
    /** Conversation history within this task group */
    conversation_history: ConversationEntry[];
    /** Files currently being worked on */
    working_files: string[];
    /** Result of the last completed task */
    last_task_result: TaskResult | null;
    /** All file changes accumulated in this task group */
    accumulated_changes: FileChange[];
}
/**
 * Task Group metadata
 * Per spec 16_TASK_GROUP.md L36-42
 */
export interface TaskGroup {
    /** Task Group ID (corresponds to thread_id) */
    task_group_id: string;
    /** Parent session ID */
    session_id: string;
    /** Creation timestamp */
    created_at: string;
    /** Human-readable description */
    description?: string;
    /** Current state */
    state: TaskGroupState;
    /** Context maintained within this group */
    context: TaskGroupContext;
}
/**
 * Generate a unique task group ID
 * Format: tg_<連番>
 */
export declare function generateTaskGroupId(): string;
/**
 * Reset task group counter (for testing)
 */
export declare function resetTaskGroupCounter(): void;
/**
 * Generate a unique conversation entry ID
 */
export declare function generateConversationEntryId(): string;
/**
 * Reset conversation entry counter (for testing)
 */
export declare function resetConversationEntryCounter(): void;
/**
 * Create a new Task Group
 */
export declare function createTaskGroup(sessionId: string, description?: string): TaskGroup;
/**
 * Activate a task group
 * Per spec 16_TASK_GROUP.md L138: Created → Active: 最初のタスク投入時
 */
export declare function activateTaskGroup(taskGroup: TaskGroup): TaskGroup;
/**
 * Pause a task group
 * Per spec 16_TASK_GROUP.md L139: Active → Paused: ユーザーが一時停止
 */
export declare function pauseTaskGroup(taskGroup: TaskGroup): TaskGroup;
/**
 * Resume a paused task group
 * Per spec 16_TASK_GROUP.md L140: Paused → Active: ユーザーが再開
 */
export declare function resumeTaskGroup(taskGroup: TaskGroup): TaskGroup;
/**
 * Complete a task group
 * Per spec 16_TASK_GROUP.md L141-142: Active → Completed: ユーザーが明示的に終了
 */
export declare function completeTaskGroup(taskGroup: TaskGroup): TaskGroup;
/**
 * Add a conversation entry to the task group
 */
export declare function addConversationEntry(taskGroup: TaskGroup, role: 'user' | 'assistant' | 'system', content: string, taskId?: string): TaskGroup;
/**
 * Add a file change to the task group
 */
export declare function addFileChange(taskGroup: TaskGroup, filePath: string, changeType: 'created' | 'modified' | 'deleted', taskId: string, previousHash?: string, newHash?: string): TaskGroup;
/**
 * Update the last task result
 * Per spec 16_TASK_GROUP.md L113-116: Task 完了後の文脈更新
 */
export declare function updateLastTaskResult(taskGroup: TaskGroup, result: TaskResult): TaskGroup;
/**
 * Validate a task group
 */
export declare function validateTaskGroup(taskGroup: unknown): taskGroup is TaskGroup;
/**
 * Check if a task group is active
 */
export declare function isTaskGroupActive(taskGroup: TaskGroup): boolean;
/**
 * Check if a task group is completed (read-only)
 */
export declare function isTaskGroupCompleted(taskGroup: TaskGroup): boolean;
//# sourceMappingURL=task-group.d.ts.map