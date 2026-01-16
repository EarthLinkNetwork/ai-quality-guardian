/**
 * Property-based tests for Property 15: Output Control and Validation
 * Based on 06_CORRECTNESS_PROPERTIES.md L141-147
 *
 * Property 15: Output Control and Validation
 * - All Claude Code output must be validated by Runner
 * - Output without evidence, speculative expressions, direct communication are rejected
 *
 * Test requirements per 08_TESTING_STRATEGY.md L27-41:
 * - Use fast-check with minimum 100 iterations
 * - Specify corresponding Correctness Property number
 * - Include parallel execution and race condition tests
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fc from 'fast-check';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { OutputControlManager, OutputControlError } from '../../src/output/output-control-manager';
import { OverallStatus, TaskStatus } from '../../src/models/enums';
import { ErrorCode } from '../../src/errors/error-codes';

const MIN_RUNS = 100;

describe('Property 15: Output Control and Validation (Property-based)', () => {
  let testDir: string;
  let outputManager: OutputControlManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-test-'));
    outputManager = new OutputControlManager();
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('15.1 Output format validation', () => {
    it('should require session_id in all outputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            OverallStatus.COMPLETE,
            OverallStatus.INCOMPLETE,
            OverallStatus.ERROR,
            OverallStatus.INVALID,
            OverallStatus.NO_EVIDENCE
          ),
          (status) => {
            const result = {
              overall_status: status,
              // Missing session_id
            } as any;

            let rejected = false;
            try {
              outputManager.formatOutput(result);
            } catch (e) {
              if (e instanceof OutputControlError && e.code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should require overall_status in all outputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          (sessionId) => {
            const result = {
              session_id: sessionId,
              // Missing overall_status
            } as any;

            let rejected = false;
            try {
              outputManager.formatOutput(result);
            } catch (e) {
              if (e instanceof OutputControlError && e.code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should reject invalid overall_status values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (sessionId, invalidStatus) => {
            // Skip if accidentally matches valid status
            if (Object.values(OverallStatus).includes(invalidStatus as OverallStatus)) {
              return true;
            }

            const result = {
              session_id: sessionId,
              overall_status: invalidStatus,
            } as any;

            let rejected = false;
            try {
              outputManager.formatOutput(result);
            } catch (e) {
              if (e instanceof OutputControlError && e.code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.2 next_action determination', () => {
    it('should set next_action=true only for COMPLETE status', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.constantFrom(
            OverallStatus.COMPLETE,
            OverallStatus.INCOMPLETE,
            OverallStatus.ERROR,
            OverallStatus.INVALID,
            OverallStatus.NO_EVIDENCE
          ),
          (sessionId, status) => {
            const result = {
              session_id: sessionId,
              overall_status: status,
            };

            const output = JSON.parse(outputManager.formatOutput(result));

            // Property: next_action is true ONLY for COMPLETE
            const expectedNextAction = status === OverallStatus.COMPLETE;
            return output.next_action === expectedNextAction;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should include next_action_reason in all outputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.constantFrom(
            OverallStatus.COMPLETE,
            OverallStatus.INCOMPLETE,
            OverallStatus.ERROR,
            OverallStatus.INVALID,
            OverallStatus.NO_EVIDENCE
          ),
          (sessionId, status) => {
            const result = {
              session_id: sessionId,
              overall_status: status,
            };

            const output = JSON.parse(outputManager.formatOutput(result));

            // Property: next_action_reason is always present and non-empty
            return typeof output.next_action_reason === 'string' &&
                   output.next_action_reason.length > 0;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.3 Sensitive data redaction', () => {
    it('should redact sensitive fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.constantFrom('api_key', 'apikey', 'token', 'secret', 'password', 'credential', 'auth', 'bearer'),
          fc.string({ minLength: 5, maxLength: 50 }),
          (sessionId, sensitiveField, sensitiveValue) => {
            const manager = new OutputControlManager();
            manager.setRedactionEnabled(true);

            const result = {
              session_id: sessionId,
              overall_status: OverallStatus.COMPLETE,
              config: {
                [sensitiveField]: sensitiveValue,
                normalField: 'visible',
              },
            };

            const output = JSON.parse(manager.formatOutput(result));

            // Property: Sensitive field should be redacted
            return output.config[sensitiveField] === '[REDACTED]' &&
                   output.config.normalField === 'visible';
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should not redact when redaction is disabled', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.string({ minLength: 5, maxLength: 50 }),
          (sessionId, apiKey) => {
            const manager = new OutputControlManager();
            manager.setRedactionEnabled(false);

            const result = {
              session_id: sessionId,
              overall_status: OverallStatus.COMPLETE,
              config: {
                api_key: apiKey,
              },
            };

            const output = JSON.parse(manager.formatOutput(result));

            // Property: When disabled, sensitive data is visible
            return output.config.api_key === apiKey;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.4 JSON structure consistency', () => {
    it('should produce valid JSON output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.constantFrom(
            OverallStatus.COMPLETE,
            OverallStatus.INCOMPLETE,
            OverallStatus.ERROR,
            OverallStatus.INVALID,
            OverallStatus.NO_EVIDENCE
          ),
          fc.nat({ max: 100 }),
          fc.nat({ max: 100 }),
          (sessionId, status, completed, total) => {
            // Ensure completed <= total
            const adjustedTotal = Math.max(completed, total);

            const result = {
              session_id: sessionId,
              overall_status: status,
              tasks_completed: completed,
              tasks_total: adjustedTotal,
            };

            const output = outputManager.formatOutput(result);

            // Property: Output should be valid JSON
            let parsed;
            try {
              parsed = JSON.parse(output);
            } catch {
              return false;
            }

            return typeof parsed === 'object' && parsed !== null;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should include timestamp in all outputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.constantFrom(OverallStatus.COMPLETE, OverallStatus.INCOMPLETE),
          (sessionId, status) => {
            const result = {
              session_id: sessionId,
              overall_status: status,
            };

            const output = JSON.parse(outputManager.formatOutput(result));

            // Property: timestamp should be valid ISO 8601
            const timestamp = new Date(output.timestamp);
            return !isNaN(timestamp.getTime());
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.5 Tasks validation', () => {
    it('should reject tasks_completed > tasks_total', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 50 }),
          (sessionId, completed, diff) => {
            // Ensure completed > total
            const total = completed - diff;
            if (total < 0) return true; // Skip invalid case

            const result = {
              session_id: sessionId,
              overall_status: OverallStatus.INCOMPLETE,
              tasks_completed: completed,
              tasks_total: total,
            };

            let rejected = false;
            try {
              outputManager.formatOutput(result);
            } catch (e) {
              if (e instanceof OutputControlError && e.code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.6 Exit code mapping', () => {
    it('should map status to correct exit code', () => {
      const expectedCodes: Record<OverallStatus, number> = {
        [OverallStatus.COMPLETE]: 0,
        [OverallStatus.INCOMPLETE]: 1,
        [OverallStatus.NO_EVIDENCE]: 2,
        [OverallStatus.ERROR]: 3,
        [OverallStatus.INVALID]: 4,
      };

      fc.assert(
        fc.property(
          fc.constantFrom(
            OverallStatus.COMPLETE,
            OverallStatus.INCOMPLETE,
            OverallStatus.ERROR,
            OverallStatus.INVALID,
            OverallStatus.NO_EVIDENCE
          ),
          (status) => {
            const exitCode = outputManager.getExitCode(status);
            return exitCode === expectedCodes[status];
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.7 Progress output format', () => {
    it('should calculate progress percentage correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.nat({ max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (sessionId, completed, total) => {
            // Ensure completed <= total
            const adjustedCompleted = Math.min(completed, total);

            const progress = {
              session_id: sessionId,
              current_phase: 'EXECUTION',
              tasks_completed: adjustedCompleted,
              tasks_total: total,
            };

            const output = JSON.parse(outputManager.formatProgress(progress));
            const expectedPercent = Math.round((adjustedCompleted / total) * 100);

            return output.progress_percent === expectedPercent;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should handle zero total tasks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          (sessionId) => {
            const progress = {
              session_id: sessionId,
              current_phase: 'REQUIREMENT_ANALYSIS',
              tasks_completed: 0,
              tasks_total: 0,
            };

            const output = JSON.parse(outputManager.formatProgress(progress));

            // Property: Zero total should result in 0% progress
            return output.progress_percent === 0;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.8 incomplete_task_reasons handling', () => {
    it('should include incomplete_task_reasons in output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.array(
            fc.record({
              task_id: fc.string({ minLength: 5, maxLength: 20 }),
              reason: fc.string({ minLength: 10, maxLength: 100 }),
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (sessionId, incompleteTasks) => {
            const result = {
              session_id: sessionId,
              overall_status: OverallStatus.INCOMPLETE,
              incomplete_tasks: incompleteTasks,
            };

            const output = JSON.parse(outputManager.formatOutput(result));

            // Property: incomplete_task_reasons should match input
            return output.incomplete_task_reasons.length === incompleteTasks.length;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should default to empty array when no incomplete tasks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          (sessionId) => {
            const result = {
              session_id: sessionId,
              overall_status: OverallStatus.COMPLETE,
              // No incomplete_tasks provided
            };

            const output = JSON.parse(outputManager.formatOutput(result));

            // Property: Should default to empty array
            return Array.isArray(output.incomplete_task_reasons) &&
                   output.incomplete_task_reasons.length === 0;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('15.9 Destination validation', () => {
    it('should reject non-writable destinations', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 50 }),
          (invalidPath) => {
            const manager = new OutputControlManager();
            const nonexistentPath = path.join('/nonexistent/path', invalidPath);

            let rejected = false;
            try {
              manager.setDestination(nonexistentPath);
            } catch (e) {
              if (e instanceof OutputControlError && e.code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should accept writable destinations', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (filename) => {
            const manager = new OutputControlManager();
            const validPath = path.join(testDir, filename.replace(/[^a-zA-Z0-9]/g, '_') + '.json');

            let accepted = true;
            try {
              manager.setDestination(validPath);
            } catch {
              accepted = false;
            }

            return accepted && manager.getDestination() === validPath;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });
});
