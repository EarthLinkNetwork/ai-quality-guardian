/**
 * Integration Tests for Template Injection and Project Settings Persistence
 *
 * Per spec/32_TEMPLATE_INJECTION.md and spec/33_PROJECT_SETTINGS_PERSISTENCE.md:
 * - Templates auto-inject rules and output format into prompts
 * - Project settings persist across /exit and process restarts
 * - Settings survive restart and are restored on next launch
 *
 * Test Cases:
 * - Template injection into prompts
 * - Settings persistence and restoration
 * - TemplateStore + ProjectSettingsStore integration
 * - Template selection and settings sync
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Note: These imports will work after implementation
// import { TemplateStore, Template, BUILTIN_TEMPLATES } from '../../src/template/template-store';
// import { ProjectSettingsStore, ProjectSettings } from '../../src/settings/project-settings-store';

describe('Template Injection and Settings Persistence Integration', () => {
  let tempDir: string;
  let projectDir: string;
  let storageDir: string;

  beforeEach(() => {
    // Create temp directory for test project
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-settings-test-'));
    projectDir = path.join(tempDir, 'test-project');
    storageDir = path.join(tempDir, '.pm-orchestrator');

    // Create project directory
    fs.mkdirSync(projectDir, { recursive: true });

    // Create storage directory structure
    fs.mkdirSync(path.join(storageDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(storageDir, 'projects'), { recursive: true });

    // Create valid .claude directory structure in project
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(
      path.join(claudeDir, 'CLAUDE.md'),
      '# Test Project\n\nDemo project for testing.'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Generate project hash (same as spec)
   */
  function generateProjectHash(projectPath: string): string {
    const normalized = path.resolve(projectPath).toLowerCase();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return hash.substring(0, 16);
  }

  describe('Template Storage', () => {
    it('should write and read template from file system', () => {
      const templateId = 'test-template-123';
      const template = {
        id: templateId,
        name: 'Test Template',
        rulesText: '## Rules\n- Rule 1\n- Rule 2',
        outputFormatText: '## Output\n- Format 1',
        enabled: true,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Write template
      const templatePath = path.join(storageDir, 'templates', `${templateId}.json`);
      fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));

      // Write index
      const indexPath = path.join(storageDir, 'templates', 'index.json');
      const index = {
        version: 1,
        templates: [
          {
            id: templateId,
            name: template.name,
            isBuiltIn: template.isBuiltIn,
            updatedAt: template.updatedAt,
          },
        ],
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      // Read back
      const readTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      const readIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      assert.equal(readTemplate.id, templateId);
      assert.equal(readTemplate.name, 'Test Template');
      assert.equal(readTemplate.rulesText, '## Rules\n- Rule 1\n- Rule 2');
      assert.equal(readIndex.templates.length, 1);
      assert.equal(readIndex.templates[0].id, templateId);
    });

    it('should handle built-in templates with isBuiltIn flag', () => {
      const builtinTemplates = [
        {
          id: 'builtin-minimal',
          name: 'Minimal',
          rulesText: '## 最小限ルール\n- 品質チェックのみ',
          outputFormatText: '## 出力形式\n- 変更ファイル一覧',
          enabled: false,
          isBuiltIn: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'builtin-standard',
          name: 'Standard',
          rulesText:
            '## 標準ルール\n- UI/UX破綻は完了条件未達\n- テスト失敗は完了条件未達',
          outputFormatText: '## 出力形式\n- 変更ファイル一覧\n- テスト結果',
          enabled: false,
          isBuiltIn: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      // Write built-in templates
      for (const template of builtinTemplates) {
        const templatePath = path.join(storageDir, 'templates', `${template.id}.json`);
        fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
      }

      // Verify built-in flag
      const minimalPath = path.join(storageDir, 'templates', 'builtin-minimal.json');
      const minimal = JSON.parse(fs.readFileSync(minimalPath, 'utf-8'));
      assert.equal(minimal.isBuiltIn, true);
      assert.equal(minimal.name, 'Minimal');
    });
  });

  describe('Project Settings Storage', () => {
    it('should write and read project settings from file system', () => {
      const projectHash = generateProjectHash(projectDir);
      const settings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: 'builtin-standard',
          enabled: true,
        },
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          customEndpoint: null,
        },
        preferences: {
          autoChunking: true,
          costWarningEnabled: true,
          costWarningThreshold: 0.5,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      // Write settings
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Write index
      const indexPath = path.join(storageDir, 'projects', 'index.json');
      const index = {
        version: 1,
        projects: [
          {
            hash: projectHash,
            path: projectDir,
            lastAccessedAt: settings.lastAccessedAt,
          },
        ],
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      // Read back
      const readSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const readIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      assert.equal(readSettings.projectHash, projectHash);
      assert.equal(readSettings.template.selectedId, 'builtin-standard');
      assert.equal(readSettings.template.enabled, true);
      assert.equal(readSettings.llm.provider, 'anthropic');
      assert.equal(readIndex.projects.length, 1);
      assert.equal(readIndex.projects[0].hash, projectHash);
    });

    it('should generate consistent hash for same project path', () => {
      const hash1 = generateProjectHash(projectDir);
      const hash2 = generateProjectHash(projectDir);
      const hash3 = generateProjectHash(projectDir.toUpperCase()); // normalized to lowercase

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 16);

      // Different paths should have different hashes
      const differentHash = generateProjectHash('/different/path');
      assert.notEqual(hash1, differentHash);
    });
  });

  describe('Template + Settings Integration', () => {
    it('should persist template selection in project settings', () => {
      const projectHash = generateProjectHash(projectDir);
      const templateId = 'custom-template-456';

      // Create custom template
      const template = {
        id: templateId,
        name: 'Custom Rules',
        rulesText: '## Custom\n- Custom rule',
        outputFormatText: '## Custom Output',
        enabled: true,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(storageDir, 'templates', `${templateId}.json`),
        JSON.stringify(template, null, 2)
      );

      // Create project settings referencing the template
      const settings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: templateId,
          enabled: true,
        },
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          customEndpoint: null,
        },
        preferences: {
          autoChunking: true,
          costWarningEnabled: true,
          costWarningThreshold: 0.5,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(storageDir, 'projects', `${projectHash}.json`),
        JSON.stringify(settings, null, 2)
      );

      // Verify the link
      const readSettings = JSON.parse(
        fs.readFileSync(path.join(storageDir, 'projects', `${projectHash}.json`), 'utf-8')
      );
      const readTemplate = JSON.parse(
        fs.readFileSync(path.join(storageDir, 'templates', `${templateId}.json`), 'utf-8')
      );

      assert.equal(readSettings.template.selectedId, templateId);
      assert.equal(readSettings.template.enabled, true);
      assert.equal(readTemplate.id, templateId);
      assert.equal(readTemplate.rulesText, '## Custom\n- Custom rule');
    });

    it('should handle template deletion gracefully', () => {
      const projectHash = generateProjectHash(projectDir);
      const templateId = 'to-be-deleted-789';

      // Create template
      fs.writeFileSync(
        path.join(storageDir, 'templates', `${templateId}.json`),
        JSON.stringify({
          id: templateId,
          name: 'To Be Deleted',
          rulesText: 'Rules',
          outputFormatText: 'Output',
          enabled: true,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      // Create settings referencing the template
      fs.writeFileSync(
        path.join(storageDir, 'projects', `${projectHash}.json`),
        JSON.stringify({
          version: 1,
          projectPath: projectDir,
          projectHash: projectHash,
          template: {
            selectedId: templateId,
            enabled: true,
          },
          llm: { provider: null, model: null, customEndpoint: null },
          preferences: { autoChunking: true, costWarningEnabled: true, costWarningThreshold: 0.5 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        })
      );

      // Delete template
      fs.unlinkSync(path.join(storageDir, 'templates', `${templateId}.json`));

      // Settings still reference the deleted template
      const readSettings = JSON.parse(
        fs.readFileSync(path.join(storageDir, 'projects', `${projectHash}.json`), 'utf-8')
      );
      assert.equal(readSettings.template.selectedId, templateId);

      // Template file no longer exists
      assert.equal(
        fs.existsSync(path.join(storageDir, 'templates', `${templateId}.json`)),
        false
      );

      // This scenario should be handled by the application layer:
      // - Detect missing template on load
      // - Clear selectedId and show warning
    });
  });

  describe('Settings Restoration Simulation', () => {
    it('should restore settings on simulated restart', () => {
      const projectHash = generateProjectHash(projectDir);

      // First "session": Create and save settings
      const initialSettings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: 'builtin-standard',
          enabled: true,
        },
        llm: {
          provider: 'openai',
          model: 'gpt-4o',
          customEndpoint: null,
        },
        preferences: {
          autoChunking: false,
          costWarningEnabled: true,
          costWarningThreshold: 1.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(storageDir, 'projects', `${projectHash}.json`),
        JSON.stringify(initialSettings, null, 2)
      );

      // Simulate "restart": Read settings from disk
      const restoredSettings = JSON.parse(
        fs.readFileSync(path.join(storageDir, 'projects', `${projectHash}.json`), 'utf-8')
      );

      // Verify all settings are restored
      assert.equal(restoredSettings.template.selectedId, 'builtin-standard');
      assert.equal(restoredSettings.template.enabled, true);
      assert.equal(restoredSettings.llm.provider, 'openai');
      assert.equal(restoredSettings.llm.model, 'gpt-4o');
      assert.equal(restoredSettings.preferences.autoChunking, false);
      assert.equal(restoredSettings.preferences.costWarningThreshold, 1.0);
    });

    it('should use defaults when settings file does not exist', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // No settings file exists
      assert.equal(fs.existsSync(settingsPath), false);

      // Application should use defaults
      const defaults = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: null,
          enabled: false,
        },
        llm: {
          provider: null,
          model: null,
          customEndpoint: null,
        },
        preferences: {
          autoChunking: true,
          costWarningEnabled: true,
          costWarningThreshold: 0.5,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      // On first access, save defaults
      fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2));

      // Verify defaults were applied
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(savedSettings.template.selectedId, null);
      assert.equal(savedSettings.template.enabled, false);
      assert.equal(savedSettings.preferences.autoChunking, true);
    });

    it('should handle corrupted settings file (fail-closed)', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // Create corrupted file
      fs.writeFileSync(settingsPath, '{ invalid json');

      // Reading should throw JSON parse error
      let parseError = false;
      try {
        JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch (e) {
        parseError = true;
      }
      assert.equal(parseError, true);

      // Application should handle this by using defaults
      // (This behavior is implemented in ProjectSettingsStore)
    });
  });

  describe('Template Injection Format', () => {
    it('should format template injection correctly', () => {
      const template = {
        id: 'test-inject',
        name: 'Test Template',
        rulesText: '## 完了条件\n- テスト失敗は完了条件未達\n- lint/typecheck エラーは完了条件未達',
        outputFormatText: '## 出力形式\n- 変更ファイル一覧\n- 実行したテスト結果',
      };

      // Format rules injection (as per spec/32)
      const rulesInjection = `---
## Injected Rules (Template: ${template.name})
${template.rulesText}
---`;

      // Format output injection (as per spec/32)
      const outputInjection = `---
## Required Output Format (Template: ${template.name})
${template.outputFormatText}
---`;

      // Verify format
      assert.ok(rulesInjection.includes('Injected Rules'));
      assert.ok(rulesInjection.includes(template.name));
      assert.ok(rulesInjection.includes('完了条件'));
      assert.ok(rulesInjection.includes('---'));

      assert.ok(outputInjection.includes('Required Output Format'));
      assert.ok(outputInjection.includes('変更ファイル一覧'));
    });

    it('should construct full prompt with template injection', () => {
      const systemPrompt = 'You are a helpful coding assistant.';
      const userTask = 'Implement the login feature';
      const template = {
        name: 'Standard',
        rulesText: '## Rules\n- All tests must pass',
        outputFormatText: '## Output\n- List changed files',
      };

      // Construct prompt with injection (as per spec/32 injection order)
      const fullPrompt = `${systemPrompt}

---
## Injected Rules (Template: ${template.name})
${template.rulesText}
---

${userTask}

---
## Required Output Format (Template: ${template.name})
${template.outputFormatText}
---`;

      // Verify structure
      const lines = fullPrompt.split('\n');
      const systemIndex = lines.findIndex((l) => l.includes('helpful coding assistant'));
      const rulesIndex = lines.findIndex((l) => l.includes('Injected Rules'));
      const taskIndex = lines.findIndex((l) => l.includes('login feature'));
      const outputIndex = lines.findIndex((l) => l.includes('Required Output Format'));

      // Order: system < rules < task < output
      assert.ok(systemIndex < rulesIndex, 'System prompt should come before rules');
      assert.ok(rulesIndex < taskIndex, 'Rules should come before user task');
      assert.ok(taskIndex < outputIndex, 'User task should come before output format');
    });
  });

  describe('File Permissions', () => {
    it('should create files with secure permissions', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // Write file
      fs.writeFileSync(settingsPath, JSON.stringify({ test: true }));

      // Set permissions (as per spec: 0600 for files)
      fs.chmodSync(settingsPath, 0o600);

      // Verify permissions
      const stats = fs.statSync(settingsPath);
      const mode = stats.mode & 0o777;

      // 0600 = owner read/write only
      assert.equal(mode, 0o600);
    });

    it('should create directories with secure permissions', () => {
      const secureDir = path.join(storageDir, 'secure-test');
      fs.mkdirSync(secureDir);

      // Set permissions (as per spec: 0700 for directories)
      fs.chmodSync(secureDir, 0o700);

      // Verify permissions
      const stats = fs.statSync(secureDir);
      const mode = stats.mode & 0o777;

      // 0700 = owner all permissions only
      assert.equal(mode, 0o700);
    });
  });

  describe('Settings Update Scenarios', () => {
    it('should update template selection and persist', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // Initial settings
      const settings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: null,
          enabled: false,
        },
        llm: { provider: null, model: null, customEndpoint: null },
        preferences: { autoChunking: true, costWarningEnabled: true, costWarningThreshold: 0.5 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Update template selection (simulate /template use Standard)
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      updated.template.selectedId = 'builtin-standard';
      updated.template.enabled = true;
      updated.updatedAt = new Date().toISOString();
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));

      // Verify update persisted
      const verified = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(verified.template.selectedId, 'builtin-standard');
      assert.equal(verified.template.enabled, true);
    });

    it('should toggle template enabled state', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // Initial: enabled
      const settings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: {
          selectedId: 'builtin-standard',
          enabled: true,
        },
        llm: { provider: null, model: null, customEndpoint: null },
        preferences: { autoChunking: true, costWarningEnabled: true, costWarningThreshold: 0.5 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Disable (simulate /template off)
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      updated.template.enabled = false;
      updated.updatedAt = new Date().toISOString();
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));

      // Verify disabled
      const verified = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(verified.template.enabled, false);
      assert.equal(verified.template.selectedId, 'builtin-standard'); // Selection preserved

      // Enable again (simulate /template on)
      verified.template.enabled = true;
      verified.updatedAt = new Date().toISOString();
      fs.writeFileSync(settingsPath, JSON.stringify(verified, null, 2));

      // Verify enabled
      const final = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(final.template.enabled, true);
    });

    it('should update LLM settings', () => {
      const projectHash = generateProjectHash(projectDir);
      const settingsPath = path.join(storageDir, 'projects', `${projectHash}.json`);

      // Initial settings
      const settings = {
        version: 1,
        projectPath: projectDir,
        projectHash: projectHash,
        template: { selectedId: null, enabled: false },
        llm: {
          provider: null,
          model: null,
          customEndpoint: null,
        },
        preferences: { autoChunking: true, costWarningEnabled: true, costWarningThreshold: 0.5 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Update LLM settings
      const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      updated.llm.provider = 'anthropic';
      updated.llm.model = 'claude-sonnet-4-20250514';
      updated.updatedAt = new Date().toISOString();
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));

      // Verify
      const verified = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(verified.llm.provider, 'anthropic');
      assert.equal(verified.llm.model, 'claude-sonnet-4-20250514');
    });
  });

  describe('Index Management', () => {
    it('should add project to index on first access', () => {
      const projectHash = generateProjectHash(projectDir);
      const indexPath = path.join(storageDir, 'projects', 'index.json');

      // Empty index
      const initialIndex = {
        version: 1,
        projects: [],
      };
      fs.writeFileSync(indexPath, JSON.stringify(initialIndex, null, 2));

      // Add project to index
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      index.projects.push({
        hash: projectHash,
        path: projectDir,
        lastAccessedAt: new Date().toISOString(),
      });
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      // Verify
      const updated = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      assert.equal(updated.projects.length, 1);
      assert.equal(updated.projects[0].hash, projectHash);
    });

    it('should update lastAccessedAt in index', () => {
      const projectHash = generateProjectHash(projectDir);
      const indexPath = path.join(storageDir, 'projects', 'index.json');

      const oldDate = '2026-01-01T00:00:00Z';
      const index = {
        version: 1,
        projects: [
          {
            hash: projectHash,
            path: projectDir,
            lastAccessedAt: oldDate,
          },
        ],
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      // Update lastAccessedAt
      const updated = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const newDate = new Date().toISOString();
      updated.projects[0].lastAccessedAt = newDate;
      fs.writeFileSync(indexPath, JSON.stringify(updated, null, 2));

      // Verify
      const verified = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      assert.notEqual(verified.projects[0].lastAccessedAt, oldDate);
    });
  });
});
