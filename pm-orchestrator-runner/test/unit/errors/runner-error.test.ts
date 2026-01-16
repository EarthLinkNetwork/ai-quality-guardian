import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { RunnerError } from '../../../src/errors/runner-error';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('RunnerError', () => {
  it('should create error with code and message', () => {
    const error = new RunnerError(ErrorCode.E101_MISSING_CLAUDE_DIRECTORY, '/path/to/project');
    assert.ok(error instanceof Error);
    assert.ok(error instanceof RunnerError);
    assert.equal(error.code, ErrorCode.E101_MISSING_CLAUDE_DIRECTORY);
    assert.ok(error.message.includes('E101'));
    assert.ok(error.message.includes('/path/to/project'));
  });

  it('should include context in error message', () => {
    const error = new RunnerError(
      ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
      'task_limits.files must be between 1 and 20'
    );
    assert.ok(error.message.includes('task_limits.files'));
  });

  it('should provide error code for programmatic handling', () => {
    const error = new RunnerError(ErrorCode.E403_DEADLOCK_DETECTED);
    assert.equal(error.code, 'E403');
  });

  it('should be throwable and catchable', () => {
    assert.throws(
      () => {
        throw new RunnerError(ErrorCode.E201_PHASE_EXECUTION_FAILURE, 'Phase 1 failed');
      },
      (err: Error) => {
        return err instanceof RunnerError && (err as RunnerError).code === 'E201';
      }
    );
  });

  it('should preserve stack trace', () => {
    const error = new RunnerError(ErrorCode.E501_SESSION_ID_MISSING);
    assert.ok(error.stack);
    assert.ok(error.stack.includes('runner-error.test.ts'));
  });
});
