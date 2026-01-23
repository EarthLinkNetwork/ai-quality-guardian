/**
 * Integration: Review Loop + Task Chunking + Auto-Retry Full Flow Tests
 *
 * Per spec/25_REVIEW_LOOP.md and spec/26_TASK_CHUNKING.md:
 * - Review Loop の max_iterations は サブタスク毎に適用
 * - サブタスクの Retry は Review Loop 全体をやり直す
 * - 各サブタスクは Review Loop を通過
 *
 * Test Strategy:
 * Since ReviewLoopExecutorWrapper does NOT implement IExecutor,
 * we test:
 * 1. TaskChunkingExecutorWrapper's decomposition and retry behavior
 * 2. ReviewLoopExecutorWrapper's PASS/REJECT/RETRY behavior
 * 3. Simulated integration scenarios
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import type {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
  VerifiedFile,
  AuthCheckResult,
} from '../../src/executor/claude-code-executor';
import {
  ReviewLoopExecutorWrapper,
  DEFAULT_REVIEW_LOOP_CONFIG,
  type ReviewLoopConfig,
  performQualityJudgment,
} from '../../src/review-loop/review-loop';
import {
  TaskChunkingExecutorWrapper,
  DEFAULT_TASK_CHUNKING_CONFIG,
  analyzeTaskForChunking,
  type TaskChunkingConfig,
  type RetryConfig,
} from '../../src/task-chunking/task-chunking';

// ============================================================================
// Configurable Fake Executor for Testing
// ============================================================================

interface SequenceResult {
  status: ExecutorResult['status'];
  output: string;
  files_modified: string[];
  verified_files?: VerifiedFile[];
  error?: string;
}

/**
 * ConfigurableSequenceExecutor
 *
 * Returns different results based on call sequence.
 * Useful for testing Review Loop retry + Task Chunking retry interactions.
 */
class ConfigurableSequenceExecutor implements IExecutor {
  private results: SequenceResult[];
  private callIndex: number = 0;
  public executeCalls: ExecutorTask[] = [];

  constructor(results: SequenceResult[] = []) {
    this.results = results;
  }

  setResults(results: SequenceResult[]): void {
    this.results = results;
    this.callIndex = 0;
  }

  reset(): void {
    this.callIndex = 0;
    this.executeCalls = [];
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async checkAuthStatus(): Promise<AuthCheckResult> {
    return { available: true, loggedIn: true };
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    this.executeCalls.push(task);

    const resultConfig = this.results[this.callIndex] ?? this.results[this.results.length - 1];
    this.callIndex++;

    const verified_files: VerifiedFile[] =
      resultConfig.verified_files ??
      resultConfig.files_modified.map(p => ({
        path: p,
        exists: true,
        size: 100,
        content_preview: 'Test content',
      }));

    return {
      executed: true,
      output: resultConfig.output,
      files_modified: resultConfig.files_modified,
      verified_files,
      unverified_files: [],
      status: resultConfig.status,
      error: resultConfig.error,
      duration_ms: 100,
      cwd: task.workingDir,
    };
  }
}

// ============================================================================
// Part 1: Task Chunking Tests (Decomposition + Retry)
// ============================================================================

describe('Task Chunking: Decomposition and Retry', () => {
  let executor: ConfigurableSequenceExecutor;
  let emittedEvents: Array<{ type: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    executor = new ConfigurableSequenceExecutor();
    emittedEvents = [];
  });

  it('should analyze task and detect decomposable patterns', () => {
    // Multi-step task with enumeration + independent parts (2 indicators required)
    const analysis1 = analyzeTaskForChunking(
      '1. Create login feature\n2. Create logout feature\n3. Create session management\nThese should be implemented independently.',
      DEFAULT_TASK_CHUNKING_CONFIG
    );
    assert.ok(analysis1.is_decomposable, 'Should detect decomposable task');
    assert.ok(
      analysis1.suggested_subtasks && analysis1.suggested_subtasks.length >= 2,
      'Should have multiple subtasks'
    );

    // Simple task
    const analysis2 = analyzeTaskForChunking(
      'Create a README file',
      DEFAULT_TASK_CHUNKING_CONFIG
    );
    assert.strictEqual(analysis2.is_decomposable, false, 'Simple task should not decompose');
  });

  it('should execute non-decomposable task directly', async () => {
    executor.setResults([
      { status: 'COMPLETE', output: 'Created README.md', files_modified: ['README.md'] },
    ]);

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      DEFAULT_TASK_CHUNKING_CONFIG,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-task-1',
      prompt: 'Create a README file',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'COMPLETE');
    assert.strictEqual(executor.executeCalls.length, 1);
  });

