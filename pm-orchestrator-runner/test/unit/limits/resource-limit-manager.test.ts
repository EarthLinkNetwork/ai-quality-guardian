import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  ResourceLimitManager,
  ResourceLimitError,
} from '../../../src/limits/resource-limit-manager';
import { TaskLimits } from '../../../src/models/supporting';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Resource Limit Manager (04_COMPONENTS.md L167-177)', () => {
  let limitManager: ResourceLimitManager;

  beforeEach(() => {
    limitManager = new ResourceLimitManager();
  });

  describe('Safe Defaults (04_COMPONENTS.md L173)', () => {
    it('should enforce default max_files (5)', () => {
      const defaults = limitManager.getDefaultLimits();
      assert.equal(defaults.max_files, 5);
    });

    it('should enforce default max_tests (10)', () => {
      const defaults = limitManager.getDefaultLimits();
      assert.equal(defaults.max_tests, 10);
    });

    it('should enforce default max_seconds (300)', () => {
      const defaults = limitManager.getDefaultLimits();
      assert.equal(defaults.max_seconds, 300);
    });

    it('should enforce default parallel subagents limit (9)', () => {
      const defaults = limitManager.getParallelLimits();
      assert.equal(defaults.subagents, 9);
    });

    it('should enforce default parallel executors limit (4)', () => {
      const defaults = limitManager.getParallelLimits();
      assert.equal(defaults.executors, 4);
    });
  });

  describe('Limit Application via Measurable Proxies (04_COMPONENTS.md L174)', () => {
    it('should track file count', () => {
      limitManager.setLimits({ max_files: 3, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');

      assert.equal(limitManager.getFileCount(), 2);
      assert.ok(!limitManager.isFileCountExceeded());
    });

    it('should detect file count exceeded', () => {
      limitManager.setLimits({ max_files: 2, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');
      limitManager.recordFileOperation('/file3.ts'); // Exceeds limit

      assert.ok(limitManager.isFileCountExceeded());
    });

    it('should track test count', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 3, max_seconds: 300 });

      limitManager.recordTestExecution('test1');
      limitManager.recordTestExecution('test2');

      assert.equal(limitManager.getTestCount(), 2);
      assert.ok(!limitManager.isTestCountExceeded());
    });

    it('should detect test count exceeded', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 2, max_seconds: 300 });

      limitManager.recordTestExecution('test1');
      limitManager.recordTestExecution('test2');
      limitManager.recordTestExecution('test3'); // Exceeds limit

      assert.ok(limitManager.isTestCountExceeded());
    });

    it('should track execution time', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 30 });

      limitManager.startTimer();
      // Simulate some time passing
      const elapsed = limitManager.getElapsedSeconds();

      assert.ok(elapsed >= 0);
    });

    it('should detect time exceeded', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 30 });

      limitManager.startTimer();

      // Force elapsed time to exceed limit
      limitManager.setElapsedForTesting(31); // 31 seconds (exceeds 30 second limit)

      assert.ok(limitManager.isTimeExceeded());
    });
  });

  describe('Fail-Closed on Limit Violation (04_COMPONENTS.md L175)', () => {
    it('should throw error when file limit is violated', () => {
      limitManager.setLimits({ max_files: 2, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');

      assert.throws(
        () => limitManager.enforceFileLimit('/file3.ts'),
        (err: Error) => {
          return err instanceof ResourceLimitError &&
            (err as ResourceLimitError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should throw error when test limit is violated', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 2, max_seconds: 300 });

      limitManager.recordTestExecution('test1');
      limitManager.recordTestExecution('test2');

      assert.throws(
        () => limitManager.enforceTestLimit('test3'),
        (err: Error) => {
          return err instanceof ResourceLimitError &&
            (err as ResourceLimitError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should throw error when time limit is violated', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 30 });

      limitManager.startTimer();
      limitManager.setElapsedForTesting(31);

      assert.throws(
        () => limitManager.enforceTimeLimit(),
        (err: Error) => {
          return err instanceof ResourceLimitError &&
            (err as ResourceLimitError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should stop execution immediately on violation (fail-closed)', () => {
      limitManager.setLimits({ max_files: 1, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');

      // Attempting to record another file should trigger fail-closed
      const result = limitManager.checkAndRecordFileOperation('/file2.ts');

      assert.ok(!result.allowed);
      assert.equal(result.violation?.limit_type, 'max_files');
    });
  });

  describe('Chunk Size Adjustment (04_COMPONENTS.md L176)', () => {
    it('should suggest chunk size based on file limit', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 300 });

      const suggestedChunkSize = limitManager.suggestChunkSize(10); // 10 files to process
      assert.ok(suggestedChunkSize <= 5); // Should not exceed limit
    });

    it('should adjust chunk size for remaining capacity', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');

      const remainingCapacity = limitManager.getRemainingFileCapacity();
      assert.equal(remainingCapacity, 3);

      const suggestedChunkSize = limitManager.suggestChunkSize(10);
      assert.ok(suggestedChunkSize <= 3);
    });

    it('should return 0 chunk size when limit exhausted', () => {
      limitManager.setLimits({ max_files: 2, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');

      const suggestedChunkSize = limitManager.suggestChunkSize(5);
      assert.equal(suggestedChunkSize, 0);
    });
  });

  describe('Limit Validation (Configuration Schema)', () => {
    it('should validate max_files range (1-20)', () => {
      assert.throws(
        () => limitManager.setLimits({ max_files: 0, max_tests: 10, max_seconds: 300 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      assert.throws(
        () => limitManager.setLimits({ max_files: 21, max_tests: 10, max_seconds: 300 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      // Valid range should work
      limitManager.setLimits({ max_files: 1, max_tests: 10, max_seconds: 300 });
      limitManager.setLimits({ max_files: 20, max_tests: 10, max_seconds: 300 });
    });

    it('should validate max_tests range (1-50)', () => {
      assert.throws(
        () => limitManager.setLimits({ max_files: 5, max_tests: 0, max_seconds: 300 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      assert.throws(
        () => limitManager.setLimits({ max_files: 5, max_tests: 51, max_seconds: 300 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      // Valid range should work
      limitManager.setLimits({ max_files: 5, max_tests: 1, max_seconds: 300 });
      limitManager.setLimits({ max_files: 5, max_tests: 50, max_seconds: 300 });
    });

    it('should validate max_seconds range (30-900)', () => {
      assert.throws(
        () => limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 29 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      assert.throws(
        () => limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 901 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      // Valid range should work
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 30 });
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 900 });
    });
  });

  describe('Parallel Limits', () => {
    it('should validate subagents limit (max 9)', () => {
      assert.throws(
        () => limitManager.setParallelLimits({ subagents: 10, executors: 4 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      // Valid should work
      limitManager.setParallelLimits({ subagents: 9, executors: 4 });
    });

    it('should validate executors limit (max 4)', () => {
      assert.throws(
        () => limitManager.setParallelLimits({ subagents: 9, executors: 5 }),
        (err: Error) => err instanceof ResourceLimitError
      );

      // Valid should work
      limitManager.setParallelLimits({ subagents: 9, executors: 4 });
    });

    it('should track active subagents', () => {
      limitManager.setParallelLimits({ subagents: 3, executors: 4 });

      limitManager.startSubagent('sub-1');
      limitManager.startSubagent('sub-2');

      assert.equal(limitManager.getActiveSubagentCount(), 2);
      assert.ok(!limitManager.isSubagentLimitExceeded());
    });

    it('should detect subagent limit exceeded', () => {
      limitManager.setParallelLimits({ subagents: 2, executors: 4 });

      limitManager.startSubagent('sub-1');
      limitManager.startSubagent('sub-2');

      assert.throws(
        () => limitManager.startSubagent('sub-3'),
        (err: Error) => {
          return err instanceof ResourceLimitError &&
            (err as ResourceLimitError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should track active executors', () => {
      limitManager.setParallelLimits({ subagents: 9, executors: 2 });

      limitManager.startExecutor('exec-1');
      limitManager.startExecutor('exec-2');

      assert.equal(limitManager.getActiveExecutorCount(), 2);
      assert.throws(
        () => limitManager.startExecutor('exec-3'),
        (err: Error) => err instanceof ResourceLimitError
      );
    });

    it('should release resources when subagent completes', () => {
      limitManager.setParallelLimits({ subagents: 2, executors: 4 });

      limitManager.startSubagent('sub-1');
      limitManager.startSubagent('sub-2');
      limitManager.endSubagent('sub-1');

      assert.equal(limitManager.getActiveSubagentCount(), 1);

      // Should be able to start another
      limitManager.startSubagent('sub-3');
      assert.equal(limitManager.getActiveSubagentCount(), 2);
    });
  });

  describe('Limit Violation Recording (Property 5)', () => {
    it('should record file limit violation', () => {
      limitManager.setLimits({ max_files: 2, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');

      const result = limitManager.checkAndRecordFileOperation('/file3.ts');

      assert.ok(result.violation);
      assert.equal(result.violation.limit_type, 'max_files');
      assert.equal(result.violation.limit_value, 2);
      assert.equal(result.violation.actual_value, 3);
      assert.ok(result.violation.resolution_required);
    });

    it('should record test limit violation', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 2, max_seconds: 300 });

      limitManager.recordTestExecution('test1');
      limitManager.recordTestExecution('test2');

      const result = limitManager.checkAndRecordTestExecution('test3');

      assert.ok(result.violation);
      assert.equal(result.violation.limit_type, 'max_tests');
      assert.equal(result.violation.limit_value, 2);
      assert.equal(result.violation.actual_value, 3);
    });

    it('should record time limit violation', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 60 });

      limitManager.startTimer();
      limitManager.setElapsedForTesting(61);

      const result = limitManager.checkTimeLimit();

      assert.ok(result.violation);
      assert.equal(result.violation.limit_type, 'max_seconds');
      assert.equal(result.violation.limit_value, 60);
      assert.ok(result.violation.actual_value > 60);
    });

    it('should collect all violations', () => {
      limitManager.setLimits({ max_files: 1, max_tests: 1, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');
      limitManager.recordTestExecution('test1');
      limitManager.recordTestExecution('test2');

      const violations = limitManager.getAllViolations();
      assert.ok(violations.length >= 2);
    });
  });

  describe('Reset and Statistics', () => {
    it('should reset counters for new task', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordTestExecution('test1');

      limitManager.reset();

      assert.equal(limitManager.getFileCount(), 0);
      assert.equal(limitManager.getTestCount(), 0);
    });

    it('should provide usage statistics', () => {
      limitManager.setLimits({ max_files: 5, max_tests: 10, max_seconds: 300 });

      limitManager.recordFileOperation('/file1.ts');
      limitManager.recordFileOperation('/file2.ts');
      limitManager.recordTestExecution('test1');

      const stats = limitManager.getUsageStatistics();

      assert.equal(stats.files_used, 2);
      assert.equal(stats.files_limit, 5);
      assert.equal(stats.files_remaining, 3);
      assert.equal(stats.tests_used, 1);
      assert.equal(stats.tests_limit, 10);
      assert.equal(stats.tests_remaining, 9);
    });
  });
});
