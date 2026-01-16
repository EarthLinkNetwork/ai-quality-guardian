"use strict";
/**
 * Status Commands Handler
 * Manages /status and /tasks commands
 *
 * UX Improvements (v2):
 * - Tasks are categorized into Active/Completed/Failed/Pending sections
 * - ERROR tasks no longer shown as "Current Tasks"
 * - Human-readable error messages with guidance
 * - Alert banners for failed tasks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusCommands = void 0;
exports.getHumanReadableError = getHumanReadableError;
exports.getErrorGuidance = getErrorGuidance;
const enums_1 = require("../../models/enums");
/**
 * Helper to normalize status for comparison
 * TaskStatus enum values are UPPERCASE, but some code uses lowercase
 */
function normalizeStatus(status) {
    return (status || '').toUpperCase();
}
/**
 * Translate technical error messages to human-readable form
 */
function getHumanReadableError(errorMessage) {
    // NO_EVIDENCE / verified files error
    if (errorMessage.includes('verified files') || errorMessage.includes('no evidence')) {
        return 'No files were created or modified by this task';
    }
    // Blocked executor
    if (errorMessage.includes('BLOCKED') || errorMessage.includes('blocked')) {
        return 'Task was interrupted (may require interactive input)';
    }
    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
        return 'Task took too long and was stopped';
    }
    // Default: return original but truncate if too long
    if (errorMessage.length > 100) {
        return errorMessage.substring(0, 100) + '...';
    }
    return errorMessage;
}
/**
 * Get guidance for specific error types
 */
function getErrorGuidance(status) {
    const normalizedStatus = normalizeStatus(status);
    switch (normalizedStatus) {
        case 'NO_EVIDENCE':
            return [
                'The task ran but no files were verified on disk.',
                '',
                'To resolve:',
                '  1. Check task description - was a file path specified?',
                '  2. Run /logs <task-id> to see execution details',
                '  3. Try rephrasing your request with explicit file paths',
                '     Example: "Create a file at src/utils/helper.ts with..."',
            ];
        case 'ERROR':
            return [
                'The task encountered an error during execution.',
                '',
                'To resolve:',
                '  1. Run /logs <task-id> --full for detailed error logs',
                '  2. Check if the task description is clear and specific',
                '  3. Retry the task or break it into smaller steps',
            ];
        case 'INVALID':
            return [
                'The task or its result was invalid.',
                '',
                'To resolve:',
                '  1. Run /logs <task-id> to see what went wrong',
                '  2. Ensure your request is clear and actionable',
            ];
        default:
            return [];
    }
}
/**
 * Status commands handler
 */
