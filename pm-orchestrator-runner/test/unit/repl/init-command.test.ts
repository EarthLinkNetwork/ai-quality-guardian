/**
 * Tests for InitCommand
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InitCommand } from '../../../src/repl/commands/init';

describe('InitCommand', () => {
  let tempDir: string;
  let initCommand: InitCommand;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-init-test-'));
    initCommand = new InitCommand();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('execute', () => {
    it('should create .claude directory structure', async () => {
      const result = await initCommand.execute(tempDir);

      assert.ok(result.success);
      assert.ok(result.createdPaths && result.createdPaths.length > 0);
      assert.ok(fs.existsSync(path.join(tempDir, '.claude')));
    });

    it('should create CLAUDE.md', async () => {
      await initCommand.execute(tempDir);

      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      assert.ok(fs.existsSync(claudeMdPath));

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      assert.ok(content.includes('Project Configuration'));
    });

    it('should create settings.json', async () => {
      await initCommand.execute(tempDir);

      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      assert.ok(fs.existsSync(settingsPath));

      const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.ok(content.project);
      assert.ok(content.pm);
      assert.ok(content.executor);
    });

    it('should create agents directory', async () => {
      await initCommand.execute(tempDir);

      const agentsDir = path.join(tempDir, '.claude', 'agents');
      assert.ok(fs.existsSync(agentsDir));
      assert.ok(fs.statSync(agentsDir).isDirectory());
    });

    it('should create pm-orchestrator.md', async () => {
      await initCommand.execute(tempDir);

      const pmPath = path.join(tempDir, '.claude', 'agents', 'pm-orchestrator.md');
      assert.ok(fs.existsSync(pmPath));

      const content = fs.readFileSync(pmPath, 'utf-8');
      assert.ok(content.includes('PM Orchestrator'));
    });

    it('should create rules directory', async () => {
      await initCommand.execute(tempDir);

      const rulesDir = path.join(tempDir, '.claude', 'rules');
      assert.ok(fs.existsSync(rulesDir));
      assert.ok(fs.statSync(rulesDir).isDirectory());
    });

    it('should create project-rules.md', async () => {
      await initCommand.execute(tempDir);

      const rulesPath = path.join(tempDir, '.claude', 'rules', 'project-rules.md');
      assert.ok(fs.existsSync(rulesPath));

      const content = fs.readFileSync(rulesPath, 'utf-8');
      assert.ok(content.includes('Project Rules'));
    });

    it('should return ERROR when files already exist (spec compliance)', async () => {
      // First init
      await initCommand.execute(tempDir);

      // Modify CLAUDE.md
      const claudeMdPath = path.join(tempDir, '.claude', 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'Custom content', 'utf-8');

      // Second init - per spec 10_REPL_UX.md L96-99, should return ERROR
      const result = await initCommand.execute(tempDir);

      // Should return ERROR with existing files listed
      assert.ok(!result.success, 'Should return success: false when files exist');
      assert.ok(result.existingFiles && result.existingFiles.length > 0, 'Should list existing files');

      // Content should be preserved (files were not overwritten)
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      assert.equal(content, 'Custom content');
    });

    it('should fail for non-existent directory', async () => {
      const result = await initCommand.execute('/nonexistent/path');

      assert.ok(!result.success);
      assert.ok(result.message?.includes('does not exist'));
    });

    it('should set project name from directory name', async () => {
      await initCommand.execute(tempDir);

      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

      assert.ok(content.project.name);
      assert.ok(content.project.name.length > 0);
    });
  });

  describe('isInitialized', () => {
    it('should return false for uninitialized directory', () => {
      assert.ok(!initCommand.isInitialized(tempDir));
    });

    it('should return true for initialized directory', async () => {
      await initCommand.execute(tempDir);
      assert.ok(initCommand.isInitialized(tempDir));
    });
  });

  /**
   * Spec compliance tests (10_REPL_UX.md L96-99)
   * Required behavior:
   * - If any file exists, ERROR (not success)
   * - List which files exist in error message
   */
  describe('Spec Compliance: ERROR when files exist (10_REPL_UX.md L96-99)', () => {
    it('should return ERROR when .claude/ directory exists', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await initCommand.execute(tempDir);

      // Per spec L98: "存在する場合は ERROR として停止する"
      assert.ok(!result.success, 'Should return success: false when .claude/ exists');
      assert.ok(result.message.includes('.claude'), 'Error should mention .claude/');
    });

    it('should return ERROR when CLAUDE.md exists', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), 'existing', 'utf-8');

      const result = await initCommand.execute(tempDir);

      assert.ok(!result.success, 'Should return success: false when CLAUDE.md exists');
      assert.ok(result.message.includes('CLAUDE.md'), 'Error should mention CLAUDE.md');
    });

    it('should return ERROR when settings.json exists', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}', 'utf-8');

      const result = await initCommand.execute(tempDir);

      assert.ok(!result.success, 'Should return success: false when settings.json exists');
      assert.ok(result.message.includes('settings.json'), 'Error should mention settings.json');
    });

    it('should list ALL existing files in error message', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), 'existing', 'utf-8');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}', 'utf-8');

      const result = await initCommand.execute(tempDir);

      assert.ok(!result.success, 'Should return success: false');
      // Per spec L98: "どれが存在しているかを明示"
      assert.ok(result.message.includes('CLAUDE.md'), 'Should list CLAUDE.md');
      assert.ok(result.message.includes('settings.json'), 'Should list settings.json');
    });

    it('should create all files when NONE exist', async () => {
      // tempDir is fresh, no .claude exists
      const result = await initCommand.execute(tempDir);

      assert.ok(result.success, 'Should succeed when no files exist');
      assert.ok(result.createdPaths && result.createdPaths.length > 0, 'Should create files');
    });

    it('should include existingFiles array in result when files exist', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), 'existing', 'utf-8');

      const result = await initCommand.execute(tempDir);

      assert.ok(!result.success);
      assert.ok(result.existingFiles, 'Result should include existingFiles array');
      assert.ok(Array.isArray(result.existingFiles), 'existingFiles should be an array');
      assert.ok(result.existingFiles.length > 0, 'existingFiles should not be empty');
    });
  });
});
