/**
 * Tests for ExecutorSupervisor
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { ExecutorSupervisor, SupervisorConfig } from '../../../src/supervisor/executor-supervisor';
import { OverallStatus } from '../../../src/models/enums';

describe('ExecutorSupervisor', () => {
  let mockRunner: any;
  let supervisor: ExecutorSupervisor;
  let config: SupervisorConfig;

  beforeEach(() => {
    mockRunner = {
      getSessionState: () => ({
        session_id: 'test-session-123',
        current_phase: 'executing',
      }),
      getOverallStatus: () => OverallStatus.INCOMPLETE,
      getTaskResults: () => [
        { task_id: 'task-1', status: 'completed' },
        { task_id: 'task-2', status: 'in_progress' },
      ],
      resume: async () => ({}),
    };

    config = {
      checkIntervalMs: 100, // Short interval for testing
      maxRetries: 3,
      timeoutMs: 5000,
      autoRetry: true,
    };

    supervisor = new ExecutorSupervisor(mockRunner, config);
  });

  afterEach(() => {
    supervisor.stop();
  });

  describe('constructor', () => {
    it('should initialize with default config values', () => {
      const minimalConfig = {
        checkIntervalMs: 0,
        maxRetries: 0,
        timeoutMs: 0,
      };
      const sup = new ExecutorSupervisor(mockRunner, minimalConfig);

      const cfg = sup.getConfig();
      assert.ok(cfg.checkIntervalMs > 0);
      assert.ok(cfg.maxRetries > 0);
      assert.ok(cfg.timeoutMs > 0);
      assert.equal(cfg.autoRetry, true);
    });
  });

  describe('start', () => {
    it('should start monitoring', () => {
      supervisor.start();

      assert.ok(supervisor.isRunning());
      const state = supervisor.getState();
      assert.ok(state.isRunning);
      assert.ok(state.startTime !== null);
    });

    it('should not start if already running', () => {
      supervisor.start();
      const firstStartTime = supervisor.getState().startTime;

      supervisor.start(); // Second start should be ignored

      assert.equal(supervisor.getState().startTime, firstStartTime);
    });

    it('should emit started event', (done) => {
      supervisor.on('started', (data) => {
        assert.ok(data.startTime);
        done();
      });

      supervisor.start();
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      supervisor.start();
      supervisor.stop();

      assert.ok(!supervisor.isRunning());
      const state = supervisor.getState();
      assert.ok(!state.isRunning);
    });

    it('should not error if not running', () => {
      assert.doesNotThrow(() => {
        supervisor.stop();
      });
    });

    it('should emit stopped event', (done) => {
      supervisor.on('stopped', (data) => {
        assert.ok(typeof data.duration === 'number');
        assert.ok(typeof data.retryCount === 'number');
        done();
      });

      supervisor.start();
      supervisor.stop();
    });
  });

  describe('check', () => {
    it('should emit check event with status info', (done) => {
      supervisor.on('check', (data) => {
        assert.equal(data.status, OverallStatus.INCOMPLETE);
        assert.ok(data.tasksCompleted !== undefined);
        assert.ok(data.tasksTotal !== undefined);
        supervisor.stop();
        done();
      });

      supervisor.start();
    });

    it('should handle COMPLETE status', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.COMPLETE;

      supervisor.on('complete', (data) => {
        assert.ok(typeof data.duration === 'number');
        done();
      });

      supervisor.start();
    });

    it('should handle ERROR status with auto-retry', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.ERROR;

      supervisor.on('retry', (data) => {
        assert.equal(data.attempt, 1);
        assert.equal(data.maxRetries, 3);
        supervisor.stop();
        done();
      });

      supervisor.start();
    });

    it('should emit max_retries when retry limit reached', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.ERROR;
      mockRunner.resume = async () => {
        throw new Error('Resume failed');
      };

      // Set low max retries for testing
      supervisor.updateConfig({ maxRetries: 1 });

      let retryCount = 0;
      supervisor.on('retry', () => {
        retryCount++;
      });

      supervisor.on('max_retries', (data) => {
        assert.equal(data.maxRetries, 1);
        done();
      });

      supervisor.start();
    });

    it('should handle NO_EVIDENCE status', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.NO_EVIDENCE;

      supervisor.on('no_evidence', (data) => {
        assert.ok(data.message);
        supervisor.stop();
        done();
      });

      supervisor.start();
    });

    it('should handle INVALID status', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.INVALID;

      supervisor.on('invalid', (data) => {
        assert.ok(data.message);
        done();
      });

      supervisor.start();
    });
  });

  describe('timeout', () => {
    it('should emit timeout event when timeout is reached', (done) => {
      supervisor.updateConfig({ timeoutMs: 50 });

      supervisor.on('timeout', (data) => {
        assert.ok(typeof data.duration === 'number');
        assert.equal(data.status, OverallStatus.INCOMPLETE);
        done();
      });

      supervisor.start();
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = supervisor.getState();

      assert.equal(state.isRunning, false);
      assert.equal(state.retryCount, 0);
      assert.equal(state.startTime, null);
      assert.equal(state.lastCheckTime, null);
      assert.equal(state.currentTaskId, null);
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const cfg = supervisor.getConfig();

      assert.equal(cfg.checkIntervalMs, 100);
      assert.equal(cfg.maxRetries, 3);
      assert.equal(cfg.timeoutMs, 5000);
      assert.equal(cfg.autoRetry, true);
    });
  });

  describe('updateConfig', () => {
    it('should update config', () => {
      supervisor.updateConfig({
        maxRetries: 5,
        timeoutMs: 10000,
      });

      const cfg = supervisor.getConfig();
      assert.equal(cfg.maxRetries, 5);
      assert.equal(cfg.timeoutMs, 10000);
      // Original values should be preserved
      assert.equal(cfg.checkIntervalMs, 100);
    });
  });

  describe('auto-retry disabled', () => {
    it('should not retry when autoRetry is false', (done) => {
      mockRunner.getOverallStatus = () => OverallStatus.ERROR;
      supervisor.updateConfig({ autoRetry: false });

      supervisor.on('error', (data) => {
        assert.ok(data.reason.includes('auto-retry disabled'));
        done();
      });

      supervisor.start();
    });
  });
});
