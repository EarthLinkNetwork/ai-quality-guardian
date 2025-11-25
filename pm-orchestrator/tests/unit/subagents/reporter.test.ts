/**
 * PM Orchestrator Enhancement - Reporter Unit Tests
 */

import { Reporter } from '../../../src/subagents/reporter';

describe('Reporter', () => {
  let reporter: Reporter;

  beforeEach(() => {
    reporter = new Reporter();
  });

  describe('createReport', () => {
    it('should create success report', async () => {
      const subagentResults = [
        { agent: { name: 'rule-checker' }, status: 'pass' },
        { agent: { name: 'implementer' }, status: 'success' },
        { agent: { name: 'qa' }, status: 'pass' }
      ];
      const executionLog = {
        taskName: 'Test Task',
        duration: 1000
      };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.status).toBe('success');
      expect(result.title).toContain('SUCCESS');
      expect(result.summary).toBeDefined();
      expect(result.details).toBeDefined();
      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.userFriendlyMessage).toBeDefined();
    });

    it('should create error report', async () => {
      const subagentResults = [
        { agent: { name: 'rule-checker' }, status: 'fail' },
        { agent: { name: 'implementer' }, status: 'error' }
      ];
      const executionLog = {
        taskName: 'Failed Task',
        duration: 500
      };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.status).toBe('error');
      expect(result.title).toContain('ERROR');
    });

    it('should create warning report', async () => {
      const subagentResults = [
        { agent: { name: 'rule-checker' }, status: 'pass' },
        { agent: { name: 'qa' }, status: 'warning' }
      ];
      const executionLog = {
        taskName: 'Warning Task',
        duration: 750
      };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.status).toBe('warning');
      expect(result.title).toContain('WARNING');
    });

    it('should include execution details', async () => {
      const subagentResults = [
        {
          agent: { name: 'implementer' },
          status: 'success',
          filesCreated: ['file1.ts', 'file2.ts'],
          filesModified: ['file3.ts']
        }
      ];
      const executionLog = { taskName: 'Implementation', duration: 2000 };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.details.changes.length).toBeGreaterThan(0);
    });

    it('should include verification results', async () => {
      const subagentResults = [
        {
          agent: { name: 'qa' },
          status: 'pass',
          lint: { passed: true },
          test: { passed: true },
          typecheck: { passed: true },
          build: { passed: true }
        }
      ];
      const executionLog = { taskName: 'QA Check', duration: 3000 };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.details.verification.length).toBeGreaterThan(0);
    });

    it('should collect warnings from subagents', async () => {
      const subagentResults = [
        {
          agent: { name: 'code-analyzer' },
          status: 'completed',
          recommendations: ['Improve complexity', 'Add documentation']
        }
      ];
      const executionLog = { taskName: 'Analysis', duration: 1500 };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.details.warnings.length).toBeGreaterThan(0);
    });

    it('should collect errors from subagents', async () => {
      const subagentResults = [
        {
          agent: { name: 'implementer' },
          status: 'error',
          errors: ['File not found', 'Permission denied']
        }
      ];
      const executionLog = { taskName: 'Implementation', duration: 500 };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.details.errors.length).toBeGreaterThan(0);
    });

    it('should generate next steps based on status', async () => {
      const successResults = [
        { agent: { name: 'qa' }, status: 'pass' }
      ];
      const errorResults = [
        { agent: { name: 'qa' }, status: 'fail' }
      ];

      const successReport = await reporter.createReport(
        successResults,
        { taskName: 'Success', duration: 1000 }
      );
      const errorReport = await reporter.createReport(
        errorResults,
        { taskName: 'Error', duration: 500 }
      );

      expect(successReport.nextSteps).not.toEqual(errorReport.nextSteps);
    });

    it('should generate user-friendly message', async () => {
      const subagentResults = [
        { agent: { name: 'rule-checker' }, status: 'pass' }
      ];
      const executionLog = { taskName: 'Test', duration: 100 };

      const result = await reporter.createReport(subagentResults, executionLog);

      expect(result.userFriendlyMessage).toContain('Task Execution Report');
      expect(result.userFriendlyMessage).toContain('Status:');
      expect(result.userFriendlyMessage).toContain('Summary:');
      expect(result.userFriendlyMessage).toContain('Next Steps:');
    });
  });
});
