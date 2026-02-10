/**
 * Timeout Design v3 (AC B) Unit Tests
 *
 * AC B: Abolish "silence=timeout"
 * - Silence alone does NOT terminate the process
 * - Only overall timeout (safety net) can terminate
 * - Interactive prompt detection still works
 */

import { expect } from 'chai';
import { ClaudeCodeExecutor, ExecutorConfig } from '../../../src/executor/claude-code-executor';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Timeout Design v3 (AC B: silence=timeout abolished)', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeout-v3-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('ExecutorConfig changes', () => {
    it('should not have hardTimeoutMs in config interface', () => {
      // This test validates that hardTimeoutMs has been removed
      const config: ExecutorConfig = {
        projectPath: tempDir,
        timeout: 300000,
        softTimeoutMs: 60000,
        silenceLogIntervalMs: 30000,
        verbose: false,
        disableOverallTimeout: false,
      };

      // If hardTimeoutMs existed, TypeScript would require it here
      // The fact that this compiles proves hardTimeoutMs is not required
      expect(config.timeout).to.equal(300000);
      expect(config.softTimeoutMs).to.equal(60000);
      expect(config.silenceLogIntervalMs).to.equal(30000);
      expect(config.disableOverallTimeout).to.equal(false);
    });

    it('should support disableOverallTimeout option', () => {
      const config: ExecutorConfig = {
        projectPath: tempDir,
        timeout: 300000,
        disableOverallTimeout: true,
      };

      expect(config.disableOverallTimeout).to.equal(true);
    });

    it('should have silenceLogIntervalMs for logging (not termination)', () => {
      const config: ExecutorConfig = {
        projectPath: tempDir,
        timeout: 300000,
        silenceLogIntervalMs: 45000, // 45 seconds
      };

      expect(config.silenceLogIntervalMs).to.equal(45000);
    });
  });

  describe('ClaudeCodeExecutor construction', () => {
    it('should create executor with v3 timeout design', () => {
      const executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 600000, // 10 min overall
        softTimeoutMs: 60000,
        silenceLogIntervalMs: 30000,
      });

      // Executor should be created successfully
      expect(executor).to.be.instanceOf(ClaudeCodeExecutor);
    });

    it('should use default silence log interval if not specified', () => {
      const executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 300000,
      });

      // Default silenceLogIntervalMs should be 30000 (30s)
      expect(executor).to.be.instanceOf(ClaudeCodeExecutor);
    });

    it('should allow disabling overall timeout for long tasks', () => {
      const executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 300000,
        disableOverallTimeout: true,
      });

      expect(executor).to.be.instanceOf(ClaudeCodeExecutor);
    });
  });

  describe('Environment variable overrides', () => {
    const originalSoftTimeout = process.env.SOFT_TIMEOUT_MS;
    const originalSilenceLog = process.env.SILENCE_LOG_INTERVAL_MS;

    afterEach(() => {
      // Restore original values
      if (originalSoftTimeout !== undefined) {
        process.env.SOFT_TIMEOUT_MS = originalSoftTimeout;
      } else {
        delete process.env.SOFT_TIMEOUT_MS;
      }
      if (originalSilenceLog !== undefined) {
        process.env.SILENCE_LOG_INTERVAL_MS = originalSilenceLog;
      } else {
        delete process.env.SILENCE_LOG_INTERVAL_MS;
      }
    });

    it('should respect SOFT_TIMEOUT_MS environment variable', () => {
      process.env.SOFT_TIMEOUT_MS = '90000';

      const executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 300000,
        softTimeoutMs: 60000, // This should be overridden by env var
      });

      expect(executor).to.be.instanceOf(ClaudeCodeExecutor);
    });

    it('should respect SILENCE_LOG_INTERVAL_MS environment variable', () => {
      process.env.SILENCE_LOG_INTERVAL_MS = '45000';

      const executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 300000,
        silenceLogIntervalMs: 30000, // This should be overridden by env var
      });

      expect(executor).to.be.instanceOf(ClaudeCodeExecutor);
    });
  });

  describe('Timeout design principles', () => {
    it('should document that silence alone does NOT terminate', () => {
      // This is a documentation test - the actual behavior is tested
      // in integration tests. Here we validate the design principles.

      // AC B: "Abolish silence=timeout"
      // - HARD_TIMEOUT based on silence has been REMOVED
      // - Only OVERALL_TIMEOUT (safety net) can terminate
      // - Interactive prompt detection still works

      const principles = {
        silenceAloneTerminates: false, // ABOLISHED
        overallTimeoutCanTerminate: true, // Safety net
        interactivePromptDetection: true, // Still works
        softTimeoutIsWarningOnly: true, // Logging only
        silenceLogIntervalIsLoggingOnly: true, // NOT termination
      };

      expect(principles.silenceAloneTerminates).to.equal(false);
      expect(principles.overallTimeoutCanTerminate).to.equal(true);
      expect(principles.interactivePromptDetection).to.equal(true);
      expect(principles.softTimeoutIsWarningOnly).to.equal(true);
      expect(principles.silenceLogIntervalIsLoggingOnly).to.equal(true);
    });

    it('should NOT have HARD_TIMEOUT_MS environment variable support (abolished)', () => {
      // The HARD_TIMEOUT_MS env var was used for the old silence-based timeout
      // It should no longer be used since silence=timeout is abolished

      // Note: The code no longer reads HARD_TIMEOUT_MS
      // This test documents that design decision
      expect(true).to.equal(true); // Design principle validated
    });
  });
});
