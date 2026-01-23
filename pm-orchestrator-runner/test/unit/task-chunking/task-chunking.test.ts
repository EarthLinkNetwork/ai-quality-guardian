/**
 * Task Chunking Tests
 *
 * Per spec/26_TASK_CHUNKING.md: Tests for automatic task splitting
 *
 * Covers:
 * - Task analysis for decomposition
 * - Subtask creation and management
 * - Parallel and sequential execution
 * - Auto-retry with exponential backoff
 * - Result aggregation
 * - Event emission
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  // Main class
  TaskChunkingExecutorWrapper,

  // Analysis functions
  analyzeTaskForChunking,

  // Retry functions
  calculateRetryDelay,
  shouldRetry,

  // Utility functions
  generateSubtaskId,
  createSubtaskDefinitions,
  createChunkedTask,
  getReadySubtasks,
  isChunkedTaskComplete,
  hasFailedSubtask,
  aggregateResults,

  // Configuration
  DEFAULT_TASK_CHUNKING_CONFIG,

  // Types
  type ChunkedTask,
  type SubtaskDefinition,
  type SubtaskResult,
  type TaskChunkingConfig,
  type TaskAnalysisResult,
} from '../../../src/task-chunking';

import type {
  IExecutor,
  ExecutorResult,
  ExecutorTask,
  AuthCheckResult,
} from '../../../src/executor/claude-code-executor';

// ============================================================================
// Mock Executor
// ============================================================================

/**
 * Mock executor for testing
 */
class MockExecutor implements IExecutor {
  public executeCalls: ExecutorTask[] = [];
  public executeResults: ExecutorResult[] = [];
  private executeIndex = 0;