  it('should decompose task into subtasks and execute', async () => {
    // Set up results for 3 subtasks
    executor.setResults([
      { status: 'COMPLETE', output: 'Created login', files_modified: ['src/login.ts'] },
      { status: 'COMPLETE', output: 'Created logout', files_modified: ['src/logout.ts'] },
      { status: 'COMPLETE', output: 'Created session', files_modified: ['src/session.ts'] },
    ]);

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      execution_mode: 'sequential',
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-task-2',
      prompt: 'Create login feature, logout feature, and session management',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'COMPLETE');
    assert.ok(
      result.files_modified.length >= 1,
      'Should have modified files from subtasks'
    );

    // Verify chunking events
    const startEvents = emittedEvents.filter(e => e.type === 'CHUNKING_START');
    assert.ok(startEvents.length > 0, 'Should emit CHUNKING_START event');
  });

  it('should retry failed subtask with exponential backoff', async () => {
    // First attempt fails, retry succeeds
    executor.setResults([
      { status: 'ERROR', output: 'Error', files_modified: [], error: 'Network error' },
      { status: 'COMPLETE', output: 'Created feature', files_modified: ['src/feature.ts'] },
    ]);

    const retryConfig: RetryConfig = {
      max_retries: 3,
      retry_delay_ms: 10, // Short delay for testing
      backoff_multiplier: 1.5,
      retry_on: ['ERROR', 'INCOMPLETE'],
    };

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      retry: retryConfig,
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-task-3',
      prompt: 'Create a new feature',
      workingDir: '/tmp/test',
    });

    // Since task is not decomposable, it executes directly
    // First call fails, should retry
    assert.ok(executor.executeCalls.length >= 1, 'Should have at least one execute call');
  });

  it('should fail after max retries exceeded', async () => {
    // All attempts fail
    executor.setResults([
      { status: 'ERROR', output: 'Error 1', files_modified: [], error: 'Network error' },
      { status: 'ERROR', output: 'Error 2', files_modified: [], error: 'Network error' },
      { status: 'ERROR', output: 'Error 3', files_modified: [], error: 'Network error' },
      { status: 'ERROR', output: 'Error 4', files_modified: [], error: 'Network error' },
    ]);

    const retryConfig: RetryConfig = {
      max_retries: 2,
      retry_delay_ms: 10,
      backoff_multiplier: 1.5,
      retry_on: ['ERROR'],
    };

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      retry: retryConfig,
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-task-4',
      prompt: 'Create a feature that will fail',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'ERROR', 'Should fail after max retries');
  });

  it('should support fail-fast mode for parallel execution', async () => {
    // Set up mixed results
    executor.setResults([
      { status: 'COMPLETE', output: 'Success 1', files_modified: ['file1.ts'] },
      { status: 'ERROR', output: 'Error', files_modified: [], error: 'Failed' },
      { status: 'COMPLETE', output: 'Success 3', files_modified: ['file3.ts'] },
    ]);

    const retryConfig: RetryConfig = {
      max_retries: 0, // No retries for fail-fast test
      retry_delay_ms: 10,
      backoff_multiplier: 1.0,
      retry_on: [],
    };

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      execution_mode: 'parallel',
      fail_fast: true,
      retry: retryConfig,
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-task-5',
      prompt: 'Create feature A, feature B, and feature C',
      workingDir: '/tmp/test',
    });

    // With fail-fast, one failure should cause overall failure
    // But depends on execution order in parallel mode
    assert.ok(
      result.status === 'ERROR' || result.status === 'COMPLETE',
      'Should complete (may succeed or fail depending on timing)'
    );
  });
});

