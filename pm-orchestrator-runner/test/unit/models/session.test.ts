import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  Session,
  createSession,
  validateSession,
  SessionValidationError,
} from '../../../src/models/session';
import { Phase, OverallStatus } from '../../../src/models/enums';

describe('Session (05_DATA_MODELS.md L8-21)', () => {
  describe('Session structure', () => {
    it('should contain all required fields', () => {
      const session: Session = {
        session_id: 'test-session-123',
        started_at: '2024-01-01T00:00:00.000Z',
        target_project: '/path/to/project',
        runner_version: '0.1.0',
        configuration: {},
        current_phase: Phase.REQUIREMENT_ANALYSIS,
        status: OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
      };

      assert.equal(session.session_id, 'test-session-123');
      assert.equal(session.started_at, '2024-01-01T00:00:00.000Z');
      assert.equal(session.target_project, '/path/to/project');
      assert.equal(session.runner_version, '0.1.0');
      assert.deepEqual(session.configuration, {});
      assert.equal(session.current_phase, Phase.REQUIREMENT_ANALYSIS);
      assert.equal(session.status, OverallStatus.INCOMPLETE);
      assert.equal(session.continuation_approved, false);
      assert.deepEqual(session.limit_violations, []);
    });
  });

  describe('createSession', () => {
    it('should create session with generated ID', () => {
      const session = createSession('/path/to/project', '0.1.0', {});
      assert.ok(session.session_id.length > 0);
      assert.equal(session.target_project, '/path/to/project');
      assert.equal(session.runner_version, '0.1.0');
      assert.equal(session.current_phase, Phase.REQUIREMENT_ANALYSIS);
      assert.equal(session.status, OverallStatus.INCOMPLETE);
      assert.equal(session.continuation_approved, false);
      assert.deepEqual(session.limit_violations, []);
    });

    it('should generate ISO 8601 timestamp', () => {
      const session = createSession('/path', '0.1.0', {});
      const timestamp = new Date(session.started_at);
      assert.ok(!isNaN(timestamp.getTime()));
    });

    it('should generate unique session IDs', () => {
      const session1 = createSession('/path', '0.1.0', {});
      const session2 = createSession('/path', '0.1.0', {});
      assert.notEqual(session1.session_id, session2.session_id);
    });
  });

  describe('validateSession', () => {
    it('should accept valid session', () => {
      const session: Session = {
        session_id: 'valid-id',
        started_at: '2024-01-01T00:00:00.000Z',
        target_project: '/path/to/project',
        runner_version: '0.1.0',
        configuration: {},
        current_phase: Phase.REQUIREMENT_ANALYSIS,
        status: OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
      };
      assert.ok(validateSession(session));
    });

    it('should reject session without session_id', () => {
      const session = {
        started_at: '2024-01-01T00:00:00.000Z',
        target_project: '/path/to/project',
        runner_version: '0.1.0',
        configuration: {},
        current_phase: Phase.REQUIREMENT_ANALYSIS,
        status: OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
      } as unknown as Session;
      assert.throws(() => validateSession(session), SessionValidationError);
    });

    it('should reject session with invalid timestamp', () => {
      const session: Session = {
        session_id: 'valid-id',
        started_at: 'not-a-timestamp',
        target_project: '/path/to/project',
        runner_version: '0.1.0',
        configuration: {},
        current_phase: Phase.REQUIREMENT_ANALYSIS,
        status: OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
      };
      assert.throws(() => validateSession(session), SessionValidationError);
    });

    it('should reject session without target_project', () => {
      const session = {
        session_id: 'valid-id',
        started_at: '2024-01-01T00:00:00.000Z',
        runner_version: '0.1.0',
        configuration: {},
        current_phase: Phase.REQUIREMENT_ANALYSIS,
        status: OverallStatus.INCOMPLETE,
        continuation_approved: false,
        limit_violations: [],
      } as unknown as Session;
      assert.throws(() => validateSession(session), SessionValidationError);
    });
  });
});
