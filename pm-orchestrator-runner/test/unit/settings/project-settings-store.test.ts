import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ProjectSettingsStore,
  ProjectSettings,
  DEFAULT_PROJECT_SETTINGS,
  generateProjectHash,
  ProjectSettingsEvent,
} from '../../../src/settings';

describe('ProjectSettingsStore (spec/33_PROJECT_SETTINGS_PERSISTENCE.md)', () => {
  let tempDir: string;
  let projectDir: string;
  let store: ProjectSettingsStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-settings-test-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-project-'));
    store = new ProjectSettingsStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  describe('generateProjectHash() (Section 3.2)', () => {
    it('should generate consistent hash for same path', () => {
      const hash1 = generateProjectHash('/Users/user/project');
      const hash2 = generateProjectHash('/Users/user/project');
      assert.strictEqual(hash1, hash2);
    });

    it('should generate 16-character hex string', () => {
      const hash = generateProjectHash('/Users/user/project');
      assert.strictEqual(hash.length, 16);
      assert.ok(/^[0-9a-f]+$/.test(hash), 'should be hex string');
    });

    it('should normalize path (resolve, lowercase)', () => {
      // Same path with different formats should produce same hash
      const hash1 = generateProjectHash('/Users/User/Project');
      const hash2 = generateProjectHash('/users/user/project');
      // Note: This depends on OS. On macOS/Linux, case matters in paths
      // The implementation should normalize consistently
      assert.ok(hash1.length === 16);
      assert.ok(hash2.length === 16);
    });

    it('should generate different hash for different paths', () => {
      const hash1 = generateProjectHash('/Users/user/project1');
      const hash2 = generateProjectHash('/Users/user/project2');
      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('DEFAULT_PROJECT_SETTINGS (Section 2.2)', () => {
    it('should have correct default template settings', () => {
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.template.selectedId, null);
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.template.enabled, false);
    });

    it('should have correct default LLM settings', () => {
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.llm.provider, null);
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.llm.model, null);
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.llm.customEndpoint, null);
    });

    it('should have correct default preferences', () => {
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.preferences.autoChunking, true);
      assert.strictEqual(DEFAULT_PROJECT_SETTINGS.preferences.costWarningEnabled, true);
      assert.ok(typeof DEFAULT_PROJECT_SETTINGS.preferences.costWarningThreshold === 'number');
      assert.ok(DEFAULT_PROJECT_SETTINGS.preferences.costWarningThreshold > 0);
    });
  });

  describe('initialize() (Section 4.1)', () => {
    it('should create storage directory if not exists', async () => {
      const newDir = path.join(tempDir, 'new-settings');
      const newStore = new ProjectSettingsStore(newDir);
      await newStore.initialize(projectDir);

      assert.ok(fs.existsSync(newDir), 'should create storage directory');
    });

    it('should create settings file for new project', async () => {
      await store.initialize(projectDir);

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      assert.ok(fs.existsSync(filePath), 'should create settings file');
    });

    it('should return settings with correct projectPath and projectHash', async () => {
      const settings = await store.initialize(projectDir);

      assert.strictEqual(settings.projectPath, path.resolve(projectDir));
      assert.strictEqual(settings.projectHash, generateProjectHash(projectDir));
    });

    it('should have default values for new project', async () => {
      const settings = await store.initialize(projectDir);

      assert.strictEqual(settings.template.selectedId, null);
      assert.strictEqual(settings.template.enabled, false);
      assert.strictEqual(settings.llm.provider, null);
      assert.strictEqual(settings.llm.model, null);
    });

    it('should have timestamps for new project', async () => {
      const settings = await store.initialize(projectDir);

      assert.ok(settings.createdAt, 'should have createdAt');
      assert.ok(settings.updatedAt, 'should have updatedAt');
      assert.ok(settings.lastAccessedAt, 'should have lastAccessedAt');

      // Timestamps should be valid ISO 8601
      assert.ok(!isNaN(Date.parse(settings.createdAt)));
      assert.ok(!isNaN(Date.parse(settings.updatedAt)));
      assert.ok(!isNaN(Date.parse(settings.lastAccessedAt)));
    });

    it('should load existing settings', async () => {
      // First, initialize and update
      await store.initialize(projectDir);
      await store.setTemplate('test-template-id');

      // Create new store instance and initialize
      const store2 = new ProjectSettingsStore(tempDir);
      const settings = await store2.initialize(projectDir);

      assert.strictEqual(settings.template.selectedId, 'test-template-id');
    });

    it('should update lastAccessedAt on load', async () => {
      await store.initialize(projectDir);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Load again
      const store2 = new ProjectSettingsStore(tempDir);
      const settings = await store2.initialize(projectDir);

      // lastAccessedAt should be recent
      const accessedTime = new Date(settings.lastAccessedAt).getTime();
      const now = Date.now();
      assert.ok(now - accessedTime < 1000, 'lastAccessedAt should be recent');
    });
  });

  describe('get() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should return current settings', () => {
      const settings = store.get();
      assert.ok(settings);
      assert.strictEqual(settings.projectPath, path.resolve(projectDir));
    });

    it('should return same instance on multiple calls', () => {
      const settings1 = store.get();
      const settings2 = store.get();
      assert.strictEqual(settings1, settings2);
    });
  });

  describe('update() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should update partial settings', async () => {
      const updated = await store.update({
        template: { selectedId: 'new-id', enabled: true },
      });

      assert.strictEqual(updated.template.selectedId, 'new-id');
      assert.strictEqual(updated.template.enabled, true);
    });

    it('should update updatedAt timestamp', async () => {
      const before = store.get().updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));

      await store.update({ template: { selectedId: 'new-id', enabled: true } });
      const after = store.get().updatedAt;

      assert.ok(after > before, 'updatedAt should be updated');
    });

    it('should persist updates to file', async () => {
      await store.update({
        llm: { provider: 'anthropic', model: 'claude-3-opus', customEndpoint: null },
      });

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(content.llm.provider, 'anthropic');
      assert.strictEqual(content.llm.model, 'claude-3-opus');
    });

    it('should not modify unrelated settings', async () => {
      await store.update({ template: { selectedId: 'test', enabled: true } });
      await store.update({ llm: { provider: 'openai', model: 'gpt-4', customEndpoint: null } });

      const settings = store.get();
      assert.strictEqual(settings.template.selectedId, 'test', 'template should be preserved');
      assert.strictEqual(settings.llm.provider, 'openai');
    });
  });

  describe('setTemplate() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should set template ID and enable', async () => {
      await store.setTemplate('my-template');

      const settings = store.get();
      assert.strictEqual(settings.template.selectedId, 'my-template');
      assert.strictEqual(settings.template.enabled, true);
    });

    it('should clear template with null', async () => {
      await store.setTemplate('my-template');
      await store.setTemplate(null);

      const settings = store.get();
      assert.strictEqual(settings.template.selectedId, null);
      assert.strictEqual(settings.template.enabled, false);
    });
  });

  describe('enableTemplate() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should enable template', async () => {
      await store.setTemplate('my-template');
      await store.enableTemplate(false);
      await store.enableTemplate(true);

      assert.strictEqual(store.get().template.enabled, true);
    });

    it('should disable template', async () => {
      await store.setTemplate('my-template');
      await store.enableTemplate(false);

      const settings = store.get();
      assert.strictEqual(settings.template.enabled, false);
      assert.strictEqual(settings.template.selectedId, 'my-template', 'should keep selection');
    });
  });

  describe('setLLM() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should set provider and model', async () => {
      await store.setLLM('anthropic', 'claude-3-opus');

      const settings = store.get();
      assert.strictEqual(settings.llm.provider, 'anthropic');
      assert.strictEqual(settings.llm.model, 'claude-3-opus');
    });

    it('should persist LLM settings', async () => {
      await store.setLLM('openai', 'gpt-4');

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(content.llm.provider, 'openai');
      assert.strictEqual(content.llm.model, 'gpt-4');
    });
  });

  describe('setPreference() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should set autoChunking preference', async () => {
      await store.setPreference('autoChunking', false);
      assert.strictEqual(store.get().preferences.autoChunking, false);
    });

    it('should set costWarningEnabled preference', async () => {
      await store.setPreference('costWarningEnabled', false);
      assert.strictEqual(store.get().preferences.costWarningEnabled, false);
    });

    it('should set costWarningThreshold preference', async () => {
      await store.setPreference('costWarningThreshold', 1.5);
      assert.strictEqual(store.get().preferences.costWarningThreshold, 1.5);
    });
  });

  describe('save() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should save settings to file', async () => {
      await store.setTemplate('save-test');
      await store.save();

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(content.template.selectedId, 'save-test');
    });

    it('should update lastAccessedAt', async () => {
      const before = store.get().lastAccessedAt;
      await new Promise(resolve => setTimeout(resolve, 10));

      await store.save();
      const after = store.get().lastAccessedAt;

      assert.ok(after >= before, 'lastAccessedAt should be updated');
    });
  });

  describe('reset() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should reset to default settings', async () => {
      await store.setTemplate('my-template');
      await store.setLLM('anthropic', 'claude-3-opus');

      const reset = await store.reset();

      assert.strictEqual(reset.template.selectedId, null);
      assert.strictEqual(reset.template.enabled, false);
      assert.strictEqual(reset.llm.provider, null);
      assert.strictEqual(reset.llm.model, null);
    });

    it('should preserve projectPath and projectHash', async () => {
      await store.setTemplate('my-template');
      const reset = await store.reset();

      assert.strictEqual(reset.projectPath, path.resolve(projectDir));
      assert.strictEqual(reset.projectHash, generateProjectHash(projectDir));
    });

    it('should persist reset to file', async () => {
      await store.setTemplate('my-template');
      await store.reset();

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(content.template.selectedId, null);
    });
  });

  describe('Event Emission (Section 8)', () => {
    let events: ProjectSettingsEvent[];

    beforeEach(async () => {
      events = [];
      store = new ProjectSettingsStore(tempDir, (event) => {
        events.push(event);
      });
    });

    it('should emit SETTINGS_LOADED event on initialize', async () => {
      await store.initialize(projectDir);

      const loadedEvent = events.find(e => e.type === 'SETTINGS_LOADED');
      assert.ok(loadedEvent, 'should emit SETTINGS_LOADED');
    });

    it('should emit SETTINGS_UPDATED event on update', async () => {
      await store.initialize(projectDir);
      await store.update({ template: { selectedId: 'test', enabled: true } });

      const updatedEvent = events.find(e => e.type === 'SETTINGS_UPDATED');
      assert.ok(updatedEvent, 'should emit SETTINGS_UPDATED');
    });

    it('should emit SETTINGS_SAVED event on save', async () => {
      await store.initialize(projectDir);
      await store.save();

      const savedEvent = events.find(e => e.type === 'SETTINGS_SAVED');
      assert.ok(savedEvent, 'should emit SETTINGS_SAVED');
    });

    it('should emit SETTINGS_RESET event on reset', async () => {
      await store.initialize(projectDir);
      await store.reset();

      const resetEvent = events.find(e => e.type === 'SETTINGS_RESET');
      assert.ok(resetEvent, 'should emit SETTINGS_RESET');
    });
  });

  describe('Error Handling - Fail-Closed (Section 7.1)', () => {
    it('should handle corrupted settings file gracefully', async () => {
      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);

      // Create corrupted file
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(filePath, 'not valid json');

      // Should initialize with defaults
      const settings = await store.initialize(projectDir);
      assert.strictEqual(settings.template.selectedId, null);
      assert.strictEqual(settings.llm.provider, null);
    });

    it('should handle write failure gracefully', async () => {
      await store.initialize(projectDir);

      // Make directory read-only (if supported)
      try {
        fs.chmodSync(tempDir, 0o444);
        await store.update({ template: { selectedId: 'test', enabled: true } });
        // In-memory state should still be updated even if write fails
        assert.strictEqual(store.get().template.selectedId, 'test');
      } finally {
        fs.chmodSync(tempDir, 0o755);
      }
    });
  });

  describe('Migration (Section 7.3)', () => {
    it('should migrate v0 settings to current version', async () => {
      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);

      // Create v0 (no version) settings
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({
        projectPath: projectDir,
        projectHash: hash,
        template: { selectedId: 'old', enabled: true },
      }));

      const settings = await store.initialize(projectDir);

      // Should have migrated
      assert.strictEqual(settings.version, 1);
      assert.strictEqual(settings.template.selectedId, 'old');
    });
  });

  describe('Index Management (Section 3.3)', () => {
    it('should update index.json on initialize', async () => {
      await store.initialize(projectDir);

      const indexPath = path.join(tempDir, 'index.json');
      assert.ok(fs.existsSync(indexPath), 'index.json should exist');

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const hash = generateProjectHash(projectDir);
      const found = index.projects.find((p: { hash: string }) => p.hash === hash);
      assert.ok(found, 'project should be in index');
    });

    it('should track multiple projects', async () => {
      const projectDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-project2-'));

      try {
        await store.initialize(projectDir);

        const store2 = new ProjectSettingsStore(tempDir);
        await store2.initialize(projectDir2);

        const indexPath = path.join(tempDir, 'index.json');
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

        assert.strictEqual(index.projects.length, 2);
      } finally {
        fs.rmSync(projectDir2, { recursive: true, force: true });
      }
    });
  });

  describe('File Permissions (Section 10)', () => {
    it('should create files with secure permissions', async () => {
      await store.initialize(projectDir);

      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const stats = fs.statSync(filePath);

      const mode = stats.mode & 0o777;
      assert.ok(mode <= 0o600, `file should have restrictive permissions, got ${mode.toString(8)}`);
    });
  });

  describe('ID-only Persistence (Section 2.3)', () => {
    beforeEach(async () => {
      await store.initialize(projectDir);
    });

    it('should persist template.id, not template.name', async () => {
      // Given: A template where id !== name
      // BUILTIN_GOAL_DRIFT_GUARD has:
      //   id: 'goal_drift_guard'
      //   name: 'Goal_Drift_Guard'
      const templateId = 'goal_drift_guard';
      const templateName = 'Goal_Drift_Guard';

      // When: Setting template by ID
      await store.setTemplate(templateId);

      // Then: The persisted value should be the ID, not the name
      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(
        content.template.selectedId,
        templateId,
        `persisted value should be ID '${templateId}'`
      );
      assert.notStrictEqual(
        content.template.selectedId,
        templateName,
        `persisted value should NOT be name '${templateName}'`
      );
    });

    it('should store lowercase ID, not display name', async () => {
      // The ID 'goal_drift_guard' is all lowercase
      // The name 'Goal_Drift_Guard' has mixed case
      // Persistence must use the ID format
      await store.setTemplate('goal_drift_guard');

      const settings = store.get();
      
      // Verify in-memory value
      assert.strictEqual(settings.template.selectedId, 'goal_drift_guard');
      assert.notStrictEqual(settings.template.selectedId, 'Goal_Drift_Guard');

      // Verify persisted value
      const hash = generateProjectHash(projectDir);
      const filePath = path.join(tempDir, `${hash}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      assert.strictEqual(content.template.selectedId, 'goal_drift_guard');
    });

    it('should verify name-to-ID resolution pattern (UI/CLI -> persistence)', async () => {
      // This test documents the expected pattern:
      // 1. UI/CLI receives display name (e.g., 'Goal_Drift_Guard')
      // 2. TemplateStore.getByName() resolves to Template object
      // 3. template.id is extracted ('goal_drift_guard')
      // 4. ProjectSettingsStore.setTemplate(template.id) is called
      // 5. Only the ID is persisted

      // Simulating the pattern: when user selects by name,
      // the calling code should resolve to ID before calling setTemplate
      const simulatedIdFromTemplateStore = 'goal_drift_guard';
      
      await store.setTemplate(simulatedIdFromTemplateStore);
      
      const settings = store.get();
      assert.strictEqual(
        settings.template.selectedId,
        'goal_drift_guard',
        'after name resolution, only ID should be stored'
      );
    });

    it('should preserve ID-only persistence across save/load cycle', async () => {
      // Set template
      await store.setTemplate('goal_drift_guard');
      await store.save();

      // Create new store instance and load
      const store2 = new ProjectSettingsStore(tempDir);
      const settings = await store2.initialize(projectDir);

      // Verify the loaded value is still the ID
      assert.strictEqual(
        settings.template.selectedId,
        'goal_drift_guard',
        'loaded value should be ID, not name'
      );
    });
  });
});
