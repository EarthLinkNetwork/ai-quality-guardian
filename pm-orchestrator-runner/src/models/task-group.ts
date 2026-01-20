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
 * Task group counter for generating unique IDs
 */
let taskGroupCounter = 0;

/**
 * Generate a unique task group ID
 * Format: tg_<連番>
 */
export function generateTaskGroupId(): string {
  taskGroupCounter++;
  return `tg_${taskGroupCounter}`;
}

/**
 * Reset task group counter (for testing)
 */
export function resetTaskGroupCounter(): void {
  taskGroupCounter = 0;
}

/**
 * Conversation entry counter
 */
let conversationEntryCounter = 0;

/**
 * Generate a unique conversation entry ID
 */
export function generateConversationEntryId(): string {
  conversationEntryCounter++;
  return `ce_${conversationEntryCounter}`;
}

/**
 * Reset conversation entry counter (for testing)
 */
export function resetConversationEntryCounter(): void {
  conversationEntryCounter = 0;
}

/**
 * Create a new Task Group
 */
export function createTaskGroup(
  sessionId: string,
  description?: string
): TaskGroup {
  const taskGroupId = generateTaskGroupId();
  return {
    task_group_id: taskGroupId,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    description,
    state: TaskGroupState.CREATED,
    context: {
      task_group_id: taskGroupId,
      conversation_history: [],
      working_files: [],
      last_task_result: null,
      accumulated_changes: [],
    },
  };
}

/**
 * Activate a task group
 * Per spec 16_TASK_GROUP.md L138: Created → Active: 最初のタスク投入時
 */
export function activateTaskGroup(taskGroup: TaskGroup): TaskGroup {
  if (taskGroup.state === TaskGroupState.COMPLETED) {
    throw new Error('Cannot activate a completed task group');
  }
  return {
    ...taskGroup,
    state: TaskGroupState.ACTIVE,
  };
}

/**
 * Pause a task group
 * Per spec 16_TASK_GROUP.md L139: Active → Paused: ユーザーが一時停止
 */
export function pauseTaskGroup(taskGroup: TaskGroup): TaskGroup {
  if (taskGroup.state !== TaskGroupState.ACTIVE) {
    throw new Error('Can only pause an active task group');
  }
  return {
    ...taskGroup,
    state: TaskGroupState.PAUSED,
  };
}

/**
 * Resume a paused task group
 * Per spec 16_TASK_GROUP.md L140: Paused → Active: ユーザーが再開
 */
export function resumeTaskGroup(taskGroup: TaskGroup): TaskGroup {
  if (taskGroup.state !== TaskGroupState.PAUSED) {
    throw new Error('Can only resume a paused task group');
  }
  return {
    ...taskGroup,
    state: TaskGroupState.ACTIVE,
  };
}

/**
 * Complete a task group
 * Per spec 16_TASK_GROUP.md L141-142: Active → Completed: ユーザーが明示的に終了
 */
export function completeTaskGroup(taskGroup: TaskGroup): TaskGroup {
  if (taskGroup.state !== TaskGroupState.ACTIVE) {
    throw new Error('Can only complete an active task group');
  }
  return {
    ...taskGroup,
    state: TaskGroupState.COMPLETED,
  };
}

/**
 * Add a conversation entry to the task group
 */
export function addConversationEntry(
  taskGroup: TaskGroup,
  role: 'user' | 'assistant' | 'system',
  content: string,
  taskId?: string
): TaskGroup {
  const entry: ConversationEntry = {
    entry_id: generateConversationEntryId(),
    role,
    content,
    timestamp: new Date().toISOString(),
    task_id: taskId,
  };

  return {
    ...taskGroup,
    context: {
      ...taskGroup.context,
      conversation_history: [...taskGroup.context.conversation_history, entry],
    },
  };
}

/**
 * Add a file change to the task group
 */
export function addFileChange(
  taskGroup: TaskGroup,
  filePath: string,
  changeType: 'created' | 'modified' | 'deleted',
  taskId: string,
  previousHash?: string,
  newHash?: string
): TaskGroup {
  const change: FileChange = {
    file_path: filePath,
    change_type: changeType,
    task_id: taskId,
    timestamp: new Date().toISOString(),
    previous_hash: previousHash,
    new_hash: newHash,
  };

  // Update working files
  let workingFiles = [...taskGroup.context.working_files];
  if (changeType === 'created' || changeType === 'modified') {
    if (!workingFiles.includes(filePath)) {
      workingFiles.push(filePath);
    }
  } else if (changeType === 'deleted') {
    workingFiles = workingFiles.filter((f) => f !== filePath);
  }

  return {
    ...taskGroup,
    context: {
      ...taskGroup.context,
      working_files: workingFiles,
      accumulated_changes: [...taskGroup.context.accumulated_changes, change],
    },
  };
}

/**
 * Update the last task result
 * Per spec 16_TASK_GROUP.md L113-116: Task 完了後の文脈更新
 */
export function updateLastTaskResult(
  taskGroup: TaskGroup,
  result: TaskResult
): TaskGroup {
  return {
    ...taskGroup,
    context: {
      ...taskGroup.context,
      last_task_result: result,
    },
  };
}

/**
 * Validate a task group
 */
export function validateTaskGroup(taskGroup: unknown): taskGroup is TaskGroup {
  if (typeof taskGroup !== 'object' || taskGroup === null) {
    return false;
  }

  const tg = taskGroup as Record<string, unknown>;

  // Required fields
  if (typeof tg.task_group_id !== 'string' || !tg.task_group_id.startsWith('tg_')) {
    return false;
  }
  if (typeof tg.session_id !== 'string' || tg.session_id.length === 0) {
    return false;
  }
  if (typeof tg.created_at !== 'string') {
    return false;
  }
  if (!Object.values(TaskGroupState).includes(tg.state as TaskGroupState)) {
    return false;
  }

  // Context validation
  if (typeof tg.context !== 'object' || tg.context === null) {
    return false;
  }

  const ctx = tg.context as Record<string, unknown>;
  if (!Array.isArray(ctx.conversation_history)) {
    return false;
  }
  if (!Array.isArray(ctx.working_files)) {
    return false;
  }
  if (!Array.isArray(ctx.accumulated_changes)) {
    return false;
  }

  return true;
}

/**
 * Check if a task group is active
 */
export function isTaskGroupActive(taskGroup: TaskGroup): boolean {
  return taskGroup.state === TaskGroupState.ACTIVE;
}

/**
 * Check if a task group is completed (read-only)
 */
export function isTaskGroupCompleted(taskGroup: TaskGroup): boolean {
  return taskGroup.state === TaskGroupState.COMPLETED;
}