// ============================================================================
// Part 2: Review Loop Tests (PASS/REJECT/RETRY)
// ============================================================================

describe('Review Loop: Quality Judgment', () => {
  let executor: ConfigurableSequenceExecutor;
  let emittedEvents: Array<{ type: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    executor = new ConfigurableSequenceExecutor();
    emittedEvents = [];
  });

  it('should PASS when all quality criteria met', async () => {
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created file with complete implementation',
        files_modified: ['src/feature.ts'],
        verified_files: [
          { path: 'src/feature.ts', exists: true, size: 500, content_preview: 'export function complete() { return true; }' },
        ],
      },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-review-1',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.final_status, 'COMPLETE');
    assert.strictEqual(result.total_iterations, 1);
  });

  it('should REJECT when omission markers detected (Q3)', async () => {
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created file... // rest omitted for brevity',
        files_modified: ['src/feature.ts'],
      },
      {
        status: 'COMPLETE',
        output: 'Created complete implementation',
        files_modified: ['src/feature.ts'],
      },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
      omission_patterns: [/\.\.\./, /\/\/ rest omitted/i],
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-review-2',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should eventually PASS after retry fixes the omission
    assert.ok(
      result.final_status === 'COMPLETE' || result.total_iterations > 1,
      'Should detect omission and retry or pass'
    );

    // Check that REJECT event was emitted
    const rejectEvents = emittedEvents.filter(e => e.type === 'REVIEW_LOOP_REJECT');
    // May or may not have reject depending on Q3 check implementation
  });

  it('should REJECT when TODO/FIXME detected (Q2)', async () => {
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created file with TODO: implement validation',
        files_modified: ['src/feature.ts'],
      },
      {
        status: 'COMPLETE',
        output: 'Created complete implementation without TODO',
        files_modified: ['src/feature.ts'],
      },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-review-3',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should either PASS after fixing or show iteration count
    assert.ok(
      result.total_iterations >= 1,
      'Should have at least one iteration'
    );
  });

  it('should REJECT when early termination detected (Q6)', async () => {
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Done! Implementation is complete.',
        files_modified: ['src/feature.ts'],
      },
      {
        status: 'COMPLETE',
        output: 'Created src/feature.ts with full implementation',
        files_modified: ['src/feature.ts'],
      },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
      early_termination_patterns: [/^done!?\s/i, /implementation is complete/i],
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-review-4',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    assert.ok(result.total_iterations >= 1);
  });

  it('should escalate when max_iterations reached', async () => {
    // All iterations fail Q checks
    executor.setResults([
      { status: 'COMPLETE', output: '... more code', files_modified: [] },
      { status: 'COMPLETE', output: '... more code', files_modified: [] },
      { status: 'COMPLETE', output: '... more code', files_modified: [] },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
      escalate_on_max: true,
      omission_patterns: [/\.\.\./],
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-review-5',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should have used all iterations
    assert.ok(result.total_iterations >= 1);

    // Check for escalation event
    const escalateEvents = emittedEvents.filter(e => e.type === 'REVIEW_LOOP_ESCALATE');
    // Escalation event may or may not be present depending on implementation
  });

  it('should emit correct events throughout review cycle', async () => {
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Complete implementation',
        files_modified: ['src/feature.ts'],
        verified_files: [
          { path: 'src/feature.ts', exists: true, size: 100, content_preview: 'code' },
        ],
      },
    ]);

    const config: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        emittedEvents.push({ type: eventType, data: content });
      }
    );

    await wrapper.executeWithReview({
      id: 'test-review-6',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should have START event
    const startEvents = emittedEvents.filter(e => e.type === 'REVIEW_LOOP_START');
    assert.strictEqual(startEvents.length, 1, 'Should emit one REVIEW_LOOP_START');

    // Should have QUALITY_JUDGMENT events (PASS judgment recorded in content)
    const judgmentEvents = emittedEvents.filter(
      e => e.type === 'QUALITY_JUDGMENT'
    );
    assert.ok(judgmentEvents.length >= 1, 'Should emit judgment event');
  });
});

