/**
 * PM Orchestrator Enhancement - ProgressTracker Unit Tests
 */

import { ProgressTracker, TaskProgress } from '../../../src/visualization/progress-tracker';

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker();
  });

  describe('startTask', () => {
    it('should start a new task', () => {
      tracker.startTask('task-1', 'Test Task');

      const progress = tracker.getProgress('task-1');
      expect(progress).toBeDefined();
      expect(progress!.taskId).toBe('task-1');
      expect(progress!.taskName).toBe('Test Task');
      expect(progress!.status).toBe('in_progress');
      expect(progress!.progress).toBe(0);
      expect(progress!.startTime).toBeDefined();
    });

    it('should notify listeners when task starts', () => {
      const listener = jest.fn();
      tracker.addListener(listener);

      tracker.startTask('task-1', 'Test Task');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          status: 'in_progress'
        })
      );
    });
  });

  describe('updateProgress', () => {
    beforeEach(() => {
      tracker.startTask('task-1', 'Test Task');
    });

    it('should update task progress', () => {
      tracker.updateProgress('task-1', 50);

      const progress = tracker.getProgress('task-1');
      expect(progress!.progress).toBe(50);
    });

    it('should update current subagent', () => {
      tracker.updateProgress('task-1', 50, 'rule-checker');

      const progress = tracker.getProgress('task-1');
      expect(progress!.currentSubagent).toBe('rule-checker');
    });

    it('should clamp progress to 0-100', () => {
      tracker.updateProgress('task-1', 150);
      expect(tracker.getProgress('task-1')!.progress).toBe(100);

      tracker.updateProgress('task-1', -10);
      expect(tracker.getProgress('task-1')!.progress).toBe(0);
    });

    it('should notify listeners when progress updates', () => {
      const listener = jest.fn();
      tracker.addListener(listener);

      tracker.updateProgress('task-1', 50, 'implementer');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 50,
          currentSubagent: 'implementer'
        })
      );
    });
  });

  describe('completeTask', () => {
    beforeEach(() => {
      tracker.startTask('task-1', 'Test Task');
    });

    it('should complete a task', () => {
      tracker.completeTask('task-1');

      const progress = tracker.getProgress('task-1');
      expect(progress!.status).toBe('completed');
      expect(progress!.progress).toBe(100);
      expect(progress!.endTime).toBeDefined();
    });

    it('should notify listeners when task completes', () => {
      const listener = jest.fn();
      tracker.addListener(listener);

      tracker.completeTask('task-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          progress: 100
        })
      );
    });
  });

  describe('failTask', () => {
    beforeEach(() => {
      tracker.startTask('task-1', 'Test Task');
    });

    it('should fail a task', () => {
      tracker.failTask('task-1');

      const progress = tracker.getProgress('task-1');
      expect(progress!.status).toBe('failed');
      expect(progress!.endTime).toBeDefined();
    });
  });

  describe('listeners', () => {
    it('should add and remove listeners', () => {
      const listener = jest.fn();

      tracker.addListener(listener);
      tracker.startTask('task-1', 'Test Task');
      expect(listener).toHaveBeenCalledTimes(1);

      tracker.removeListener(listener);
      tracker.startTask('task-2', 'Another Task');
      expect(listener).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      tracker.addListener(errorListener);
      tracker.addListener(normalListener);

      // Should not throw
      expect(() => {
        tracker.startTask('task-1', 'Test Task');
      }).not.toThrow();

      expect(normalListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllProgress', () => {
    it('should return all task progress', () => {
      tracker.startTask('task-1', 'Task 1');
      tracker.startTask('task-2', 'Task 2');
      tracker.startTask('task-3', 'Task 3');

      const allProgress = tracker.getAllProgress();
      expect(allProgress).toHaveLength(3);
    });

    it('should return empty array when no tasks', () => {
      const allProgress = tracker.getAllProgress();
      expect(allProgress).toHaveLength(0);
    });
  });

  describe('getProgress', () => {
    it('should return undefined for non-existent task', () => {
      const progress = tracker.getProgress('non-existent');
      expect(progress).toBeUndefined();
    });
  });
});
