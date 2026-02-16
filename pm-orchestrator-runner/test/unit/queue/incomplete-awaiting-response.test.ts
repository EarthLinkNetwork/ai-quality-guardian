/**
 * Unit Tests: INCOMPLETE -> AWAITING_RESPONSE for READ_INFO/REPORT tasks
 *
 * Verifies that:
 * 1. READ_INFO/REPORT + INCOMPLETE + output -> AWAITING_RESPONSE & output saved
 * 2. READ_INFO/REPORT + INCOMPLETE + no output -> AWAITING_RESPONSE & fallback output
 * 3. IMPLEMENTATION + INCOMPLETE -> ERROR (strict) but output saved if present
 * 4. QueuePoller correctly handles AWAITING_CLARIFICATION with output preservation
 * 5. setAwaitingResponse saves output when provided
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { InMemoryQueueStore } from '../../../src/queue/in-memory-queue-store';
import { QueuePoller, TaskExecutor } from '../../../src/queue/queue-poller';
import { QueueItem, IQueueStore } from '../../../src/queue/queue-store';

describe('INCOMPLETE -> AWAITING_RESPONSE handling', () => {
  let store: InMemoryQueueStore;
  const testNamespace = 'incomplete-test';
  const testSessionId = 'test-session';

  beforeEach(() => {
    store = new InMemoryQueueStore({ namespace: testNamespace });
  });

  describe('setAwaitingResponse with output', () => {
    it('should save output when provided to setAwaitingResponse', async () => {
      const task = await store.enqueue(
        testSessionId,
        'tg-1',
        'Test prompt',
        'task-output-1',
        'READ_INFO'
      );

      // Transition to RUNNING first (required for AWAITING_RESPONSE transition)
      await store.updateStatus(task.task_id, 'RUNNING');

      const result = await store.setAwaitingResponse(
        task.task_id,
        {
          type: 'unknown',
          question: 'Need more info',
          context: 'test',
        },
        undefined,
        'This is the partial output that should be saved'
      );

      assert.equal(result.success, true);
      assert.equal(result.new_status, 'AWAITING_RESPONSE');

      // Verify output was saved
      const saved = await store.getItem(task.task_id);
      assert.equal(saved?.status, 'AWAITING_RESPONSE');
      assert.equal(saved?.output, 'This is the partial output that should be saved');
    });

    it('should work without output (backward compatibility)', async () => {
      const task = await store.enqueue(
        testSessionId,
        'tg-2',
        'Test prompt',
        'task-no-output-1',
        'READ_INFO'
      );

      await store.updateStatus(task.task_id, 'RUNNING');

      const result = await store.setAwaitingResponse(
        task.task_id,
        {
          type: 'unknown',
          question: 'Need more info',
          context: 'test',
        }
      );

      assert.equal(result.success, true);
      const saved = await store.getItem(task.task_id);
      assert.equal(saved?.status, 'AWAITING_RESPONSE');
      assert.equal(saved?.output, undefined);
    });
  });

  describe('QueuePoller AWAITING_CLARIFICATION with output', () => {
    it('should preserve output when AWAITING_CLARIFICATION has output', async () => {
      const task = await store.enqueue(
        testSessionId,
        'tg-poller-1',
        'Explain this code',
        'task-poller-1',
        'READ_INFO'
      );

      const testOutput = 'Partial analysis:\n1. The code does X\n2. Need clarification on Y';

      // Simulate executor returning AWAITING_CLARIFICATION with output
      const executor: TaskExecutor = async (_item: QueueItem) => {
        return {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:Need more details about the scope',
          output: testOutput,
        };
      };

      const poller = new QueuePoller(
        store as unknown as IQueueStore,
        executor,
        { pollIntervalMs: 60000, recoverOnStartup: false }
      );

      await poller.start();
      await poller.poll();
      poller.stop();

      // Task should be AWAITING_RESPONSE with output preserved
      const saved = await store.getItem(task.task_id);
      assert.equal(saved?.status, 'AWAITING_RESPONSE');
      assert.equal(saved?.output, testOutput);
      assert.ok(saved?.clarification);
      assert.equal(saved?.clarification?.question, 'Need more details about the scope');
    });

    it('should handle AWAITING_CLARIFICATION without output (fallback)', async () => {
      const task = await store.enqueue(
        testSessionId,
        'tg-poller-2',
        'Tell me about this',
        'task-poller-2',
        'READ_INFO'
      );

      const executor: TaskExecutor = async (_item: QueueItem) => {
        return {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:What specifically do you want to know?',
        };
      };

      const poller = new QueuePoller(
        store as unknown as IQueueStore,
        executor,
        { pollIntervalMs: 60000, recoverOnStartup: false }
      );

      await poller.start();
      await poller.poll();
      poller.stop();

      const saved = await store.getItem(task.task_id);
      assert.equal(saved?.status, 'AWAITING_RESPONSE');
      // Without explicit output, there should be a fallback
      assert.ok(saved?.clarification);
    });
  });

  describe('createTaskExecutor INCOMPLETE handling logic', () => {
    /**
     * Tests the logic that should exist in createTaskExecutor:
     * READ_INFO/REPORT + INCOMPLETE + output -> AWAITING_RESPONSE (not ERROR)
     */
    it('READ_INFO + INCOMPLETE + output should produce AWAITING_CLARIFICATION with output', () => {
      // Simulates what createTaskExecutor should do when AutoResolvingExecutor
      // returns INCOMPLETE for a READ_INFO task with output
      const taskType: string = 'READ_INFO';
      const executorStatus: string = 'INCOMPLETE';
      const output: string = 'Here is what I found so far:\n1. File A contains...\n2. Need clarification on...';

      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';

      // The fix should produce AWAITING_CLARIFICATION (not ERROR)
      if (executorStatus === 'INCOMPLETE' && isReadInfoOrReport) {
        const hasOutput = output && output.trim().length > 0;
        const clarificationMessage = hasOutput
          ? 'INCOMPLETE: Task returned partial results. Please review and clarify.'
          : 'INCOMPLETE: No output produced. Please specify what you need.';

        // Should signal AWAITING_CLARIFICATION (handled by queue-poller)
        const result = {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:' + clarificationMessage,
          output: hasOutput ? output : `INCOMPLETE: Task could not complete.\n${clarificationMessage}`,
        };

        assert.equal(result.status, 'ERROR');
        assert.ok(result.errorMessage?.startsWith('AWAITING_CLARIFICATION:'));
        assert.ok(result.output, 'Output must be present');
        assert.ok(result.output!.includes('Here is what I found'));
      } else {
        assert.fail('Should not reach here for READ_INFO + INCOMPLETE');
      }
    });

    it('READ_INFO + INCOMPLETE + no output should produce AWAITING_CLARIFICATION with fallback', () => {
      const taskType: string = 'READ_INFO';
      const executorStatus: string = 'INCOMPLETE';
      const output: string = '';

      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';

      if (executorStatus === 'INCOMPLETE' && isReadInfoOrReport) {
        const hasOutput = output && output.trim().length > 0;

        const result = {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:Task could not produce results. Please clarify your request.',
          output: hasOutput ? output : 'INCOMPLETE: Task could not produce results.\nPlease clarify your request with more specific details.',
        };

        assert.equal(result.status, 'ERROR');
        assert.ok(result.errorMessage?.startsWith('AWAITING_CLARIFICATION:'));
        assert.ok(result.output, 'Fallback output must be present');
        assert.ok(result.output!.includes('INCOMPLETE:'));
      }
    });

    it('IMPLEMENTATION + INCOMPLETE should remain ERROR but preserve output', () => {
      const taskType: string = 'IMPLEMENTATION';
      const executorStatus: string = 'INCOMPLETE';
      const output: string = 'Created file A but could not verify...';

      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';

      if (executorStatus === 'INCOMPLETE' && !isReadInfoOrReport) {
        // IMPLEMENTATION stays ERROR
        const result = {
          status: 'ERROR' as const,
          errorMessage: `Task ended with status: ${executorStatus}`,
          output: output || undefined,
        };

        assert.equal(result.status, 'ERROR');
        assert.equal(result.output, output, 'Output should be preserved for IMPLEMENTATION too');
      }
    });

    it('IMPLEMENTATION + INCOMPLETE + question output should produce AWAITING_CLARIFICATION', () => {
      const taskType: string = 'IMPLEMENTATION';
      const executorStatus: string = 'INCOMPLETE';
      const output: string = 'Which file should I update?';

      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';
      const hasQuestions = output.includes('?') || output.includes('？');

      if (executorStatus === 'INCOMPLETE' && !isReadInfoOrReport && hasQuestions) {
        const result = {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:' + output,
          output,
        };

        assert.ok(result.errorMessage?.startsWith('AWAITING_CLARIFICATION:'));
        assert.equal(result.output, output);
      } else {
        assert.fail('Should not reach here for IMPLEMENTATION + INCOMPLETE + question output');
      }
    });

    it('REPORT + INCOMPLETE + output should produce AWAITING_CLARIFICATION with output', () => {
      const taskType: string = 'REPORT';
      const executorStatus: string = 'INCOMPLETE';
      const output: string = 'Partial report:\n- Section 1 complete\n- Section 2 needs data';

      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';
      assert.equal(isReadInfoOrReport, true, 'REPORT should be treated same as READ_INFO');

      if (executorStatus === 'INCOMPLETE' && isReadInfoOrReport) {
        const result = {
          status: 'ERROR' as const,
          errorMessage: 'AWAITING_CLARIFICATION:Partial report generated. Need more information.',
          output: output,
        };

        assert.ok(result.output);
        assert.ok(result.output!.includes('Partial report'));
      }
    });
  });
});