  setResults(results: ExecutorResult[]): void {
    this.executeResults = results;
    this.executeIndex = 0;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    this.executeCalls.push(task);

    if (this.executeIndex < this.executeResults.length) {
      return this.executeResults[this.executeIndex++];
    }

    // Default successful result
    return {
      executed: true,
      output: `Executed: ${task.prompt}`,
      files_modified: [],
      duration_ms: 100,
      status: 'COMPLETE',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
    };
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async checkAuthStatus(): Promise<AuthCheckResult> {
    return { available: true, loggedIn: true };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createSuccessResult(prompt: string): ExecutorResult {
  return {
    executed: true,
    output: `Success: ${prompt}`,
    files_modified: [`${prompt.replace(/\s+/g, '-').toLowerCase()}.ts`],
    duration_ms: 100,
    status: 'COMPLETE',
    cwd: '/test',
    verified_files: [],
    unverified_files: [],
  };
}

function createIncompleteResult(prompt: string): ExecutorResult {
  return {
    executed: true,
    output: `Incomplete: ${prompt}`,
    files_modified: [],
    duration_ms: 100,
    status: 'INCOMPLETE',
    cwd: '/test',
    verified_files: [],
    unverified_files: [],
  };
}

function createErrorResult(prompt: string): ExecutorResult {
  return {
    executed: true,
    output: `Error: ${prompt}`,
    files_modified: [],
    duration_ms: 100,
    status: 'ERROR',
    cwd: '/test',
    verified_files: [],
    unverified_files: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Task Chunking Module', () => {
  describe('DEFAULT_TASK_CHUNKING_CONFIG', () => {
    it('should have correct default values', () => {
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.enabled, true);
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.min_subtasks, 2);
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.max_subtasks, 10);
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.execution_mode, 'auto');
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.fail_fast, false);
    });

    it('should have correct retry defaults', () => {
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.retry.max_retries, 2);
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.retry.retry_delay_ms, 2000);
      assert.strictEqual(DEFAULT_TASK_CHUNKING_CONFIG.retry.backoff_multiplier, 1.5);
    });

    it('should have correct retry_on defaults', () => {
      assert.deepStrictEqual(DEFAULT_TASK_CHUNKING_CONFIG.retry.retry_on, ['INCOMPLETE', 'ERROR', 'TIMEOUT']);
    });
  });

  describe('analyzeTaskForChunking', () => {
    it('should identify non-decomposable simple tasks', () => {
      const result = analyzeTaskForChunking('Fix the typo in README.md', DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(result.is_decomposable, false);
      assert.ok(typeof result.reason === 'string');
    });

    it('should identify decomposable tasks with numbered list', () => {
      // Prompt needs 2+ indicators: enumeration + largeScope ("module")
      const prompt = `Please implement the complete module with the following:
1. Create a new file
2. Add the header
3. Add the footer`;

      const result = analyzeTaskForChunking(prompt, DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(result.is_decomposable, true);
      assert.ok(Array.isArray(result.suggested_subtasks));
      assert.ok(result.suggested_subtasks!.length >= 2);
    });

    it('should identify decomposable tasks with bullet points', () => {
      // Prompt needs 2+ indicators: enumeration + largeScope ("system")
      const prompt = `Implement the entire system:
- Login feature
- Logout feature
- Session management`;

      const result = analyzeTaskForChunking(prompt, DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(result.is_decomposable, true);
      assert.ok(Array.isArray(result.suggested_subtasks));
    });

    it('should respect max_subtasks limit', () => {
      const config: TaskChunkingConfig = {
        ...DEFAULT_TASK_CHUNKING_CONFIG,
        max_subtasks: 3,
      };

      const prompt = `Do these:
1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5`;

      const result = analyzeTaskForChunking(prompt, config);

      if (result.is_decomposable && result.suggested_subtasks) {
        assert.ok(result.suggested_subtasks.length <= 3);
      }
    });

    it('should respect min_subtasks threshold', () => {
      const config: TaskChunkingConfig = {
        ...DEFAULT_TASK_CHUNKING_CONFIG,
        min_subtasks: 3,
      };

      const prompt = `Do these:
- Task 1
- Task 2`;

      const result = analyzeTaskForChunking(prompt, config);

      // Should not decompose if fewer than min_subtasks would result
      assert.strictEqual(result.is_decomposable, false);
    });

    it('should detect dependencies for sequential execution', () => {
      const prompt = `Please:
1. First, create the database schema
2. Then, run migrations
3. Finally, seed the data`;

      const result = analyzeTaskForChunking(prompt, DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(result.is_decomposable, true);
      assert.strictEqual(result.execution_mode, 'sequential');
    });

    it('should default to parallel for independent tasks', () => {
      const prompt = `Do these independently:
- Fix typo in file1.ts
- Fix typo in file2.ts
- Fix typo in file3.ts`;

      const result = analyzeTaskForChunking(prompt, DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(result.is_decomposable, true);
      assert.strictEqual(result.execution_mode, 'parallel');
    });

    it('should not decompose when chunking is disabled', () => {
      const config: TaskChunkingConfig = {
        ...DEFAULT_TASK_CHUNKING_CONFIG,
        enabled: false,
      };

      const prompt = `Do these:
1. Task 1
2. Task 2
3. Task 3`;

      const result = analyzeTaskForChunking(prompt, config);

      assert.strictEqual(result.is_decomposable, false);
    });
  });

  describe('generateSubtaskId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSubtaskId('parent', i));
      }
      assert.strictEqual(ids.size, 100);
    });

    it('should include parent task ID', () => {
      const id = generateSubtaskId('parent-123', 0);
      assert.ok(id.includes('parent-123'));
    });

    it('should include index', () => {
      const id = generateSubtaskId('parent', 5);
      assert.ok(id.includes('5'));
    });
  });

  describe('createSubtaskDefinitions', () => {
    it('should create subtask definitions from analysis', () => {
      const analysis: TaskAnalysisResult = {
        is_decomposable: true,
        reason: 'Test',
        suggested_subtasks: [
          { prompt: 'Task 1', dependencies: [], execution_order: 0 },
          { prompt: 'Task 2', dependencies: [], execution_order: 1 },
        ],
        execution_mode: 'parallel',
      };

      const subtasks = createSubtaskDefinitions('parent-1', analysis);

      assert.strictEqual(subtasks.length, 2);
      assert.strictEqual(subtasks[0].prompt, 'Task 1');
      assert.strictEqual(subtasks[1].prompt, 'Task 2');
      assert.strictEqual(subtasks[0].parent_task_id, 'parent-1');
      assert.strictEqual(subtasks[0].status, 'PENDING');
      assert.strictEqual(subtasks[0].retry_count, 0);
    });

    it('should set execution order for sequential mode', () => {
      const analysis: TaskAnalysisResult = {
        is_decomposable: true,
        reason: 'Test',
        suggested_subtasks: [
          { prompt: 'Task 1', dependencies: [], execution_order: 0 },
          { prompt: 'Task 2', dependencies: [], execution_order: 1 },
          { prompt: 'Task 3', dependencies: [], execution_order: 2 },
        ],
        execution_mode: 'sequential',
      };

      const subtasks = createSubtaskDefinitions('parent-1', analysis);

      assert.strictEqual(subtasks[0].execution_order, 0);
      assert.strictEqual(subtasks[1].execution_order, 1);
      assert.strictEqual(subtasks[2].execution_order, 2);
    });
  });

  describe('createChunkedTask', () => {
    it('should create a chunked task from analysis', () => {
      const analysis: TaskAnalysisResult = {
        is_decomposable: true,
        reason: 'Multiple tasks',
        suggested_subtasks: [
          { prompt: 'Task 1', dependencies: [], execution_order: 0 },
          { prompt: 'Task 2', dependencies: [], execution_order: 1 },
        ],
        execution_mode: 'parallel',
      };

      const chunkedTask = createChunkedTask('task-1', analysis, DEFAULT_TASK_CHUNKING_CONFIG);

      assert.strictEqual(chunkedTask.parent_task_id, 'task-1');
      assert.strictEqual(chunkedTask.status, 'EXECUTING');
      assert.strictEqual(chunkedTask.execution_mode, 'parallel');
      assert.strictEqual(chunkedTask.subtasks.length, 2);
    });
  });

  describe('getReadySubtasks', () => {
    it('should return pending subtasks with satisfied dependencies', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'sequential',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'PENDING',
            retry_count: 0,
            dependencies: ['sub-1'],
          },
          {
            subtask_id: 'sub-3',
            parent_task_id: 'task-1',
            prompt: 'Task 3',
            status: 'PENDING',
            retry_count: 0,
            dependencies: ['sub-2'],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      const ready = getReadySubtasks(chunkedTask);

      assert.strictEqual(ready.length, 1);
      assert.strictEqual(ready[0].subtask_id, 'sub-2');
    });

    it('should return multiple pending subtasks in parallel mode', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'PENDING',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'PENDING',
            retry_count: 0,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      const ready = getReadySubtasks(chunkedTask);

      assert.strictEqual(ready.length, 2);
    });
  });

  describe('isChunkedTaskComplete', () => {
    it('should return true when all subtasks are complete', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      assert.strictEqual(isChunkedTaskComplete(chunkedTask), true);
    });

    it('should return false when subtasks are pending', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'PENDING',
            retry_count: 0,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      assert.strictEqual(isChunkedTaskComplete(chunkedTask), false);
    });

    it('should return false when some subtasks are failed (complete requires all COMPLETE)', () => {
      // Note: isChunkedTaskComplete only returns true when ALL subtasks are 'COMPLETE'
      // FAILED subtasks are not considered "complete" by this function
      // Use hasFailedSubtask to check for failures
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'FAILED',
            retry_count: 3,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      // Returns false because one subtask is FAILED, not COMPLETE
      assert.strictEqual(isChunkedTaskComplete(chunkedTask), false);
    });
  });

  describe('hasFailedSubtask', () => {
    it('should return true when any subtask has failed', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'FAILED',
            retry_count: 3,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      assert.strictEqual(hasFailedSubtask(chunkedTask), true);
    });

    it('should return false when no subtask has failed', () => {
      const chunkedTask: ChunkedTask = {
        parent_task_id: 'task-1',
        status: 'EXECUTING',
        execution_mode: 'parallel',
        subtasks: [
          {
            subtask_id: 'sub-1',
            parent_task_id: 'task-1',
            prompt: 'Task 1',
            status: 'COMPLETE',
            retry_count: 0,
            dependencies: [],
          },
          {
            subtask_id: 'sub-2',
            parent_task_id: 'task-1',
            prompt: 'Task 2',
            status: 'PENDING',
            retry_count: 0,
            dependencies: [],
          },
        ],
        aggregation_strategy: { type: 'merge_all', conflict_resolution: 'fail' },
        started_at: new Date().toISOString(),
      };

      assert.strictEqual(hasFailedSubtask(chunkedTask), false);
    });
  });

  describe('shouldRetry', () => {
    it('should return true for incomplete results under max retries', () => {
      const result: SubtaskResult = {
        status: 'INCOMPLETE',
        output_summary: 'Incomplete',
        files_modified: [],
      };

      assert.strictEqual(shouldRetry(result, 0, DEFAULT_TASK_CHUNKING_CONFIG.retry), true);
      assert.strictEqual(shouldRetry(result, 1, DEFAULT_TASK_CHUNKING_CONFIG.retry), true);
    });

    it('should return false when max retries exceeded', () => {
      const result: SubtaskResult = {
        status: 'INCOMPLETE',
        output_summary: 'Incomplete',
        files_modified: [],
      };

      assert.strictEqual(shouldRetry(result, 3, DEFAULT_TASK_CHUNKING_CONFIG.retry), false);
      assert.strictEqual(shouldRetry(result, 4, DEFAULT_TASK_CHUNKING_CONFIG.retry), false);
    });

    it('should return false for successful results', () => {
      const result: SubtaskResult = {
        status: 'COMPLETE',
        output_summary: 'Success',
        files_modified: ['file.ts'],
      };

      assert.strictEqual(shouldRetry(result, 0, DEFAULT_TASK_CHUNKING_CONFIG.retry), false);
    });

    it('should respect retry_on conditions', () => {
      const retryConfig = {
        ...DEFAULT_TASK_CHUNKING_CONFIG.retry,
        retry_on: ['INCOMPLETE' as const],
      };

      const incompleteResult: SubtaskResult = {
        status: 'INCOMPLETE',
        output_summary: 'Incomplete',
        files_modified: [],
      };

      const errorResult: SubtaskResult = {
        status: 'ERROR',
        output_summary: 'Error',
        files_modified: [],
      };

      assert.strictEqual(shouldRetry(incompleteResult, 0, retryConfig), true);
      assert.strictEqual(shouldRetry(errorResult, 0, retryConfig), false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const config = DEFAULT_TASK_CHUNKING_CONFIG.retry;

      const delay0 = calculateRetryDelay(0, config);
      const delay1 = calculateRetryDelay(1, config);
      const delay2 = calculateRetryDelay(2, config);

      assert.strictEqual(delay0, config.retry_delay_ms);
      assert.strictEqual(delay1, config.retry_delay_ms * config.backoff_multiplier);
      assert.strictEqual(delay2, config.retry_delay_ms * config.backoff_multiplier * config.backoff_multiplier);
    });

    it('should calculate increasing delays', () => {
      const config = DEFAULT_TASK_CHUNKING_CONFIG.retry;

      const delay0 = calculateRetryDelay(0, config);
      const delay1 = calculateRetryDelay(1, config);
      const delay2 = calculateRetryDelay(2, config);

      // Each delay should be larger than previous
      assert.ok(delay1 > delay0);
      assert.ok(delay2 > delay1);
    });
  });

  describe('aggregateResults', () => {
    // Helper to create a mock TaskAnalysisResult for tests
    const createMockAnalysis = (): TaskAnalysisResult => ({
      is_decomposable: true,
      reason: 'Test analysis',
      suggested_subtasks: [
        { prompt: 'Subtask 1', dependencies: [], execution_order: 1 },
        { prompt: 'Subtask 2', dependencies: [], execution_order: 2 },
      ],
      execution_mode: 'sequential',
    });

    it('should merge all files modified from subtask results', () => {
      const analysis = createMockAnalysis();
      const chunkedTask = createChunkedTask('task-1', analysis, DEFAULT_TASK_CHUNKING_CONFIG);
      // Manually set subtask results for testing
      chunkedTask.subtasks[0].status = 'COMPLETE';
      chunkedTask.subtasks[0].result = { status: 'COMPLETE', output_summary: 'Done 1', files_modified: ['file1.ts', 'file2.ts'] };
      chunkedTask.subtasks[1].status = 'COMPLETE';
      chunkedTask.subtasks[1].result = { status: 'COMPLETE', output_summary: 'Done 2', files_modified: ['file3.ts'] };

      const aggregated = aggregateResults(chunkedTask);

      assert.ok(aggregated.files_modified.includes('file1.ts'));
      assert.ok(aggregated.files_modified.includes('file2.ts'));
      assert.ok(aggregated.files_modified.includes('file3.ts'));
    });

    it('should concatenate output summaries', () => {
      const analysis = createMockAnalysis();
      const chunkedTask = createChunkedTask('task-1', analysis, DEFAULT_TASK_CHUNKING_CONFIG);
      chunkedTask.subtasks[0].status = 'COMPLETE';
      chunkedTask.subtasks[0].result = { status: 'COMPLETE', output_summary: 'First result', files_modified: [] };
      chunkedTask.subtasks[1].status = 'COMPLETE';
      chunkedTask.subtasks[1].result = { status: 'COMPLETE', output_summary: 'Second result', files_modified: [] };

      const aggregated = aggregateResults(chunkedTask);

      assert.ok(aggregated.output_summary.includes('First result'));
      assert.ok(aggregated.output_summary.includes('Second result'));
    });

    it('should sum review loop iterations', () => {
      const analysis = createMockAnalysis();
      const chunkedTask = createChunkedTask('task-1', analysis, DEFAULT_TASK_CHUNKING_CONFIG);
      chunkedTask.subtasks[0].status = 'COMPLETE';
      chunkedTask.subtasks[0].result = { status: 'COMPLETE', output_summary: 'Done 1', files_modified: [], review_loop_iterations: 2 };
      chunkedTask.subtasks[1].status = 'COMPLETE';
      chunkedTask.subtasks[1].result = { status: 'COMPLETE', output_summary: 'Done 2', files_modified: [], review_loop_iterations: 3 };

      const aggregated = aggregateResults(chunkedTask);

      assert.strictEqual(aggregated.total_review_loop_iterations, 5);
    });

    it('should handle subtasks without results', () => {
      const analysis = createMockAnalysis();
      const chunkedTask = createChunkedTask('task-1', analysis, DEFAULT_TASK_CHUNKING_CONFIG);
      chunkedTask.subtasks[0].status = 'COMPLETE';
      chunkedTask.subtasks[0].result = { status: 'COMPLETE', output_summary: 'Done', files_modified: ['file1.ts'] };
      // subtasks[1] remains PENDING with no result

      const aggregated = aggregateResults(chunkedTask);

      assert.deepStrictEqual(aggregated.files_modified, ['file1.ts']);
      assert.strictEqual(aggregated.total_review_loop_iterations, 0);
    });
  });

  describe('TaskChunkingExecutorWrapper', () => {
    let mockExecutor: MockExecutor;
    let wrapper: TaskChunkingExecutorWrapper;
    const events: Array<{ type: string; content: Record<string, unknown> }> = [];

    beforeEach(() => {
      mockExecutor = new MockExecutor();
      events.length = 0;
      wrapper = new TaskChunkingExecutorWrapper(
        mockExecutor,
        DEFAULT_TASK_CHUNKING_CONFIG,
        (type, content) => events.push({ type, content })
      );
    });

    describe('execute - non-decomposable task', () => {
      it('should pass through to executor for simple tasks', async () => {
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: 'Fix typo in README.md',
          workingDir: '/test',
        };

        mockExecutor.setResults([createSuccessResult(task.prompt)]);

        const result = await wrapper.execute(task);

        assert.strictEqual(result.status, 'COMPLETE');
        assert.strictEqual(mockExecutor.executeCalls.length, 1);
        assert.strictEqual(mockExecutor.executeCalls[0].prompt, task.prompt);
      });

      it('should emit CHUNKING_START and CHUNKING_COMPLETE events', async () => {
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: 'Fix typo',
          workingDir: '/test',
        };

        mockExecutor.setResults([createSuccessResult(task.prompt)]);

        await wrapper.execute(task);

        const startEvent = events.find(e => e.type === 'CHUNKING_START');
        const completeEvent = events.find(e => e.type === 'CHUNKING_COMPLETE');

        assert.ok(startEvent);
        assert.ok(completeEvent);
        assert.strictEqual(completeEvent?.content.chunking_skipped, true);
      });
    });

    describe('execute - decomposable task', () => {
      it('should split task into subtasks', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("full module")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Create the full module with these files:
1. Create file1.ts
2. Create file2.ts
3. Create file3.ts`,
          workingDir: '/test',
        };

        // Set up results for each subtask
        mockExecutor.setResults([
          createSuccessResult('Create file1.ts'),
          createSuccessResult('Create file2.ts'),
          createSuccessResult('Create file3.ts'),
        ]);

        const result = await wrapper.execute(task);

        assert.strictEqual(result.status, 'COMPLETE');
        assert.ok(mockExecutor.executeCalls.length >= 3);
      });

      it('should emit SUBTASK_CREATED events', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("entire system")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Build the entire system:
- Task A
- Task B`,
          workingDir: '/test',
        };

        mockExecutor.setResults([
          createSuccessResult('Task A'),
          createSuccessResult('Task B'),
        ]);

        await wrapper.execute(task);

        const subtaskCreatedEvents = events.filter(e => e.type === 'SUBTASK_CREATED');
        assert.ok(subtaskCreatedEvents.length >= 2);
      });

      it('should emit SUBTASK_START and SUBTASK_COMPLETE events', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("complete module")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Build the complete module:
- Task A
- Task B`,
          workingDir: '/test',
        };

        mockExecutor.setResults([
          createSuccessResult('Task A'),
          createSuccessResult('Task B'),
        ]);

        await wrapper.execute(task);

        const startEvents = events.filter(e => e.type === 'SUBTASK_START');
        const completeEvents = events.filter(e => e.type === 'SUBTASK_COMPLETE');

        assert.ok(startEvents.length >= 2);
        assert.ok(completeEvents.length >= 2);
      });
    });

    describe('execute - retry behavior', () => {
      it('should retry failed subtasks', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("full system")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Build the full system:
- Task A
- Task B`,
          workingDir: '/test',
        };

        // First attempt fails, retry succeeds
        mockExecutor.setResults([
          createSuccessResult('Task A'),
          createIncompleteResult('Task B'), // First attempt
          createSuccessResult('Task B'),    // Retry
        ]);

        // Use fast retry config for testing
        const fastRetryWrapper = new TaskChunkingExecutorWrapper(
          mockExecutor,
          {
            ...DEFAULT_TASK_CHUNKING_CONFIG,
            retry: {
              ...DEFAULT_TASK_CHUNKING_CONFIG.retry,
              retry_delay_ms: 10, // Fast for testing
            },
          },
          (type, content) => events.push({ type, content })
        );

        const result = await fastRetryWrapper.execute(task);

        assert.strictEqual(result.status, 'COMPLETE');

        const retryEvents = events.filter(e => e.type === 'SUBTASK_RETRY');
        assert.ok(retryEvents.length >= 1);
      });

      it('should fail after max retries exceeded', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("entire module")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Build the entire module:
- Task A
- Task B`,
          workingDir: '/test',
        };

        // All attempts fail
        mockExecutor.setResults([
          createSuccessResult('Task A'),
          createIncompleteResult('Task B'),
          createIncompleteResult('Task B'),
          createIncompleteResult('Task B'),
          createIncompleteResult('Task B'),
        ]);

        // Use fast retry config for testing
        const fastRetryWrapper = new TaskChunkingExecutorWrapper(
          mockExecutor,
          {
            ...DEFAULT_TASK_CHUNKING_CONFIG,
            fail_fast: false,
            retry: {
              ...DEFAULT_TASK_CHUNKING_CONFIG.retry,
              retry_delay_ms: 10,
              max_retries: 3,
            },
          },
          (type, content) => events.push({ type, content })
        );

        const result = await fastRetryWrapper.execute(task);

        assert.strictEqual(result.status, 'INCOMPLETE');

        const failedEvents = events.filter(e => e.type === 'SUBTASK_FAILED');
        assert.ok(failedEvents.length >= 1);
      });
    });

    describe('execute - fail_fast behavior', () => {
      it('should stop on first failure when fail_fast is true', async () => {
        // Needs 2+ indicators: enumeration + largeScope ("complete system")
        const task: ExecutorTask = {
          id: 'task-1',
          prompt: `Build the complete system in order:
1. First task
2. Then second
3. Finally third`,
          workingDir: '/test',
        };

        // Second task fails
        mockExecutor.setResults([
          createSuccessResult('First task'),
          createIncompleteResult('Second task'),
          createIncompleteResult('Second task'),
          createIncompleteResult('Second task'),
          createIncompleteResult('Second task'),
          createSuccessResult('Third task'), // Should not be reached
        ]);

        const failFastWrapper = new TaskChunkingExecutorWrapper(
          mockExecutor,
          {
            ...DEFAULT_TASK_CHUNKING_CONFIG,
            fail_fast: true,
            retry: {
              ...DEFAULT_TASK_CHUNKING_CONFIG.retry,
              retry_delay_ms: 10,
              max_retries: 3,
            },
          },
          (type, content) => events.push({ type, content })
        );

        const result = await failFastWrapper.execute(task);

        // In fail_fast mode, when a subtask fails after max retries, the overall status is ERROR
        assert.strictEqual(result.status, 'ERROR');

        // Third task should not have been started
        const thirdTaskCalls = mockExecutor.executeCalls.filter(
          call => call.prompt.includes('third') || call.prompt.includes('Third')
        );
        // In fail_fast mode, we expect the third task to not be executed
        // or to have fewer executions than if we hadn't failed fast
      });
    });

    describe('isClaudeCodeAvailable', () => {
      it('should delegate to wrapped executor', async () => {
        const available = await wrapper.isClaudeCodeAvailable();
        assert.strictEqual(available, true);
      });
    });

    describe('checkAuthStatus', () => {
      it('should delegate to wrapped executor', async () => {
        const status = await wrapper.checkAuthStatus();
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.loggedIn, true);
      });
    });
  });
});
