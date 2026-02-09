/**
 * E2E Test: Supervisor Template System
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md E2E-1
 *
 * Tests SUP-2: Input template composition order (GLOBAL → PROJECT → USER)
 * Tests SUP-3: Output template enforcement
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
  mergePromptWithMarkers,
  applyOutputTemplate,
  applyOutputTemplateWithMarkers,
  extractComponents,
  TEMPLATE_MARKERS,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROJECT_CONFIG,
} from '../../src/supervisor/index';

describe('E2E: Supervisor Template System (SUP-2, SUP-3)', () => {
  let testDir: string;

  before(() => {
    // Create temp directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-template-test-'));

    // Create .claude directory structure
    const claudeDir = path.join(testDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(path.join(claudeDir, 'projects'), { recursive: true });

    // Reset supervisor singleton
    resetSupervisor();
  });

  after(() => {
    // Cleanup
    resetSupervisor();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('SUP-2: Input Template Composition', () => {
    it('should compose prompts in correct order: GLOBAL → PROJECT → USER', () => {
      const globalTemplate = 'You are a helpful assistant.';
      const projectTemplate = 'Focus on TypeScript code.';
      const userPrompt = 'Write a function to add two numbers.';

      const composed = mergePrompt(globalTemplate, projectTemplate, userPrompt);

      // Verify order
      assert.ok(composed.composed.includes(globalTemplate), 'Should include global template');
      assert.ok(composed.composed.includes(projectTemplate), 'Should include project template');
      assert.ok(composed.composed.includes(userPrompt), 'Should include user prompt');

      // Verify order is correct (global comes before project, project before user)
      const globalIndex = composed.composed.indexOf(globalTemplate);
      const projectIndex = composed.composed.indexOf(projectTemplate);
      const userIndex = composed.composed.indexOf(userPrompt);

      assert.ok(globalIndex < projectIndex, 'Global should come before project');
      assert.ok(projectIndex < userIndex, 'Project should come before user');
    });

    it('should compose with markers for debugging', () => {
      const globalTemplate = 'Global rules here.';
      const projectTemplate = 'Project rules here.';
      const userPrompt = 'User request here.';

      const composed = mergePromptWithMarkers(globalTemplate, projectTemplate, userPrompt);

      // Verify markers are present
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.GLOBAL_START), 'Should include GLOBAL_START marker');
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.GLOBAL_END), 'Should include GLOBAL_END marker');
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.PROJECT_START), 'Should include PROJECT_START marker');
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.PROJECT_END), 'Should include PROJECT_END marker');
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.USER_START), 'Should include USER_START marker');
      assert.ok(composed.composed.includes(TEMPLATE_MARKERS.USER_END), 'Should include USER_END marker');
    });

    it('should extract components from marked prompt', () => {
      const globalTemplate = 'Global template content';
      const projectTemplate = 'Project template content';
      const userPrompt = 'User prompt content';

      const composed = mergePromptWithMarkers(globalTemplate, projectTemplate, userPrompt);
      const extracted = extractComponents(composed.composed);

      assert.equal(extracted.globalTemplate, globalTemplate);
      assert.equal(extracted.projectTemplate, projectTemplate);
      assert.equal(extracted.userPrompt, userPrompt);
    });

    it('should handle empty templates gracefully', () => {
      const userPrompt = 'Just a user prompt.';

      const composed = mergePrompt('', '', userPrompt);

      assert.equal(composed.composed, userPrompt);
      assert.equal(composed.globalTemplate, '');
      assert.equal(composed.projectTemplate, '');
    });

    it('should preserve immutability of user prompt', () => {
      const globalTemplate = 'Global.';
      const projectTemplate = 'Project.';
      const userPrompt = 'User input that should not be modified.';

      const composed = mergePrompt(globalTemplate, projectTemplate, userPrompt);

      assert.equal(composed.userPrompt, userPrompt);
      assert.ok(composed.composed.includes(userPrompt), 'Composed should include user prompt');
    });
  });

  describe('SUP-3: Output Template Enforcement', () => {
    it('should apply output template with placeholder', () => {
      const rawOutput = 'This is the raw LLM output.';
      const template = 'Response:\n{{OUTPUT}}\n---';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.equal(formatted.raw, rawOutput);
      assert.equal(formatted.formatted, 'Response:\nThis is the raw LLM output.\n---');
      assert.equal(formatted.templateApplied, true);
    });

    it('should append output when no placeholder exists', () => {
      const rawOutput = 'LLM response text.';
      const template = 'Header:';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Header:'), 'Should include header');
      assert.ok(formatted.formatted.includes(rawOutput), 'Should include raw output');
      assert.equal(formatted.templateApplied, true);
    });

    it('should pass through when no template', () => {
      const rawOutput = 'Raw output without template.';

      const formatted = applyOutputTemplate(rawOutput, '');

      assert.equal(formatted.raw, rawOutput);
      assert.equal(formatted.formatted, rawOutput);
      assert.equal(formatted.templateApplied, false);
    });

    it('should apply template with markers for debugging', () => {
      const rawOutput = 'Output content';
      const template = 'Formatted: {{OUTPUT}}';

      const formatted = applyOutputTemplateWithMarkers(rawOutput, template);

      assert.ok(formatted.formatted.includes(TEMPLATE_MARKERS.OUTPUT_START), 'Should include OUTPUT_START marker');
      assert.ok(formatted.formatted.includes(TEMPLATE_MARKERS.OUTPUT_END), 'Should include OUTPUT_END marker');
    });
  });

  describe('Supervisor Integration', () => {
    it('should compose prompt through Supervisor', () => {
      const supervisor = getSupervisor(testDir);
      const userPrompt = 'Create a test file.';

      const composed = supervisor.compose(userPrompt, 'test-project');

      assert.equal(composed.userPrompt, userPrompt);
      assert.ok(composed.composed.includes(userPrompt), 'Composed should include user prompt');
    });

    it('should get merged config for project', () => {
      const supervisor = getSupervisor(testDir);
      const config = supervisor.getConfig('test-project');

      // Should have defaults
      assert.equal(typeof config.supervisorEnabled, 'boolean');
      assert.equal(typeof config.timeoutMs, 'number');
      assert.equal(typeof config.maxRetries, 'number');
    });

    it('should format output through Supervisor', () => {
      const supervisor = getSupervisor(testDir);
      const rawOutput = 'Test output content.';

      const formatted = supervisor.format(rawOutput, 'test-project');

      assert.equal(formatted.raw, rawOutput);
      assert.equal(typeof formatted.formatted, 'string');
    });
  });

  describe('Default Configurations', () => {
    it('should have valid default global config', () => {
      assert.ok('global_input_template' in DEFAULT_GLOBAL_CONFIG, 'Should have global_input_template');
      assert.ok('global_output_template' in DEFAULT_GLOBAL_CONFIG, 'Should have global_output_template');
      assert.ok('supervisor_rules' in DEFAULT_GLOBAL_CONFIG, 'Should have supervisor_rules');
      assert.ok('enabled' in DEFAULT_GLOBAL_CONFIG.supervisor_rules, 'Should have enabled');
      assert.ok('timeout_default_ms' in DEFAULT_GLOBAL_CONFIG.supervisor_rules, 'Should have timeout_default_ms');
    });

    it('should have valid default project config', () => {
      assert.ok('input_template' in DEFAULT_PROJECT_CONFIG, 'Should have input_template');
      assert.ok('output_template' in DEFAULT_PROJECT_CONFIG, 'Should have output_template');
      assert.ok('supervisor_rules' in DEFAULT_PROJECT_CONFIG, 'Should have supervisor_rules');
      assert.ok('timeout_profile' in DEFAULT_PROJECT_CONFIG.supervisor_rules, 'Should have timeout_profile');
    });
  });
});
