/**
 * PM Orchestrator Enhancement - ExecutionLogger Unit Tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ExecutionLogger } from '../../../src/logger/execution-logger';
import { SubagentStatus } from '../../../src/types';

describe('ExecutionLogger', () => {
  let logger: ExecutionLogger;
  let testBaseDir: string;
  let testLogDir: string;

  beforeEach(async () => {
    // テストごとにユニークなディレクトリを使用
    testBaseDir = path.join(process.cwd(), `.pm-orchestrator-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    testLogDir = path.join(testBaseDir, '.pm-orchestrator', 'logs');

    // テスト用ログディレクトリを使用
    logger = new ExecutionLogger(testBaseDir);

    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('startTask', () => {
    it('should create a new execution log with taskId', () => {
      const { taskId, log } = logger.startTask('Test user input');

      expect(taskId).toMatch(/^task-\d+-[a-z0-9]+$/);
      expect(log.taskId).toBe(taskId);
      expect(log.userInput).toBe('Test user input');
      expect(log.status).toBe('success');
      expect(log.subagents).toEqual([]);
    });

    it('should set optional parameters', () => {
      const { log } = logger.startTask(
        'Test input',
        'pr_review',
        'complex',
        'CODERABBIT_RESOLVE'
      );

      expect(log.taskType).toBe('pr_review');
      expect(log.complexity).toBe('complex');
      expect(log.detectedPattern).toBe('CODERABBIT_RESOLVE');
    });

    it('should use default values when optional parameters are not provided', () => {
      const { log } = logger.startTask('Test input');

      expect(log.taskType).toBe('unknown');
      expect(log.complexity).toBe('medium');
      expect(log.detectedPattern).toBe('none');
    });
  });

  describe('recordSubagent', () => {
    it('should record subagent execution', () => {
      logger.startTask('Test input');

      logger.recordSubagent(
        'rule-checker',
        SubagentStatus.COMPLETED,
        { status: 'pass' },
        undefined,
        [{ tool: 'Read', action: 'read file', result: 'success' }]
      );

      const currentLog = logger.getCurrentLog();
      expect(currentLog).not.toBeNull();
      expect(currentLog!.subagents).toHaveLength(1);
      expect(currentLog!.subagents[0].name).toBe('rule-checker');
      expect(currentLog!.subagents[0].status).toBe(SubagentStatus.COMPLETED);
    });

    it('should update existing subagent record', () => {
      logger.startTask('Test input');

      logger.recordSubagent('implementer', SubagentStatus.RUNNING, { progress: 50 });
      logger.recordSubagent('implementer', SubagentStatus.COMPLETED, { progress: 100 });

      const currentLog = logger.getCurrentLog();
      expect(currentLog!.subagents).toHaveLength(1);
      expect(currentLog!.subagents[0].status).toBe(SubagentStatus.COMPLETED);
      expect(currentLog!.subagents[0].output).toEqual({ progress: 100 });
    });

    it('should throw error if no active task', () => {
      expect(() => {
        logger.recordSubagent('rule-checker', SubagentStatus.COMPLETED, {});
      }).toThrow('No active task');
    });
  });

  describe('recordAutoFix', () => {
    it('should record auto-fix attempt', () => {
      logger.startTask('Test input');
      logger.recordAutoFix(true, true);

      const currentLog = logger.getCurrentLog();
      expect(currentLog!.autoFixAttempted).toBe(true);
      expect(currentLog!.autoFixSuccess).toBe(true);
    });

    it('should throw error if no active task', () => {
      expect(() => {
        logger.recordAutoFix(true, true);
      }).toThrow('No active task');
    });
  });

  describe('recordRetry', () => {
    it('should increment retry count', () => {
      logger.startTask('Test input');

      logger.recordRetry();
      expect(logger.getCurrentLog()!.retryCount).toBe(1);

      logger.recordRetry();
      expect(logger.getCurrentLog()!.retryCount).toBe(2);
    });

    it('should throw error if no active task', () => {
      expect(() => {
        logger.recordRetry();
      }).toThrow('No active task');
    });
  });

  describe('recordRollback', () => {
    it('should mark task as rolled back', () => {
      logger.startTask('Test input');
      logger.recordRollback();

      const currentLog = logger.getCurrentLog();
      expect(currentLog!.rollbackExecuted).toBe(true);
      expect(currentLog!.status).toBe('rollback');
    });

    it('should throw error if no active task', () => {
      expect(() => {
        logger.recordRollback();
      }).toThrow('No active task');
    });
  });

  describe('recordFileChanges', () => {
    it('should record file change statistics', () => {
      logger.startTask('Test input');
      logger.recordFileChanges(5, 100, 50, 3);

      const currentLog = logger.getCurrentLog();
      expect(currentLog!.filesChanged).toBe(5);
      expect(currentLog!.linesAdded).toBe(100);
      expect(currentLog!.linesDeleted).toBe(50);
      expect(currentLog!.testsAdded).toBe(3);
    });

    it('should throw error if no active task', () => {
      expect(() => {
        logger.recordFileChanges(1, 10, 5);
      }).toThrow('No active task');
    });
  });

  describe('completeTask', () => {
    it('should complete task and save log to file', async () => {
      const { taskId } = logger.startTask('Test input');

      // 時間経過を待つ
      await new Promise(resolve => setTimeout(resolve, 10));

      logger.recordSubagent('rule-checker', SubagentStatus.COMPLETED, {});
      logger.recordFileChanges(2, 50, 10, 1);

      const completedLog = await logger.completeTask('success', 95);

      expect(completedLog.status).toBe('success');
      expect(completedLog.qualityScore).toBe(95);
      expect(completedLog.duration).toBeGreaterThanOrEqual(0);
      expect(completedLog.endTime).toBeTruthy();

      // ログファイルが作成されたことを確認
      try {
        await fs.access(testLogDir);
        const files = await fs.readdir(testLogDir);
        expect(files.length).toBeGreaterThan(0);
        const taskFiles = files.filter(f => f.includes(taskId));
        expect(taskFiles).toHaveLength(1);
      } catch (error) {
        throw new Error(`Log directory was not created: ${testLogDir}`);
      }
    });

    it('should record error type when provided', async () => {
      logger.startTask('Test input');

      const completedLog = await logger.completeTask('error', 0, 'TEST_FAILURE');

      expect(completedLog.status).toBe('error');
      expect(completedLog.errorType).toBe('TEST_FAILURE');
    });

    it('should clear current log after completion', async () => {
      logger.startTask('Test input');
      await logger.completeTask('success', 100);

      expect(logger.getCurrentLog()).toBeNull();
    });

    it('should throw error if no active task', async () => {
      await expect(logger.completeTask('success', 100)).rejects.toThrow('No active task');
    });
  });

  describe('getLogsBetween', () => {
    it('should return logs within date range', async () => {
      // タスク1を作成
      logger.startTask('Task 1');
      await logger.completeTask('success', 100);

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      // タスク2を作成
      logger.startTask('Task 2');
      await logger.completeTask('success', 90);

      // ログを取得
      const startDate = new Date(Date.now() - 1000);
      const endDate = new Date(Date.now() + 1000);
      const logs = await logger.getLogsBetween(startDate, endDate);

      expect(logs).toHaveLength(2);
      expect(logs[0].userInput).toBe('Task 1');
      expect(logs[1].userInput).toBe('Task 2');
    });

    it('should return empty array when no logs exist', async () => {
      const startDate = new Date(Date.now() - 1000);
      const endDate = new Date(Date.now() + 1000);
      const logs = await logger.getLogsBetween(startDate, endDate);

      expect(logs).toEqual([]);
    });

    it('should filter logs by date range', async () => {
      // 過去のタスクを作成（範囲外）
      logger.startTask('Old task');
      await logger.completeTask('success', 100);

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      const startDate = new Date();

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      // 新しいタスクを作成（範囲内）
      logger.startTask('New task');
      await logger.completeTask('success', 100);

      const endDate = new Date(Date.now() + 1000);
      const logs = await logger.getLogsBetween(startDate, endDate);

      expect(logs).toHaveLength(1);
      expect(logs[0].userInput).toBe('New task');
    });
  });
});
