import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  L1SubagentPool,
  L2ExecutorPool,
  AgentPoolError,
} from '../../../src/pool/agent-pool';
import { AgentType, TaskStatus } from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('L1 Subagent Pool (04_COMPONENTS.md L98-118)', () => {
  let pool: L1SubagentPool;

  beforeEach(() => {
    pool = new L1SubagentPool();
  });

  afterEach(() => {
    pool.releaseAll();
  });

  describe('Pool Configuration (04_COMPONENTS.md L104)', () => {
    it('should have max 9 parallel subagents', () => {
      assert.equal(pool.getMaxCapacity(), 9);
    });

    it('should start with 0 active subagents', () => {
      assert.equal(pool.getActiveCount(), 0);
    });

    it('should track available slots', () => {
      assert.equal(pool.getAvailableSlots(), 9);
    });
  });

  describe('Subagent Acquisition (04_COMPONENTS.md L105-108)', () => {
    it('should acquire subagent slot', () => {
      const agent = pool.acquire('agent-001', AgentType.READER);

      assert.ok(agent);
      assert.equal(agent.id, 'agent-001');
      assert.equal(pool.getActiveCount(), 1);
    });

    it('should acquire multiple subagents up to limit', () => {
      for (let i = 1; i <= 9; i++) {
        pool.acquire(`agent-${i}`, AgentType.READER);
      }

      assert.equal(pool.getActiveCount(), 9);
      assert.equal(pool.getAvailableSlots(), 0);
    });

    it('should reject acquisition when pool is full', () => {
      for (let i = 1; i <= 9; i++) {
        pool.acquire(`agent-${i}`, AgentType.READER);
      }

      assert.throws(
        () => pool.acquire('agent-10', AgentType.READER),
        (err: Error) => {
          return err instanceof AgentPoolError &&
            (err as AgentPoolError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should queue acquisition when pool is full (if queueing enabled)', () => {
      pool.enableQueueing(true);

      for (let i = 1; i <= 9; i++) {
        pool.acquire(`agent-${i}`, AgentType.READER);
      }

      const pending = pool.queueAcquisition('agent-10', AgentType.READER);
      assert.ok(pending.queued);
      assert.ok(pending.position >= 0);
    });
  });

  describe('Read-Only Enforcement (04_COMPONENTS.md L109-112)', () => {
    it('should enforce read-only permissions', () => {
      const agent = pool.acquire('agent-001', AgentType.READER);

      assert.ok(agent.permissions.read);
      assert.ok(!agent.permissions.write);
      assert.ok(!agent.permissions.execute);
    });

    it('should not allow write type for L1 agents', () => {
      assert.throws(
        () => pool.acquire('agent-001', AgentType.WRITER),
        (err: Error) => err instanceof AgentPoolError
      );
    });

    it('should support specific read permissions', () => {
      const agent = pool.acquire('agent-001', AgentType.READER, {
        allowedPaths: ['/src/**/*.ts', '/docs/**/*.md'],
      });

      assert.deepEqual(agent.permissions.allowedPaths, [
        '/src/**/*.ts',
        '/docs/**/*.md',
      ]);
    });
  });

  describe('Subagent Release (04_COMPONENTS.md L113-114)', () => {
    it('should release subagent slot', () => {
      pool.acquire('agent-001', AgentType.READER);
      assert.equal(pool.getActiveCount(), 1);

      pool.release('agent-001');
      assert.equal(pool.getActiveCount(), 0);
    });

    it('should process queue after release', () => {
      pool.enableQueueing(true);

      for (let i = 1; i <= 9; i++) {
        pool.acquire(`agent-${i}`, AgentType.READER);
      }

      const pending = pool.queueAcquisition('agent-10', AgentType.READER);

      // Release one
      pool.release('agent-1');

      // Queued agent should be activated
      assert.ok(pool.isActive('agent-10'));
    });

    it('should ignore release for unknown agent', () => {
      // Should not throw
      pool.release('unknown-agent');
      assert.equal(pool.getActiveCount(), 0);
    });
  });

  describe('Agent Status Tracking (04_COMPONENTS.md L115-118)', () => {
    it('should track agent start time', () => {
      const agent = pool.acquire('agent-001', AgentType.READER);

      assert.ok(agent.started_at);
      assert.ok(!isNaN(Date.parse(agent.started_at)));
    });

    it('should track agent task assignment', () => {
      pool.acquire('agent-001', AgentType.READER);

      pool.assignTask('agent-001', 'task-001');

      const info = pool.getAgentInfo('agent-001');
      assert.equal(info.current_task, 'task-001');
    });

    it('should track agent activity duration', () => {
      pool.acquire('agent-001', AgentType.READER);

      // Simulate time passing
      pool.setStartTimeForTesting('agent-001', Date.now() - 5000);

      const info = pool.getAgentInfo('agent-001');
      assert.ok(info.duration_seconds >= 5);
    });
  });

  describe('Pool Statistics', () => {
    it('should provide pool statistics', () => {
      pool.acquire('agent-001', AgentType.READER);
      pool.acquire('agent-002', AgentType.READER);

      const stats = pool.getStatistics();

      assert.equal(stats.total_capacity, 9);
      assert.equal(stats.active_count, 2);
      assert.equal(stats.available_slots, 7);
      assert.equal(stats.utilization_percent, Math.round((2 / 9) * 100));
    });

    it('should track cumulative acquisitions', () => {
      pool.acquire('agent-001', AgentType.READER);
      pool.release('agent-001');
      pool.acquire('agent-002', AgentType.READER);

      const stats = pool.getStatistics();
      assert.equal(stats.total_acquisitions, 2);
    });
  });
});

describe('L2 Executor Pool (04_COMPONENTS.md L119-155)', () => {
  let pool: L2ExecutorPool;

  beforeEach(() => {
    pool = new L2ExecutorPool();
  });

  afterEach(() => {
    pool.releaseAll();
  });

  describe('Pool Configuration (04_COMPONENTS.md L125)', () => {
    it('should have max 4 parallel executors', () => {
      assert.equal(pool.getMaxCapacity(), 4);
    });

    it('should start with 0 active executors', () => {
      assert.equal(pool.getActiveCount(), 0);
    });

    it('should track available slots', () => {
      assert.equal(pool.getAvailableSlots(), 4);
    });
  });

  describe('Executor Acquisition (04_COMPONENTS.md L126-130)', () => {
    it('should acquire executor slot', () => {
      const executor = pool.acquire('executor-001');

      assert.ok(executor);
      assert.equal(executor.id, 'executor-001');
      assert.equal(pool.getActiveCount(), 1);
    });

    it('should acquire multiple executors up to limit', () => {
      for (let i = 1; i <= 4; i++) {
        pool.acquire(`executor-${i}`);
      }

      assert.equal(pool.getActiveCount(), 4);
      assert.equal(pool.getAvailableSlots(), 0);
    });

    it('should reject acquisition when pool is full', () => {
      for (let i = 1; i <= 4; i++) {
        pool.acquire(`executor-${i}`);
      }

      assert.throws(
        () => pool.acquire('executor-5'),
        (err: Error) => {
          return err instanceof AgentPoolError &&
            (err as AgentPoolError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });
  });

  describe('Write Permission Management (04_COMPONENTS.md L131-138)', () => {
    it('should have write permissions by default', () => {
      const executor = pool.acquire('executor-001');

      assert.ok(executor.permissions.read);
      assert.ok(executor.permissions.write);
    });

    it('should support scoped write permissions', () => {
      const executor = pool.acquire('executor-001', {
        writeScopes: ['/src/**/*.ts'],
        readScopes: ['/src/**/*', '/tests/**/*'],
      });

      assert.deepEqual(executor.permissions.writeScopes, ['/src/**/*.ts']);
      assert.deepEqual(executor.permissions.readScopes, ['/src/**/*', '/tests/**/*']);
    });

    it('should validate path against write scope', () => {
      const executor = pool.acquire('executor-001', {
        writeScopes: ['/src/**/*.ts'],
      });

      assert.ok(executor.canWrite('/src/components/Button.ts'));
      assert.ok(!executor.canWrite('/src/components/Button.js'));
      assert.ok(!executor.canWrite('/tests/unit.ts'));
    });
  });

  describe('Lock Integration (04_COMPONENTS.md L139-145)', () => {
    it('should acquire lock when executor starts', () => {
      const executor = pool.acquire('executor-001', {
        lockPaths: ['/src/module-a'],
      });

      assert.ok(executor.heldLocks.length > 0);
      assert.ok(executor.heldLocks.includes('/src/module-a'));
    });

    it('should release locks when executor completes', () => {
      pool.acquire('executor-001', {
        lockPaths: ['/src/module-a'],
      });

      pool.release('executor-001');

      // Lock should be released
      const info = pool.getLockInfo('/src/module-a');
      assert.ok(!info.locked);
    });

    it('should fail acquisition if lock unavailable', () => {
      pool.acquire('executor-001', {
        lockPaths: ['/src/module-a'],
      });

      assert.throws(
        () => pool.acquire('executor-002', {
          lockPaths: ['/src/module-a'], // Same lock
        }),
        (err: Error) => {
          return err instanceof AgentPoolError &&
            (err as AgentPoolError).code === ErrorCode.E401_LOCK_ACQUISITION_FAILED;
        }
      );
    });
  });

  describe('Task Assignment (04_COMPONENTS.md L146-150)', () => {
    it('should assign task to executor', () => {
      pool.acquire('executor-001');

      pool.assignTask('executor-001', {
        task_id: 'task-001',
        description: 'Implement feature',
        files: ['/src/feature.ts'],
      });

      const info = pool.getExecutorInfo('executor-001');
      assert.equal(info.current_task.task_id, 'task-001');
    });

    it('should track task status', () => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });

      pool.updateTaskStatus('executor-001', TaskStatus.IN_PROGRESS);

      const info = pool.getExecutorInfo('executor-001');
      assert.equal(info.current_task.status, TaskStatus.IN_PROGRESS);
    });

    it('should record task completion with evidence', () => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });

      pool.completeTask('executor-001', {
        status: TaskStatus.COMPLETED,
        evidence: {
          files_modified: ['/src/feature.ts'],
          tests_passed: true,
        },
      });

      const info = pool.getExecutorInfo('executor-001');
      assert.equal(info.current_task.status, TaskStatus.COMPLETED);
      assert.ok(info.current_task.evidence);
    });
  });

  describe('Executor Release (04_COMPONENTS.md L151-155)', () => {
    it('should release executor slot', () => {
      pool.acquire('executor-001');
      assert.equal(pool.getActiveCount(), 1);

      pool.release('executor-001');
      assert.equal(pool.getActiveCount(), 0);
    });

    it('should release all held locks on release', () => {
      pool.acquire('executor-001', {
        lockPaths: ['/src/module-a', '/src/module-b'],
      });

      pool.release('executor-001');

      assert.ok(!pool.getLockInfo('/src/module-a').locked);
      assert.ok(!pool.getLockInfo('/src/module-b').locked);
    });

    it('should fail release if task not complete (unless forced)', () => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });
      pool.updateTaskStatus('executor-001', TaskStatus.IN_PROGRESS);

      assert.throws(
        () => pool.release('executor-001'),
        (err: Error) => err instanceof AgentPoolError
      );

      // Force release should work
      pool.release('executor-001', { force: true });
      assert.equal(pool.getActiveCount(), 0);
    });
  });

  describe('Evidence Collection (04_COMPONENTS.md L145)', () => {
    it('should collect evidence for task completion', () => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });

      pool.recordEvidence('executor-001', {
        type: 'file_change',
        path: '/src/feature.ts',
        hash: 'abc123',
      });

      const evidence = pool.getTaskEvidence('executor-001');
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0].type, 'file_change');
    });

    it('should require evidence for task completion', () => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });

      assert.throws(
        () => pool.completeTask('executor-001', {
          status: TaskStatus.COMPLETED,
          evidence: null, // No evidence
        }),
        (err: Error) => err instanceof AgentPoolError
      );
    });
  });

  describe('Executor Health Monitoring', () => {
    it('should track executor health', () => {
      pool.acquire('executor-001');

      const health = pool.getExecutorHealth('executor-001');

      assert.ok(health.status === 'healthy');
      assert.ok(health.last_activity);
    });

    it('should detect stale executor', () => {
      pool.acquire('executor-001');

      // Simulate no activity for a long time
      pool.setLastActivityForTesting('executor-001', Date.now() - 600000); // 10 minutes

      const health = pool.getExecutorHealth('executor-001');
      assert.equal(health.status, 'stale');
    });

    it('should force release stale executors', () => {
      pool.acquire('executor-001');
      pool.setLastActivityForTesting('executor-001', Date.now() - 600000);

      pool.cleanupStaleExecutors(300); // 5 minute threshold

      assert.equal(pool.getActiveCount(), 0);
    });
  });

  describe('Pool Coordination', () => {
    it('should coordinate with global semaphore', () => {
      const globalSemaphore = pool.getGlobalSemaphore();

      pool.acquire('executor-001');

      assert.equal(globalSemaphore.getActiveCount(), 1);
    });

    it('should emit events on acquisition and release', (done) => {
      pool.on('executor_acquired', (event) => {
        assert.equal(event.executor_id, 'executor-001');
        done();
      });

      pool.acquire('executor-001');
    });

    it('should emit event on task completion', (done) => {
      pool.acquire('executor-001');
      pool.assignTask('executor-001', { task_id: 'task-001' });

      pool.on('task_completed', (event) => {
        assert.equal(event.task_id, 'task-001');
        assert.equal(event.executor_id, 'executor-001');
        done();
      });

      pool.completeTask('executor-001', {
        status: TaskStatus.COMPLETED,
        evidence: { files_modified: [] },
      });
    });
  });
});

