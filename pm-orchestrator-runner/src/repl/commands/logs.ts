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

import * as path from 'path';
import { TaskLogManager } from '../../logging/task-log-manager';
import { VisibilityLevel } from '../../models/repl';

/**
 * Logs command result
 */
export interface LogsResult {
  success: boolean;
  message: string;
  output?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Logs Command class
 */
export class LogsCommand {
  private logManager: TaskLogManager | null = null;
  private projectPath: string = '';

  /**
   * Initialize log manager with project path
   *
   * @param projectPath - Project path
   */
  private ensureLogManager(projectPath: string): TaskLogManager {
    if (!this.logManager || this.projectPath !== projectPath) {
      this.projectPath = projectPath;
      this.logManager = new TaskLogManager(projectPath);
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
  async listLogs(projectPath: string, sessionId: string): Promise<LogsResult> {
    try {
      const manager = this.ensureLogManager(projectPath);
      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      return {
        success: true,
        message: 'Task logs retrieved',
        output,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to retrieve logs',
        error: {
          code: 'E107',
          message: 'Failed to retrieve logs: ' + (err as Error).message,
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
  async getTaskDetail(projectPath: string, taskId: string, full: boolean = false): Promise<LogsResult> {
    try {
      const manager = this.ensureLogManager(projectPath);
      const visibility: VisibilityLevel = full ? 'full' : 'summary';
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
    } catch (err) {
      return {
        success: false,
        message: 'Failed to retrieve task detail',
        error: {
          code: 'E107',
          message: 'Failed to retrieve task detail: ' + (err as Error).message,
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
  async createTaskLog(projectPath: string, taskId: string, sessionId: string): Promise<LogsResult> {
    try {
      const manager = this.ensureLogManager(projectPath);
      await manager.createTask(taskId, sessionId);

      return {
        success: true,
        message: 'Task log created',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to create task log',
        error: {
          code: 'E107',
          message: 'Failed to create task log: ' + (err as Error).message,
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
  async addEvent(
    projectPath: string,
    taskId: string,
    eventType: string,
    content: Record<string, unknown>
  ): Promise<LogsResult> {
    try {
      const manager = this.ensureLogManager(projectPath);
      await manager.addEvent(
        taskId,
        eventType as Parameters<typeof manager.addEvent>[1],
        content as Parameters<typeof manager.addEvent>[2]
      );

      return {
        success: true,
        message: 'Event added',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to add event',
        error: {
          code: 'E107',
          message: 'Failed to add event: ' + (err as Error).message,
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
  async completeTask(
    projectPath: string,
    taskId: string,
    status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR',
    filesModified: string[] = []
  ): Promise<LogsResult> {
    try {
      const manager = this.ensureLogManager(projectPath);
      await manager.completeTask(taskId, status, filesModified);

      return {
        success: true,
        message: 'Task completed',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to complete task',
        error: {
          code: 'E107',
          message: 'Failed to complete task: ' + (err as Error).message,
        },
      };
    }
  }
}
