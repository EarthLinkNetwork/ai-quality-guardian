/**
 * Integration Tests for Subagent Coordination
 *
 * サブエージェント間の連携をテストします。
 */

import { ContextStore } from '../../src/context/context-store';
import { FileCache } from '../../src/context/file-cache';
import { PermissionChecker } from '../../src/security/permission-checker';
import { WorkflowLoader } from '../../src/workflow/workflow-loader';
import { ConditionEvaluator } from '../../src/workflow/condition-evaluator';
import { SubagentResult } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Subagent Coordination Integration Tests', () => {
  let contextStore: ContextStore;
  let fileCache: FileCache;
  let permissionChecker: PermissionChecker;
  let workflowLoader: WorkflowLoader;
  let conditionEvaluator: ConditionEvaluator;

  beforeEach(() => {
    contextStore = new ContextStore();
    fileCache = new FileCache();
    permissionChecker = new PermissionChecker();
    workflowLoader = new WorkflowLoader();
    conditionEvaluator = new ConditionEvaluator();

    // Setup agent roles
    permissionChecker.assignRole('pm-orchestrator', 'admin');
    permissionChecker.assignRole('rule-checker', 'quality-checker');
    permissionChecker.assignRole('implementer', 'implementer');
    permissionChecker.assignRole('qa', 'quality-checker');
    permissionChecker.assignRole('reporter', 'readonly');
  });

  describe('Sequential Agent Execution', () => {
    it('should execute agents in sequence with context sharing', () => {
      // Step 1: PM Orchestrator analyzes task
      const pmResult: SubagentResult = {
        name: 'pm-orchestrator',
        status: 'success',
        duration: 100,
        output: {
          taskType: 'pr-review',
          requiredAgents: ['rule-checker', 'implementer', 'qa', 'reporter']
        }
      };

      contextStore.set('pm:task-analysis', pmResult.output, 'pm-orchestrator');

      // Verify PM can write context
      const canWrite = permissionChecker.checkAccess({
        agentName: 'pm-orchestrator',
        resource: 'context:pm:task-analysis',
        action: 'write'
      });
      expect(canWrite).toBe(true);

      // Step 2: Rule Checker validates rules
      const pmAnalysis = contextStore.get('pm:task-analysis');
      expect(pmAnalysis).toBeDefined();

      const ruleCheckerResult: SubagentResult = {
        name: 'rule-checker',
        status: 'success',
        duration: 150,
        output: {
          violations: [],
          warnings: ['Consider adding tests'],
          approved: true
        }
      };

      contextStore.set('rule-checker:result', ruleCheckerResult.output, 'rule-checker');

      // Step 3: Implementer executes implementation
      const ruleCheckResult = contextStore.get('rule-checker:result');
      expect(ruleCheckResult).toBeDefined();
      expect((ruleCheckResult as any).approved).toBe(true);

      const implementerResult: SubagentResult = {
        name: 'implementer',
        status: 'success',
        duration: 500,
        output: {
          filesModified: ['src/index.ts', 'src/utils.ts'],
          testsAdded: ['tests/index.test.ts']
        }
      };

      contextStore.set('implementer:result', implementerResult.output, 'implementer');

      // Step 4: QA validates implementation
      const implResult = contextStore.get('implementer:result');
      expect(implResult).toBeDefined();

      const qaResult: SubagentResult = {
        name: 'qa',
        status: 'success',
        duration: 300,
        output: {
          lintPassed: true,
          testsPassed: true,
          coverage: 85,
          qualityScore: 90
        }
      };

      contextStore.set('qa:result', qaResult.output, 'qa');

      // Step 5: Reporter generates final report
      const allResults = new Map<string, SubagentResult>([
        ['pm-orchestrator', pmResult],
        ['rule-checker', ruleCheckerResult],
        ['implementer', implementerResult],
        ['qa', qaResult]
      ]);

      const reporterCanRead = permissionChecker.checkAccess({
        agentName: 'reporter',
        resource: 'context:qa:result',
        action: 'read'
      });
      expect(reporterCanRead).toBe(true);

      // Verify all context data is accessible
      expect(contextStore.get('pm:task-analysis')).toBeDefined();
      expect(contextStore.get('rule-checker:result')).toBeDefined();
      expect(contextStore.get('implementer:result')).toBeDefined();
      expect(contextStore.get('qa:result')).toBeDefined();
    });
  });

  describe('Conditional Workflow Execution', () => {
    it('should execute conditional steps based on previous results', () => {
      workflowLoader.loadDefault();

      // Simulate rule-checker failure
      const ruleCheckerResult: SubagentResult = {
        name: 'rule-checker',
        status: 'error',
        duration: 100,
        output: {
          violations: ['MUST Rule 1 violated'],
          approved: false
        },
        error: 'Rule violations detected'
      };

      contextStore.set('rule-checker:result', ruleCheckerResult.output, 'rule-checker');

      const context = new Map<string, SubagentResult>([
        ['rule-checker', ruleCheckerResult]
      ]);

      // Should not proceed to implementer if rule-checker failed
      const shouldProceed = conditionEvaluator.evaluate(
        "rule-checker.status == 'success'",
        context
      );

      expect(shouldProceed).toBe(false);

      // Simulate rule-checker success
      const successResult: SubagentResult = {
        name: 'rule-checker',
        status: 'success',
        duration: 100,
        output: {
          violations: [],
          approved: true
        }
      };

      const successContext = new Map<string, SubagentResult>([
        ['rule-checker', successResult]
      ]);

      const shouldProceedNow = conditionEvaluator.evaluate(
        "rule-checker.status == 'success'",
        successContext
      );

      expect(shouldProceedNow).toBe(true);
    });

    it('should skip QA if implementer failed', () => {
      const implementerResult: SubagentResult = {
        name: 'implementer',
        status: 'error',
        duration: 200,
        output: {},
        error: 'Implementation failed'
      };

      const context = new Map<string, SubagentResult>([
        ['implementer', implementerResult]
      ]);

      // QA step has condition: implementer.status == 'success'
      const shouldRunQA = conditionEvaluator.evaluate(
        "implementer.status == 'success'",
        context
      );

      expect(shouldRunQA).toBe(false);
    });

    it('should execute based on quality score threshold', () => {
      const qaResult: SubagentResult = {
        name: 'qa',
        status: 'success',
        duration: 300,
        output: {
          qualityScore: 95
        }
      };

      const context = new Map<string, SubagentResult>([
        ['qa', qaResult]
      ]);

      // Deploy only if quality score > 90
      const shouldDeploy = conditionEvaluator.evaluate(
        'qa.output.qualityScore > 90',
        context
      );

      expect(shouldDeploy).toBe(true);
    });
  });

  describe('File Cache Coordination', () => {
    const testDir = path.join(__dirname, 'test-cache');
    const testFile = path.join(testDir, 'shared.txt');

    beforeEach(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should share file cache between agents', () => {
      fs.writeFileSync(testFile, 'Original content');

      // Agent 1 reads and caches
      const content1 = fileCache.get(testFile);
      expect(content1).toBe('Original content');

      // Agent 2 reads from cache (no file I/O)
      const content2 = fileCache.get(testFile);
      expect(content2).toBe('Original content');
      expect(fileCache.size()).toBe(1);

      // Agent 3 modifies file
      fs.writeFileSync(testFile, 'Modified content');

      // Agent 4 reads and detects change
      const content3 = fileCache.get(testFile);
      expect(content3).toBe('Modified content');
    });

    it('should handle concurrent file access', () => {
      fs.writeFileSync(testFile, 'Shared content');

      // Multiple agents read simultaneously
      const results = [
        fileCache.get(testFile),
        fileCache.get(testFile),
        fileCache.get(testFile)
      ];

      // All should get same content
      expect(results.every(r => r === 'Shared content')).toBe(true);

      // Only one cache entry
      expect(fileCache.size()).toBe(1);
    });
  });

  describe('Permission-based Coordination', () => {
    it('should enforce permissions across agent interactions', () => {
      // Implementer can write to src/
      const implementerWrite = permissionChecker.checkAccess({
        agentName: 'implementer',
        resource: 'src/new-feature.ts',
        action: 'write'
      });
      expect(implementerWrite).toBe(true);

      // QA can only read src/
      const qaWrite = permissionChecker.checkAccess({
        agentName: 'qa',
        resource: 'src/new-feature.ts',
        action: 'write'
      });
      expect(qaWrite).toBe(false);

      const qaRead = permissionChecker.checkAccess({
        agentName: 'qa',
        resource: 'src/new-feature.ts',
        action: 'read'
      });
      expect(qaRead).toBe(true);

      // Reporter can only read
      const reporterRead = permissionChecker.checkAccess({
        agentName: 'reporter',
        resource: 'src/new-feature.ts',
        action: 'read'
      });
      expect(reporterRead).toBe(true);

      const reporterWrite = permissionChecker.checkAccess({
        agentName: 'reporter',
        resource: 'src/new-feature.ts',
        action: 'write'
      });
      expect(reporterWrite).toBe(false);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors through agent chain', () => {
      const results = new Map<string, SubagentResult>();

      // Step 1: Rule checker fails
      results.set('rule-checker', {
        name: 'rule-checker',
        status: 'error',
        duration: 100,
        output: {},
        error: 'Critical rule violation'
      });

      // Step 2: Check if should proceed
      const shouldContinue = conditionEvaluator.evaluate(
        "rule-checker.status == 'success'",
        results
      );

      expect(shouldContinue).toBe(false);

      // Agent chain should stop here
      // No implementer, qa, or reporter execution
    });

    it('should allow recovery after error', () => {
      const results = new Map<string, SubagentResult>();

      // Initial failure
      results.set('implementer', {
        name: 'implementer',
        status: 'error',
        duration: 200,
        output: {},
        error: 'Build failed'
      });

      // After fix, retry
      results.set('implementer', {
        name: 'implementer',
        status: 'success',
        duration: 250,
        output: {
          filesModified: ['src/fixed.ts']
        }
      });

      const canProceedToQA = conditionEvaluator.evaluate(
        "implementer.status == 'success'",
        results
      );

      expect(canProceedToQA).toBe(true);
    });
  });

  describe('Context Cleanup', () => {
    it('should cleanup expired contexts', async () => {
      // Create contexts with short TTL
      contextStore.set('temp:1', { data: 'value1' }, 'agent-1', 100);
      contextStore.set('temp:2', { data: 'value2' }, 'agent-2', 100);
      contextStore.set('permanent', { data: 'value3' }, 'agent-3');

      expect(contextStore.size()).toBe(3);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Cleanup expired
      const removed = contextStore.cleanup();
      expect(removed).toBe(2);
      expect(contextStore.size()).toBe(1);

      // Permanent context still exists
      expect(contextStore.get('permanent')).toBeDefined();
    });

    it('should cleanup namespace after workflow completion', () => {
      // Create workflow-specific contexts
      contextStore.set('workflow:task1', { step: 1 }, 'pm');
      contextStore.set('workflow:task2', { step: 2 }, 'pm');
      contextStore.set('workflow:task3', { step: 3 }, 'pm');
      contextStore.set('global:config', { setting: 'value' }, 'pm');

      expect(contextStore.size()).toBe(4);

      // Cleanup workflow namespace
      const removed = contextStore.clearNamespace('workflow');
      expect(removed).toBe(3);

      // Global context still exists
      expect(contextStore.get('global:config')).toBeDefined();
    });
  });
});
