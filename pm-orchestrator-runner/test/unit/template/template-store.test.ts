import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  TemplateStore,
  Template,
  TemplateIndexEntry,
  BUILTIN_TEMPLATES,
  TemplateStoreEvent,
} from '../../../src/template';

describe('TemplateStore (spec/32_TEMPLATE_INJECTION.md)', () => {
  let tempDir: string;
  let store: TemplateStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-template-test-'));
    store = new TemplateStore({ storageDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Initialization (Section 2.2)', () => {
    it('should initialize with built-in templates', async () => {
      await store.initialize();
      const templates = store.list();

      // Should have all built-in templates
      assert.ok(templates.length >= 3, 'should have at least 3 built-in templates');

      // Check built-in templates exist
      const builtInNames = templates.filter(t => t.isBuiltIn).map(t => t.name);
      assert.ok(builtInNames.includes('Minimal'), 'should have Minimal template');
      assert.ok(builtInNames.includes('Standard'), 'should have Standard template');
      assert.ok(builtInNames.includes('Strict'), 'should have Strict template');
    });

    it('should create storage directory if not exists', async () => {
      const newDir = path.join(tempDir, 'new-templates');
      const newStore = new TemplateStore({ storageDir: newDir });
      await newStore.initialize();

      // templates subdirectory should be created
      assert.ok(fs.existsSync(path.join(newDir, 'templates')), 'should create templates directory');
    });

    it('should load existing templates on initialize', async () => {
      // First, create a template
      await store.initialize();
      const created = await store.create(
        'test-template',
        '## Rules',
        '## Output'
      );

      // Create new store instance and initialize
      const store2 = new TemplateStore({ storageDir: tempDir });
      await store2.initialize();

      const templates = store2.list();
      const found = templates.find(t => t.name === 'test-template');
      assert.ok(found, 'should load existing template');
    });
  });

  describe('Built-in Templates (Section 2.2)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should have BUILTIN_TEMPLATES constant', () => {
      assert.ok(BUILTIN_TEMPLATES, 'BUILTIN_TEMPLATES should exist');
      assert.ok(Array.isArray(BUILTIN_TEMPLATES), 'should be an array');
      assert.ok(BUILTIN_TEMPLATES.length >= 3, 'should have at least 3 templates');
    });

    it('should have Minimal template with correct structure', () => {
      const minimal = store.getByName('Minimal');
      assert.ok(minimal, 'Minimal template should exist');
      assert.strictEqual(minimal?.isBuiltIn, true);
      assert.ok(minimal?.rulesText, 'should have rulesText');
      assert.ok(minimal?.outputFormatText, 'should have outputFormatText');
    });

    it('should have Standard template with correct structure', () => {
      const standard = store.getByName('Standard');
      assert.ok(standard, 'Standard template should exist');
      assert.strictEqual(standard?.isBuiltIn, true);
      assert.ok(standard?.rulesText.includes('完了条件'), 'should have completion criteria');
    });

    it('should have Strict template with correct structure', () => {
      const strict = store.getByName('Strict');
      assert.ok(strict, 'Strict template should exist');
      assert.strictEqual(strict?.isBuiltIn, true);
    });

    it('should not allow editing built-in templates', async () => {
      const minimal = store.getByName('Minimal');
      assert.ok(minimal);

      await assert.rejects(
        async () => store.update(minimal!.id, { name: 'Modified' }),
        /built-in|cannot.*modif/i,
        'should reject editing built-in template'
      );
    });

    it('should not allow deleting built-in templates', async () => {
      const minimal = store.getByName('Minimal');
      assert.ok(minimal);

      await assert.rejects(
        async () => store.delete(minimal!.id),
        /built-in|cannot.*delete/i,
        'should reject deleting built-in template'
      );
    });
  });

  describe('list() - Metadata Only (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return array of TemplateIndexEntry', () => {
      const list = store.list();
      assert.ok(Array.isArray(list));

      for (const item of list) {
        assert.ok(item.id, 'should have id');
        assert.ok(item.name, 'should have name');
        assert.ok(typeof item.isBuiltIn === 'boolean', 'should have isBuiltIn');
        assert.ok(item.updatedAt, 'should have updatedAt');

        // Should NOT have rulesText or outputFormatText (lazy loading)
        assert.strictEqual((item as unknown as Template).rulesText, undefined, 'should not have rulesText in list');
      }
    });
  });

  describe('get() - Full Template (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return full template with rulesText and outputFormatText', () => {
      const minimal = store.list().find(t => t.name === 'Minimal');
      assert.ok(minimal);

      const full = store.get(minimal!.id);
      assert.ok(full);
      assert.ok(full!.rulesText, 'should have rulesText');
      assert.ok(full!.outputFormatText, 'should have outputFormatText');
    });

    it('should return null for non-existent id', () => {
      const result = store.get('non-existent-id');
      assert.strictEqual(result, null);
    });

    it('should cache loaded templates', () => {
      const minimal = store.list().find(t => t.name === 'Minimal');
      assert.ok(minimal);

      // Load twice
      const first = store.get(minimal!.id);
      const second = store.get(minimal!.id);

      // Should be same object (cached)
      assert.strictEqual(first, second, 'should return cached template');
    });
  });

  describe('getByName()', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should return template by name', () => {
      const template = store.getByName('Standard');
      assert.ok(template);
      assert.strictEqual(template!.name, 'Standard');
    });

    it('should return null for non-existent name', () => {
      const result = store.getByName('NonExistent');
      assert.strictEqual(result, null);
    });
  });

  describe('create() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should create new template with all fields', async () => {
      const name = 'my-template';
      const rulesText = '## My Rules\n- Rule 1\n- Rule 2';
      const outputFormatText = '## Output\n- Item 1';

      const created = await store.create(name, rulesText, outputFormatText);

      assert.ok(created.id, 'should have generated id');
      assert.strictEqual(created.name, name);
      assert.strictEqual(created.rulesText, rulesText);
      assert.strictEqual(created.outputFormatText, outputFormatText);
      assert.strictEqual(created.enabled, false, 'should be disabled by default');
      assert.strictEqual(created.isBuiltIn, false, 'should not be built-in');
      assert.ok(created.createdAt, 'should have createdAt');
      assert.ok(created.updatedAt, 'should have updatedAt');
    });

    it('should persist template to file system', async () => {
      const created = await store.create(
        'persistent-template',
        '## Rules',
        '## Output'
      );

      // Check file exists in templates subdirectory
      const filePath = path.join(tempDir, 'templates', `${created.id}.json`);
      assert.ok(fs.existsSync(filePath), 'should save template to file');

      // Check file content
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.strictEqual(content.name, 'persistent-template');
    });

    it('should update index.json', async () => {
      await store.create(
        'indexed-template',
        '## Rules',
        '## Output'
      );

      const indexPath = path.join(tempDir, 'templates', 'index.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      const found = index.templates.find((t: TemplateIndexEntry) => t.name === 'indexed-template');
      assert.ok(found, 'should be in index');
    });

    it('should reject duplicate names', async () => {
      await store.create(
        'duplicate-name',
        '## Rules',
        '## Output'
      );

      await assert.rejects(
        async () => store.create(
          'duplicate-name',
          '## Rules 2',
          '## Output 2'
        ),
        /duplicate|already exists/i,
        'should reject duplicate name'
      );
    });

    it('should validate name format', async () => {
      await assert.rejects(
        async () => store.create(
          'invalid name with spaces!',
          '## Rules',
          '## Output'
        ),
        /invalid|format|only contain/i,
        'should reject invalid name format'
      );
    });

    it('should validate name length', async () => {
      const longName = 'a'.repeat(51);
      await assert.rejects(
        async () => store.create(
          longName,
          '## Rules',
          '## Output'
        ),
        /length|50|characters/i,
        'should reject name over 50 characters'
      );
    });

    it('should validate rulesText length', async () => {
      const longRules = 'a'.repeat(10001);
      await assert.rejects(
        async () => store.create(
          'valid-name',
          longRules,
          '## Output'
        ),
        /length|10000|characters/i,
        'should reject rulesText over 10000 characters'
      );
    });

    it('should validate outputFormatText length', async () => {
      const longOutput = 'a'.repeat(5001);
      await assert.rejects(
        async () => store.create(
          'valid-name',
          '## Rules',
          longOutput
        ),
        /length|5000|characters/i,
        'should reject outputFormatText over 5000 characters'
      );
    });
  });

  describe('update() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should update template name', async () => {
      const created = await store.create(
        'original-name',
        '## Rules',
        '## Output'
      );

      const updated = await store.update(created.id, { name: 'new-name' });
      assert.strictEqual(updated.name, 'new-name');
      assert.ok(updated.updatedAt >= created.updatedAt, 'should update timestamp');
    });

    it('should update rulesText', async () => {
      const created = await store.create(
        'test-template',
        '## Old Rules',
        '## Output'
      );

      const updated = await store.update(created.id, { rulesText: '## New Rules' });
      assert.strictEqual(updated.rulesText, '## New Rules');
    });

    it('should update outputFormatText', async () => {
      const created = await store.create(
        'test-template',
        '## Rules',
        '## Old Output'
      );

      const updated = await store.update(created.id, { outputFormatText: '## New Output' });
      assert.strictEqual(updated.outputFormatText, '## New Output');
    });

    it('should persist updates to file system', async () => {
      const created = await store.create(
        'persist-update',
        '## Rules',
        '## Output'
      );

      await store.update(created.id, { rulesText: '## Updated Rules' });

      const filePath = path.join(tempDir, 'templates', `${created.id}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.strictEqual(content.rulesText, '## Updated Rules');
    });

    it('should throw for non-existent id', async () => {
      await assert.rejects(
        async () => store.update('non-existent', { name: 'new-name' }),
        /not found/i,
        'should throw for non-existent id'
      );
    });
  });

  describe('delete() (Section 5.1)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should delete user template', async () => {
      const created = await store.create(
        'to-delete',
        '## Rules',
        '## Output'
      );

      await store.delete(created.id);

      const found = store.get(created.id);
      assert.strictEqual(found, null);
    });

    it('should remove file from file system', async () => {
      const created = await store.create(
        'to-delete',
        '## Rules',
        '## Output'
      );

      const filePath = path.join(tempDir, 'templates', `${created.id}.json`);
      assert.ok(fs.existsSync(filePath), 'file should exist before delete');

      await store.delete(created.id);
      assert.ok(!fs.existsSync(filePath), 'file should be deleted');
    });

    it('should update index.json', async () => {
      const created = await store.create(
        'to-delete',
        '## Rules',
        '## Output'
      );

      await store.delete(created.id);

      const indexPath = path.join(tempDir, 'templates', 'index.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const found = index.templates.find((t: TemplateIndexEntry) => t.id === created.id);
      assert.ok(!found, 'should be removed from index');
    });

    it('should throw for non-existent id', async () => {
      await assert.rejects(
        async () => store.delete('non-existent'),
        /not found/i,
        'should throw for non-existent id'
      );
    });
  });

  describe('Event Emission (Section 7)', () => {
    let events: TemplateStoreEvent[];

    beforeEach(async () => {
      events = [];
      store = new TemplateStore({ storageDir: tempDir }, (event) => {
        events.push(event);
      });
      await store.initialize();
    });

    it('should emit TEMPLATE_CREATED event', async () => {
      await store.create(
        'event-test',
        '## Rules',
        '## Output'
      );

      const createdEvent = events.find(e => e.type === 'TEMPLATE_CREATED');
      assert.ok(createdEvent, 'should emit TEMPLATE_CREATED');
      assert.ok((createdEvent as { template: Template })?.template);
    });

    it('should emit TEMPLATE_UPDATED event', async () => {
      const created = await store.create(
        'event-test',
        '## Rules',
        '## Output'
      );

      await store.update(created.id, { name: 'updated-name' });

      const updatedEvent = events.find(e => e.type === 'TEMPLATE_UPDATED');
      assert.ok(updatedEvent, 'should emit TEMPLATE_UPDATED');
    });

    it('should emit TEMPLATE_DELETED event', async () => {
      const created = await store.create(
        'event-test',
        '## Rules',
        '## Output'
      );

      await store.delete(created.id);

      const deletedEvent = events.find(e => e.type === 'TEMPLATE_DELETED');
      assert.ok(deletedEvent, 'should emit TEMPLATE_DELETED');
      assert.strictEqual((deletedEvent as { templateId: string })?.templateId, created.id);
    });

    it('should emit STORE_INITIALIZED event', () => {
      const initEvent = events.find(e => e.type === 'STORE_INITIALIZED');
      assert.ok(initEvent, 'should emit STORE_INITIALIZED');
    });

    it('should emit BUILTIN_LOADED event', () => {
      const builtinEvent = events.find(e => e.type === 'BUILTIN_LOADED');
      assert.ok(builtinEvent, 'should emit BUILTIN_LOADED');
    });
  });

  describe('Error Handling - Fail-Closed (Section 6)', () => {
    it('should handle corrupted index.json gracefully', async () => {
      // Write corrupted index in templates directory
      const templatesDir = path.join(tempDir, 'templates');
      fs.mkdirSync(templatesDir, { recursive: true });
      fs.writeFileSync(path.join(templatesDir, 'index.json'), 'not valid json');

      const newStore = new TemplateStore({ storageDir: tempDir });
      await newStore.initialize();

      // Should have built-in templates at minimum
      const templates = newStore.list();
      assert.ok(templates.length >= 3, 'should have built-in templates after corruption');
    });

    it('should handle corrupted template file gracefully', async () => {
      await store.initialize();

      const created = await store.create(
        'to-corrupt',
        '## Rules',
        '## Output'
      );

      // Clear cache to force reload
      store.clearCache();
      await store.initialize();

      // Corrupt the file
      fs.writeFileSync(path.join(tempDir, 'templates', `${created.id}.json`), 'not valid json');

      // Clear cache again
      store.clearCache();
      await store.initialize();

      // Get should return null (fail-closed)
      const result = store.get(created.id);
      assert.strictEqual(result, null, 'should return null for corrupted file');
    });
  });

  describe('File Permissions (Section 9)', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should create files with secure permissions', async () => {
      const created = await store.create(
        'permission-test',
        '## Rules',
        '## Output'
      );

      const filePath = path.join(tempDir, 'templates', `${created.id}.json`);
      const stats = fs.statSync(filePath);

      // Check permissions (0600 = owner read/write only)
      const mode = stats.mode & 0o777;
      assert.ok(mode <= 0o600, `file should have restrictive permissions, got ${mode.toString(8)}`);
    });
  });

  describe('copy() - Template Duplication', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should copy built-in template', async () => {
      const minimal = store.getByName('Minimal');
      assert.ok(minimal);

      const copy = await store.copy(minimal!.id, 'my-minimal');
      assert.strictEqual(copy.name, 'my-minimal');
      assert.strictEqual(copy.isBuiltIn, false);
      assert.strictEqual(copy.rulesText, minimal!.rulesText);
      assert.strictEqual(copy.outputFormatText, minimal!.outputFormatText);
    });

    it('should copy user template', async () => {
      const original = await store.create(
        'original',
        '## Original Rules',
        '## Original Output'
      );

      const copy = await store.copy(original.id, 'copy-of-original');
      assert.strictEqual(copy.name, 'copy-of-original');
      assert.strictEqual(copy.rulesText, original.rulesText);
      assert.notStrictEqual(copy.id, original.id);
    });

    it('should throw for non-existent source', async () => {
      await assert.rejects(
        async () => store.copy('non-existent', 'new-name'),
        /not found/i,
        'should throw for non-existent source'
      );
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should check if template exists', async () => {
      const created = await store.create(
        'exists-test',
        '## Rules',
        '## Output'
      );

      assert.strictEqual(store.exists(created.id), true);
      assert.strictEqual(store.exists('non-existent'), false);
    });

    it('should check if name is taken', async () => {
      await store.create(
        'taken-name',
        '## Rules',
        '## Output'
      );

      assert.strictEqual(store.isNameTaken('taken-name'), true);
      assert.strictEqual(store.isNameTaken('available-name'), false);
    });

    it('should exclude id when checking name', async () => {
      const created = await store.create(
        'my-name',
        '## Rules',
        '## Output'
      );

      // Same name but with exclusion should return false
      assert.strictEqual(store.isNameTaken('my-name', created.id), false);
    });

    it('should get built-in templates', () => {
      const builtins = store.getBuiltins();
      assert.ok(builtins.length >= 3);
      assert.ok(builtins.every(t => t.isBuiltIn));
    });

    it('should format template for injection', () => {
      const minimal = store.getByName('Minimal');
      assert.ok(minimal);

      const formatted = store.formatForInjection(minimal!);
      assert.ok(formatted.rules.includes('Injected Rules'));
      assert.ok(formatted.rules.includes(minimal!.name));
      assert.ok(formatted.outputFormat.includes('Required Output Format'));
      assert.ok(formatted.outputFormat.includes(minimal!.name));
    });
  });
});