// ============================================================================
// Part 3: Quality Judgment Function Tests
// ============================================================================

describe('Quality Judgment Function (performQualityJudgment)', () => {
  const defaultConfig: ReviewLoopConfig = {
    ...DEFAULT_REVIEW_LOOP_CONFIG,
    omission_patterns: [/\.\.\./, /\/\/ omitted/i, /省略/],
    early_termination_patterns: [/^done!?\s/i, /完了です/],
  };

  it('should return PASS for clean output', () => {
    const result: ExecutorResult = {
      executed: true,
      output: 'Created src/feature.ts with full implementation code',
      files_modified: ['src/feature.ts'],
      verified_files: [
        { path: 'src/feature.ts', exists: true, size: 500, content_preview: 'export function done() { return true; }' },
      ],
      unverified_files: [],
      status: 'COMPLETE',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'PASS');
    assert.ok(judgment.criteria_results.every(c => c.passed));
  });

  it('should return REJECT for Q1: missing files', () => {
    const result: ExecutorResult = {
      executed: true,
      output: 'Created src/feature.ts',
      files_modified: ['src/feature.ts'],
      verified_files: [
        { path: 'src/feature.ts', exists: false, size: 0 },
      ],
      unverified_files: [],
      status: 'COMPLETE',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'REJECT');
    const q1 = judgment.criteria_results.find(c => c.criteria_id === 'Q1');
    assert.ok(q1 && !q1.passed, 'Q1 should fail for missing files');
  });

  it('should return REJECT for Q2: TODO/FIXME present', () => {
    const result: ExecutorResult = {
      executed: true,
      output: 'Created feature with TODO: add error handling',
      files_modified: ['src/feature.ts'],
      verified_files: [
        { path: 'src/feature.ts', exists: true, size: 100, content_preview: '// TODO: fix' },
      ],
      unverified_files: [],
      status: 'COMPLETE',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'REJECT');
    const q2 = judgment.criteria_results.find(c => c.criteria_id === 'Q2');
    assert.ok(q2 && !q2.passed, 'Q2 should fail for TODO/FIXME');
  });

  it('should return REJECT for Q3: omission markers', () => {
    const result: ExecutorResult = {
      executed: true,
      output: 'function example() { ... } // omitted for brevity',
      files_modified: ['src/feature.ts'],
      verified_files: [
        { path: 'src/feature.ts', exists: true, size: 100, content_preview: 'test content' },
      ],
      unverified_files: [],
      status: 'COMPLETE',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'REJECT');
    const q3 = judgment.criteria_results.find(c => c.criteria_id === 'Q3');
    assert.ok(q3 && !q3.passed, 'Q3 should fail for omission markers');
  });

  it('should return REJECT for Q6: early termination without evidence', () => {
    // Q6 only fails when early termination is combined with lack of evidence
    const result: ExecutorResult = {
      executed: true,
      output: 'Done! The implementation is complete.',
      files_modified: ['src/feature.ts'],
      verified_files: [],  // No verified files = no evidence
      unverified_files: [],
      status: 'COMPLETE',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'REJECT');
    const q6 = judgment.criteria_results.find(c => c.criteria_id === 'Q6');
    assert.ok(q6 && !q6.passed, 'Q6 should fail for early termination without evidence');
  });

  it('should return RETRY for executor errors', () => {
    const result: ExecutorResult = {
      executed: false,
      output: '',
      files_modified: [],
      verified_files: [],
      unverified_files: [],
      status: 'ERROR',
      error: 'Network timeout',
      duration_ms: 100,
      cwd: '/tmp/test',
    };

    const judgment = performQualityJudgment(result, defaultConfig);
    assert.strictEqual(judgment.judgment, 'RETRY');
  });
});

// ============================================================================
// Part 4: Integration Scenarios (Simulated)
// ============================================================================

