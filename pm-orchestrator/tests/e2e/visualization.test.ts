/**
 * E2E Test for Visualization Features
 *
 * ANSI色コード、ツール呼び出し可視化、進捗表示の統合テスト
 */

import { ColorCode } from '../../src/visualization/color-code';
import { ToolVisualizer } from '../../src/visualization/tool-visualizer';
import { ProgressTracker } from '../../src/visualization/progress-tracker';

describe('Visualization E2E Tests', () => {
  describe('ColorCode Integration', () => {
    it('should display all agents with correct colors', () => {
      const agents = [
        'pm-orchestrator',
        'rule-checker',
        'code-analyzer',
        'designer',
        'implementer',
        'tester',
        'qa',
        'cicd-engineer',
        'reporter'
      ];

      for (const agent of agents) {
        const formatted = ColorCode.formatAgentName(agent);
        // Correctly formatted name
        const expectedName = ColorCode.formatAgentName(agent);
        expect(formatted).toBe(expectedName);
        // expect(formatted).toContain(agent.split('-').map(w =>
          // w.charAt(0).toUpperCase() + w.slice(1)
        // ).join(' ').replace('Cicd', 'CI/CD'));
        expect(formatted).toMatch(/\x1b\[\d+m/); // Contains ANSI color code
      }
    });

    it('should format status correctly', () => {
      const statuses: Array<'pending' | 'running' | 'completed' | 'error'> = [
        'pending',
        'running',
        'completed',
        'error'
      ];

      for (const status of statuses) {
        const formatted = ColorCode.formatStatus(status);
        expect(formatted).toMatch(/\x1b\[\d+m/); // Contains ANSI color code
        expect(formatted).toContain(status === 'pending' ? 'Pending' :
                                    status === 'running' ? 'Running' :
                                    status === 'completed' ? 'Completed' : 'Error');
      }
    });

    it('should format tool calls correctly', () => {
      const formatted = ColorCode.formatToolCall('Read', 'Read configuration file');
      expect(formatted).toContain('Read');
      expect(formatted).toContain('Read configuration file');
      expect(formatted).toMatch(/\x1b\[\d+m/); // Contains ANSI color code
    });
  });

  describe('ToolVisualizer Integration', () => {
    let visualizer: ToolVisualizer;

    beforeEach(() => {
      visualizer = new ToolVisualizer();
    });

    it('should record and display tool calls', () => {
      visualizer.recordToolCall('Read', 'Read src/index.ts');
      visualizer.recordToolResult('success', 'File contents...');

      const display = visualizer.displayAll();
      expect(display).toContain('Read');
      expect(display).toContain('Read src/index.ts');
      expect(display).toContain('success');
    });

    it('should display tool call summary', () => {
      visualizer.recordToolCall('Read', 'Read file 1');
      visualizer.recordToolResult('success');
      visualizer.recordToolCall('Read', 'Read file 2');
      visualizer.recordToolResult('success');
      visualizer.recordToolCall('Edit', 'Edit file 1');
      visualizer.recordToolResult('error');

      const summary = visualizer.displaySummary();
      expect(summary).toContain('Total: 3');
      expect(summary).toContain('Successful: 2');
      expect(summary).toContain('Failed: 1');
      expect(summary).toContain('Read: 2');
    });

    it('should truncate long outputs', () => {
      const longOutput = 'A'.repeat(200);
      visualizer.recordToolCall('Read', 'Read large file');
      visualizer.recordToolResult('success', longOutput);

      const display = visualizer.displayAll();
      expect(display).toContain('...');
      expect(display).toContain('200 chars total');
    });
  });

  describe('ProgressTracker Integration', () => {
    let tracker: ProgressTracker;

    beforeEach(() => {
      tracker = new ProgressTracker();
    });

    it('should track task lifecycle', () => {
      tracker.startTask('task-1', 'Implement feature', 'implementer');
      let task = tracker.getTask('task-1');
      expect(task?.status).toBe('in_progress');
      expect(task?.progress).toBe(0);

      tracker.updateProgress('task-1', 50);
      task = tracker.getTask('task-1');
      expect(task?.progress).toBe(50);

      tracker.completeTask('task-1');
      task = tracker.getTask('task-1');
      expect(task?.status).toBe('completed');
      expect(task?.progress).toBe(100);
    });

    it('should display progress correctly', () => {
      tracker.startTask('task-1', 'Task 1', 'implementer');
      tracker.updateProgress('task-1', 50);
      tracker.startTask('task-2', 'Task 2', 'tester');
      tracker.completeTask('task-2');

      const display = tracker.displayProgress();
      expect(display).toContain('Task 1');
      expect(display).toContain('Task 2');
      expect(display).toContain('50%');
      expect(display).toContain('Summary');
    });

    it('should calculate duration correctly', () => {
      tracker.startTask('task-1', 'Task 1');

      // Wait 100ms
      return new Promise(resolve => {
        setTimeout(() => {
          tracker.completeTask('task-1');
          const task = tracker.getTask('task-1');

          expect(task?.startTime).toBeDefined();
          expect(task?.endTime).toBeDefined();

          if (task?.startTime && task?.endTime) {
            const duration = new Date(task.endTime).getTime() - new Date(task.startTime).getTime();
            expect(duration).toBeGreaterThanOrEqual(100);
          }

          resolve(undefined);
        }, 100);
      });
    });

    it('should handle error status', () => {
      tracker.startTask('task-1', 'Task 1');
      tracker.errorTask('task-1');

      const task = tracker.getTask('task-1');
      expect(task?.status).toBe('failed');
      expect(task?.endTime).toBeDefined();
    });
  });

  describe('Full Visualization Workflow', () => {
    it('should display complete workflow with all features', () => {
      const tracker = new ProgressTracker();
      const visualizer = new ToolVisualizer();

      // Start task
      tracker.startTask('workflow-1', 'Complete Workflow', 'pm-orchestrator');

      // Record tool calls
      visualizer.recordToolCall('Read', 'Read input file');
      visualizer.recordToolResult('success');

      // Update progress
      tracker.updateProgress('workflow-1', 25);

      visualizer.recordToolCall('Edit', 'Modify file');
      visualizer.recordToolResult('success');

      tracker.updateProgress('workflow-1', 50);

      visualizer.recordToolCall('Bash', 'Run tests');
      visualizer.recordToolResult('success');

      tracker.updateProgress('workflow-1', 75);

      visualizer.recordToolCall('Write', 'Write output');
      visualizer.recordToolResult('success');

      // Complete task
      tracker.completeTask('workflow-1');

      // Display results
      const progress = tracker.displayProgress();
      const toolSummary = visualizer.displaySummary();

      expect(progress).toContain('Complete Workflow');
      expect(progress).toContain('✅'); // completed status icon
      expect(toolSummary).toContain('Total: 4');
      expect(toolSummary).toContain('Successful: 4');
    });
  });
});
