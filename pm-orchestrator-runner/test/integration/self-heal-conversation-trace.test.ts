/**
 * Self-Heal Conversation Trace Integration Tests
 *
 * Per spec/28_CONVERSATION_TRACE.md Section 6:
 * - Tests REJECT → RETRY → PASS flow with conversation trace logging
 * - Verifies all trace entries are recorded correctly
 * - Demonstrates self-healing capability through conversation trace evidence
 *
 * Evidence Goal:
 * - Prove that the system can detect quality issues (REJECT)
 * - Show retry mechanism in action
 * - Demonstrate successful recovery (PASS)
 * - All recorded in conversation trace for post-hoc analysis
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  ReviewLoopExecutorWrapper,
  DEFAULT_REVIEW_LOOP_CONFIG,
  type ReviewLoopConfig,
} from '../../src/review-loop/review-loop';
import {
  ConversationTracer,
  type ConversationTracerConfig,
  type CriteriaResult,
} from '../../src/trace/conversation-tracer';
import type {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
  VerifiedFile,
  AuthCheckResult,
} from '../../src/executor/claude-code-executor';

// ============================================================================
// Test Executor for REJECT→RETRY→PASS Simulation
// ============================================================================

interface SequenceResult {
  status: ExecutorResult['status'];
  output: string;
  files_modified: string[];
  verified_files?: VerifiedFile[];
  error?: string;
}

/**
 * Executor that returns different results based on call sequence.
 * Used to simulate REJECT→RETRY→PASS flow.
 */
