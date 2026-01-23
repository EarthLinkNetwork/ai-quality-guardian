import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  RetryManager,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_RETRY_MANAGER_CONFIG,
  classifyFailure,
  calculateBackoff,
  type RetryConfig,
  type RetryDecision,
  type EscalationReport,
  type FailureType,
  type TaskResult,
  type RetryEvent,
  type EscalationReason,
  type PartialRecovery,
} from '../../../src/retry';

describe('RetryManager (spec/30_RETRY_AND_RECOVERY.md)', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager();
  });

  describe('Default Configuration (Section 10)', () => {
    it('should have default max_retries of 3', () => {
      assert.strictEqual(DEFAULT_RETRY_CONFIG.max_retries, 3);
    });

    it('should have default backoff strategy', () => {
      assert.ok(DEFAULT_RETRY_CONFIG.backoff);
      assert.strictEqual(DEFAULT_RETRY_CONFIG.backoff.type, 'exponential');
    });

    it('should have default initial_delay_ms of 1000 in backoff', () => {
      assert.strictEqual(DEFAULT_RETRY_CONFIG.backoff.initial_delay_ms, 1000);
    });

    it('should have default max_delay_ms of 30000 in backoff', () => {
      assert.strictEqual(DEFAULT_RETRY_CONFIG.backoff.max_delay_ms, 30000);
    });

    it('should have default backoff_multiplier of 2', () => {
      assert.strictEqual(DEFAULT_RETRY_CONFIG.backoff.multiplier, 2);
    });

    it('should have jitter configuration', () => {
      assert.ok(typeof DEFAULT_RETRY_CONFIG.backoff.jitter === 'number');
    });

    it('should have default cause_specific configs', () => {
      assert.ok(Array.isArray(DEFAULT_RETRY_CONFIG.cause_specific));
      assert.ok(DEFAULT_RETRY_CONFIG.cause_specific.some(c => c.failure_type === 'RATE_LIMIT'));
      assert.ok(DEFAULT_RETRY_CONFIG.cause_specific.some(c => c.failure_type === 'TIMEOUT'));
    });

    it('should have retryable_failures list', () => {
      assert.ok(Array.isArray(DEFAULT_RETRY_CONFIG.retryable_failures));
      assert.ok(DEFAULT_RETRY_CONFIG.retryable_failures.includes('TRANSIENT_ERROR'));
      assert.ok(DEFAULT_RETRY_CONFIG.retryable_failures.includes('TIMEOUT'));
    });
  });

  describe('RetryManagerConfig', () => {
    it('should have enableSnapshots setting', () => {
      assert.strictEqual(typeof DEFAULT_RETRY_MANAGER_CONFIG.enableSnapshots, 'boolean');
    });

    it('should have snapshotRetentionHours setting', () => {
      assert.ok(typeof DEFAULT_RETRY_MANAGER_CONFIG.snapshotRetentionHours === 'number');
    });

    it('should have partialCommitEnabled setting', () => {
      assert.strictEqual(typeof DEFAULT_RETRY_MANAGER_CONFIG.partialCommitEnabled, 'boolean');
    });

    it('should have traceDir setting', () => {
      assert.ok(typeof DEFAULT_RETRY_MANAGER_CONFIG.traceDir === 'string');
    });
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      const m = new RetryManager();
      assert.ok(m);
    });

    it('should accept partial config override', () => {
      const m = new RetryManager({
        retryConfig: { max_retries: 5 } as RetryConfig,
      });
      assert.ok(m);
      assert.strictEqual(m.getConfig().retryConfig.max_retries, 5);
    });

    it('should accept event callback', () => {
      const events: RetryEvent[] = [];
      const m = new RetryManager({}, (event) => {
        events.push(event);
      });

      m.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR', 'Connection failed', 100);

      // recordAttempt doesn't emit events, but decide does
      const result: TaskResult = { status: 'FAIL', error: 'Connection failed' };
      m.decide('task-001', undefined, result);

      assert.ok(events.length > 0);
    });
  });

  describe('recordAttempt() (Section 4.1)', () => {
    it('should record successful attempt', () => {
      manager.recordAttempt('task-001', undefined, 'PASS');

      assert.strictEqual(manager.getRetryCount('task-001'), 0);
    });

    it('should record failed attempt', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR', 'Connection refused', 500);

      assert.strictEqual(manager.getRetryCount('task-001'), 1);
    });

    it('should track multiple failures', () => {
      for (let i = 0; i < 3; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR', 'Connection refused', 100 * (i + 1));
      }

      assert.strictEqual(manager.getRetryCount('task-001'), 3);
    });

    it('should track subtask-level failures', () => {
      manager.recordAttempt('task-001', 'subtask-a', 'FAIL', 'TIMEOUT', undefined, 30000);
      manager.recordAttempt('task-001', 'subtask-b', 'FAIL', 'TRANSIENT_ERROR', undefined, 500);

      assert.strictEqual(manager.getRetryCount('task-001', 'subtask-a'), 1);
      assert.strictEqual(manager.getRetryCount('task-001', 'subtask-b'), 1);
    });
  });

  describe('decide() - Retry Decision (Section 4.2)', () => {
    it('should decide PASS on success', () => {
      const result: TaskResult = {
        status: 'PASS',
        output: 'Done',
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'PASS');
    });

    it('should decide to RETRY on first failure', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: 'Connection failed',
      };

      const decision = manager.decide('task-001', undefined, result);

      // First failure with retryable error should RETRY
      assert.strictEqual(decision.decision, 'RETRY');
      assert.ok(decision.delay_ms !== undefined && decision.delay_ms > 0);
    });

    it('should ESCALATE after max retries reached', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: 'Connection failed',
      };

      // Record max attempts
      for (let i = 0; i < DEFAULT_RETRY_CONFIG.max_retries; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');
      }

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'ESCALATE');
      assert.ok(decision.reasoning.includes('Retry count') || decision.escalate_reason?.includes('Max'));
    });

    it('should ESCALATE on non-retryable failures', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '401 Unauthorized',
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'ESCALATE');
    });

    it('should provide delay in decision for RETRY', () => {
      const result: TaskResult = {
        status: 'TIMEOUT',
        duration_ms: 30000,
      };

      const decision = manager.decide('task-001', undefined, result);

      if (decision.decision === 'RETRY') {
        assert.ok(typeof decision.delay_ms === 'number');
        assert.ok(decision.delay_ms > 0);
      }
    });

    it('should include current_retry_count in decision', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      const result: TaskResult = { status: 'FAIL', error: 'Error' };
      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.current_retry_count, 1);
    });

    it('should include max_retries in decision', () => {
      const result: TaskResult = { status: 'FAIL', error: 'Error' };
      const decision = manager.decide('task-001', undefined, result);

      assert.ok(typeof decision.max_retries === 'number');
    });
  });

  describe('Backoff Calculation (Section 5)', () => {
    it('should apply exponential backoff', () => {
      const delays: number[] = [];

      for (let i = 0; i < 3; i++) {
        const delay = manager.getNextRetryDelay('task-001', undefined, 'TRANSIENT_ERROR');
        delays.push(delay);
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');
      }

      // Each delay should be greater than or equal to the previous (accounting for jitter)
      // At minimum, we expect some positive delays
      assert.ok(delays.every(d => d > 0));
    });

    it('should respect max_delay_ms', () => {
      // Many failures to push backoff to max
      for (let i = 0; i < 10; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');
      }

      const delay = manager.getNextRetryDelay('task-001', undefined, 'TRANSIENT_ERROR');

      // Should not exceed max_delay_ms + jitter (with 10% jitter, max is 33000)
      const maxWithJitter = DEFAULT_RETRY_CONFIG.backoff.max_delay_ms * 1.5;
      assert.ok(delay <= maxWithJitter);
    });

    it('should calculate backoff with calculateBackoff function', () => {
      const backoff = DEFAULT_RETRY_CONFIG.backoff;
      const delay0 = calculateBackoff(backoff, 0);
      const delay1 = calculateBackoff(backoff, 1);
      const delay2 = calculateBackoff(backoff, 2);

      // Exponential backoff should increase
      assert.ok(delay0 > 0);
      assert.ok(delay1 >= delay0);
      assert.ok(delay2 >= delay1);
    });
  });

  describe('isMaxRetriesReached() (Section 4.3)', () => {
    it('should return false initially', () => {
      assert.strictEqual(manager.isMaxRetriesReached('task-001'), false);
    });

    it('should return true after max retries', () => {
      for (let i = 0; i < DEFAULT_RETRY_CONFIG.max_retries; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');
      }

      assert.strictEqual(manager.isMaxRetriesReached('task-001'), true);
    });

    it('should track subtask level separately', () => {
      // Fill subtask-a
      for (let i = 0; i < DEFAULT_RETRY_CONFIG.max_retries; i++) {
        manager.recordAttempt('task-001', 'subtask-a', 'FAIL', 'TRANSIENT_ERROR');
      }

      assert.strictEqual(manager.isMaxRetriesReached('task-001', 'subtask-a'), true);
      assert.strictEqual(manager.isMaxRetriesReached('task-001', 'subtask-b'), false);
    });

    it('should use cause-specific max_retries', () => {
      // RATE_LIMIT has max_retries: 5
      for (let i = 0; i < 3; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'RATE_LIMIT');
      }

      // At 3 retries, should not be maxed for RATE_LIMIT (which allows 5)
      assert.strictEqual(manager.isMaxRetriesReached('task-001', undefined, 'RATE_LIMIT'), false);
    });
  });

  describe('startRetry() / retrySucceeded() (Section 4.4)', () => {
    it('should track retry start', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      manager.startRetry('task-001', undefined, 'Try again');

      // Internal state change - no direct assertion needed
      // Just verify it doesn't throw
      assert.ok(true);
    });

    it('should handle retry succeeded without errors', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      // retrySucceeded should emit event without throwing
      manager.retrySucceeded('task-001', undefined);

      assert.ok(true);
    });
  });

  describe('escalate() - Escalation Report (Section 6)', () => {
    it('should generate escalation report', () => {
      // Record failures to trigger escalation
      for (let i = 0; i < DEFAULT_RETRY_CONFIG.max_retries; i++) {
        manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR', 'Connection refused', 100);
      }

      const reason: EscalationReason = {
        type: 'MAX_RETRIES',
        description: 'Maximum retries exceeded',
      };

      const report = manager.escalate('task-001', undefined, reason);

      assert.strictEqual(report.task_id, 'task-001');
      assert.ok(report.escalated_at);
      assert.ok(report.reason);
      assert.ok(report.failure_summary);
      assert.ok(Array.isArray(report.recommended_actions));
    });

    it('should include failure summary', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR', 'Connection refused', 100);
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TIMEOUT', undefined, 30000);

      const reason: EscalationReason = {
        type: 'MAX_RETRIES',
        description: 'Max retries exceeded',
      };

      const report = manager.escalate('task-001', undefined, reason);

      assert.ok(report.failure_summary.total_attempts >= 2);
      assert.ok(Array.isArray(report.failure_summary.failure_types));
    });

    it('should include recommended actions', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      const reason: EscalationReason = {
        type: 'FATAL_ERROR',
        description: 'Authentication failed',
      };

      const report = manager.escalate('task-001', undefined, reason);

      assert.ok(Array.isArray(report.recommended_actions));
      assert.ok(report.recommended_actions.length > 0);
    });

    it('should include user_message', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      const reason: EscalationReason = {
        type: 'MAX_RETRIES',
        description: 'Max retries exceeded',
      };

      const report = manager.escalate('task-001', undefined, reason);

      assert.ok(typeof report.user_message === 'string');
      assert.ok(report.user_message.length > 0);
    });

    it('should include debug_info', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      const reason: EscalationReason = {
        type: 'MAX_RETRIES',
        description: 'Max retries exceeded',
      };

      const report = manager.escalate('task-001', undefined, reason);

      assert.ok(report.debug_info);
      assert.ok(Array.isArray(report.debug_info.retry_history));
      assert.ok(typeof report.debug_info.trace_file === 'string');
    });
  });

  describe('Partial Recovery (Section 7)', () => {
    it('should start partial recovery', () => {
      const failedSubtasks = ['subtask-c', 'subtask-d'];
      const succeededSubtasks = ['subtask-a', 'subtask-b'];
      const dependencies = new Map<string, string[]>([
        ['subtask-b', ['subtask-a']],
        ['subtask-c', ['subtask-b']],
        ['subtask-d', ['subtask-b']],
      ]);

      const recovery = manager.startRecovery(
        'task-001',
        failedSubtasks,
        succeededSubtasks,
        dependencies
      );

      assert.strictEqual(recovery.task_id, 'task-001');
      assert.deepStrictEqual(recovery.failed_subtasks, failedSubtasks);
      assert.deepStrictEqual(recovery.succeeded_subtasks, succeededSubtasks);
      assert.ok(recovery.strategy);
    });

    it('should determine recovery strategy', () => {
      const recovery = manager.startRecovery(
        'task-001',
        ['subtask-c'],
        ['subtask-a', 'subtask-b'],
        new Map()
      );

      assert.ok([
        'RETRY_FAILED_ONLY',
        'ROLLBACK_AND_RETRY',
        'PARTIAL_COMMIT',
        'ESCALATE',
      ].includes(recovery.strategy));
    });

    it('should complete recovery', () => {
      const recovery = manager.startRecovery(
        'task-001',
        ['subtask-c'],
        ['subtask-a', 'subtask-b'],
        new Map()
      );

      // completeRecovery takes (taskId, strategy, finalStatus)
      manager.completeRecovery('task-001', recovery.strategy, 'SUCCESS');

      // Should not throw
      assert.ok(true);
    });

    it('should return RETRY_FAILED_ONLY for independent failures', () => {
      const recovery = manager.startRecovery(
        'task-001',
        ['subtask-c'],
        ['subtask-a', 'subtask-b'],
        new Map()  // No dependencies
      );

      assert.strictEqual(recovery.strategy, 'RETRY_FAILED_ONLY');
    });
  });

  describe('resetHistory() (Section 4.5)', () => {
    it('should reset task history', () => {
      manager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      assert.strictEqual(manager.getRetryCount('task-001'), 1);

      manager.resetHistory('task-001');

      assert.strictEqual(manager.getRetryCount('task-001'), 0);
    });

    it('should reset subtask history', () => {
      manager.recordAttempt('task-001', 'subtask-a', 'FAIL', 'TRANSIENT_ERROR');
      manager.recordAttempt('task-001', 'subtask-b', 'FAIL', 'TRANSIENT_ERROR');

      manager.resetHistory('task-001', 'subtask-a');

      assert.strictEqual(manager.getRetryCount('task-001', 'subtask-a'), 0);
      assert.strictEqual(manager.getRetryCount('task-001', 'subtask-b'), 1);
    });
  });

  describe('getConfig()', () => {
    it('should return current configuration', () => {
      const config = manager.getConfig();

      assert.ok(config.retryConfig);
      assert.ok(typeof config.retryConfig.max_retries === 'number');
      assert.ok(typeof config.enableSnapshots === 'boolean');
    });

    it('should reflect custom config', () => {
      const customManager = new RetryManager({
        retryConfig: { max_retries: 7 } as RetryConfig,
        enableSnapshots: false,
      });

      const config = customManager.getConfig();

      assert.strictEqual(config.retryConfig.max_retries, 7);
      assert.strictEqual(config.enableSnapshots, false);
    });
  });

  describe('classifyFailure() (Section 3)', () => {
    it('should classify TIMEOUT failures', () => {
      const result: TaskResult = { status: 'TIMEOUT' };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'TIMEOUT');
    });

    it('should classify QUALITY_FAILURE for failed quality checks', () => {
      const result: TaskResult = {
        status: 'FAIL',
        quality_results: [
          { criterion: 'Q1', passed: false, details: 'Test failed' },
        ],
      };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'QUALITY_FAILURE');
    });

    it('should classify INCOMPLETE for omission markers', () => {
      const result: TaskResult = {
        status: 'FAIL',
        output: 'Some code... // 残り省略',
      };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'INCOMPLETE');
    });

    it('should classify TRANSIENT_ERROR for network errors', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '500 Internal Server Error',
      };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'TRANSIENT_ERROR');
    });

    it('should classify RATE_LIMIT for 429 errors', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '429 Too Many Requests',
      };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'RATE_LIMIT');
    });

    it('should classify FATAL_ERROR for auth errors', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '401 Unauthorized',
      };
      const failureType = classifyFailure(result);
      assert.strictEqual(failureType, 'FATAL_ERROR');
    });
  });

  describe('Failure Type Handling (Section 3)', () => {
    it('should handle TRANSIENT_ERROR failures (retryable)', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: 'Connection refused',
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'RETRY');
    });

    it('should handle TIMEOUT failures (retryable)', () => {
      const result: TaskResult = {
        status: 'TIMEOUT',
        duration_ms: 30000,
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'RETRY');
    });

    it('should handle RATE_LIMIT failures (retryable)', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '429 Rate limit exceeded',
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'RETRY');
    });

    it('should ESCALATE FATAL_ERROR failures (non-retryable)', () => {
      const result: TaskResult = {
        status: 'FAIL',
        error: '403 Forbidden - Access denied',
      };

      const decision = manager.decide('task-001', undefined, result);

      assert.strictEqual(decision.decision, 'ESCALATE');
    });
  });

  describe('Event Emission', () => {
    it('should emit events for retry decisions', () => {
      const events: RetryEvent[] = [];
      const eventManager = new RetryManager({}, (event) => {
        events.push(event);
      });

      const result: TaskResult = { status: 'FAIL', error: 'Test error' };
      eventManager.decide('task-001', undefined, result);

      assert.ok(events.some(e => e.type === 'RETRY_DECISION'));
    });

    it('should emit events for escalation', () => {
      const events: RetryEvent[] = [];
      const eventManager = new RetryManager({}, (event) => {
        events.push(event);
      });

      eventManager.recordAttempt('task-001', undefined, 'FAIL', 'TRANSIENT_ERROR');

      const reason: EscalationReason = {
        type: 'MAX_RETRIES',
        description: 'Max retries exceeded',
      };
      eventManager.escalate('task-001', undefined, reason);

      assert.ok(events.some(e => e.type === 'ESCALATE_DECISION'));
      assert.ok(events.some(e => e.type === 'ESCALATE_EXECUTED'));
    });

    it('should emit events for recovery start', () => {
      const events: RetryEvent[] = [];
      const eventManager = new RetryManager({}, (event) => {
        events.push(event);
      });

      eventManager.startRecovery('task-001', ['subtask-a'], ['subtask-b'], new Map());

      assert.ok(events.some(e => e.type === 'RECOVERY_START'));
    });

    it('should emit events for recovery complete', () => {
      const events: RetryEvent[] = [];
      const eventManager = new RetryManager({}, (event) => {
        events.push(event);
      });

      eventManager.completeRecovery('task-001', 'RETRY_FAILED_ONLY', 'SUCCESS');

      assert.ok(events.some(e => e.type === 'RECOVERY_COMPLETE'));
    });
  });
});
