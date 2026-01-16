/**
 * E2E Tests for Immediate Summary Output
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 39
 *
 * Tests 3 summary block patterns:
 * 1. COMPLETE - Task completed successfully
 * 2. INCOMPLETE - Task did not complete fully
 * 3. ERROR - Task failed with error
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { REPLInterface } from '../../src/repl/repl-interface';

describe('Immediate Summary Output (Property 39)', () => {
  let repl: REPLInterface;
  let originalConsoleLog: typeof console.log;
  let outputBuffer: string[];

  beforeEach(() => {
    outputBuffer = [];
    originalConsoleLog = console.log;
    console.log = (msg: string) => {
      outputBuffer.push(msg);
    };
    repl = new REPLInterface({
      projectPath: '/tmp/test-project',
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    outputBuffer = [];
  });

  describe('Summary Block Format', () => {
    it('should output COMPLETE as 4 lines (no WHY)', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-123', 'complete', 'ignored reason');

      // COMPLETE: 4 lines fixed, no WHY
      assert.strictEqual(outputBuffer.length, 4, 'COMPLETE must be 4 lines');
      assert.strictEqual(outputBuffer[0], 'RESULT: COMPLETE');
      assert.strictEqual(outputBuffer[1], 'TASK: task-123');
      assert.strictEqual(outputBuffer[2], 'NEXT: (none)');
      assert.strictEqual(outputBuffer[3], 'HINT: /logs task-123');
    });

    it('should output INCOMPLETE as 5 lines (WHY required)', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-456', 'incomplete', 'ファイルが見つかりませんでした');

      // INCOMPLETE: 5 lines fixed, WHY required
      assert.strictEqual(outputBuffer.length, 5, 'INCOMPLETE must be 5 lines');
      assert.strictEqual(outputBuffer[0], 'RESULT: INCOMPLETE');
      assert.strictEqual(outputBuffer[1], 'TASK: task-456');
      assert.strictEqual(outputBuffer[2], 'NEXT: /logs task-456');
      assert.strictEqual(outputBuffer[3], 'WHY: ファイルが見つかりませんでした');
      assert.strictEqual(outputBuffer[4], 'HINT: /logs task-456');
    });

    it('should output ERROR as 5 lines (WHY required)', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-789', 'error', 'Claude Code execution failed');

      // ERROR: 5 lines fixed, WHY required
      assert.strictEqual(outputBuffer.length, 5, 'ERROR must be 5 lines');
      assert.strictEqual(outputBuffer[0], 'RESULT: ERROR');
      assert.strictEqual(outputBuffer[1], 'TASK: task-789');
      assert.strictEqual(outputBuffer[2], 'NEXT: /logs task-789');
      assert.strictEqual(outputBuffer[3], 'WHY: Claude Code execution failed');
      assert.strictEqual(outputBuffer[4], 'HINT: /logs task-789');
    });
  });

  describe('Terminal State Detection', () => {
    it('should detect COMPLETE as terminal state', () => {
      const isTerminal = (repl as any).isTerminalStatus.bind(repl);
      assert.strictEqual(isTerminal('complete'), true);
    });

    it('should detect INCOMPLETE as terminal state', () => {
      const isTerminal = (repl as any).isTerminalStatus.bind(repl);
      assert.strictEqual(isTerminal('incomplete'), true);
    });

    it('should detect ERROR as terminal state', () => {
      const isTerminal = (repl as any).isTerminalStatus.bind(repl);
      assert.strictEqual(isTerminal('error'), true);
    });

    it('should NOT detect RUNNING as terminal state', () => {
      const isTerminal = (repl as any).isTerminalStatus.bind(repl);
      assert.strictEqual(isTerminal('running'), false);
    });

    it('should NOT detect QUEUED as terminal state', () => {
      const isTerminal = (repl as any).isTerminalStatus.bind(repl);
      assert.strictEqual(isTerminal('queued'), false);
    });
  });

  describe('Non-Terminal State Handling', () => {
    it('should NOT output summary for RUNNING status', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-running', 'running', 'Still running');

      assert.strictEqual(outputBuffer.length, 0, 'Should not output for running status');
    });

    it('should NOT output summary for QUEUED status', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-queued', 'queued', 'Waiting in queue');

      assert.strictEqual(outputBuffer.length, 0, 'Should not output for queued status');
    });
  });

  describe('WHY Line Handling', () => {
    it('COMPLETE never has WHY line even with reason provided', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-complete', 'complete', 'some reason');

      assert.strictEqual(outputBuffer.length, 4, 'COMPLETE must be 4 lines');
      assert.ok(!outputBuffer.some(line => line.startsWith('WHY:')), 'COMPLETE must not have WHY');
    });

    it('INCOMPLETE uses (unknown) when reason is empty', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-incomplete', 'incomplete', '');

      assert.strictEqual(outputBuffer.length, 5, 'INCOMPLETE must be 5 lines');
      assert.strictEqual(outputBuffer[3], 'WHY: (unknown)');
    });

    it('ERROR uses (unknown) when reason is undefined', () => {
      const printSummary = (repl as any).printImmediateSummary.bind(repl);

      printSummary('task-error', 'error');

      assert.strictEqual(outputBuffer.length, 5, 'ERROR must be 5 lines');
      assert.strictEqual(outputBuffer[3], 'WHY: (unknown)');
    });
  });
});

describe('Exit Typo Safety', () => {
  let repl: REPLInterface;
  let originalConsoleLog: typeof console.log;
  let outputBuffer: string[];

  beforeEach(() => {
    outputBuffer = [];
    originalConsoleLog = console.log;
    console.log = (msg: string) => {
      outputBuffer.push(msg);
    };
    repl = new REPLInterface({
      projectPath: '/tmp/test-project',
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    outputBuffer = [];
  });

  describe('Exit Input Detection', () => {
    it('should detect bare "exit" as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('exit'), true);
    });

    it('should detect "EXIT" (uppercase) as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('EXIT'), true);
    });

    it('should detect " exit " (with spaces) as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('  exit  '), true);
    });

    it('should NOT detect "/exit" as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('/exit'), false);
    });

    it('should NOT detect "exit the program" as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('exit the program'), false);
    });

    it('should NOT detect "please exit" as typo', () => {
      const isExitTypo = (repl as any).isExitTypo.bind(repl);
      assert.strictEqual(isExitTypo('please exit'), false);
    });
  });

  describe('Exit Typo Output', () => {
    it('should output exactly 2 lines for exit typo', async () => {
      // Simulate processNaturalLanguage with exit typo
      const processNL = (repl as any).processNaturalLanguage.bind(repl);
      await processNL('exit');

      // Filter out debug lines
      const userOutput = outputBuffer.filter(line => !line.startsWith('[DEBUG'));
      assert.strictEqual(userOutput.length, 2, 'Exit typo must output exactly 2 lines');
      assert.strictEqual(userOutput[0], 'ERROR: Did you mean /exit?');
      assert.strictEqual(userOutput[1], 'HINT: /exit');
    });

    it('should not pass exit typo to executor', async () => {
      let executorCalled = false;
      // Mock executor
      (repl as any).executor = {
        execute: () => {
          executorCalled = true;
          return Promise.resolve({ overall_status: 'COMPLETE' });
        }
      };

      const processNL = (repl as any).processNaturalLanguage.bind(repl);
      await processNL('exit');

      assert.strictEqual(executorCalled, false, 'Executor must not be called for exit typo');
    });
  });
});

describe('Current Task ID Tracking (Property 38)', () => {
  let repl: REPLInterface;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    originalConsoleLog = console.log;
    console.log = () => {}; // Suppress output
    repl = new REPLInterface({
      projectPath: '/tmp/test-project',
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('Task ID Lifecycle', () => {
    it('should have null current_task_id initially', () => {
      const session = (repl as any).session;
      assert.strictEqual(session.current_task_id, null);
    });

    it('should have null last_task_id initially', () => {
      const session = (repl as any).session;
      assert.strictEqual(session.last_task_id, null);
    });
  });

  describe('Status Mapping', () => {
    it('should map COMPLETE status correctly', () => {
      const mapStatus = (repl as any).mapToTaskLogStatus.bind(repl);
      // OverallStatus.COMPLETE is the string 'COMPLETE'
      assert.strictEqual(mapStatus('COMPLETE'), 'complete');
    });

    it('should map INCOMPLETE status correctly', () => {
      const mapStatus = (repl as any).mapToTaskLogStatus.bind(repl);
      assert.strictEqual(mapStatus('INCOMPLETE'), 'incomplete');
    });

    it('should map ERROR status correctly', () => {
      const mapStatus = (repl as any).mapToTaskLogStatus.bind(repl);
      assert.strictEqual(mapStatus('ERROR'), 'error');
    });

    it('should default to running for unknown status', () => {
      const mapStatus = (repl as any).mapToTaskLogStatus.bind(repl);
      assert.strictEqual(mapStatus('UNKNOWN'), 'running');
    });
  });
});
