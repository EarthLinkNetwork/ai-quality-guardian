"use strict";
/**
 * Logs Command
 *
 * Per spec 10_REPL_UX.md Section 2.4:
 * - /logs: list task logs for current session
 * - /logs <task-id>: show task details (summary view)
 * - /logs <task-id> --full: show task details (full view with executor logs)
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Two-layer viewing (summary/full)
 * - Logs stored in .claude/logs/
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25:
 * - Log visibility control (summary default, --full for details)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogsCommand = void 0;
const task_log_manager_1 = require("../../logging/task-log-manager");
/**
 * Logs Command class
 */
class LogsCommand {
    logManager = null;
    projectPath = '';
    /**
     * Initialize log manager with project path
     *
     * @param projectPath - Project path
     */
    ensureLogManager(projectPath) {
        if (!this.logManager || this.projectPath !== projectPath) {
            this.projectPath = projectPath;
            this.logManager = new task_log_manager_1.TaskLogManager(projectPath);
        }
        return this.logManager;
    }
    /**
     * List task logs for a session
     * Per spec 10_REPL_UX.md: /logs shows task list (Layer 1)
     *
     * @param projectPath - Project path
     * @param sessionId - Session ID
     * @returns Logs result
     */
    async listLogs(projectPath, sessionId) {
        try {
            const manager = this.ensureLogManager(projectPath);
            const entries = await manager.getTaskList(sessionId);
            const output = manager.formatTaskList(entries, sessionId);
            return {
                success: true,
                message: 'Task logs retrieved',
                output,
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to retrieve logs',
                error: {
                    code: 'E107',
                    message: 'Failed to retrieve logs: ' + err.message,
                },
            };
        }
    }
    /**
     * Get task detail
     * Per spec 10_REPL_UX.md: /logs <task-id> shows details (Layer 2)
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25: --full for executor logs
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param full - Show full details (executor logs)
     * @returns Logs result
     */
    async getTaskDetail(projectPath, taskId, full = false) {
        try {
            const manager = this.ensureLogManager(projectPath);
            const visibility = full ? 'full' : 'summary';
            const { log, events } = await manager.getTaskDetail(taskId, visibility);
            if (!log) {
                return {
                    success: false,
                    message: 'Task not found',
                    error: {
                        code: 'E108',
                        message: 'Task not found: ' + taskId,
                    },
                };
            }
            const output = manager.formatTaskDetail(taskId, log, events, full);
            return {
                success: true,
                message: 'Task detail retrieved',
                output,
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to retrieve task detail',
                error: {
                    code: 'E107',
                    message: 'Failed to retrieve task detail: ' + err.message,
                },
            };
        }
    }
    /**
     * Create a new task log
     * Called when starting a new task
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param sessionId - Session ID
     * @returns Logs result
     */
    async createTaskLog(projectPath, taskId, sessionId) {
        try {
            const manager = this.ensureLogManager(projectPath);
            await manager.createTask(taskId, sessionId);
            return {
                success: true,
                message: 'Task log created',
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to create task log',
                error: {
                    code: 'E107',
                    message: 'Failed to create task log: ' + err.message,
                },
            };
        }
    }
    /**
     * Add event to task log
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param eventType - Event type
     * @param content - Event content
     * @returns Logs result
     */
    async addEvent(projectPath, taskId, eventType, content) {
        try {
            const manager = this.ensureLogManager(projectPath);
            await manager.addEvent(taskId, eventType, content);
            return {
                success: true,
                message: 'Event added',
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to add event',
                error: {
                    code: 'E107',
                    message: 'Failed to add event: ' + err.message,
                },
            };
        }
    }
    /**
     * Complete a task log
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param status - Completion status
     * @param filesModified - List of modified files
     * @returns Logs result
     */
    async completeTask(projectPath, taskId, status, filesModified = []) {
        try {
            const manager = this.ensureLogManager(projectPath);
            await manager.completeTask(taskId, status, filesModified);
            return {
                success: true,
                message: 'Task completed',
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to complete task',
                error: {
                    code: 'E107',
                    message: 'Failed to complete task: ' + err.message,
                },
            };
        }
    }
}
exports.LogsCommand = LogsCommand;
//# sourceMappingURL=logs.js.map