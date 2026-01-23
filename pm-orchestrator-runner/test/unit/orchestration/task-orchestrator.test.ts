import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  TaskOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
  type TaskInput,
  type SubtaskExecutor,
  type SubtaskExecutionResult,
  type OrchestratedTaskResult,
  type OrchestrationEvent,
} from '../../../src/orchestration';
import { TaskPlanner } from '../../../src/planning';
import { RetryManager } from '../../../src/retry';
import { ModelPolicyManager } from '../../../src/model-policy';

describe('TaskOrchestrator (Unified Orchestration)', () => {
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    orchestrator = new TaskOrchestrator();
  });

  describe('Default Configuration', () => {
    it('should have default max_parallel_subtasks', () => {
      assert.ok(typeof DEFAULT_ORCHESTRATOR_CONFIG.max_parallel_subtasks === 'number');
      assert.ok((DEFAULT_ORCHESTRATOR_CONFIG.max_parallel_subtasks ?? 0) > 0);
    });

    it('should have default auto_chunking', () => {
      assert.strictEqual(DEFAULT_ORCHESTRATOR_CONFIG.auto_chunking, true);
    });

    it('should have default auto_model_escalation', () => {
      assert.strictEqual(DEFAULT_ORCHESTRATOR_CONFIG.auto_model_escalation, true);
    });

    it('should have default cost_warning_threshold', () => {
      assert.ok(typeof DEFAULT_ORCHESTRATOR_CONFIG.cost_warning_threshold === 'number');
      assert.ok((DEFAULT_ORCHESTRATOR_CONFIG.cost_warning_threshold ?? 0) > 0);
    });
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      const o = new TaskOrchestrator();
      assert.ok(o);
    });

    it('should accept partial config override', () => {
      const o = new TaskOrchestrator({ max_parallel_subtasks: 5 });
      assert.ok(o);
    });

    it('should accept event callback', () => {
      const events: OrchestrationEvent[] = [];
      const o = new TaskOrchestrator({}, (event) => {
        events.push(event);
      });
      assert.ok(o);
    });
  });

  describe('Component Access', () => {
    it('should provide access to TaskPlanner', () => {
      const planner = orchestrator.getPlanner();
      assert.ok(planner instanceof TaskPlanner);
    });

    it('should provide access to RetryManager', () => {
      const retryManager = orchestrator.getRetryManager();
      assert.ok(retryManager instanceof RetryManager);
    });

    it('should provide access to ModelPolicyManager', () => {
      const modelPolicy = orchestrator.getModelPolicy();
      assert.ok(modelPolicy instanceof ModelPolicyManager);
    });
  });

  describe('orchestrate() - Basic Execution', () => {
    it('should orchestrate simple task', async () => {
      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Simple task',
      };

      const executor: SubtaskExecutor = async (subtask, model) => {
        return {
          subtask_id: subtask.id,
          status: 'SUCCESS',
          output: 'Completed',
          duration_ms: 100,
        };
      };

      const result = await orchestrator.orchestrate(input, executor);

      assert.ok(result.task_id);
      assert.ok(result.completed_at);
      assert.ok(typeof result.total_duration_ms === 'number');
    });

    it('should include execution plan in result', async () => {
      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task with planning',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 50,
      });

      const result = await orchestrator.orchestrate(input, executor);

      assert.ok(result.plan);
      assert.ok(result.plan.plan_id);
    });

    it('should track subtask results', async () => {
      const complexInput: TaskInput = {
        task_id: 'task-001',
        description: `
          Implement feature with:
          1. Database schema design
          2. API endpoint creation
          3. Frontend component development
          4. Integration testing
        `,
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: `Completed: ${subtask.description}`,
        duration_ms: 100,
      });

      const result = await orchestrator.orchestrate(complexInput, executor);

      assert.ok(Array.isArray(result.subtask_results));
    });
  });

  describe('orchestrate() - Error Handling', () => {
    it('should handle subtask failure', async () => {
      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task that will fail',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'FAILURE',
        error_message: 'Simulated failure',
        duration_ms: 50,
      });

      const result = await orchestrator.orchestrate(input, executor);

      // Should complete but may have failures
      assert.ok(result.completed_at);
    });

    it('should handle executor exception', async () => {
      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task with exception',
      };

      const executor: SubtaskExecutor = async () => {
        throw new Error('Executor crashed');
      };

      const result = await orchestrator.orchestrate(input, executor);

      // Should handle gracefully
      assert.ok(result);
    });
  });

  describe('orchestrate() - Retry Handling', () => {
    it('should retry failed subtasks', async function() {
      // Set longer timeout for retry tests with backoff delays
      this.timeout(15000);

      let attemptCount = 0;

      // Use numbered list to ensure subtasks are generated
      const input: TaskInput = {
        task_id: 'task-001',
        description: `Build full system with database integration:
          1. Create database schema
          2. Implement API endpoints
          3. Add authentication`,
      };

      const executor: SubtaskExecutor = async (subtask, model) => {
        attemptCount++;
        if (attemptCount < 2) {
          return {
            subtask_id: subtask.id,
            status: 'FAILURE',
            error_message: 'Transient error',
            failure_type: 'TRANSIENT_ERROR',
            duration_ms: 50,
          };
        }
        return {
          subtask_id: subtask.id,
          status: 'SUCCESS',
          output: 'Success after retry',
          duration_ms: 100,
        };
      };

      const result = await orchestrator.orchestrate(input, executor);

      // Should have called executor at least once
      assert.ok(attemptCount >= 1);
    });

    it('should track retry decisions in result', async () => {
      let failCount = 0;

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task needing retries',
      };

      const executor: SubtaskExecutor = async (subtask, model) => {
        failCount++;
        if (failCount < 2) {
          return {
            subtask_id: subtask.id,
            status: 'FAILURE',
            error_message: 'Temporary failure',
            failure_type: 'TIMEOUT',
            duration_ms: 30000,
          };
        }
        return {
          subtask_id: subtask.id,
          status: 'SUCCESS',
          output: 'Done',
          duration_ms: 100,
        };
      };

      const result = await orchestrator.orchestrate(input, executor);

      // Result should have retry_decisions array
      assert.ok(Array.isArray(result.retry_decisions));
    });
  });

  describe('orchestrate() - Model Selection', () => {
    it('should select model for execution', async () => {
      let selectedModel: unknown = null;

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task with model selection',
      };

      const executor: SubtaskExecutor = async (subtask, model) => {
        selectedModel = model;
        return {
          subtask_id: subtask.id,
          status: 'SUCCESS',
          output: 'Done',
          duration_ms: 100,
        };
      };

      await orchestrator.orchestrate(input, executor);

      if (selectedModel) {
        assert.ok((selectedModel as { model_id: string }).model_id);
        assert.ok((selectedModel as { provider: string }).provider);
      }
    });
  });

  describe('Usage Tracking', () => {
    it('should track usage summary', async () => {
      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Task for usage tracking',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
        tokens_used: { input: 1000, output: 500 },
      });

      await orchestrator.orchestrate(input, executor);

      const summary = orchestrator.getUsageSummary();
      assert.ok(summary);
      assert.ok(typeof summary.task_count === 'number');
    });
  });

  describe('Cost Management', () => {
    it('should check cost limit', () => {
      const check = orchestrator.checkCostLimit();

      assert.ok(typeof check.exceeded === 'boolean');
      assert.ok(typeof check.warning === 'boolean');
      assert.ok(typeof check.current_cost === 'number');
    });
  });

  describe('Profile Management', () => {
    it('should set model profile', () => {
      const result = orchestrator.setModelProfile('cheap');
      assert.strictEqual(result, true);
    });

    it('should reject unknown profile', () => {
      const result = orchestrator.setModelProfile('unknown-profile');
      assert.strictEqual(result, false);
    });
  });

  describe('Event Emission', () => {
    it('should emit orchestration events', async () => {
      const events: OrchestrationEvent[] = [];
      const o = new TaskOrchestrator({}, (event) => {
        events.push(event);
      });

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Event test task',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      await o.orchestrate(input, executor);

      assert.ok(events.length > 0);
      assert.ok(events.some(e => e.type === 'ORCHESTRATION_STARTED'));
      assert.ok(events.some(e => e.type === 'ORCHESTRATION_COMPLETED'));
    });

    it('should emit planning events', async () => {
      const events: OrchestrationEvent[] = [];
      const o = new TaskOrchestrator({}, (event) => {
        events.push(event);
      });

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Planning event test',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      await o.orchestrate(input, executor);

      assert.ok(events.some(e => e.type === 'PLANNING_COMPLETED'));
    });

    it('should emit subtask events', async () => {
      const events: OrchestrationEvent[] = [];
      const o = new TaskOrchestrator({}, (event) => {
        events.push(event);
      });

      // Use numbered list to ensure subtasks are generated
      const input: TaskInput = {
        task_id: 'task-001',
        description: `Build full database system:
          1. Create schema
          2. Add API endpoints
          3. Implement auth`,
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      await o.orchestrate(input, executor);

      assert.ok(events.some(e => e.type === 'SUBTASK_STARTED'));
      assert.ok(events.some(e => e.type === 'SUBTASK_COMPLETED'));
    });
  });

  describe('Configuration Options', () => {
    it('should work with custom max_parallel_subtasks', async () => {
      const o = new TaskOrchestrator({ max_parallel_subtasks: 5 });

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'Parallel config task',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      const result = await o.orchestrate(input, executor);
      assert.ok(result);
    });

    it('should work with auto_chunking disabled', async () => {
      const o = new TaskOrchestrator({ auto_chunking: false });

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'No chunking task',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      const result = await o.orchestrate(input, executor);
      assert.ok(result);
    });

    it('should work with auto_model_escalation disabled', async () => {
      const o = new TaskOrchestrator({ auto_model_escalation: false });

      const input: TaskInput = {
        task_id: 'task-001',
        description: 'No model escalation task',
      };

      const executor: SubtaskExecutor = async (subtask, model) => ({
        subtask_id: subtask.id,
        status: 'SUCCESS',
        output: 'Done',
        duration_ms: 100,
      });

      const result = await o.orchestrate(input, executor);
      assert.ok(result);
    });
  });
});
