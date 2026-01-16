/**
 * Tests for ModelCommand
 *
 * Per spec author clarification: /model is REPL-local feature.
 * Model preference is stored in .claude/repl.json (NOT settings.json).
 * Runner Core and Configuration Manager ignore this file.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModelCommand } from '../../../src/repl/commands/model';

describe('ModelCommand', () => {
  let tempDir: string;
  let modelCommand: ModelCommand;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-model-test-'));
    modelCommand = new ModelCommand();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('listModels', () => {
    it('should return list of available models', () => {
      const models = modelCommand.listModels();

      assert.ok(Array.isArray(models));
      assert.ok(models.length > 0);
      assert.ok(models.some(m => m.includes('opus')));
      assert.ok(models.some(m => m.includes('sonnet')));
    });
  });

  describe('getModel', () => {
    it('should return E101 error when .claude/ directory does not exist', async () => {
      // Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
      const result = await modelCommand.getModel(tempDir);

      assert.ok(!result.success);
      assert.equal(result.error?.code, 'E101');
      assert.ok(result.error?.message?.includes('.claude/'));
    });

    it('should return "UNSET" when .claude/ exists but repl.json does not', async () => {
      // Per spec 10_REPL_UX.md L133: If unset, display "UNSET"
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.getModel(tempDir);

      assert.ok(result.success);
      assert.equal(result.model, 'UNSET');
      assert.equal(result.configPath, undefined);
    });

    it('should return model from repl.json if it exists', async () => {
      // Create .claude directory and repl.json with spec-compliant schema
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        JSON.stringify({
          selected_model: 'claude-3-opus-20240229',
          updated_at: new Date().toISOString(),
        }),
        'utf-8'
      );

      const result = await modelCommand.getModel(tempDir);

      assert.ok(result.success);
      assert.equal(result.model, 'claude-3-opus-20240229');
      assert.ok(result.configPath?.endsWith('repl.json'));
    });

    it('should NOT read from settings.json', async () => {
      // Create .claude directory with settings.json (but NOT repl.json)
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          project: { name: 'test' },
          pm: { defaultModel: 'claude-3-opus-20240229' },
          executor: {},
        }),
        'utf-8'
      );

      const result = await modelCommand.getModel(tempDir);

      assert.ok(result.success);
      // Model should be "UNSET" because repl.json doesn't exist
      // (settings.json should be ignored)
      assert.equal(result.model, 'UNSET');
    });
  });

  describe('setModel', () => {
    it('should set model in repl.json', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      assert.ok(result.success);
      assert.equal(result.model, 'claude-3-opus-20240229');

      // Verify repl.json was created/updated with spec-compliant schema
      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );
      assert.equal(replConfig.selected_model, 'claude-3-opus-20240229');
      assert.ok(replConfig.updated_at, 'updated_at should exist');
    });

    it('should NOT modify settings.json', async () => {
      // Create .claude directory with existing settings.json
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const originalSettings = {
        project: { name: 'test' },
        pm: { defaultModel: 'claude-3-sonnet-20240229' },
        executor: {},
      };
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(originalSettings),
        'utf-8'
      );

      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      // Verify settings.json was NOT modified
      const settings = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')
      );
      assert.equal(settings.pm.defaultModel, 'claude-3-sonnet-20240229');
    });

    it('should accept unknown model names with warning', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'custom-model');

      // Should succeed - unknown models are allowed with a warning
      assert.ok(result.success);
      assert.equal(result.model, 'custom-model');

      // Verify repl.json was created with spec-compliant schema
      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );
      assert.equal(replConfig.selected_model, 'custom-model');
      assert.ok(replConfig.updated_at, 'updated_at should exist');
    });

    it('should fail for empty model name', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, '');

      assert.ok(!result.success);
      assert.ok(result.message?.includes('empty'));
    });

    it('should create repl.json if it does not exist', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      assert.ok(result.success);
      assert.equal(result.model, 'claude-3-opus-20240229');

      // Verify repl.json was created
      const replPath = path.join(claudeDir, 'repl.json');
      assert.ok(fs.existsSync(replPath));
    });

    it('should use fixed schema with only selected_model and updated_at (spec compliance)', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Per spec 10_REPL_UX.md L123-128, schema is FIXED:
      // { "selected_model": string, "updated_at": string }
      // No additional properties should be preserved

      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      // Verify spec-compliant schema
      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );
      assert.equal(replConfig.selected_model, 'claude-3-opus-20240229');
      assert.ok(replConfig.updated_at, 'updated_at should exist');

      // Verify only these two properties exist (fixed schema)
      const keys = Object.keys(replConfig);
      assert.deepEqual(keys.sort(), ['selected_model', 'updated_at'].sort());
    });
  });

  /**
   * Spec compliance tests (10_REPL_UX.md L123-139)
   * Required schema:
   * {
   *   "selected_model": string,
   *   "updated_at": string
   * }
   */
  describe('Spec Compliance: repl.json schema (10_REPL_UX.md L123-139)', () => {
    it('should use selected_model field name (not model)', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      // Verify repl.json uses selected_model (not model)
      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );
      assert.equal(replConfig.selected_model, 'claude-3-opus-20240229');
      // model field should NOT exist
      assert.equal(replConfig.model, undefined);
    });

    it('should set updated_at on save', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );
      assert.ok(replConfig.updated_at, 'updated_at should exist');
    });

    it('should set updated_at in ISO 8601 format', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const before = new Date();
      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');
      const after = new Date();

      const replConfig = JSON.parse(
        fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8')
      );

      // Verify ISO 8601 format (should be parseable as Date)
      const updatedAt = new Date(replConfig.updated_at);
      assert.ok(!isNaN(updatedAt.getTime()), 'updated_at should be valid ISO 8601');
      assert.ok(updatedAt >= before, 'updated_at should be >= before');
      assert.ok(updatedAt <= after, 'updated_at should be <= after');
    });

    it('should return E105 error on JSON parse error', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create corrupted repl.json
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        '{ invalid json content',
        'utf-8'
      );

      const result = await modelCommand.getModel(tempDir);

      assert.ok(!result.success);
      assert.ok(result.error?.code === 'E105', 'Should return E105 error code');
    });

    it('should read selected_model from repl.json (not model)', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // Create repl.json with spec-compliant schema
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        JSON.stringify({
          selected_model: 'claude-3-opus-20240229',
          updated_at: new Date().toISOString(),
        }),
        'utf-8'
      );

      const result = await modelCommand.getModel(tempDir);

      assert.ok(result.success);
      assert.equal(result.model, 'claude-3-opus-20240229');
    });
  });

  describe('setModel E101 error handling', () => {
    it('should return E101 error when .claude/ directory does not exist', async () => {
      // Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      assert.ok(!result.success);
      assert.equal(result.error?.code, 'E101');
      assert.ok(result.error?.message?.includes('.claude/'));
    });
  });

  describe('Evidence generation (10_REPL_UX.md L142)', () => {
    it('should generate evidence file when model is set', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      assert.ok(result.success);
      assert.ok(result.evidencePath, 'evidencePath should be returned');
      assert.ok(fs.existsSync(result.evidencePath!), 'Evidence file should exist');
    });

    it('should include correct fields in evidence', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      const evidence = JSON.parse(fs.readFileSync(result.evidencePath!, 'utf-8'));

      // Verify evidence fields
      assert.ok(evidence.evidence_id, 'evidence_id should exist');
      assert.ok(evidence.timestamp, 'timestamp should exist');
      assert.equal(evidence.operation_type, 'REPL_MODEL_CHANGE');
      assert.equal(evidence.previous_model, null, 'previous_model should be null for first set');
      assert.equal(evidence.new_model, 'claude-3-opus-20240229');
      assert.ok(evidence.config_path?.endsWith('repl.json'));
      assert.ok(evidence.hash?.startsWith('sha256:'));
    });

    it('should track previous_model on subsequent changes', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      // First set
      await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      // Second set
      const result = await modelCommand.setModel(tempDir, 'claude-3-sonnet-20240229');

      const evidence = JSON.parse(fs.readFileSync(result.evidencePath!, 'utf-8'));

      assert.equal(evidence.previous_model, 'claude-3-opus-20240229');
      assert.equal(evidence.new_model, 'claude-3-sonnet-20240229');
    });

    it('should store evidence in .claude/evidence/repl/ directory', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await modelCommand.setModel(tempDir, 'claude-3-opus-20240229');

      // Evidence should be in .claude/evidence/repl/
      const expectedDir = path.join(claudeDir, 'evidence', 'repl');
      assert.ok(result.evidencePath?.startsWith(expectedDir));
      assert.ok(fs.existsSync(expectedDir));
    });
  });
});