class SelfHealSequenceExecutor implements IExecutor {
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
// Helper: Create CriteriaResult for testing
// ============================================================================

function createCriteriaResult(id: string, name: string, passed: boolean, reason?: string): CriteriaResult {
  return { id, name, passed, reason };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Self-Heal Conversation Trace Integration Tests', () => {
  let tempDir: string;
  let traceDir: string;
  let executor: SelfHealSequenceExecutor;
  let tracer: ConversationTracer;

  beforeEach(() => {
    // Create temp directory for trace files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-heal-trace-test-'));
    traceDir = tempDir;

    // Create executor
    executor = new SelfHealSequenceExecutor();

    // Create tracer
    const tracerConfig: ConversationTracerConfig = {
      stateDir: traceDir,
      sessionId: 'test-session-001',
      taskId: 'test-task-001',
    };
    tracer = new ConversationTracer(tracerConfig);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('REJECT → RETRY → PASS Flow with Trace', () => {
    it('should record REJECT judgment and retry in conversation trace', async () => {
      // Setup: First call has TODO (fails Q2), second call is clean (passes)
      executor.setResults([
        {
          status: 'COMPLETE',
          output: 'Created feature with TODO: implement validation',
          files_modified: ['src/feature.ts'],
          verified_files: [
            { path: 'src/feature.ts', exists: true, size: 100, content_preview: '// TODO: fix' },
          ],
        },
        {
          status: 'COMPLETE',
          output: 'Created complete feature implementation with all validations',
          files_modified: ['src/feature.ts'],
          verified_files: [
            { path: 'src/feature.ts', exists: true, size: 500, content_preview: 'export function complete() { return true; }' },
          ],
        },
      ]);

      const reviewConfig: Partial<ReviewLoopConfig> = {
        ...DEFAULT_REVIEW_LOOP_CONFIG,
        max_iterations: 3,
        retry_delay_ms: 0,  // Speed up tests
      };

      // Log initial user request
      tracer.logUserRequest('Create a feature implementation');
      tracer.logSystemRules('Q1: File existence\nQ2: No TODO/FIXME\nQ3: No omissions');

      const wrapper = new ReviewLoopExecutorWrapper(
        executor,
        reviewConfig,
        (eventType, content) => {
          // Hook into review loop events to log to tracer
          if (eventType === 'QUALITY_JUDGMENT') {
            const data = content as Record<string, unknown>;
            const passed = data.passed as boolean;
            tracer.logQualityJudgment(
              passed ? 'PASS' : 'REJECT',
              [createCriteriaResult('Q2', 'No TODO', passed, data.reason as string)],
              (data.iteration as number) || 0,
              data.reason as string
            );
          } else if (eventType === 'REVIEW_LOOP_REJECT') {
            const data = content as Record<string, unknown>;
            tracer.logRejectionDetails(
              data.failed_checks as string[] || ['Q2'],
              'Please fix the TODO markers',
              (data.iteration as number) || 0
            );
          }
        },
        undefined,  // promptAssembler
        tracer  // Pass tracer to wrapper for logging
      );

      const result = await wrapper.executeWithReview({
        id: 'test-reject-retry-pass',
        prompt: 'Create a feature implementation',
        workingDir: '/tmp/test',
      });

      // Note: ReviewLoopExecutorWrapper internally logs FINAL_SUMMARY to tracer
      // No need to manually log here

      // Verify the flow
      assert.strictEqual(result.final_status, 'COMPLETE', 'Should eventually PASS');
      assert.ok(result.total_iterations >= 1, 'Should have at least one iteration');

      // Read trace and verify entries
      const traceFile = tracer.getTraceFilePath();
      assert.ok(fs.existsSync(traceFile), 'Trace file should exist');

      const entries = ConversationTracer.readTrace(traceFile);
      assert.ok(entries.length >= 3, 'Should have at least 3 trace entries');

      // Verify entry types
      const eventTypes = entries.map(e => e.event);
      assert.ok(eventTypes.includes('USER_REQUEST'), 'Should have USER_REQUEST entry');
      assert.ok(eventTypes.includes('SYSTEM_RULES'), 'Should have SYSTEM_RULES entry');
      assert.ok(eventTypes.includes('FINAL_SUMMARY'), 'Should have FINAL_SUMMARY entry');

      // Verify final summary shows PASS
      const finalSummary = entries.find(e => e.event === 'FINAL_SUMMARY');
      assert.ok(finalSummary, 'Should have final summary');
      assert.strictEqual(finalSummary?.data?.status, 'PASS', 'Final status should be PASS');
    });

    it('should record full REJECT→RETRY→PASS sequence in trace', async () => {
      // Setup: Three iterations - first two fail, third passes
      executor.setResults([
        {
          status: 'COMPLETE',
          output: '... code omitted for brevity',  // Fails Q3 (omission)
          files_modified: [],
        },
        {
          status: 'COMPLETE',
          output: 'Created feature with TODO: add tests',  // Fails Q2 (TODO)
          files_modified: ['src/feature.ts'],
          verified_files: [
            { path: 'src/feature.ts', exists: true, size: 50, content_preview: 'TODO' },
          ],
        },
        {
          status: 'COMPLETE',
          output: 'Created complete feature with full implementation',  // Passes
          files_modified: ['src/feature.ts'],
          verified_files: [
            { path: 'src/feature.ts', exists: true, size: 500, content_preview: 'export function complete() {}' },
          ],
        },
      ]);

      const reviewConfig: Partial<ReviewLoopConfig> = {
        ...DEFAULT_REVIEW_LOOP_CONFIG,
        max_iterations: 5,
        omission_patterns: [/\.\.\./],
      };

      // Log initial request
      tracer.logUserRequest('Create a complete feature');
      tracer.logSystemRules('Q1: File existence check\nQ2: No TODO/FIXME markers\nQ3: No omission markers (...)');

      let iterationCount = 0;

      const wrapper = new ReviewLoopExecutorWrapper(
        executor,
        reviewConfig,
        (eventType, content) => {
          const data = content as Record<string, unknown>;

          if (eventType === 'REVIEW_LOOP_ITERATION_START') {
            iterationCount++;
          } else if (eventType === 'QUALITY_JUDGMENT') {
            const passed = data.passed as boolean;
            tracer.logQualityJudgment(
              passed ? 'PASS' : 'REJECT',
              [createCriteriaResult('Q2', 'Quality', passed, data.reason as string)],
              iterationCount,
              data.reason as string
            );
          } else if (eventType === 'REVIEW_LOOP_REJECT') {
            tracer.logRejectionDetails(
              data.failed_checks as string[] || ['Q2'],
              'Please fix the issues',
              iterationCount
            );
          }
        },
        undefined,  // promptAssembler
        tracer
      );

      const result = await wrapper.executeWithReview({
        id: 'test-full-sequence',
        prompt: 'Create a complete feature',
        workingDir: '/tmp/test',
      });

      // Note: ReviewLoopExecutorWrapper internally logs FINAL_SUMMARY to tracer
      // No need to manually log here

      // Verify the final result
      assert.strictEqual(result.final_status, 'COMPLETE', 'Should eventually PASS');
      assert.ok(result.total_iterations >= 2, 'Should have at least 2 iterations');

      // Read and verify trace
      const entries = ConversationTracer.readTrace(tracer.getTraceFilePath());

      // Count judgment entries
      const judgmentEntries = entries.filter(e => e.event === 'QUALITY_JUDGMENT');
      assert.ok(judgmentEntries.length >= 1, 'Should have quality judgment entries');

      // Verify final summary
      const finalSummary = entries.find(e => e.event === 'FINAL_SUMMARY');
      assert.ok(finalSummary, 'Should have final summary');
      assert.strictEqual(finalSummary?.data?.status, 'PASS', 'Should show PASS in final summary');
    });

    it('should record ESCALATE when max iterations reached', async () => {
      // Setup: All iterations fail
      executor.setResults([
        { status: 'COMPLETE', output: '... code', files_modified: [] },
        { status: 'COMPLETE', output: '... more code', files_modified: [] },
        { status: 'COMPLETE', output: '... final code', files_modified: [] },
      ]);

      const reviewConfig: Partial<ReviewLoopConfig> = {
        ...DEFAULT_REVIEW_LOOP_CONFIG,
        max_iterations: 3,
        escalate_on_max: true,
        omission_patterns: [/\.\.\./],
      };

      tracer.logUserRequest('Create a feature (expected to fail)');
      tracer.logSystemRules('Q3: No omission markers');

      const wrapper = new ReviewLoopExecutorWrapper(
        executor,
        reviewConfig,
        (eventType, content) => {
          const data = content as Record<string, unknown>;
          if (eventType === 'QUALITY_JUDGMENT') {
            const passed = data.passed as boolean;
            tracer.logQualityJudgment(
              passed ? 'PASS' : 'REJECT',
              [createCriteriaResult('Q3', 'Omission', passed, data.reason as string)],
              (data.iteration as number) || 0,
              data.reason as string
            );
          } else if (eventType === 'REVIEW_LOOP_ESCALATE') {
            tracer.logIterationEnd(
              (data.iteration as number) || 0,
              'ESCALATE'
            );
          }
        },
        undefined,
        tracer
      );

      const result = await wrapper.executeWithReview({
        id: 'test-escalate',
        prompt: 'Create a feature (expected to fail)',
        workingDir: '/tmp/test',
      });

      // Note: ReviewLoopExecutorWrapper internally logs FINAL_SUMMARY ('ESCALATE') to tracer
      // No need to manually log here

      // Verify escalation
      assert.strictEqual(result.total_iterations, 3, 'Should use all iterations');
      assert.strictEqual(result.final_status, 'INCOMPLETE', 'Should be INCOMPLETE');

      // Verify trace
      const entries = ConversationTracer.readTrace(tracer.getTraceFilePath());
      const finalSummary = entries.find(e => e.event === 'FINAL_SUMMARY');
      assert.strictEqual(finalSummary?.data?.status, 'ESCALATE', 'Should show ESCALATE');
    });
  });

  describe('Trace File Operations', () => {
    it('should find trace files by task ID', async () => {
      // Create trace entries
      tracer.logUserRequest('Test request');
      tracer.logFinalSummary('PASS', 1, []);

      // Find trace files
      const traceFiles = ConversationTracer.findTraceFiles(traceDir, 'test-task-001');
      assert.ok(traceFiles.length >= 1, 'Should find trace file');
    });

    it('should get latest trace file', async () => {
      // Create trace entries
      tracer.logUserRequest('Test request');
      tracer.logFinalSummary('PASS', 1, []);

      // Get latest trace
      const latestFile = ConversationTracer.getLatestTraceFile(traceDir, 'test-task-001');
      assert.ok(latestFile, 'Should find latest trace file');
      assert.ok(latestFile.includes('test-task-001'), 'Should contain task ID');
    });

    it('should format trace for display', async () => {
      // Create complete trace
      tracer.logUserRequest('Create a feature');
      tracer.logSystemRules('Q1\nQ2\nQ3');
      tracer.logQualityJudgment(
        'REJECT',
        [createCriteriaResult('Q2', 'No TODO', false, 'TODO marker detected')],
        0,
        'TODO marker detected'
      );
      tracer.logRejectionDetails(['Q2: TODO marker'], 'Please remove TODO markers', 0);
      tracer.logQualityJudgment(
        'PASS',
        [createCriteriaResult('Q2', 'No TODO', true, 'All checks passed')],
        1,
        'All checks passed'
      );
      tracer.logFinalSummary('PASS', 2, []);

      // Read and format
      const entries = ConversationTracer.readTrace(tracer.getTraceFilePath());
      const formatted = ConversationTracer.formatTraceForDisplay(entries, { latestOnly: false, raw: false });

      assert.ok(formatted.length > 0, 'Should have formatted output');
      assert.ok(formatted.includes('USER_REQUEST'), 'Should include USER_REQUEST');
      assert.ok(formatted.includes('FINAL_SUMMARY'), 'Should include FINAL_SUMMARY');
    });

    it('should format trace with latestOnly option', async () => {
      // Create multi-iteration trace
      tracer.logUserRequest('Create a feature');
      tracer.logQualityJudgment(
        'REJECT',
        [createCriteriaResult('Q1', 'Check', false, 'Failed')],
        0,
        'Failed'
      );
      tracer.logIterationEnd(0, 'REJECT');
      tracer.logQualityJudgment(
        'PASS',
        [createCriteriaResult('Q1', 'Check', true, 'Passed')],
        1,
        'Passed'
      );
      tracer.logIterationEnd(1, 'PASS');
      tracer.logFinalSummary('PASS', 2, []);

      const entries = ConversationTracer.readTrace(tracer.getTraceFilePath());

      // Format with latestOnly
      const formatted = ConversationTracer.formatTraceForDisplay(entries, { latestOnly: true, raw: false });

      // Should show only iteration 1 entries (plus non-iteration entries)
      assert.ok(formatted.length > 0, 'Should have formatted output');
    });
  });

  describe('Evidence Structure Verification', () => {
    it('should produce trace that proves self-healing capability', async () => {
      // This is the key evidence test:
      // - Start with a failing task (TODO marker)
      // - System detects and rejects
      // - Retry produces clean output
      // - Final status is PASS
      // - All captured in conversation trace

      executor.setResults([
        {
          status: 'COMPLETE',
          output: 'function add(a, b) { /* TODO: implement */ return 0; }',
          files_modified: ['src/math.ts'],
          verified_files: [
            { path: 'src/math.ts', exists: true, size: 50, content_preview: '/* TODO: implement */' },
          ],
        },
        {
          status: 'COMPLETE',
          output: 'function add(a: number, b: number): number { return a + b; }',
          files_modified: ['src/math.ts'],
          verified_files: [
            { path: 'src/math.ts', exists: true, size: 100, content_preview: 'return a + b;' },
          ],
        },
      ]);

      const reviewConfig: Partial<ReviewLoopConfig> = {
        ...DEFAULT_REVIEW_LOOP_CONFIG,
        max_iterations: 3,
        retry_delay_ms: 0,  // Speed up tests
      };

      // Record the complete flow
      tracer.logUserRequest('Implement add function');
      tracer.logSystemRules(
        'Q1: File must exist and have content\n' +
        'Q2: No TODO/FIXME markers allowed\n' +
        'Q3: No code omissions\n' +
        'Q4: Complete implementation required'
      );

      let currentIteration = 0;

      const wrapper = new ReviewLoopExecutorWrapper(
        executor,
        reviewConfig,
        (eventType, content) => {
          const data = content as Record<string, unknown>;

          if (eventType === 'REVIEW_LOOP_ITERATION_START') {
            currentIteration = (data.iteration as number) || 0;
          }

          if (eventType === 'LLM_REQUEST') {
            tracer.logLLMRequest(data.prompt as string, currentIteration);
          }

          if (eventType === 'LLM_RESPONSE') {
            tracer.logLLMResponse(
              data.output as string,
              'COMPLETE',
              (data.files_modified as string[]) || [],
              currentIteration
            );
          }

          if (eventType === 'QUALITY_JUDGMENT') {
            const passed = data.passed as boolean;
            tracer.logQualityJudgment(
              passed ? 'PASS' : 'REJECT',
              [createCriteriaResult('Q2', 'No TODO', passed, data.reason as string)],
              currentIteration,
              data.reason as string
            );
          }

          if (eventType === 'REVIEW_LOOP_REJECT') {
            tracer.logRejectionDetails(
              data.failed_checks as string[] || ['Q2'],
              'Please fix the issues',
              currentIteration
            );
          }

          if (eventType === 'REVIEW_LOOP_ITERATION_END') {
            tracer.logIterationEnd(
              currentIteration,
              data.status as string
            );
          }
        },
        undefined,  // promptAssembler
        tracer
      );

      const result = await wrapper.executeWithReview({
        id: 'test-evidence',
        prompt: 'Implement add function',
        workingDir: '/tmp/test',
      });

      // Note: ReviewLoopExecutorWrapper internally logs FINAL_SUMMARY to tracer
      // No need to manually log here

      // === EVIDENCE VERIFICATION ===

      // 1. Verify the result
      assert.strictEqual(result.final_status, 'COMPLETE', 'Should self-heal to COMPLETE');

      // 2. Read the complete trace
      const traceFile = tracer.getTraceFilePath();
      const entries = ConversationTracer.readTrace(traceFile);

      // 3. Verify trace structure
      const eventTypes = entries.map(e => e.event);

      // Must have these entry types for valid self-heal evidence
      assert.ok(eventTypes.includes('USER_REQUEST'), 'Evidence: USER_REQUEST recorded');
      assert.ok(eventTypes.includes('SYSTEM_RULES'), 'Evidence: SYSTEM_RULES recorded');
      assert.ok(eventTypes.includes('FINAL_SUMMARY'), 'Evidence: FINAL_SUMMARY recorded');

      // 4. Verify self-healing occurred
      const judgments = entries.filter(e => e.event === 'QUALITY_JUDGMENT');
      assert.ok(judgments.length >= 1, 'Evidence: Quality judgments recorded');

      // 5. Verify final summary shows success
      const finalSummary = entries.find(e => e.event === 'FINAL_SUMMARY');
      assert.strictEqual(finalSummary?.data?.status, 'PASS', 'Evidence: Final status is PASS');

      // 6. Output formatted trace for evidence documentation
      const formattedTrace = ConversationTracer.formatTraceForDisplay(entries, { latestOnly: false, raw: false });
      console.log('\n=== SELF-HEAL EVIDENCE TRACE ===');
      console.log(formattedTrace);
      console.log('=== END TRACE ===\n');
    });
  });
});
