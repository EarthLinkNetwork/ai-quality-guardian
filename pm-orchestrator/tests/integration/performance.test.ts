/**
 * Performance Integration Tests
 *
 * システムパフォーマンスとスケーラビリティをテストします。
 */

import { ContextStore } from '../../src/context/context-store';
import { FileCache } from '../../src/context/file-cache';
import { PermissionChecker } from '../../src/security/permission-checker';
import { PatternDetector } from '../../src/orchestrator/pattern-detector';
import { WorkflowLoader } from '../../src/workflow/workflow-loader';
import { ConditionEvaluator } from '../../src/workflow/condition-evaluator';
import { SubagentResult } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Performance Integration Tests', () => {
  describe('Context Store Performance', () => {
    let contextStore: ContextStore;

    beforeEach(() => {
      contextStore = new ContextStore();
    });

    it('should handle large number of contexts', () => {
      const startTime = Date.now();
      const count = 1000;

      // Create 1000 contexts
      for (let i = 0; i < count; i++) {
        contextStore.set(`context:${i}`, { index: i, data: `value${i}` }, 'agent');
      }

      const writeTime = Date.now() - startTime;

      expect(contextStore.size()).toBe(count);
      expect(writeTime).toBeLessThan(100); // Should complete in <100ms
    });

    it('should retrieve contexts quickly', () => {
      // Setup
      for (let i = 0; i < 1000; i++) {
        contextStore.set(`context:${i}`, { index: i }, 'agent');
      }

      const startTime = Date.now();

      // Retrieve 1000 contexts
      for (let i = 0; i < 1000; i++) {
        contextStore.get(`context:${i}`);
      }

      const readTime = Date.now() - startTime;

      expect(readTime).toBeLessThan(50); // Should complete in <50ms
    });

    it('should cleanup expired contexts efficiently', async () => {
      // Create 500 expiring and 500 permanent contexts
      for (let i = 0; i < 500; i++) {
        contextStore.set(`expiring:${i}`, { data: i }, 'agent', 50);
        contextStore.set(`permanent:${i}`, { data: i }, 'agent');
      }

      expect(contextStore.size()).toBe(1000);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      const startTime = Date.now();
      const removed = contextStore.cleanup();
      const cleanupTime = Date.now() - startTime;

      expect(removed).toBe(500);
      expect(cleanupTime).toBeLessThan(20); // Should complete in <20ms
    });

    it('should handle namespace operations at scale', () => {
      // Create 100 contexts in each of 10 namespaces
      for (let ns = 0; ns < 10; ns++) {
        for (let i = 0; i < 100; i++) {
          contextStore.set(`ns${ns}:ctx${i}`, { data: i }, 'agent');
        }
      }

      const startTime = Date.now();

      // Retrieve all contexts from one namespace
      const namespace = contextStore.getNamespace('ns5');

      const retrieveTime = Date.now() - startTime;

      expect(namespace.size).toBe(100);
      expect(retrieveTime).toBeLessThan(10); // Should complete in <10ms
    });
  });

  describe('File Cache Performance', () => {
    let fileCache: FileCache;
    const testDir = path.join(__dirname, 'perf-test');

    beforeEach(() => {
      fileCache = new FileCache();

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should cache multiple files efficiently', () => {
      // Create 50 files
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(
          path.join(testDir, `file${i}.txt`),
          `Content ${i}`
        );
      }

      const startTime = Date.now();

      // Load all files
      for (let i = 0; i < 50; i++) {
        fileCache.get(path.join(testDir, `file${i}.txt`));
      }

      const loadTime = Date.now() - startTime;

      expect(fileCache.size()).toBe(50);
      expect(loadTime).toBeLessThan(200); // Should complete in <200ms
    });

    it('should benefit from caching on repeated reads', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content');

      // First read (cold cache)
      const coldStart = Date.now();
      fileCache.get(testFile);
      const coldTime = Date.now() - coldStart;

      // Second read (warm cache)
      const warmStart = Date.now();
      for (let i = 0; i < 100; i++) {
        fileCache.get(testFile);
      }
      const warmTime = Date.now() - warmStart;

      // Cache should be significantly faster
      expect(warmTime).toBeLessThan(coldTime);
      expect(warmTime).toBeLessThan(10); // 100 cached reads in <10ms
    });

    it('should detect file changes quickly', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Original');

      fileCache.get(testFile);

      // Modify file
      fs.writeFileSync(testFile, 'Modified');

      const startTime = Date.now();
      const content = fileCache.get(testFile);
      const detectTime = Date.now() - startTime;

      expect(content).toBe('Modified');
      expect(detectTime).toBeLessThan(20); // Change detection in <20ms
    });
  });

  describe('Permission Checker Performance', () => {
    let permissionChecker: PermissionChecker;

    beforeEach(() => {
      permissionChecker = new PermissionChecker();

      // Setup 10 agents with various roles
      for (let i = 0; i < 10; i++) {
        permissionChecker.assignRole(`agent-${i}`, 'developer');
      }
    });

    it('should check permissions quickly', () => {
      const startTime = Date.now();

      // Perform 1000 permission checks
      for (let i = 0; i < 1000; i++) {
        permissionChecker.checkAccess({
          agentName: `agent-${i % 10}`,
          resource: `src/file${i}.ts`,
          action: 'read'
        });
      }

      const checkTime = Date.now() - startTime;

      expect(checkTime).toBeLessThan(100); // 1000 checks in <100ms
    });

    it('should handle complex permission rules efficiently', () => {
      // Define complex role with many permissions
      permissionChecker.defineRole({
        name: 'complex-role',
        permissions: Array.from({ length: 100 }, (_, i) => ({
          resource: `resource-${i}`,
          action: 'read' as const
        }))
      });

      permissionChecker.assignRole('complex-agent', 'complex-role');

      const startTime = Date.now();

      // Check against complex role
      for (let i = 0; i < 100; i++) {
        permissionChecker.checkAccess({
          agentName: 'complex-agent',
          resource: `resource-${i}`,
          action: 'read'
        });
      }

      const checkTime = Date.now() - startTime;

      expect(checkTime).toBeLessThan(50); // Should complete in <50ms
    });
  });

  describe('Pattern Detection Performance', () => {
    let detector: PatternDetector;

    beforeEach(() => {
      detector = new PatternDetector();
    });

    it('should detect patterns quickly', () => {
      const inputs = [
        'Fix PR review comments',
        'Update version to 1.3.0',
        'Run lint and test',
        'Implement new authentication feature',
        'Create comprehensive test suite'
      ];

      const startTime = Date.now();

      // Detect patterns in 1000 inputs
      for (let i = 0; i < 1000; i++) {
        detector.detect(inputs[i % inputs.length]);
      }

      const detectTime = Date.now() - startTime;

      expect(detectTime).toBeLessThan(200); // 1000 detections in <200ms
    });

    it('should calculate complexity score quickly', () => {
      const input = 'Implement complex feature across 15 files with comprehensive tests and documentation';
      const result = detector.detect(input);

      const startTime = Date.now();

      // Calculate score 1000 times
      for (let i = 0; i < 1000; i++) {
        detector.calculateComplexityScore(input, result.matches);
      }

      const scoreTime = Date.now() - startTime;

      expect(scoreTime).toBeLessThan(50); // 1000 calculations in <50ms
    });
  });

  describe('Workflow Execution Performance', () => {
    let workflowLoader: WorkflowLoader;
    let conditionEvaluator: ConditionEvaluator;

    beforeEach(() => {
      workflowLoader = new WorkflowLoader();
      conditionEvaluator = new ConditionEvaluator();
      workflowLoader.loadDefault();
    });

    it('should find matching workflow quickly', () => {
      const inputs = [
        'Address PR review',
        'Update version',
        'Run quality checks',
        'Implement feature',
        'Fix all instances'
      ];

      const startTime = Date.now();

      // Find workflows 1000 times
      for (let i = 0; i < 1000; i++) {
        workflowLoader.findMatchingWorkflow(inputs[i % inputs.length]);
      }

      const findTime = Date.now() - startTime;

      expect(findTime).toBeLessThan(100); // 1000 searches in <100ms
    });

    it('should evaluate conditions quickly', () => {
      const context = new Map<string, SubagentResult>([
        ['implementer', {
          name: 'implementer',
          status: 'success',
          executionTime: 100,
          output: { qualityScore: 85 }
        }]
      ]);

      const startTime = Date.now();

      // Evaluate 1000 conditions
      for (let i = 0; i < 1000; i++) {
        conditionEvaluator.evaluate("implementer.status == 'success'", context);
        conditionEvaluator.evaluate('implementer.output.qualityScore > 80', context);
      }

      const evalTime = Date.now() - startTime;

      expect(evalTime).toBeLessThan(100); // 2000 evaluations in <100ms
    });
  });

  describe('Concurrent Agent Execution Performance', () => {
    it('should handle concurrent agent results', async () => {
      const contextStore = new ContextStore();

      const agents = ['pm-orchestrator', 'rule-checker', 'implementer', 'qa', 'reporter'];

      const startTime = Date.now();

      // Simulate concurrent agent execution
      const promises = agents.map(async (agentName, index) => {
        // Simulate varying execution times
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

        const result: SubagentResult = {
          name: agentName,
          status: 'success',
          executionTime: Math.random() * 500,
          output: { index }
        };

        contextStore.set(`${agentName}:result`, result.output, agentName);
        return result;
      });

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(5);
      expect(totalTime).toBeLessThan(150); // Concurrent execution in <150ms
      expect(contextStore.size()).toBe(5);
    });

    it('should handle sequential agent chain efficiently', async () => {
      const contextStore = new ContextStore();
      const results: SubagentResult[] = [];

      const agents = ['rule-checker', 'implementer', 'qa', 'reporter'];

      const startTime = Date.now();

      // Sequential execution
      for (const agentName of agents) {
        const result: SubagentResult = {
          name: agentName,
          status: 'success',
          executionTime: 50,
          output: { timestamp: Date.now() }
        };

        contextStore.set(`${agentName}:result`, result.output, agentName);
        results.push(result);

        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(4);
      expect(totalTime).toBeLessThan(100); // Sequential chain in <100ms
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain reasonable memory usage', () => {
      const contextStore = new ContextStore();

      const initialMemory = process.memoryUsage().heapUsed;

      // Create 10000 contexts
      for (let i = 0; i < 10000; i++) {
        contextStore.set(`context:${i}`, {
          index: i,
          data: `value${i}`,
          metadata: { created: new Date() }
        }, 'agent');
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(memoryIncrease).toBeLessThan(50); // <50MB for 10000 contexts
    });

    it('should cleanup memory after context expiration', async () => {
      const contextStore = new ContextStore();

      // Create 1000 expiring contexts
      for (let i = 0; i < 1000; i++) {
        contextStore.set(`expiring:${i}`, { data: i }, 'agent', 50);
      }

      const beforeCleanup = process.memoryUsage().heapUsed;

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      contextStore.cleanup();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;

      // Memory should decrease or stay similar (accounting for GC timing)
      expect(afterCleanup).toBeLessThanOrEqual(beforeCleanup * 1.1);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale with increasing number of agents', () => {
      const permissionChecker = new PermissionChecker();

      const timings: number[] = [];

      // Test with 10, 50, 100, 500 agents
      for (const agentCount of [10, 50, 100, 500]) {
        // Setup agents
        for (let i = 0; i < agentCount; i++) {
          permissionChecker.assignRole(`agent-${i}`, 'developer');
        }

        const startTime = Date.now();

        // Perform 100 permission checks
        for (let i = 0; i < 100; i++) {
          permissionChecker.checkAccess({
            agentName: `agent-${i % agentCount}`,
            resource: `src/file${i}.ts`,
            action: 'read'
          });
        }

        timings.push(Date.now() - startTime);
      }

      // Performance should scale linearly or better
      expect(timings[3]).toBeLessThan(timings[0] * 10); // 500 agents not >10x slower than 10
    });

    it('should scale with increasing workflow complexity', () => {
      const conditionEvaluator = new ConditionEvaluator();

      const timings: number[] = [];

      // Test with 5, 10, 15, 20 agents in context
      for (const agentCount of [5, 10, 15, 20]) {
        const context = new Map<string, SubagentResult>();

        for (let i = 0; i < agentCount; i++) {
          context.set(`agent-${i}`, {
            name: `agent-${i}`,
            status: 'success',
            executionTime: 100,
            output: { value: i }
          });
        }

        const startTime = Date.now();

        // Evaluate 100 conditions
        for (let i = 0; i < 100; i++) {
          conditionEvaluator.evaluate(
            `agent-${i % agentCount}.status == 'success'`,
            context
          );
        }

        timings.push(Date.now() - startTime);
      }

      // Performance should scale reasonably
      expect(timings[3]).toBeLessThan(timings[0] * 5); // 20 agents not >5x slower than 5
    });
  });
});
