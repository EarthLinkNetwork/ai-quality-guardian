/**
 * Unit Tests for Dynamic Timeout Executor
 *
 * AC C: Dynamic Control - Executor with dynamic profile selection
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  DynamicTimeoutExecutor,
  DynamicExecutorConfig,
  createDynamicExecutor,
  analyzeTaskPrompt,
  TaskExecutionContext,
} from '../../../src/executor/dynamic-timeout-executor';
import {
  STANDARD_PROFILE,
  LONG_PROFILE,
  EXTENDED_PROFILE,
} from '../../../src/utils/timeout-profile';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('DynamicTimeoutExecutor (AC C: Dynamic Control)', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-executor-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create executor with default config', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      assert.ok(executor, 'Executor should be created');
    });

    it('should accept all config options', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        useDynamicProfiles: false,
        overrideProfile: LONG_PROFILE,
        extendedTimeoutMinCategory: 'medium',
        logProfileSelection: true,
        verbose: true,
      });

      assert.ok(executor, 'Executor should be created with all options');
    });
  });

  describe('analyzeTask', () => {
    it('should analyze small task and select STANDARD_PROFILE', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const context = executor.analyzeTask({
        id: 'task-1',
        prompt: 'read the file contents',
        workingDir: tempDir,
      });

      assert.strictEqual(context.estimate.category, 'small');
      assert.strictEqual(context.profile.name, 'standard');
      assert.strictEqual(context.executorConfig.projectPath, tempDir);
    });

    it('should analyze large task and select LONG_PROFILE', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const context = executor.analyzeTask({
        id: 'task-2',
        prompt: 'refactor the entire authentication module',
        workingDir: tempDir,
      });

      assert.ok(
        context.estimate.category === 'large' || context.estimate.category === 'x-large',
        `Expected large or x-large, got ${context.estimate.category}`
      );
    });

    it('should analyze x-large task and select EXTENDED_PROFILE', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const context = executor.analyzeTask({
        id: 'task-3',
        prompt: 'rewrite the entire codebase and auto iterate until done',
        workingDir: tempDir,
      });

      assert.strictEqual(context.estimate.category, 'x-large');
      assert.strictEqual(context.profile.name, 'extended');
    });

    it('should respect overrideProfile', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        overrideProfile: EXTENDED_PROFILE,
      });

      const context = executor.analyzeTask({
        id: 'task-4',
        prompt: 'read this small file', // Would normally be small
        workingDir: tempDir,
      });

      // Override should take precedence
      assert.strictEqual(context.profile.name, 'extended');
    });

    it('should include taskType in estimation', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const context = executor.analyzeTask({
        id: 'task-5',
        prompt: 'analyze the codebase',
        workingDir: tempDir,
        taskType: 'READ_INFO',
      });

      // READ_INFO should reduce score
      const typeFactor = context.estimate.factors.find(f => f.name === 'task_type');
      if (typeFactor) {
        assert.ok(typeFactor.score < 0, 'READ_INFO should have negative score');
      }
    });

    it('should configure executorConfig from profile', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const context = executor.analyzeTask({
        id: 'task-6',
        prompt: 'refactor everything',
        workingDir: tempDir,
      });

      const config = context.executorConfig;

      // softTimeoutMs should be based on profile's idle_timeout_ms
      assert.ok(config.softTimeoutMs, 'Should have softTimeoutMs');
      assert.ok(config.silenceLogIntervalMs, 'Should have silenceLogIntervalMs');
      assert.ok(
        config.silenceLogIntervalMs! <= config.softTimeoutMs!,
        'silenceLogIntervalMs should be <= softTimeoutMs'
      );
    });
  });

  describe('profile selection logic', () => {
    it('should disable overall timeout for x-large tasks', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        extendedTimeoutMinCategory: 'large',
      });

      const xlarge = executor.analyzeTask({
        id: 'task-7',
        prompt: 'rewrite the entire codebase batch thousands',
        workingDir: tempDir,
      });

      assert.strictEqual(xlarge.estimate.category, 'x-large');
      assert.strictEqual(xlarge.executorConfig.disableOverallTimeout, true);
    });

    it('should not disable overall timeout for small tasks', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      const small = executor.analyzeTask({
        id: 'task-8',
        prompt: 'hello',
        workingDir: tempDir,
      });

      assert.strictEqual(small.estimate.category, 'small');
      assert.strictEqual(small.executorConfig.disableOverallTimeout, false);
    });

    it('should respect extendedTimeoutMinCategory', () => {
      // With extendedTimeoutMinCategory = 'x-large', only x-large disables timeout
      const executor1 = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        extendedTimeoutMinCategory: 'x-large',
      });

      const large1 = executor1.analyzeTask({
        id: 'task-9',
        prompt: 'refactor the module',
        workingDir: tempDir,
      });

      // Large should NOT disable timeout when min category is x-large
      assert.strictEqual(large1.estimate.category, 'large');
      assert.strictEqual(large1.executorConfig.disableOverallTimeout, false);

      // With extendedTimeoutMinCategory = 'medium', even medium disables timeout
      const executor2 = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        extendedTimeoutMinCategory: 'medium',
      });

      const xlarge = executor2.analyzeTask({
        id: 'task-10',
        prompt: 'rewrite the entire codebase batch',
        workingDir: tempDir,
      });

      // X-large should disable timeout
      assert.strictEqual(xlarge.estimate.category, 'x-large');
      assert.strictEqual(xlarge.executorConfig.disableOverallTimeout, true);
    });
  });

  describe('createDynamicExecutor', () => {
    it('should create executor with defaults', () => {
      const executor = createDynamicExecutor(tempDir);

      assert.ok(executor, 'Executor should be created');
      assert.strictEqual(executor.getConfig().projectPath, tempDir);
    });

    it('should accept timeout parameter', () => {
      const executor = createDynamicExecutor(tempDir, 300000);

      assert.strictEqual(executor.getConfig().timeout, 300000);
    });

    it('should accept additional options', () => {
      const executor = createDynamicExecutor(tempDir, 600000, {
        verbose: true,
        logProfileSelection: true,
      });

      const config = executor.getConfig();
      assert.strictEqual(config.verbose, true);
      assert.strictEqual(config.logProfileSelection, true);
    });
  });

  describe('analyzeTaskPrompt', () => {
    it('should analyze prompt without executor', () => {
      const estimate = analyzeTaskPrompt('refactor the authentication system');

      assert.ok(estimate.category, 'Should have category');
      assert.ok(estimate.recommendedProfile, 'Should have recommendedProfile');
    });

    it('should accept taskType', () => {
      const estimate = analyzeTaskPrompt('analyze this', 'READ_INFO');

      // Should reduce score due to READ_INFO modifier
      const typeFactor = estimate.factors.find(f => f.name === 'task_type');
      if (typeFactor) {
        assert.ok(typeFactor.score < 0, 'READ_INFO should have negative score');
      }
    });
  });

  describe('withConfig', () => {
    it('should create new executor with modified config', () => {
      const executor1 = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        verbose: false,
      });

      const executor2 = executor1.withConfig({ verbose: true });

      assert.strictEqual(executor1.getConfig().verbose, false);
      assert.strictEqual(executor2.getConfig().verbose, true);
    });

    it('should preserve other config values', () => {
      const executor1 = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
        logProfileSelection: true,
      });

      const executor2 = executor1.withConfig({ verbose: true });

      assert.strictEqual(executor2.getConfig().logProfileSelection, true);
      assert.strictEqual(executor2.getConfig().projectPath, tempDir);
    });
  });

  describe('isClaudeCodeAvailable', () => {
    it('should check CLI availability', async () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      // Just verify it doesn't throw
      const available = await executor.isClaudeCodeAvailable();
      assert.ok(typeof available === 'boolean');
    });
  });

  describe('integration: profile matches task complexity', () => {
    it('should use appropriate profiles for different task types', () => {
      const executor = new DynamicTimeoutExecutor({
        projectPath: tempDir,
        timeout: 600000,
      });

      // Small tasks
      const small = executor.analyzeTask({
        id: '1',
        prompt: 'read the version',
        workingDir: tempDir,
        taskType: 'READ_INFO',
      });
      assert.strictEqual(small.profile.name, 'standard');

      // Large refactoring
      const refactor = executor.analyzeTask({
        id: '2',
        prompt: 'refactor the module',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      });
      assert.strictEqual(refactor.profile.name, 'long');

      // X-large full rewrite
      const rewrite = executor.analyzeTask({
        id: '3',
        prompt: 'rewrite entire codebase batch auto iterate',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      });
      assert.strictEqual(rewrite.profile.name, 'extended');
    });
  });
});
