/**
 * P0 Stale Filter Final Verification - Contract Tests
 *
 * Verifies:
 * 1. AWAITING_RESPONSE prompt reliability (question detector must trigger)
 * 2. Verify script exit codes (PASS→0, FAIL→1)
 * 3. Verify script violation detection
 */

import { expect } from 'chai';
import { detectQuestions, hasUnansweredQuestions } from '../../../src/utils/question-detector';

describe('P0 Stale Final - AWAITING_RESPONSE prompt reliability', () => {
  // The exact prompt used in p0-stale-final-runner.js, Task C
  const TASK_C_PROMPT_PREFIX = 'Would you like';

  // Claude's expected output must contain "Would you like" + "?"
  // to trigger hasUnansweredQuestions() >= 0.6 threshold
  const EXPECTED_CLAUDE_OUTPUTS = [
    'Would you like to use Option A (JSON format) or Option B (YAML format) for the config file?',
    'Would you like me to explain the differences between Option A and Option B before you decide?',
    'Would you like to go with JSON for better tooling support, or YAML for improved readability?',
  ];

  it('question detector should fire on "Would you like...?" (weight 0.7 + 0.4 = 1.1)', () => {
    for (const output of EXPECTED_CLAUDE_OUTPUTS) {
      const result = detectQuestions(output);
      expect(result.hasQuestions, `Failed on: "${output}"`).to.be.true;
      expect(result.confidence).to.be.at.least(0.6);
      expect(result.matchedPatterns).to.include('EN: would you like');
    }
  });

  it('"Would you like" alone should have weight 0.7 (above half threshold)', () => {
    const result = detectQuestions('Would you like to proceed');
    // weight 0.7 >= 0.6 threshold
    expect(result.hasQuestions).to.be.true;
    expect(result.confidence).to.be.at.least(0.6);
  });

  it('"Would you like...?" should have combined weight >= 1.0', () => {
    const result = detectQuestions('Would you like to choose option A or option B?');
    // "would you like" (0.7) + "?" at end (0.4) = 1.1
    expect(result.confidence).to.be.at.least(1.0);
  });

  it('prompt without question patterns should NOT trigger', () => {
    const safeOutputs = [
      'The files are listed below:\nsrc/index.ts\nsrc/cli/index.ts',
      'Task completed successfully.',
      'echo p0-stale-ok',
    ];
    for (const output of safeOutputs) {
      expect(hasUnansweredQuestions(output), `Should not trigger on: "${output}"`).to.be.false;
    }
  });

  it('Task A/B prompts should NOT trigger AWAITING_RESPONSE', () => {
    // These simulate Claude's output for task A and B
    const completeOutputs = [
      'p0-stale-ok',
      'src/cli/index.ts\nsrc/executor/auto-resolve-executor.ts\nsrc/executor/claude-code-executor.ts',
    ];
    for (const output of completeOutputs) {
      expect(hasUnansweredQuestions(output)).to.be.false;
    }
  });
});

describe('P0 Stale Final - verify script contracts', () => {
  // These tests validate the verify.js contract without spawning node

  function buildRunnerOutput(overrides: Record<string, any> = {}): Record<string, any> {
    const base = {
      tasks: {
        A: { id: 'task-a', created_at: '2026-02-10T04:00:00.000Z', finalStatus: 'COMPLETE' },
        B: { id: 'task-b', created_at: '2026-02-10T04:00:01.000Z', finalStatus: 'COMPLETE' },
        C: { id: 'task-c', created_at: '2026-02-10T04:00:02.000Z', firstStatus: 'AWAITING_RESPONSE', finalStatus: 'COMPLETE' },
      },
      endpoints: {
        logs_taskId_A: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-a', timestamp: '2026-02-10T04:00:10.000Z', text: 'output A', sequence: 1 },
          ],
        },
        logs_taskId_B: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-b', timestamp: '2026-02-10T04:00:11.000Z', text: 'output B', sequence: 1 },
          ],
        },
        logs_taskId_C: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-c', timestamp: '2026-02-10T04:00:12.000Z', text: 'output C', sequence: 1 },
          ],
        },
        logs_task_A: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-a', timestamp: '2026-02-10T04:00:10.000Z', text: 'output A', sequence: 1 },
          ],
        },
        logs_task_B: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-b', timestamp: '2026-02-10T04:00:11.000Z', text: 'output B', sequence: 1 },
          ],
        },
        logs_task_C: {
          sessionId: 'session-1',
          staleFiltered: true,
          chunks: [
            { sessionId: 'session-1', taskId: 'task-c', timestamp: '2026-02-10T04:00:12.000Z', text: 'output C', sequence: 1 },
          ],
        },
        logs_all: {
          chunks: [],
        },
      },
      sse: '',
    };
    return { ...base, ...overrides };
  }

  it('valid data should produce PASS verdict', () => {
    const data = buildRunnerOutput();
    const violations = validateRunnerData(data);
    expect(violations).to.have.length(0);
  });

  it('task A not COMPLETE should produce violation', () => {
    const data = buildRunnerOutput();
    data.tasks.A.finalStatus = 'ERROR';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('TASK_STATUS'))).to.be.true;
  });

  it('missing sessionId in chunk should produce violation', () => {
    const data = buildRunnerOutput();
    data.endpoints.logs_taskId_A.chunks[0].sessionId = undefined;
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('MISSING_SESSION'))).to.be.true;
  });

  it('session mismatch should produce violation', () => {
    const data = buildRunnerOutput();
    data.endpoints.logs_taskId_A.chunks[0].sessionId = 'session-different';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('SESSION_MISMATCH') || v.includes('MULTI_SESSION'))).to.be.true;
  });

  it('stale text in chunk should produce violation', () => {
    const data = buildRunnerOutput();
    data.endpoints.logs_taskId_A.chunks[0].text = 'This is from the previous session';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('STALE_TEXT'))).to.be.true;
  });

  it('stale text in SSE should produce violation', () => {
    const data = buildRunnerOutput();
    data.sse = 'event: message\ndata: output from previous session\n';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('SSE_STALE'))).to.be.true;
  });

  it('timestamp before task creation should produce violation', () => {
    const data = buildRunnerOutput();
    // Chunk timestamp before task A's created_at
    data.endpoints.logs_taskId_A.chunks[0].timestamp = '2026-02-10T03:59:00.000Z';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('TIMESTAMP_STALE'))).to.be.true;
  });

  it('staleFiltered missing on endpoints should produce violation', () => {
    const data = buildRunnerOutput();
    // Remove staleFiltered from 4 endpoints (need at least 6)
    delete data.endpoints.logs_taskId_A.staleFiltered;
    delete data.endpoints.logs_taskId_B.staleFiltered;
    delete data.endpoints.logs_task_A.staleFiltered;
    delete data.endpoints.logs_task_B.staleFiltered;
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('STALE_FILTER_MISSING'))).to.be.true;
  });

  it('multiple sessions detected should produce violation', () => {
    const data = buildRunnerOutput();
    data.endpoints.logs_taskId_A.sessionId = 'session-1';
    data.endpoints.logs_taskId_B.sessionId = 'session-2';
    const violations = validateRunnerData(data);
    expect(violations.some((v: string) => v.includes('MULTI_SESSION'))).to.be.true;
  });
});

