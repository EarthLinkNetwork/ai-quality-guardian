import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SessionManager,
  SessionManagerError,
} from '../../../src/session/session-manager';
import { Session, SessionStatus } from '../../../src/models/session';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Session Manager (04_COMPONENTS.md L83-97)', () => {
  let tempDir: string;
  let sessionManager: SessionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-session-test-'));
    sessionManager = new SessionManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Session ID Generation (04_COMPONENTS.md L89)', () => {
    it('should generate unique session IDs', () => {
      const id1 = sessionManager.generateSessionId();
      const id2 = sessionManager.generateSessionId();
      assert.notEqual(id1, id2);
    });

    it('should generate session ID with valid format', () => {
      const sessionId = sessionManager.generateSessionId();
      // Session ID should be non-empty string
      assert.ok(sessionId.length > 0);
      // Should contain timestamp or UUID component
      assert.ok(sessionId.length >= 8);
    });

    it('should generate session IDs that are sortable by creation time', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(sessionManager.generateSessionId());
      }
      // Each ID should be unique
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 5);
    });
  });

  describe('Session Evidence Initialization (04_COMPONENTS.md L90)', () => {
    it('should create session.json on initialization', () => {
      const session = sessionManager.initializeSession('/target/project');
      const sessionJsonPath = path.join(tempDir, session.session_id, 'session.json');
      assert.ok(fs.existsSync(sessionJsonPath));
    });

    it('should create executor_runs.jsonl on initialization', () => {
      const session = sessionManager.initializeSession('/target/project');
      const executorRunsPath = path.join(tempDir, session.session_id, 'executor_runs.jsonl');
      assert.ok(fs.existsSync(executorRunsPath));
    });

    it('should create evidence directory structure', () => {
      const session = sessionManager.initializeSession('/target/project');
      const evidenceDir = path.join(tempDir, session.session_id);
      assert.ok(fs.existsSync(evidenceDir));
      assert.ok(fs.statSync(evidenceDir).isDirectory());
    });
  });

  describe('Session Evidence Structure (04_COMPONENTS.md L94-96)', () => {
    it('session.json should contain session_id', () => {
      const session = sessionManager.initializeSession('/target/project');
      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.equal(sessionJson.session_id, session.session_id);
    });

    it('session.json should contain started_at', () => {
      const session = sessionManager.initializeSession('/target/project');
      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.ok(sessionJson.started_at);
      // Should be valid ISO timestamp
      assert.ok(!isNaN(Date.parse(sessionJson.started_at)));
    });

    it('session.json should contain target_project', () => {
      const targetProject = '/target/project';
      const session = sessionManager.initializeSession(targetProject);
      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.equal(sessionJson.target_project, targetProject);
    });

    it('session.json should contain runner_version', () => {
      const session = sessionManager.initializeSession('/target/project');
      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.ok(sessionJson.runner_version);
      assert.ok(sessionJson.runner_version.length > 0);
    });

    it('session.json should contain configuration', () => {
      const session = sessionManager.initializeSession('/target/project');
      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.ok(sessionJson.configuration !== undefined);
    });

    it('executor_runs.jsonl should be initially empty', () => {
      const session = sessionManager.initializeSession('/target/project');
      const executorRunsPath = path.join(tempDir, session.session_id, 'executor_runs.jsonl');
      const content = fs.readFileSync(executorRunsPath, 'utf-8');
      assert.equal(content.trim(), '');
    });
  });

  describe('Session State Persistence (04_COMPONENTS.md L91)', () => {
    it('should persist session state to disk', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.equal(sessionJson.status, SessionStatus.RUNNING);
    });

    it('should load persisted session state', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      const loadedSession = sessionManager.loadSession(session.session_id);
      assert.equal(loadedSession.session_id, session.session_id);
      assert.equal(loadedSession.status, SessionStatus.RUNNING);
    });

    it('should update session state on persist', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      session.status = SessionStatus.COMPLETED;
      sessionManager.persistSession(session);

      const sessionJson = readSessionJson(tempDir, session.session_id);
      assert.equal(sessionJson.status, SessionStatus.COMPLETED);
    });

    it('should fail to load non-existent session', () => {
      assert.throws(
        () => sessionManager.loadSession('non-existent-session'),
        (err: Error) => {
          return err instanceof SessionManagerError &&
            (err as SessionManagerError).code === ErrorCode.E201_SESSION_ID_MISSING;
        }
      );
    });
  });

  describe('Executor Run Recording (04_COMPONENTS.md L96)', () => {
    it('should append executor run to executor_runs.jsonl', () => {
      const session = sessionManager.initializeSession('/target/project');
      const executorRun = {
        executor_id: 'exec-001',
        started_at: new Date().toISOString(),
        task_id: 'task-001',
      };

      sessionManager.recordExecutorRun(session.session_id, executorRun);

      const executorRunsPath = path.join(tempDir, session.session_id, 'executor_runs.jsonl');
      const content = fs.readFileSync(executorRunsPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      assert.equal(lines.length, 1);

      const recorded = JSON.parse(lines[0]);
      assert.equal(recorded.executor_id, 'exec-001');
    });

    it('should append multiple executor runs as separate lines', () => {
      const session = sessionManager.initializeSession('/target/project');

      for (let i = 1; i <= 3; i++) {
        sessionManager.recordExecutorRun(session.session_id, {
          executor_id: `exec-00${i}`,
          started_at: new Date().toISOString(),
          task_id: `task-00${i}`,
        });
      }

      const executorRunsPath = path.join(tempDir, session.session_id, 'executor_runs.jsonl');
      const content = fs.readFileSync(executorRunsPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      assert.equal(lines.length, 3);
    });
  });

  describe('Session Listing and Status', () => {
    it('should list all sessions', () => {
      sessionManager.initializeSession('/project1');
      sessionManager.initializeSession('/project2');

      const sessions = sessionManager.listSessions();
      assert.equal(sessions.length, 2);
    });

    it('should get session status by ID', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      const status = sessionManager.getSessionStatus(session.session_id);
      assert.equal(status.status, SessionStatus.RUNNING);
    });

    it('should return error for non-existent session status', () => {
      assert.throws(
        () => sessionManager.getSessionStatus('non-existent'),
        (err: Error) => {
          return err instanceof SessionManagerError &&
            (err as SessionManagerError).code === ErrorCode.E201_SESSION_ID_MISSING;
        }
      );
    });
  });

  describe('Session Completion', () => {
    it('should mark session as completed', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      sessionManager.completeSession(session.session_id, SessionStatus.COMPLETED);

      const loadedSession = sessionManager.loadSession(session.session_id);
      assert.equal(loadedSession.status, SessionStatus.COMPLETED);
      assert.ok(loadedSession.completed_at);
    });

    it('should mark session as failed', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.RUNNING;
      sessionManager.persistSession(session);

      sessionManager.completeSession(session.session_id, SessionStatus.FAILED);

      const loadedSession = sessionManager.loadSession(session.session_id);
      assert.equal(loadedSession.status, SessionStatus.FAILED);
    });
  });

  describe('Session Resume (continue command support)', () => {
    it('should resume existing session', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.PAUSED;
      sessionManager.persistSession(session);

      const resumed = sessionManager.resumeSession(session.session_id);
      assert.equal(resumed.status, SessionStatus.RUNNING);
    });

    it('should fail to resume completed session', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.COMPLETED;
      sessionManager.persistSession(session);

      assert.throws(
        () => sessionManager.resumeSession(session.session_id),
        (err: Error) => {
          return err instanceof SessionManagerError &&
            (err as SessionManagerError).code === ErrorCode.E205_SESSION_RESUME_FAILURE;
        }
      );
    });

    it('should fail to resume failed session', () => {
      const session = sessionManager.initializeSession('/target/project');
      session.status = SessionStatus.FAILED;
      sessionManager.persistSession(session);

      assert.throws(
        () => sessionManager.resumeSession(session.session_id),
        (err: Error) => {
          return err instanceof SessionManagerError &&
            (err as SessionManagerError).code === ErrorCode.E205_SESSION_RESUME_FAILURE;
        }
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw E201 for missing session ID', () => {
      assert.throws(
        () => sessionManager.loadSession(''),
        (err: Error) => {
          return err instanceof SessionManagerError &&
            (err as SessionManagerError).code === ErrorCode.E201_SESSION_ID_MISSING;
        }
      );
    });

    it('should throw E203 for state persistence failure', () => {
      const session = sessionManager.initializeSession('/target/project');
      // Make directory read-only to cause write failure
      const sessionDir = path.join(tempDir, session.session_id);
      fs.chmodSync(sessionDir, 0o444);

      try {
        assert.throws(
          () => sessionManager.persistSession(session),
          (err: Error) => {
            return err instanceof SessionManagerError &&
              (err as SessionManagerError).code === ErrorCode.E203_STATE_PERSISTENCE_FAILURE;
          }
        );
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(sessionDir, 0o755);
      }
    });
  });
});

// Helper function
function readSessionJson(baseDir: string, sessionId: string): any {
  const sessionJsonPath = path.join(baseDir, sessionId, 'session.json');
  const content = fs.readFileSync(sessionJsonPath, 'utf-8');
  return JSON.parse(content);
}