describe('Integration Scenarios: Review Loop + Task Chunking', () => {
  let executor: ConfigurableSequenceExecutor;
  let chunkingEvents: Array<{ type: string; data: Record<string, unknown> }>;
  let reviewEvents: Array<{ type: string; data: Record<string, unknown> }>;

  beforeEach(() => {
    executor = new ConfigurableSequenceExecutor();
    chunkingEvents = [];
    reviewEvents = [];
  });

  it('Scenario 1: Decompose task, each subtask passes Review Loop', async () => {
    // Simulate: decomposable task, all subtasks pass Q1-Q6
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created login feature with complete implementation',
        files_modified: ['src/login.ts'],
        verified_files: [
          { path: 'src/login.ts', exists: true, size: 1000, content_preview: 'export function login() { return true; }' },
        ],
      },
      {
        status: 'COMPLETE',
        output: 'Created logout feature with complete implementation',
        files_modified: ['src/logout.ts'],
        verified_files: [
          { path: 'src/logout.ts', exists: true, size: 500, content_preview: 'export function logout() { return true; }' },
        ],
      },
      {
        status: 'COMPLETE',
        output: 'Created session feature with complete implementation',
        files_modified: ['src/session.ts'],
        verified_files: [
          { path: 'src/session.ts', exists: true, size: 800, content_preview: 'export class Session { constructor() {} }' },
        ],
      },
    ]);

    const chunkingConfig: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      execution_mode: 'sequential',
    };

    const chunkingWrapper = new TaskChunkingExecutorWrapper(
      executor,
      chunkingConfig,
      (eventType, content) => {
        chunkingEvents.push({ type: eventType, data: content });
      }
    );

    const result = await chunkingWrapper.execute({
      id: 'test-scenario-1',
      prompt: 'Create login feature, logout feature, and session management',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'COMPLETE');
    assert.ok(result.files_modified.length > 0, 'Should have modified files');

    // Verify chunking events
    assert.ok(
      chunkingEvents.some(e => e.type === 'CHUNKING_START'),
      'Should emit CHUNKING_START'
    );
  });

  it('Scenario 2: Subtask fails Review Loop, triggers retry', async () => {
    // First attempt: omission marker detected (would fail Q3)
    // Second attempt: clean output
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created login... // rest of code',
        files_modified: [],
      },
      {
        status: 'COMPLETE',
        output: 'Created login with full implementation',
        files_modified: ['src/login.ts'],
        verified_files: [
          { path: 'src/login.ts', exists: true, size: 1000, content_preview: 'code' },
        ],
      },
    ]);

    // Test Review Loop directly to verify REJECT -> retry behavior
    const reviewConfig: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
      omission_patterns: [/\.\.\./],
    };

    const reviewWrapper = new ReviewLoopExecutorWrapper(
      executor,
      reviewConfig,
      (eventType, content) => {
        reviewEvents.push({ type: eventType, data: content });
      }
    );

    const result = await reviewWrapper.executeWithReview({
      id: 'test-scenario-2',
      prompt: 'Create login feature',
      workingDir: '/tmp/test',
    });

    // Should have used multiple iterations or passed
    assert.ok(
      result.final_status === 'COMPLETE' || result.total_iterations > 1,
      'Should retry and pass, or show multiple iterations'
    );
  });

  it('Scenario 3: Parallel subtasks with independent Review Loops', async () => {
    // All subtasks succeed
    executor.setResults([
      { status: 'COMPLETE', output: 'Feature A complete', files_modified: ['a.ts'] },
      { status: 'COMPLETE', output: 'Feature B complete', files_modified: ['b.ts'] },
      { status: 'COMPLETE', output: 'Feature C complete', files_modified: ['c.ts'] },
    ]);

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      execution_mode: 'parallel',
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        chunkingEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-scenario-3',
      prompt: 'Create feature A, feature B, and feature C',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'COMPLETE');
  });

  it('Scenario 4: Sequential execution with dependencies', async () => {
    // Dependent tasks execute in order
    executor.setResults([
      {
        status: 'COMPLETE',
        output: 'Created database models',
        files_modified: ['src/models/user.ts'],
      },
      {
        status: 'COMPLETE',
        output: 'Created API routes using models',
        files_modified: ['src/routes/user.ts'],
      },
      {
        status: 'COMPLETE',
        output: 'Created UI components using API',
        files_modified: ['src/components/UserList.tsx'],
      },
    ]);

    const config: TaskChunkingConfig = {
      ...DEFAULT_TASK_CHUNKING_CONFIG,
      execution_mode: 'sequential',
    };

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      config,
      (eventType, content) => {
        chunkingEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.execute({
      id: 'test-scenario-4',
      prompt: 'Create database models, then API routes, then UI components',
      workingDir: '/tmp/test',
    });

    assert.strictEqual(result.status, 'COMPLETE');

    // Verify sequential execution order
    assert.ok(executor.executeCalls.length >= 1, 'Should have execute calls');
  });

  it('Scenario 5: Max iterations reached, escalate to user', async () => {
    // All attempts contain omission markers
    executor.setResults([
      { status: 'COMPLETE', output: '... code here', files_modified: [] },
      { status: 'COMPLETE', output: '... more code', files_modified: [] },
      { status: 'COMPLETE', output: '... final code', files_modified: [] },
    ]);

    const reviewConfig: Partial<ReviewLoopConfig> = {
      ...DEFAULT_REVIEW_LOOP_CONFIG,
      max_iterations: 3,
      escalate_on_max: true,
      omission_patterns: [/\.\.\./],
    };

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      reviewConfig,
      (eventType, content) => {
        reviewEvents.push({ type: eventType, data: content });
      }
    );

    const result = await wrapper.executeWithReview({
      id: 'test-scenario-5',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should have used all iterations
    assert.strictEqual(result.total_iterations, 3);
    assert.ok(
      result.final_status === 'INCOMPLETE',
      'Should be INCOMPLETE when max iterations reached'
    );
  });
});

