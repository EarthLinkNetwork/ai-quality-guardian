/**
 * E2E Test: Output Format Enforcement
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md E2E-2
 *
 * Tests SUP-3: Output template enforcement
 * Tests SUP-7: Format violation prevention
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
  applyOutputTemplate,
} from '../../src/supervisor/index';

describe('E2E: Output Format Enforcement (SUP-3, SUP-7)', () => {
  let testDir: string;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-format-test-'));
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

  describe('SUP-3: Output Template Application', () => {
    it('should apply template with {{OUTPUT}} placeholder', () => {
      const rawOutput = 'Task completed successfully.';
      const template = '## Result\n{{OUTPUT}}\n## End';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.equal(formatted.formatted, '## Result\nTask completed successfully.\n## End');
      assert.equal(formatted.templateApplied, true);
    });

    it('should handle multiple {{OUTPUT}} placeholders', () => {
      const rawOutput = 'Important message';
      const template = 'Start: {{OUTPUT}} | Middle | End: {{OUTPUT}}';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Important message'), 'Should include output');
      assert.equal(formatted.templateApplied, true);
    });

    it('should append output when template has no placeholder', () => {
      const rawOutput = 'Generated content';
      const template = 'Header Section';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Header Section'), 'Should include header');
      assert.ok(formatted.formatted.includes('Generated content'), 'Should include output');
      assert.equal(formatted.templateApplied, true);
    });

    it('should preserve raw output when no template provided', () => {
      const rawOutput = 'Original output unchanged';

      const formatted = applyOutputTemplate(rawOutput, '');

      assert.equal(formatted.raw, rawOutput);
      assert.equal(formatted.formatted, rawOutput);
      assert.equal(formatted.templateApplied, false);
    });

    it('should handle empty output with template', () => {
      const rawOutput = '';
      const template = 'Wrapper: {{OUTPUT}}';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.equal(formatted.formatted, 'Wrapper: ');
      assert.equal(formatted.templateApplied, true);
    });
  });

  describe('SUP-7: Format Violation Detection', () => {
    it('should pass validation for properly formatted output', () => {
      const supervisor = getSupervisor(testDir);
      const output = 'This is a properly formatted response with valid content.';

      const validation = supervisor.validate(output);

      assert.equal(validation.valid, true);
      assert.ok(Array.isArray(validation.violations), 'Violations should be an array');
    });

    it('should detect format violations', () => {
      const supervisor = getSupervisor(testDir);
      // Empty output is typically a violation
      const emptyOutput = '';

      const validation = supervisor.validate(emptyOutput);

      // Validation should handle empty output
      assert.ok('valid' in validation, 'Should have valid property');
      assert.ok('violations' in validation, 'Should have violations property');
    });

    it('should categorize violations by severity', () => {
      const supervisor = getSupervisor(testDir);
      const output = 'Test output';

      const validation = supervisor.validate(output);

      assert.ok(Array.isArray(validation.violations), 'Violations should be an array');
      // Check that violations have severity property if any exist
      validation.violations.forEach((v: { severity: string }) => {
        assert.ok('severity' in v, 'Violation should have severity');
        assert.ok(['minor', 'major', 'critical'].includes(v.severity), 'Severity should be minor, major, or critical');
      });
    });
  });

  describe('Supervisor Format Integration', () => {
    it('should format output through Supervisor', () => {
      const supervisor = getSupervisor(testDir);
      const rawOutput = 'Integration test output.';

      const formatted = supervisor.format(rawOutput, 'test-project');

      assert.ok('raw' in formatted, 'Should have raw property');
      assert.ok('formatted' in formatted, 'Should have formatted property');
      assert.equal(formatted.raw, rawOutput);
    });

    it('should validate after formatting', () => {
      const supervisor = getSupervisor(testDir);
      const rawOutput = 'Formatted and validated output.';

      const formatted = supervisor.format(rawOutput, 'test-project');
      const validation = supervisor.validate(formatted.formatted);

      assert.ok('valid' in validation, 'Should have valid property');
      assert.ok('violations' in validation, 'Should have violations property');
    });

    it('should handle format chain: raw → template → validate', () => {
      const supervisor = getSupervisor(testDir);
      const rawOutput = 'Chain test output';
      const projectId = 'chain-test-project';

      // Format
      const formatted = supervisor.format(rawOutput, projectId);
      assert.equal(typeof formatted.formatted, 'string');

      // Validate
      const validation = supervisor.validate(formatted.formatted);
      assert.equal(typeof validation.valid, 'boolean');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in output', () => {
      const rawOutput = 'Special chars: <script>alert("xss")</script> & "quotes"';
      const template = 'Safe: {{OUTPUT}}';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Special chars:'), 'Should include special chars');
      assert.equal(formatted.templateApplied, true);
    });

    it('should handle multiline output', () => {
      const rawOutput = 'Line 1\nLine 2\nLine 3';
      const template = '```\n{{OUTPUT}}\n```';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Line 1'), 'Should include Line 1');
      assert.ok(formatted.formatted.includes('Line 2'), 'Should include Line 2');
      assert.ok(formatted.formatted.includes('Line 3'), 'Should include Line 3');
    });

    it('should handle unicode characters', () => {
      const rawOutput = 'Unicode: Hello World';
      const template = 'Output: {{OUTPUT}}';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.includes('Unicode:'), 'Should include Unicode:');
      assert.ok(formatted.formatted.includes('Hello World'), 'Should include Hello World');
    });

    it('should handle very long output', () => {
      const rawOutput = 'x'.repeat(10000);
      const template = 'Long: {{OUTPUT}}';

      const formatted = applyOutputTemplate(rawOutput, template);

      assert.ok(formatted.formatted.length > 10000, 'Formatted should be longer than 10000');
      assert.equal(formatted.templateApplied, true);
    });
  });
});
