/**
 * Tests for UX Improvements
 * 
 * Issue: Tasks display and error handling UX problems
 * 1. ERROR tasks shown as "Current Tasks" - should be in "Failed Tasks" section
 * 2. Errors not immediately visible - should show error alert when task fails
 * 3. No user guidance - should explain what to do next
 * 4. Technical error messages - should provide human-readable explanations
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { StatusCommands, REPLSession } from '../../../src/repl/commands/status';
import { TaskStatus } from '../../../src/models/enums';

describe('UX Improvements', () => {
  describe('Task Display Categorization', () => {
    let session: REPLSession;
    let statusCommands: StatusCommands;

    beforeEach(() => {
      session = {
        sessionId: 'test-session',
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'running',
      };
    });

    it('should categorize tasks into Active/Completed/Failed/Pending sections', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'INCOMPLETE',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'COMPLETED' },
          { task_id: 'task-2', status: 'IN_PROGRESS' },
          { task_id: 'task-3', status: 'PENDING' },
          { task_id: 'task-4', status: 'ERROR', error: { message: 'No evidence' } },
          { task_id: 'task-5', status: 'NO_EVIDENCE', error: { message: 'No verified files' } },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should have separate sections
      assert.ok(output.includes('Active Tasks'), 'Should have Active Tasks section');
      assert.ok(output.includes('Completed Tasks'), 'Should have Completed Tasks section');
      assert.ok(output.includes('Failed Tasks'), 'Should have Failed Tasks section');
      assert.ok(output.includes('Pending Tasks'), 'Should have Pending Tasks section');
    });

    it('should show ERROR tasks in Failed Tasks section, not Current Tasks', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'ERROR',
        getTaskResults: () => [
          { task_id: 'task-error', status: 'ERROR', error: { message: 'Task failed' } },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // ERROR task should NOT be under "Current Tasks"
      assert.ok(!output.includes('Current Tasks'), 'Should not use "Current Tasks" label');
      // ERROR task should be under "Failed Tasks"
      assert.ok(output.includes('Failed Tasks'), 'Should have Failed Tasks section');
      // task-error should appear after "Failed Tasks"
      const failedSection = output.indexOf('Failed Tasks');
      const taskPosition = output.indexOf('task-error');
      assert.ok(taskPosition > failedSection, 'ERROR task should be in Failed Tasks section');
    });

    it('should show NO_EVIDENCE tasks in Failed Tasks section', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'NO_EVIDENCE',
        getTaskResults: () => [
          { task_id: 'task-noev', status: 'NO_EVIDENCE', error: { message: 'No verified files' } },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // NO_EVIDENCE task should be under "Failed Tasks"
      assert.ok(output.includes('Failed Tasks'), 'Should have Failed Tasks section');
      const failedSection = output.indexOf('Failed Tasks');
      const taskPosition = output.indexOf('task-noev');
      assert.ok(taskPosition > failedSection, 'NO_EVIDENCE task should be in Failed Tasks section');
    });

    it('should hide empty sections', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'INCOMPLETE',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'IN_PROGRESS' },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should show Active section (has task)
      assert.ok(output.includes('Active Tasks'), 'Should show Active Tasks section');
      // Should NOT show Failed section (no failed tasks)
      assert.ok(!output.includes('Failed Tasks'), 'Should hide empty Failed Tasks section');
      // Should NOT show Completed section (no completed tasks)
      assert.ok(!output.includes('Completed Tasks'), 'Should hide empty Completed Tasks section');
    });
  });

  describe('Error Guidance', () => {
    let session: REPLSession;
    let statusCommands: StatusCommands;

    beforeEach(() => {
      session = {
        sessionId: 'test-session',
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'running',
      };
    });

    it('should provide user guidance for NO_EVIDENCE errors', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'NO_EVIDENCE',
        getTaskResults: () => [
          { 
            task_id: 'task-1', 
            status: 'NO_EVIDENCE',
            error: { message: 'Task completed but no verified files exist on disk' }
          },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should explain what NO_EVIDENCE means
      assert.ok(
        output.includes('No files were created') || output.includes('no verified files'),
        'Should explain NO_EVIDENCE error'
      );
      // Should provide guidance
      assert.ok(
        output.includes('Try:') || output.includes('Next steps:') || output.includes('To resolve:'),
        'Should provide guidance for resolution'
      );
    });

    it('should show actionable next steps for failed tasks', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'ERROR',
        getTaskResults: () => [
          { 
            task_id: 'task-fail', 
            status: 'ERROR',
            error: { message: 'Execution failed' }
          },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should include guidance section
      assert.ok(
        output.includes('/logs') || output.includes('logs'),
        'Should mention logs command for debugging'
      );
    });
  });

  describe('Error Message Humanization', () => {
    it('should translate technical error messages to human-readable form', () => {
      const { getHumanReadableError, getErrorGuidance } = require('../../../src/repl/commands/status');

      // NO_EVIDENCE error
      const noEvError = 'Task completed but no verified files exist on disk';
      const humanNoEv = getHumanReadableError(noEvError);
      assert.ok(
        !humanNoEv.includes('verified_files') && !humanNoEv.includes('disk'),
        'Should not use technical terms'
      );

      // Should have guidance
      const guidance = getErrorGuidance('NO_EVIDENCE');
      assert.ok(guidance.length > 0, 'Should provide guidance for NO_EVIDENCE');
    });
  });

  describe('Summary with Alerts', () => {
    let session: REPLSession;
    let statusCommands: StatusCommands;

    beforeEach(() => {
      session = {
        sessionId: 'test-session',
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'running',
      };
    });

    it('should show alert banner when there are failed tasks', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'ERROR',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'COMPLETED' },
          { task_id: 'task-2', status: 'ERROR', error: { message: 'Failed' } },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should have an alert at the top
      assert.ok(
        output.includes('ALERT') || output.includes('Warning') || output.includes('!'),
        'Should show alert for failed tasks'
      );
      // Alert should be near the top
      const alertPosition = Math.min(
        output.indexOf('ALERT') >= 0 ? output.indexOf('ALERT') : Infinity,
        output.indexOf('Warning') >= 0 ? output.indexOf('Warning') : Infinity,
        output.indexOf('1 task failed') >= 0 ? output.indexOf('1 task failed') : Infinity
      );
      const firstTaskPosition = output.indexOf('task-');
      assert.ok(
        alertPosition < firstTaskPosition || output.includes('failed'),
        'Alert should be visible prominently'
      );
    });

    it('should not show alert when all tasks completed successfully', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'COMPLETE',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'COMPLETED' },
          { task_id: 'task-2', status: 'COMPLETED' },
        ],
      };
      session.runner = mockRunner as any;
      statusCommands = new StatusCommands(session);

      const output = await statusCommands.getTasks();

      // Should NOT have a warning alert
      assert.ok(
        !output.includes('ALERT') && !output.includes('Warning'),
        'Should not show alert when all successful'
      );
    });
  });
});
