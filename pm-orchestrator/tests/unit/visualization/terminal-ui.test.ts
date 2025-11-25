/**
 * PM Orchestrator Enhancement - TerminalUI Unit Tests
 */

import { TerminalUI } from '../../../src/visualization/terminal-ui';
import { TaskProgress } from '../../../src/visualization/progress-tracker';

describe('TerminalUI', () => {
  let ui: TerminalUI;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    ui = new TerminalUI();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('displayProgress', () => {
    it('should display task progress', () => {
      const progress: TaskProgress = {
        taskId: 'task-1',
        taskName: 'Test Task',
        status: 'in_progress',
        progress: 50,
        startTime: new Date().toISOString(),
        currentSubagent: 'rule-checker'
      };

      ui.displayProgress(progress);

      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('Test Task'))).toBe(true);
      expect(calls.some(call => call.includes('In Progress'))).toBe(true);
      expect(calls.some(call => call.includes('rule-checker'))).toBe(true);
    });

    it('should display completed task', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 1000);

      const progress: TaskProgress = {
        taskId: 'task-1',
        taskName: 'Completed Task',
        status: 'completed',
        progress: 100,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      };

      ui.displayProgress(progress);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('Completed'))).toBe(true);
      expect(calls.some(call => call.includes('Duration'))).toBe(true);
    });

    it('should display failed task', () => {
      const progress: TaskProgress = {
        taskId: 'task-1',
        taskName: 'Failed Task',
        status: 'failed',
        progress: 50,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString()
      };

      ui.displayProgress(progress);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('Failed'))).toBe(true);
    });
  });

  describe('displaySummary', () => {
    it('should display task summary', () => {
      const allProgress: TaskProgress[] = [
        {
          taskId: 'task-1',
          taskName: 'Task 1',
          status: 'completed',
          progress: 100
        },
        {
          taskId: 'task-2',
          taskName: 'Task 2',
          status: 'completed',
          progress: 100
        },
        {
          taskId: 'task-3',
          taskName: 'Task 3',
          status: 'failed',
          progress: 50
        },
        {
          taskId: 'task-4',
          taskName: 'Task 4',
          status: 'in_progress',
          progress: 30
        },
        {
          taskId: 'task-5',
          taskName: 'Task 5',
          status: 'pending',
          progress: 0
        }
      ];

      ui.displaySummary(allProgress);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('Completed: 2'))).toBe(true);
      expect(calls.some(call => call.includes('Failed: 1'))).toBe(true);
      expect(calls.some(call => call.includes('In Progress: 1'))).toBe(true);
      expect(calls.some(call => call.includes('Pending: 1'))).toBe(true);
    });

    it('should handle empty progress list', () => {
      ui.displaySummary([]);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(calls.some(call => call.includes('Completed: 0'))).toBe(true);
    });
  });
});
