import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  OutputControlManager,
  OutputControlError,
} from '../../../src/output/output-control-manager';
import { OverallStatus, TaskStatus } from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Output Control Manager (04_COMPONENTS.md L178-195)', () => {
  let outputManager: OutputControlManager;

  beforeEach(() => {
    outputManager = new OutputControlManager();
  });

  describe('JSON-Structured Output (04_COMPONENTS.md L184)', () => {
    it('should produce valid JSON output', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);

      // Should be valid JSON
      assert.doesNotThrow(() => JSON.parse(output));
    });

    it('should include all required fields in output', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        evidence_hash: 'abc123',
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.session_id);
      assert.ok(parsed.overall_status);
      assert.ok(parsed.tasks_completed !== undefined);
      assert.ok(parsed.tasks_total !== undefined);
    });

    it('should pretty-print JSON by default', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
      };

      const output = outputManager.formatOutput(result);

      // Pretty-printed JSON should contain newlines
      assert.ok(output.includes('\n'));
    });

    it('should support compact JSON mode', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
      };

      const output = outputManager.formatOutput(result, { compact: true });

      // Compact JSON should not contain newlines (except possibly in values)
      const lines = output.split('\n').filter(l => l.trim());
      assert.equal(lines.length, 1);
    });
  });

  describe('next_action Field (04_COMPONENTS.md L185-186)', () => {
    it('should set next_action=true when status is COMPLETE', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.equal(parsed.next_action, true);
    });

    it('should set next_action=false when status is ERROR', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.equal(parsed.next_action, false);
    });

    it('should set next_action=false when status is INVALID', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.INVALID,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.equal(parsed.next_action, false);
    });

    it('should set next_action=false when status is NO_EVIDENCE', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.NO_EVIDENCE,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.equal(parsed.next_action, false);
    });

    it('should set next_action=false when status is INCOMPLETE', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.equal(parsed.next_action, false);
    });

    it('should include next_action_reason in output', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 5,
        tasks_total: 10,
        error_message: 'Validation failed',
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.next_action_reason);
      assert.ok(parsed.next_action_reason.length > 0);
    });
  });

  describe('incomplete_task_reasons Field (04_COMPONENTS.md L187)', () => {
    it('should include incomplete_task_reasons when tasks are incomplete', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        incomplete_tasks: [
          { task_id: 'task-6', reason: 'Timeout' },
          { task_id: 'task-7', reason: 'Dependency failed' },
        ],
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.incomplete_task_reasons);
      assert.ok(Array.isArray(parsed.incomplete_task_reasons));
      assert.equal(parsed.incomplete_task_reasons.length, 2);
    });

    it('should format incomplete reasons correctly', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        incomplete_tasks: [
          { task_id: 'task-6', reason: 'Resource limit exceeded' },
        ],
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.incomplete_task_reasons[0].task_id);
      assert.ok(parsed.incomplete_task_reasons[0].reason);
    });

    it('should have empty incomplete_task_reasons when all complete', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        incomplete_tasks: [],
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(Array.isArray(parsed.incomplete_task_reasons));
      assert.equal(parsed.incomplete_task_reasons.length, 0);
    });
  });

  describe('Output Validation (04_COMPONENTS.md L188)', () => {
    it('should validate output structure before formatting', () => {
      const invalidResult = {
        // Missing required fields
        session_id: 'session-001',
      };

      assert.throws(
        () => outputManager.formatOutput(invalidResult as any),
        (err: Error) => {
          return err instanceof OutputControlError &&
            (err as OutputControlError).code === ErrorCode.E208_OUTPUT_VALIDATION_FAILED;
        }
      );
    });

    it('should validate overall_status is valid enum value', () => {
      const invalidResult = {
        session_id: 'session-001',
        overall_status: 'INVALID_STATUS' as any,
        tasks_completed: 5,
        tasks_total: 10,
      };

      assert.throws(
        () => outputManager.formatOutput(invalidResult),
        (err: Error) => err instanceof OutputControlError
      );
    });

    it('should validate tasks_completed <= tasks_total', () => {
      const invalidResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 15,
        tasks_total: 10,
      };

      assert.throws(
        () => outputManager.formatOutput(invalidResult),
        (err: Error) => err instanceof OutputControlError
      );
    });
  });

  describe('Evidence Summary in Output (04_COMPONENTS.md L189)', () => {
    it('should include evidence_summary when evidence is provided', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        evidence: {
          files_collected: 5,
          hash: 'abc123def456',
          location: '/path/to/evidence',
        },
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.evidence_summary);
      assert.equal(parsed.evidence_summary.files_collected, 5);
      assert.ok(parsed.evidence_summary.hash);
    });

    it('should include evidence_index_hash in output', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        evidence: {
          files_collected: 5,
          hash: 'abc123def456',
          index_hash: 'index-hash-789',
          location: '/path/to/evidence',
        },
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.evidence_summary.index_hash);
    });
  });

  describe('Error Output Formatting (04_COMPONENTS.md L190)', () => {
    it('should format error output with error_code', () => {
      const errorResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 3,
        tasks_total: 10,
        error: {
          code: ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
          message: 'File limit exceeded',
        },
      };

      const output = outputManager.formatOutput(errorResult);
      const parsed = JSON.parse(output);

      assert.ok(parsed.error);
      assert.equal(parsed.error.code, ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED);
      assert.ok(parsed.error.message);
    });

    it('should include stack trace in debug mode', () => {
      outputManager.setDebugMode(true);

      const errorResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 3,
        tasks_total: 10,
        error: {
          code: ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
          message: 'File limit exceeded',
          stack: 'Error: File limit exceeded\n    at ...',
        },
      };

      const output = outputManager.formatOutput(errorResult);
      const parsed = JSON.parse(output);

      assert.ok(parsed.error.stack);
    });

    it('should exclude stack trace in production mode', () => {
      outputManager.setDebugMode(false);

      const errorResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 3,
        tasks_total: 10,
        error: {
          code: ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
          message: 'File limit exceeded',
          stack: 'Error: File limit exceeded\n    at ...',
        },
      };

      const output = outputManager.formatOutput(errorResult);
      const parsed = JSON.parse(output);

      assert.ok(!parsed.error.stack);
    });
  });

  describe('Progress Output (04_COMPONENTS.md L191)', () => {
    it('should format progress output', () => {
      const progressUpdate = {
        session_id: 'session-001',
        current_phase: 'execution',
        tasks_completed: 5,
        tasks_total: 10,
        elapsed_seconds: 120,
      };

      const output = outputManager.formatProgress(progressUpdate);
      const parsed = JSON.parse(output);

      assert.equal(parsed.type, 'progress');
      assert.equal(parsed.current_phase, 'execution');
      assert.equal(parsed.progress_percent, 50);
    });

    it('should include ETA when available', () => {
      const progressUpdate = {
        session_id: 'session-001',
        current_phase: 'execution',
        tasks_completed: 5,
        tasks_total: 10,
        elapsed_seconds: 120,
        estimated_remaining_seconds: 120,
      };

      const output = outputManager.formatProgress(progressUpdate);
      const parsed = JSON.parse(output);

      assert.ok(parsed.eta_seconds !== undefined);
    });
  });

  describe('Output Streaming (04_COMPONENTS.md L192)', () => {
    it('should support streaming output mode', () => {
      outputManager.enableStreaming(true);

      const events: string[] = [];
      outputManager.onOutput((output) => {
        events.push(output);
      });

      outputManager.emitProgress({
        session_id: 'session-001',
        current_phase: 'execution',
        tasks_completed: 1,
        tasks_total: 10,
      });

      assert.ok(events.length > 0);
    });

    it('should emit NDJSON in streaming mode', () => {
      outputManager.enableStreaming(true);

      const events: string[] = [];
      outputManager.onOutput((output) => {
        events.push(output);
      });

      outputManager.emitProgress({
        session_id: 'session-001',
        current_phase: 'execution',
        tasks_completed: 1,
        tasks_total: 10,
      });

      // Each line should be valid JSON (NDJSON format)
      events.forEach(event => {
        assert.doesNotThrow(() => JSON.parse(event));
      });
    });
  });

  describe('Output Destinations (04_COMPONENTS.md L193)', () => {
    it('should write to stdout by default', () => {
      const destination = outputManager.getDefaultDestination();
      assert.equal(destination, 'stdout');
    });

    it('should support file destination', () => {
      outputManager.setDestination('/tmp/output.json');
      assert.equal(outputManager.getDestination(), '/tmp/output.json');
    });

    it('should validate file destination is writable', () => {
      assert.throws(
        () => outputManager.setDestination('/nonexistent/path/output.json'),
        (err: Error) => err instanceof OutputControlError
      );
    });
  });

  describe('Report Generation (04_COMPONENTS.md L194)', () => {
    it('should generate final execution report', () => {
      const executionResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        started_at: '2025-01-01T00:00:00Z',
        completed_at: '2025-01-01T01:00:00Z',
        tasks_completed: 10,
        tasks_total: 10,
        phases: [
          { name: 'planning', status: 'completed', duration_seconds: 60 },
          { name: 'execution', status: 'completed', duration_seconds: 3540 },
        ],
      };

      const report = outputManager.generateReport(executionResult);

      assert.ok(report.session_id);
      assert.ok(report.overall_status);
      assert.ok(report.duration_seconds);
      assert.ok(report.phases);
    });

    it('should include task breakdown in report', () => {
      const executionResult = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        started_at: '2025-01-01T00:00:00Z',
        completed_at: '2025-01-01T01:00:00Z',
        tasks_completed: 10,
        tasks_total: 10,
        tasks: [
          { id: 'task-1', status: TaskStatus.COMPLETE, duration_seconds: 30 },
          { id: 'task-2', status: TaskStatus.COMPLETE, duration_seconds: 45 },
        ],
      };

      const report = outputManager.generateReport(executionResult);

      assert.ok(report.task_summary);
      assert.equal(report.task_summary.completed, 10);
      assert.equal(report.task_summary.total, 10);
    });
  });

  describe('Output Redaction (Security)', () => {
    it('should redact sensitive information by default', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        config: {
          api_key: 'sk-secret-key-12345',
          token: 'secret-token',
        },
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      // Sensitive fields should be redacted
      if (parsed.config) {
        assert.ok(!parsed.config.api_key?.includes('sk-secret'));
        assert.ok(!parsed.config.token?.includes('secret'));
      }
    });

    it('should allow disabling redaction in debug mode', () => {
      outputManager.setDebugMode(true);
      outputManager.setRedactionEnabled(false);

      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        config: {
          api_key: 'sk-secret-key-12345',
        },
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      // With redaction disabled, values should be present
      assert.ok(parsed.config?.api_key?.includes('sk-secret'));
    });
  });

  describe('Output Timestamp (Property 11)', () => {
    it('should include timestamp in all output', () => {
      const result = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
      };

      const output = outputManager.formatOutput(result);
      const parsed = JSON.parse(output);

      assert.ok(parsed.timestamp);
      // Should be valid ISO timestamp
      assert.ok(!isNaN(Date.parse(parsed.timestamp)));
    });

    it('should include timestamp in progress output', () => {
      const progressUpdate = {
        session_id: 'session-001',
        current_phase: 'execution',
        tasks_completed: 5,
        tasks_total: 10,
      };

      const output = outputManager.formatProgress(progressUpdate);
      const parsed = JSON.parse(output);

      assert.ok(parsed.timestamp);
    });
  });

  describe('Machine-Readable Exit Codes', () => {
    it('should provide exit code for COMPLETE status', () => {
      const exitCode = outputManager.getExitCode(OverallStatus.COMPLETE);
      assert.equal(exitCode, 0);
    });

    it('should provide exit code for ERROR status', () => {
      const exitCode = outputManager.getExitCode(OverallStatus.ERROR);
      assert.ok(exitCode > 0);
    });

    it('should provide exit code for INCOMPLETE status', () => {
      const exitCode = outputManager.getExitCode(OverallStatus.INCOMPLETE);
      assert.ok(exitCode > 0);
    });

    it('should provide exit code for INVALID status', () => {
      const exitCode = outputManager.getExitCode(OverallStatus.INVALID);
      assert.ok(exitCode > 0);
    });

    it('should provide exit code for NO_EVIDENCE status', () => {
      const exitCode = outputManager.getExitCode(OverallStatus.NO_EVIDENCE);
      assert.ok(exitCode > 0);
    });

    it('should map different statuses to different exit codes', () => {
      const codes = new Set([
        outputManager.getExitCode(OverallStatus.ERROR),
        outputManager.getExitCode(OverallStatus.INCOMPLETE),
        outputManager.getExitCode(OverallStatus.INVALID),
        outputManager.getExitCode(OverallStatus.NO_EVIDENCE),
      ]);

      // Each non-success status should have a distinct exit code
      assert.equal(codes.size, 4);
    });
  });
});
