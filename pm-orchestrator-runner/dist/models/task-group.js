"use strict";
/**
 * Task Group Model
 * Per spec 16_TASK_GROUP.md
 *
 * Task Group は「会話・思考・文脈の単位」である。
 * 05_DATA_MODELS.md の Thread 概念を拡張し、
 * 論理的な会話単位としての役割を明確化する。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTaskGroupId = generateTaskGroupId;
exports.resetTaskGroupCounter = resetTaskGroupCounter;
exports.generateConversationEntryId = generateConversationEntryId;
exports.resetConversationEntryCounter = resetConversationEntryCounter;
exports.createTaskGroup = createTaskGroup;
exports.activateTaskGroup = activateTaskGroup;
exports.pauseTaskGroup = pauseTaskGroup;
exports.resumeTaskGroup = resumeTaskGroup;
exports.completeTaskGroup = completeTaskGroup;
exports.addConversationEntry = addConversationEntry;
exports.addFileChange = addFileChange;
exports.updateLastTaskResult = updateLastTaskResult;
exports.validateTaskGroup = validateTaskGroup;
exports.isTaskGroupActive = isTaskGroupActive;
exports.isTaskGroupCompleted = isTaskGroupCompleted;
const enums_1 = require("./enums");
/**
 * Task group counter for generating unique IDs
 */
let taskGroupCounter = 0;
/**
 * Generate a unique task group ID
 * Format: tg_<連番>
 */
function generateTaskGroupId() {
    taskGroupCounter++;
    return `tg_${taskGroupCounter}`;
}
/**
 * Reset task group counter (for testing)
 */
function resetTaskGroupCounter() {
    taskGroupCounter = 0;
}
/**
 * Conversation entry counter
 */
let conversationEntryCounter = 0;
/**
 * Generate a unique conversation entry ID
 */
function generateConversationEntryId() {
    conversationEntryCounter++;
    return `ce_${conversationEntryCounter}`;
}
/**
 * Reset conversation entry counter (for testing)
 */
function resetConversationEntryCounter() {
    conversationEntryCounter = 0;
}
/**
 * Create a new Task Group
 */
function createTaskGroup(sessionId, description) {
    const taskGroupId = generateTaskGroupId();
    return {
        task_group_id: taskGroupId,
        session_id: sessionId,
        created_at: new Date().toISOString(),
        description,
        state: enums_1.TaskGroupState.CREATED,
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
function activateTaskGroup(taskGroup) {
    if (taskGroup.state === enums_1.TaskGroupState.COMPLETED) {
        throw new Error('Cannot activate a completed task group');
    }
    return {
        ...taskGroup,
        state: enums_1.TaskGroupState.ACTIVE,
    };
}
/**
 * Pause a task group
 * Per spec 16_TASK_GROUP.md L139: Active → Paused: ユーザーが一時停止
 */
function pauseTaskGroup(taskGroup) {
    if (taskGroup.state !== enums_1.TaskGroupState.ACTIVE) {
        throw new Error('Can only pause an active task group');
    }
    return {
        ...taskGroup,
        state: enums_1.TaskGroupState.PAUSED,
    };
}
/**
 * Resume a paused task group
 * Per spec 16_TASK_GROUP.md L140: Paused → Active: ユーザーが再開
 */
function resumeTaskGroup(taskGroup) {
    if (taskGroup.state !== enums_1.TaskGroupState.PAUSED) {
        throw new Error('Can only resume a paused task group');
    }
    return {
        ...taskGroup,
        state: enums_1.TaskGroupState.ACTIVE,
    };
}
/**
 * Complete a task group
 * Per spec 16_TASK_GROUP.md L141-142: Active → Completed: ユーザーが明示的に終了
 */
function completeTaskGroup(taskGroup) {
    if (taskGroup.state !== enums_1.TaskGroupState.ACTIVE) {
        throw new Error('Can only complete an active task group');
    }
    return {
        ...taskGroup,
        state: enums_1.TaskGroupState.COMPLETED,
    };
}
/**
 * Add a conversation entry to the task group
 */
function addConversationEntry(taskGroup, role, content, taskId) {
    const entry = {
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
function addFileChange(taskGroup, filePath, changeType, taskId, previousHash, newHash) {
    const change = {
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
    }
    else if (changeType === 'deleted') {
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
function updateLastTaskResult(taskGroup, result) {
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
function validateTaskGroup(taskGroup) {
    if (typeof taskGroup !== 'object' || taskGroup === null) {
        return false;
    }
    const tg = taskGroup;
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
    if (!Object.values(enums_1.TaskGroupState).includes(tg.state)) {
        return false;
    }
    // Context validation
    if (typeof tg.context !== 'object' || tg.context === null) {
        return false;
    }
    const ctx = tg.context;
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
function isTaskGroupActive(taskGroup) {
    return taskGroup.state === enums_1.TaskGroupState.ACTIVE;
}
/**
 * Check if a task group is completed (read-only)
 */
function isTaskGroupCompleted(taskGroup) {
    return taskGroup.state === enums_1.TaskGroupState.COMPLETED;
}
//# sourceMappingURL=task-group.js.map