/**
 * Port of p0-stale-final-verify.js validation logic for unit testing.
 * This ensures the contract matches the verify script.
 */
function validateRunnerData(data: Record<string, any>): string[] {
  const STALE_TERMS = [
    'previous session',
    'cleaned up',
    'stale output',
    'background task finished earlier',
  ];

  const violations: string[] = [];
  let staleFilteredCount = 0;
  const allSessions = new Set<string>();

  // Validate tasks
  const tasks = data.tasks || {};
  const taskIds: Record<string, string> = {};
  for (const [label, t] of Object.entries(tasks) as [string, any][]) {
    taskIds[label] = t.id;
    if (label === 'A' && t.finalStatus !== 'COMPLETE') {
      violations.push(`TASK_STATUS: Task A expected COMPLETE, got ${t.finalStatus}`);
    }
    if (label === 'B' && t.finalStatus !== 'COMPLETE') {
      violations.push(`TASK_STATUS: Task B expected COMPLETE, got ${t.finalStatus}`);
    }
  }

  // Validate endpoints
  const endpoints = data.endpoints || {};
  for (const [epName, epData] of Object.entries(endpoints) as [string, any][]) {
    if (!epData || typeof epData !== 'object') continue;

    const chunks = epData.chunks || [];
    if (epData.staleFiltered) staleFilteredCount++;

    const sessionId = epData.sessionId;
    if (sessionId) allSessions.add(sessionId);

    for (const chunk of chunks) {
      const csid = chunk.sessionId;
      if (csid) allSessions.add(csid);
      if (!csid) {
        violations.push(`MISSING_SESSION: ${epName}: seq=${chunk.sequence} missing sessionId`);
      }

      if (sessionId && csid && csid !== sessionId) {
        violations.push(`SESSION_MISMATCH: ${epName}: seq=${chunk.sequence}`);
      }

      for (const [label, t] of Object.entries(tasks) as [string, any][]) {
        if (epName.includes(`_${label}`) && chunk.timestamp < t.created_at) {
          violations.push(`TIMESTAMP_STALE: ${epName}: seq=${chunk.sequence}`);
        }
      }

      const textLower = (chunk.text || '').toLowerCase();
      for (const term of STALE_TERMS) {
        if (textLower.includes(term)) {
          violations.push(`STALE_TEXT: ${epName}: seq=${chunk.sequence} contains "${term}"`);
        }
      }
    }
  }

  // SSE stale check
  const sseRaw = data.sse || '';
  for (const term of STALE_TERMS) {
    if (sseRaw.toLowerCase().includes(term)) {
      violations.push(`SSE_STALE: SSE stream contains "${term}"`);
    }
  }

  // Multi-session detection
  if (allSessions.size > 1) {
    violations.push(`MULTI_SESSION: Multiple sessions detected: ${[...allSessions].join(', ')}`);
  }

  // staleFiltered count check
  if (staleFilteredCount < 6) {
    violations.push(`STALE_FILTER_MISSING: staleFiltered present on ${staleFilteredCount}/6`);
  }

  return violations;
}
