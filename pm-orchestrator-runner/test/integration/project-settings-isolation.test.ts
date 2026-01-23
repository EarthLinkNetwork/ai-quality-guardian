/**
 * Integration Test: Project Settings Persistence Isolation
 *
 * Verifies that project settings:
 * 1. Persist across process exit/restart
 * 2. Are isolated between different projects (project A vs project B)
 *
 * Per spec/33_PROJECT_SETTINGS_PERSISTENCE.md:
 * - Each project gets its own settings file based on path hash
 * - Settings survive process restart
 * - Different projects have different configurations
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  ProjectSettingsStore,
  generateProjectHash,
  DEFAULT_PROJECT_SETTINGS,
} from '../../src/settings/project-settings-store';

describe('Project Settings Persistence Isolation', function () {
  this.timeout(10000);

  let tempDir: string;
  let projectADir: string;
  let projectBDir: string;
  let storageDir: string;

  beforeEach(() => {
    // Create isolated temp directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-settings-isolation-'));
    projectADir = path.join(tempDir, 'project-a');
    projectBDir = path.join(tempDir, 'project-b');
    storageDir = path.join(tempDir, '.pm-orchestrator', 'projects');

    // Create project directories with required .claude structure
    for (const projDir of [projectADir, projectBDir]) {
      const claudeDir = path.join(projDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), `# Project ${path.basename(projDir)}`);
    }

    // Create storage directory
    fs.mkdirSync(storageDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Hash-based Project Identification', () => {
    it('should generate different hashes for different project paths', () => {
      const hashA = generateProjectHash(projectADir);
      const hashB = generateProjectHash(projectBDir);

      assert.notEqual(hashA, hashB, 'Different projects should have different hashes');
      assert.equal(hashA.length, 16, 'Hash should be 16 characters');
      assert.equal(hashB.length, 16, 'Hash should be 16 characters');
    });

    it('should generate consistent hash for same path', () => {
      const hash1 = generateProjectHash(projectADir);
      const hash2 = generateProjectHash(projectADir);

      assert.equal(hash1, hash2, 'Same path should produce same hash');
    });

    it('should normalize path case for consistent hashing', () => {
      // Hash should be case-insensitive (normalized to lowercase)
      const hash1 = generateProjectHash('/tmp/TEST-PROJECT');
      const hash2 = generateProjectHash('/tmp/test-project');

      assert.equal(hash1, hash2, 'Hashes should match regardless of case');
    });
  });

  describe('Settings Isolation Between Projects', () => {
    it('should persist different settings for different projects', async () => {
      // Initialize store for Project A
      const storeA = new ProjectSettingsStore(storageDir);
      const settingsA = await storeA.initialize(projectADir);

      // Set specific settings for Project A
      await storeA.setTemplate('builtin-minimal');
      await storeA.setLLM('openai', 'gpt-4o');

      // Initialize store for Project B
      const storeB = new ProjectSettingsStore(storageDir);
      const settingsB = await storeB.initialize(projectBDir);

      // Set different settings for Project B
      await storeB.setTemplate('builtin-standard');
      await storeB.setLLM('anthropic', 'claude-sonnet-4-20250514');

      // Verify settings files exist with different hashes
      const hashA = generateProjectHash(projectADir);
      const hashB = generateProjectHash(projectBDir);

      const fileA = path.join(storageDir, `${hashA}.json`);
      const fileB = path.join(storageDir, `${hashB}.json`);

      assert.ok(fs.existsSync(fileA), 'Project A settings file should exist');
      assert.ok(fs.existsSync(fileB), 'Project B settings file should exist');

      // Read and verify isolation
      const dataA = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
      const dataB = JSON.parse(fs.readFileSync(fileB, 'utf-8'));

      // Project A assertions
      assert.equal(dataA.template.selectedId, 'builtin-minimal');
      assert.equal(dataA.template.enabled, true);
      assert.equal(dataA.llm.provider, 'openai');
      assert.equal(dataA.llm.model, 'gpt-4o');

      // Project B assertions
      assert.equal(dataB.template.selectedId, 'builtin-standard');
      assert.equal(dataB.template.enabled, true);
      assert.equal(dataB.llm.provider, 'anthropic');
      assert.equal(dataB.llm.model, 'claude-sonnet-4-20250514');

      // Verify they are different
      assert.notEqual(dataA.template.selectedId, dataB.template.selectedId);
      assert.notEqual(dataA.llm.provider, dataB.llm.provider);
    });

    it('should not cross-contaminate settings between projects', async () => {
      // Set up Project A
      const storeA1 = new ProjectSettingsStore(storageDir);
      await storeA1.initialize(projectADir);
      await storeA1.setTemplate('custom-a-template');

      // Set up Project B with different settings
      const storeB = new ProjectSettingsStore(storageDir);
      await storeB.initialize(projectBDir);
      await storeB.setTemplate('custom-b-template');

      // Re-load Project A and verify it still has its original settings
      const storeA2 = new ProjectSettingsStore(storageDir);
      const reloadedA = await storeA2.initialize(projectADir);

      assert.equal(
        reloadedA.template.selectedId,
        'custom-a-template',
        'Project A should retain its settings after Project B was configured'
      );
    });
  });

  describe('Settings Persistence Across Restart', () => {
    it('should restore settings after simulated process restart', async () => {
      // Session 1: Initialize and configure
      const store1 = new ProjectSettingsStore(storageDir);
      await store1.initialize(projectADir);
      await store1.setTemplate('test-template-123');
      await store1.setLLM('openai', 'gpt-4-turbo');
      await store1.setPreference('autoChunking', false);
      await store1.setPreference('costWarningThreshold', 2.5);

      // Simulate process exit (destroy store reference)
      // In real scenario, process exits and store is garbage collected

      // Session 2: Create new store instance (simulates restart)
      const store2 = new ProjectSettingsStore(storageDir);
      const restored = await store2.initialize(projectADir);

      // Verify all settings were restored
      assert.equal(restored.template.selectedId, 'test-template-123');
      assert.equal(restored.template.enabled, true);
      assert.equal(restored.llm.provider, 'openai');
      assert.equal(restored.llm.model, 'gpt-4-turbo');
      assert.equal(restored.preferences.autoChunking, false);
      assert.equal(restored.preferences.costWarningThreshold, 2.5);
    });

    it('should preserve settings through multiple restart cycles', async () => {
      const iterations = 3;

      for (let i = 0; i < iterations; i++) {
        const store = new ProjectSettingsStore(storageDir);
        const settings = await store.initialize(projectADir);

        if (i === 0) {
          // First iteration: set initial values
          await store.setTemplate('template-iteration-0');
        } else {
          // Subsequent iterations: verify persistence
          assert.equal(
            settings.template.selectedId,
            'template-iteration-0',
            `Iteration ${i}: Template should persist from first iteration`
          );
        }
      }
    });
  });

  describe('Default Settings and First-Time Initialization', () => {
    it('should use defaults when no settings file exists', async () => {
      const store = new ProjectSettingsStore(storageDir);
      const settings = await store.initialize(projectADir);

      // Verify defaults are applied
      assert.equal(settings.template.selectedId, DEFAULT_PROJECT_SETTINGS.template.selectedId);
      assert.equal(settings.template.enabled, DEFAULT_PROJECT_SETTINGS.template.enabled);
      assert.equal(settings.llm.provider, DEFAULT_PROJECT_SETTINGS.llm.provider);
      assert.equal(settings.llm.model, DEFAULT_PROJECT_SETTINGS.llm.model);
      assert.equal(
        settings.preferences.autoChunking,
        DEFAULT_PROJECT_SETTINGS.preferences.autoChunking
      );
    });

    it('should create settings file on first initialization', async () => {
      const hash = generateProjectHash(projectADir);
      const settingsPath = path.join(storageDir, `${hash}.json`);

      // Verify file doesn't exist initially
      assert.equal(fs.existsSync(settingsPath), false);

      // Initialize
      const store = new ProjectSettingsStore(storageDir);
      await store.initialize(projectADir);

      // Verify file was created
      assert.equal(fs.existsSync(settingsPath), true);
    });
  });

  describe('Corrupted Settings Recovery', () => {
    it('should recover from corrupted settings file using defaults', async () => {
      const hash = generateProjectHash(projectADir);
      const settingsPath = path.join(storageDir, `${hash}.json`);

      // Create corrupted file
      fs.writeFileSync(settingsPath, '{ invalid json content');

      // Initialize should succeed with defaults
      const store = new ProjectSettingsStore(storageDir);
      const settings = await store.initialize(projectADir);

      // Verify defaults were applied
      assert.equal(settings.template.selectedId, DEFAULT_PROJECT_SETTINGS.template.selectedId);
      assert.equal(settings.llm.provider, DEFAULT_PROJECT_SETTINGS.llm.provider);

      // Verify corrupted file was replaced with valid JSON
      const fileContent = fs.readFileSync(settingsPath, 'utf-8');
      assert.doesNotThrow(() => JSON.parse(fileContent));
    });
  });

  describe('Index Management', () => {
    it('should maintain index of all projects', async () => {
      // Initialize both projects
      const storeA = new ProjectSettingsStore(storageDir);
      await storeA.initialize(projectADir);

      const storeB = new ProjectSettingsStore(storageDir);
      await storeB.initialize(projectBDir);

      // Check index file
      const indexPath = path.join(storageDir, 'index.json');
      assert.ok(fs.existsSync(indexPath), 'Index file should exist');

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      assert.equal(index.version, 1);
      assert.equal(index.projects.length, 2);

      // Verify both projects are indexed
      const hashA = generateProjectHash(projectADir);
      const hashB = generateProjectHash(projectBDir);

      const projectAEntry = index.projects.find((p: { hash: string }) => p.hash === hashA);
      const projectBEntry = index.projects.find((p: { hash: string }) => p.hash === hashB);

      assert.ok(projectAEntry, 'Project A should be in index');
      assert.ok(projectBEntry, 'Project B should be in index');
    });
  });

  describe('Template and Provider Selection Persistence', () => {
    it('should persist activeTemplate selection', async () => {
      const store1 = new ProjectSettingsStore(storageDir);
      await store1.initialize(projectADir);
      await store1.setTemplate('my-custom-template');

      // Reload
      const store2 = new ProjectSettingsStore(storageDir);
      const restored = await store2.initialize(projectADir);

      assert.equal(restored.template.selectedId, 'my-custom-template');
      assert.equal(restored.template.enabled, true);
    });

    it('should persist provider selection', async () => {
      const store1 = new ProjectSettingsStore(storageDir);
      await store1.initialize(projectADir);
      await store1.setLLM('anthropic', 'claude-3-haiku');

      // Reload
      const store2 = new ProjectSettingsStore(storageDir);
      const restored = await store2.initialize(projectADir);

      assert.equal(restored.llm.provider, 'anthropic');
      assert.equal(restored.llm.model, 'claude-3-haiku');
    });

    it('should persist template enabled/disabled state', async () => {
      const store1 = new ProjectSettingsStore(storageDir);
      await store1.initialize(projectADir);
      await store1.setTemplate('some-template');
      await store1.enableTemplate(false);

      // Reload
      const store2 = new ProjectSettingsStore(storageDir);
      const restored = await store2.initialize(projectADir);

      assert.equal(restored.template.selectedId, 'some-template');
      assert.equal(restored.template.enabled, false);
    });
  });
});
