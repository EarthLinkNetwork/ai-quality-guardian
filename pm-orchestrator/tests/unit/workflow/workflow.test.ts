/**
 * Unit Tests for Workflow Features
 */

import { WorkflowLoader } from '../../../src/workflow/workflow-loader';
import { ConditionEvaluator } from '../../../src/workflow/condition-evaluator';
import { SubagentResult } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkflowLoader', () => {
  let loader: WorkflowLoader;

  beforeEach(() => {
    loader = new WorkflowLoader();
  });

  describe('loadDefault', () => {
    it('should load default workflows', () => {
      const config = loader.loadDefault();

      expect(config.workflows).toBeDefined();
      expect(config.workflows.length).toBeGreaterThan(0);
      expect(config.defaults).toBeDefined();
    });

    it('should have all required workflow fields', () => {
      const config = loader.loadDefault();

      for (const workflow of config.workflows) {
        expect(workflow.name).toBeDefined();
        expect(workflow.pattern).toBeDefined();
        expect(workflow.steps).toBeDefined();
        expect(workflow.steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('findMatchingWorkflow', () => {
    it('should find PR review workflow', () => {
      loader.loadDefault();
      const workflow = loader.findMatchingWorkflow('Resolve PR review comments');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('PR Review Response');
    });

    it('should find version update workflow', () => {
      loader.loadDefault();
      const workflow = loader.findMatchingWorkflow('バージョン更新してください');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Version Update');
    });

    it('should find quality check workflow', () => {
      loader.loadDefault();
      const workflow = loader.findMatchingWorkflow('Run lint and test');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Quality Check');
    });

    it('should return null for no match', () => {
      loader.loadDefault();
      const workflow = loader.findMatchingWorkflow('Random task with no pattern');

      expect(workflow).toBeNull();
    });
  });

  describe('loadFromFile', () => {
    const testConfigPath = path.join(__dirname, 'test-workflow.yaml');

    afterEach(() => {
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
    });

    it('should load YAML config file', async () => {
      const yamlContent = `
workflows:
  - name: "Test Workflow"
    pattern: "test"
    steps:
      - agent: "implementer"
defaults:
  timeout: 1000
`;
      fs.writeFileSync(testConfigPath, yamlContent);

      const config = await loader.loadFromFile(testConfigPath);

      expect(config.workflows).toHaveLength(1);
      expect(config.workflows[0].name).toBe('Test Workflow');
      expect(config.defaults?.timeout).toBe(1000);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        loader.loadFromFile('/nonexistent/file.yaml')
      ).rejects.toThrow('not found');
    });

    it('should throw error for invalid format', async () => {
      const invalidPath = path.join(__dirname, 'test.txt');
      fs.writeFileSync(invalidPath, 'test');

      await expect(
        loader.loadFromFile(invalidPath)
      ).rejects.toThrow('Unsupported file format');

      fs.unlinkSync(invalidPath);
    });
  });

  describe('validateConfig', () => {
    it('should validate workflow with all required fields', () => {
      const config = loader.loadDefault();
      // Should not throw
      expect(config).toBeDefined();
    });

    it('should reject workflow without name', async () => {
      const invalidConfig = `
workflows:
  - pattern: "test"
    steps:
      - agent: "implementer"
`;
      const testPath = path.join(__dirname, 'invalid.yaml');
      fs.writeFileSync(testPath, invalidConfig);

      await expect(
        loader.loadFromFile(testPath)
      ).rejects.toThrow('must have a name');

      fs.unlinkSync(testPath);
    });

    it('should reject workflow with invalid agent', async () => {
      const invalidConfig = `
workflows:
  - name: "Test"
    pattern: "test"
    steps:
      - agent: "invalid-agent"
`;
      const testPath = path.join(__dirname, 'invalid.yaml');
      fs.writeFileSync(testPath, invalidConfig);

      await expect(
        loader.loadFromFile(testPath)
      ).rejects.toThrow('Invalid agent');

      fs.unlinkSync(testPath);
    });
  });
});

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;
  let context: Map<string, SubagentResult>;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
    context = new Map();

    // Setup test context
    context.set('implementer', {
      name: 'implementer',
      status: 'success',
      duration: 1000,
      output: {
        status: 'success',
        filesModified: ['file1.ts', 'file2.ts']
      }
    });

    context.set('qa', {
      name: 'qa',
      status: 'success',
      duration: 2000,
      output: {
        status: 'success',
        qualityScore: 85,
        findings: []
      }
    });
  });

  describe('evaluate', () => {
    it('should evaluate status equality', () => {
      const result = evaluator.evaluate("implementer.status == 'success'", context);
      expect(result).toBe(true);
    });

    it('should evaluate status inequality', () => {
      const result = evaluator.evaluate("implementer.status == 'error'", context);
      expect(result).toBe(false);
    });

    it('should evaluate numeric comparison', () => {
      const result = evaluator.evaluate('qa.output.qualityScore > 80', context);
      expect(result).toBe(true);
    });

    it('should evaluate array length', () => {
      const result = evaluator.evaluate('qa.output.findings.length == 0', context);
      expect(result).toBe(true);
    });

    it('should handle missing values', () => {
      const result = evaluator.evaluate('nonexistent.field == 1', context);
      expect(result).toBe(false);
    });

    it('should handle boolean expressions', () => {
      const result = evaluator.evaluate("implementer.status == 'success'", context);
      expect(result).toBe(true);
    });
  });

  describe('evaluateAll', () => {
    it('should return true when all conditions are true', () => {
      const conditions = [
        "implementer.status == 'success'",
        'qa.output.qualityScore > 80'
      ];

      const result = evaluator.evaluateAll(conditions, context);
      expect(result).toBe(true);
    });

    it('should return false when any condition is false', () => {
      const conditions = [
        "implementer.status == 'success'",
        'qa.output.qualityScore > 90' // False
      ];

      const result = evaluator.evaluateAll(conditions, context);
      expect(result).toBe(false);
    });
  });

  describe('evaluateAny', () => {
    it('should return true when at least one condition is true', () => {
      const conditions = [
        "implementer.status == 'error'", // False
        'qa.output.qualityScore > 80' // True
      ];

      const result = evaluator.evaluateAny(conditions, context);
      expect(result).toBe(true);
    });

    it('should return false when all conditions are false', () => {
      const conditions = [
        "implementer.status == 'error'",
        'qa.output.qualityScore > 90'
      ];

      const result = evaluator.evaluateAny(conditions, context);
      expect(result).toBe(false);
    });
  });
});