class StatusCommands {
    session;
    constructor(session) {
        this.session = session;
    }
    /**
     * Get current session status
     */
    async getStatus() {
        if (!this.session.sessionId) {
            return this.formatNoSession();
        }
        if (!this.session.runner) {
            return this.formatNoRunner();
        }
        try {
            const sessionState = this.session.runner.getSessionState();
            const overallStatus = this.session.runner.getOverallStatus();
            const taskResults = this.session.runner.getTaskResults();
            if (!sessionState || !sessionState.session_id) {
                return this.formatNoState();
            }
            return this.formatStatus(sessionState, overallStatus, taskResults);
        }
        catch (err) {
            return 'Error getting status: ' + err.message;
        }
    }
    /**
     * Get current tasks - with improved categorization
     */
    async getTasks() {
        if (!this.session.sessionId) {
            return 'No active session. Use /start to begin.';
        }
        if (!this.session.runner) {
            return 'Runner not initialized. Use /start first.';
        }
        try {
            const taskResults = this.session.runner.getTaskResults();
            if (!taskResults || taskResults.length === 0) {
                return 'No tasks in current session.';
            }
            return this.formatTasksImproved(taskResults);
        }
        catch (err) {
            return 'Error getting tasks: ' + err.message;
        }
    }
    /**
     * Categorize tasks by status
     */
    categorizeTasks(tasks) {
        const result = {
            active: [],
            completed: [],
            failed: [],
            pending: [],
        };
        for (const task of tasks) {
            const status = normalizeStatus(task.status);
            if (status === enums_1.TaskStatus.IN_PROGRESS) {
                result.active.push(task);
            }
            else if (status === enums_1.TaskStatus.COMPLETE || status === enums_1.TaskStatus.COMPLETED) {
                result.completed.push(task);
            }
            else if (status === enums_1.TaskStatus.ERROR ||
                status === enums_1.TaskStatus.NO_EVIDENCE ||
                status === enums_1.TaskStatus.INVALID ||
                status === 'FAILED') {
                result.failed.push(task);
            }
            else if (status === enums_1.TaskStatus.PENDING) {
                result.pending.push(task);
            }
            else {
                // Unknown status - treat as pending
                result.pending.push(task);
            }
        }
        return result;
    }
    /**
     * Format no session message
     */
    formatNoSession() {
        return '\n' +
            'Session Status\n' +
            '==============\n' +
            'Status: No active session\n' +
            '\n' +
            'To start a session:\n' +
            '  /start [project-path]\n' +
            '\n' +
            'To continue a session:\n' +
            '  /continue [session-id]\n';
    }
    /**
     * Format no runner message
     */
    formatNoRunner() {
        return '\n' +
            'Session Status\n' +
            '==============\n' +
            'Session ID: ' + this.session.sessionId + '\n' +
            'Status: Runner not initialized\n' +
            '\n' +
            'Use /start to initialize the runner.\n';
    }
    /**
     * Format no state message
     */
    formatNoState() {
        return '\n' +
            'Session Status\n' +
            '==============\n' +
            'Session ID: ' + this.session.sessionId + '\n' +
            'Status: State not available\n' +
            '\n' +
            'The session may have been corrupted. Try /start to begin a new session.\n';
    }
    /**
     * Format status from state
     */
    formatStatus(sessionState, overallStatus, taskResults) {
        const lines = [
            '',
            'Session Status',
            '==============',
            'Session ID: ' + (sessionState.session_id || this.session.sessionId),
            'Phase: ' + (sessionState.current_phase || 'unknown'),
            'Status: ' + this.session.status,
            'Project: ' + this.session.projectPath,
        ];
        if (taskResults && taskResults.length > 0) {
            const completed = taskResults.filter((t) => normalizeStatus(t.status) === enums_1.TaskStatus.COMPLETED ||
                normalizeStatus(t.status) === enums_1.TaskStatus.COMPLETE).length;
            const total = taskResults.length;
            lines.push('Tasks: ' + completed + '/' + total + ' completed');
        }
        if (overallStatus) {
            lines.push('Overall: ' + overallStatus);
        }
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Format tasks list - IMPROVED with categorization and guidance
     */
    formatTasksImproved(tasks) {
        const categorized = this.categorizeTasks(tasks);
        const lines = [''];
        // Show alert banner if there are failed tasks
        if (categorized.failed.length > 0) {
            lines.push('!!! ALERT: ' + categorized.failed.length + ' task(s) failed !!!');
            lines.push('');
        }
        // Failed Tasks section (show first if any - most important for UX)
        if (categorized.failed.length > 0) {
            lines.push('Failed Tasks');
            lines.push('------------');
            for (const task of categorized.failed) {
                const taskId = task.task_id || task.id || 'unknown';
                const status = task.status || 'ERROR';
                lines.push('[!] ' + taskId + ': ' + status);
                // Show human-readable error
                if (task.error?.message) {
                    const humanError = getHumanReadableError(task.error.message);
                    lines.push('    Error: ' + humanError);
                }
            }
            // Show guidance for failed tasks
            if (categorized.failed.length > 0) {
                const firstFailedStatus = normalizeStatus(categorized.failed[0].status);
                const guidance = getErrorGuidance(firstFailedStatus);
                if (guidance.length > 0) {
                    lines.push('');
                    for (const line of guidance) {
                        lines.push('    ' + line);
                    }
                }
            }
            lines.push('');
        }
        // Active Tasks section
        if (categorized.active.length > 0) {
            lines.push('Active Tasks');
            lines.push('------------');
            for (const task of categorized.active) {
                const taskId = task.task_id || task.id || 'unknown';
                lines.push('[>] ' + taskId + ': IN_PROGRESS');
            }
            lines.push('');
        }
        // Pending Tasks section
        if (categorized.pending.length > 0) {
            lines.push('Pending Tasks');
            lines.push('-------------');
            for (const task of categorized.pending) {
                const taskId = task.task_id || task.id || 'unknown';
                lines.push('[ ] ' + taskId + ': PENDING');
            }
            lines.push('');
        }
        // Completed Tasks section (at the end - less urgent)
        if (categorized.completed.length > 0) {
            lines.push('Completed Tasks');
            lines.push('---------------');
            for (const task of categorized.completed) {
                const taskId = task.task_id || task.id || 'unknown';
                lines.push('[x] ' + taskId + ': COMPLETED');
            }
            lines.push('');
        }
        // Summary
        lines.push('Summary');
        lines.push('-------');
        lines.push(categorized.completed.length + ' completed, ' + categorized.active.length + ' running, ' + categorized.pending.length + ' pending, ' + categorized.failed.length + ' failed');
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Get status icon
     */
    getStatusIcon(status) {
        switch (status) {
            case 'completed':
                return '[x]';
            case 'in_progress':
                return '[>]';
            case 'pending':
                return '[ ]';
            case 'failed':
                return '[!]';
            default:
                return '[?]';
        }
    }
}
exports.StatusCommands = StatusCommands;
//# sourceMappingURL=status.js.map