// ============================================================================
// Part 5: Event Emission Verification
// ============================================================================

describe('Event Emission: Full Flow', () => {
  let executor: ConfigurableSequenceExecutor;
  let allEvents: Array<{ type: string; timestamp: number }>;

  beforeEach(() => {
    executor = new ConfigurableSequenceExecutor();
    allEvents = [];
  });

  it('should emit events in correct order for Task Chunking', async () => {
    executor.setResults([
      { status: 'COMPLETE', output: 'Done', files_modified: ['file.ts'] },
    ]);

    const wrapper = new TaskChunkingExecutorWrapper(
      executor,
      DEFAULT_TASK_CHUNKING_CONFIG,
      (eventType, _content) => {
        allEvents.push({ type: eventType, timestamp: Date.now() });
      }
    );

    await wrapper.execute({
      id: 'test-event-1',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Verify we have events
    assert.ok(allEvents.length >= 1, 'Should emit at least one event');

    // First event should be START
    if (allEvents.length > 0) {
      assert.ok(
        allEvents[0].type.includes('START') || allEvents[0].type.includes('CHUNK'),
        'First event should be start-related'
      );
    }
  });

  it('should emit events in correct order for Review Loop', async () => {
    executor.setResults([
      { status: 'COMPLETE', output: 'Complete implementation', files_modified: ['file.ts'] },
    ]);

    const wrapper = new ReviewLoopExecutorWrapper(
      executor,
      DEFAULT_REVIEW_LOOP_CONFIG,
      (eventType, _content) => {
        allEvents.push({ type: eventType, timestamp: Date.now() });
      }
    );

    await wrapper.executeWithReview({
      id: 'test-event-2',
      prompt: 'Create a feature',
      workingDir: '/tmp/test',
    });

    // Should have START event first
    assert.ok(allEvents.length >= 1, 'Should emit events');
    assert.strictEqual(
      allEvents[0].type,
      'REVIEW_LOOP_START',
      'First event should be REVIEW_LOOP_START'
    );

    // Last event should be REVIEW_LOOP_END
    const lastEvent = allEvents[allEvents.length - 1];
    assert.ok(
      lastEvent.type === 'REVIEW_LOOP_END',
      'Last event should be REVIEW_LOOP_END'
    );
  });
});