describe('Pool Integration (L1 + L2)', () => {
  let l1Pool: L1SubagentPool;
  let l2Pool: L2ExecutorPool;

  beforeEach(() => {
    l1Pool = new L1SubagentPool();
    l2Pool = new L2ExecutorPool();
  });

  afterEach(() => {
    l1Pool.releaseAll();
    l2Pool.releaseAll();
  });

  it('should allow mixed L1 and L2 usage', () => {
    l1Pool.acquire('reader-001', AgentType.READER);
    l2Pool.acquire('executor-001');

    assert.equal(l1Pool.getActiveCount(), 1);
    assert.equal(l2Pool.getActiveCount(), 1);
  });

  it('should track total parallel agents', () => {
    for (let i = 1; i <= 5; i++) {
      l1Pool.acquire(`reader-${i}`, AgentType.READER);
    }
    for (let i = 1; i <= 3; i++) {
      l2Pool.acquire(`executor-${i}`);
    }

    const totalActive = l1Pool.getActiveCount() + l2Pool.getActiveCount();
    assert.equal(totalActive, 8);
  });

  it('should enforce individual pool limits independently', () => {
    // Fill L1 pool
    for (let i = 1; i <= 9; i++) {
      l1Pool.acquire(`reader-${i}`, AgentType.READER);
    }

    // L2 should still have capacity
    assert.equal(l2Pool.getAvailableSlots(), 4);

    // L1 is full
    assert.throws(
      () => l1Pool.acquire('reader-10', AgentType.READER),
      (err: Error) => err instanceof AgentPoolError
    );

    // But L2 can still acquire
    l2Pool.acquire('executor-001');
    assert.equal(l2Pool.getActiveCount(), 1);
  });
});
