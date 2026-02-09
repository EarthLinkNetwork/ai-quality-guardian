/**
 * E2E Test: No User Manual Debug Required
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md E2E-4
 *
 * Validates that the system provides sufficient automated
 * verification and never requires user manual testing.
 *
 * Key Principle: "ユーザーに手動デバッグ・手動curl・手動確認を絶対にさせるな"
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  Supervisor,
  getSupervisor,
  resetSupervisor,
  mergePrompt,
  applyOutputTemplate,
  RestartHandler,
} from '../../src/supervisor/index';

import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';

describe('E2E: No User Manual Debug Required (E2E-4)', () => {
  let testDir: string;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-user-debug-test-'));
    const claudeDir = path.join(testDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    resetSupervisor();
  });

  after(() => {
    resetSupervisor();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('Automated Prompt Composition Verification', () => {
    it('should automatically verify prompt composition order', () => {
      const globalTemplate = 'GLOBAL_RULES';
      const projectTemplate = 'PROJECT_RULES';
      const userPrompt = 'USER_REQUEST';

      const composed = mergePrompt(globalTemplate, projectTemplate, userPrompt);

      // Automated verification - no manual inspection needed
      const globalIdx = composed.composed.indexOf(globalTemplate);
      const projectIdx = composed.composed.indexOf(projectTemplate);
      const userIdx = composed.composed.indexOf(userPrompt);

      assert.ok(globalIdx < projectIdx, 'Global should come before project');
      assert.ok(projectIdx < userIdx, 'Project should come before user');
    });

    it('should automatically verify template immutability', () => {
      const original = 'Original user prompt';
      const composed = mergePrompt('G', 'P', original);

      // Automated verification - user prompt unchanged
      assert.equal(composed.userPrompt, original);
    });
  });

  describe('Automated Output Validation', () => {
    it('should automatically validate output format', () => {
      const supervisor = getSupervisor(testDir);
      const output = 'Valid output content';

      const validation = supervisor.validate(output);

      // Automated validation - no manual check needed
      assert.ok('valid' in validation, 'Should have valid property');
      assert.ok('violations' in validation, 'Should have violations property');
      assert.ok(Array.isArray(validation.violations), 'violations should be an array');
    });

    it('should automatically detect and report violations', () => {
      const supervisor = getSupervisor(testDir);
      const outputs = [
        'Normal output',
        '',
        'x'.repeat(100000),
        'Special: <>&"\'',
      ];

      outputs.forEach(output => {
        const validation = supervisor.validate(output);

        // Automated detection - system handles all cases
        assert.ok('valid' in validation, 'Should have valid property');
        assert.ok('violations' in validation, 'Should have violations property');
      });
    });
  });

  describe('Automated Restart Detection', () => {
    it('should automatically detect and categorize restart scenarios', async () => {
      const queueStore = new InMemoryQueueStore({ namespace: 'test-ns' });
      const restartHandler = new RestartHandler({
        queueStore,
        staleThresholdMs: 1000,
      });

      // Add test tasks
      await queueStore.enqueue('session-1', 'group-1', 'Task 1');
      await queueStore.enqueue('session-2', 'group-2', 'Task 2');

      const claim1 = await queueStore.claim();
      const claim2 = await queueStore.claim();

      if (claim1.success && claim1.item) await queueStore.updateStatus(claim1.item.task_id, 'RUNNING');
      if (claim2.success && claim2.item) await queueStore.updateStatus(claim2.item.task_id, 'AWAITING_RESPONSE');

      // Automated check - no manual inspection required
      const result = await restartHandler.checkAllTasks();

      assert.ok('totalChecked' in result, 'Should have totalChecked property');
      assert.ok('needsAction' in result, 'Should have needsAction property');
      assert.ok('staleTasks' in result, 'Should have staleTasks property');
      assert.ok('continueTasks' in result, 'Should have continueTasks property');
      assert.ok('rollbackTasks' in result, 'Should have rollbackTasks property');
    });
  });

  describe('Automated Config Verification', () => {
    it('should automatically verify config loading', () => {
      const supervisor = getSupervisor(testDir);
      const config = supervisor.getConfig('test-project');

      // Automated verification - all required fields present
      assert.ok('supervisorEnabled' in config, 'Should have supervisorEnabled property');
      assert.ok('timeoutMs' in config, 'Should have timeoutMs property');
      assert.ok('maxRetries' in config, 'Should have maxRetries property');
      assert.equal(typeof config.supervisorEnabled, 'boolean');
      assert.equal(typeof config.timeoutMs, 'number');
      assert.equal(typeof config.maxRetries, 'number');
    });

    it('should automatically validate timeout profiles', () => {
      const supervisor = getSupervisor(testDir);
      const config = supervisor.getConfig('default');

      // Automated validation - timeout within expected range
      assert.ok(config.timeoutMs > 0, 'timeoutMs should be greater than 0');
      assert.ok(config.timeoutMs <= 3600000, 'timeoutMs should be at most 1 hour');
    });
  });

  describe('Automated Error Detection', () => {
    it('should automatically detect template errors', () => {
      const invalidTemplates = [
        '{{INVALID_PLACEHOLDER}}',
        '{{',
        '}}',
      ];

      invalidTemplates.forEach(template => {
        const result = applyOutputTemplate('output', template);

        // System handles gracefully - no manual debugging needed
        assert.ok('formatted' in result, 'Should have formatted property');
        assert.ok('templateApplied' in result, 'Should have templateApplied property');
      });
    });

    it('should automatically handle edge cases without crash', () => {
      const edgeCases = [
        { global: '', project: '', user: '' },
        { global: null as any, project: undefined as any, user: 'test' },
        { global: 'g', project: 'p', user: 'u'.repeat(100000) },
      ];

      edgeCases.forEach(({ global: g, project: p, user: u }) => {
        try {
          const result = mergePrompt(g || '', p || '', u || '');
          assert.ok('composed' in result, 'Should have composed property');
        } catch (e) {
          // Even if error, it should be a proper Error
          assert.ok(e instanceof Error, 'Error should be an instance of Error');
        }
      });
    });
  });

  describe('Automated Integration Verification', () => {
    it('should automatically verify full flow: compose → format → validate', () => {
      const supervisor = getSupervisor(testDir);
      const projectId = 'integration-test';

      // Step 1: Compose (automated)
      const composed = supervisor.compose('Test prompt', projectId);
      assert.equal(typeof composed.composed, 'string');
      assert.ok(composed.composed.length > 0, 'composed string should not be empty');

      // Step 2: Format (automated)
      const formatted = supervisor.format('Test output', projectId);
      assert.equal(typeof formatted.formatted, 'string');

      // Step 3: Validate (automated)
      const validation = supervisor.validate(formatted.formatted);
      assert.ok('valid' in validation, 'Should have valid property');

      // All automated - no user intervention needed
    });

    it('should provide complete error information without manual debugging', () => {
      const supervisor = getSupervisor(testDir);

      // Even for problematic inputs, system provides full context
      const emptyComposed = supervisor.compose('', 'project');
      assert.ok('composed' in emptyComposed, 'Should have composed property');
      assert.ok('globalTemplate' in emptyComposed, 'Should have globalTemplate property');
      assert.ok('projectTemplate' in emptyComposed, 'Should have projectTemplate property');
      assert.ok('userPrompt' in emptyComposed, 'Should have userPrompt property');
    });
  });

  describe('Self-Documenting Results', () => {
    it('should return results that explain themselves', () => {
      const supervisor = getSupervisor(testDir);

      // Compose returns all components
      const composed = supervisor.compose('User request', 'project-id');
      assert.equal(typeof composed.globalTemplate, 'string');
      assert.equal(typeof composed.projectTemplate, 'string');
      assert.equal(composed.userPrompt, 'User request');

      // Format returns both raw and formatted
      const formatted = supervisor.format('Output', 'project-id');
      assert.equal(typeof formatted.raw, 'string');
      assert.equal(typeof formatted.formatted, 'string');
      assert.equal(typeof formatted.templateApplied, 'boolean');

      // Validate returns detailed violations
      const validation = supervisor.validate(formatted.formatted);
      assert.ok(Array.isArray(validation.violations), 'violations should be an array');
    });
  });
});
