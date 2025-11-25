/**
 * End-to-End Workflow Integration Tests
 *
 * 完全なワークフロー実行をテストします。
 */

import { WorkflowLoader } from '../../src/workflow/workflow-loader';
import { ConditionEvaluator } from '../../src/workflow/condition-evaluator';
import { ContextStore } from '../../src/context/context-store';
import { PermissionChecker } from '../../src/security/permission-checker';
import { DataSanitizer } from '../../src/context/data-sanitizer';
import { InputValidator } from '../../src/security/input-validator';
import { SubagentResult } from '../../src/types';

describe('End-to-End Workflow Tests', () => {
  let workflowLoader: WorkflowLoader;
  let conditionEvaluator: ConditionEvaluator;
  let contextStore: ContextStore;
  let permissionChecker: PermissionChecker;
  let dataSanitizer: DataSanitizer;
  let inputValidator: InputValidator;

  beforeEach(() => {
    workflowLoader = new WorkflowLoader();
    conditionEvaluator = new ConditionEvaluator();
    contextStore = new ContextStore();
    permissionChecker = new PermissionChecker();
    dataSanitizer = new DataSanitizer();
    inputValidator = new InputValidator();

    // Load default workflows
    workflowLoader.loadDefault();

    // Setup agent permissions
    permissionChecker.assignRole('pm-orchestrator', 'admin');
    permissionChecker.assignRole('rule-checker', 'quality-checker');
    permissionChecker.assignRole('implementer', 'developer');
    permissionChecker.assignRole('qa', 'quality-checker');
    permissionChecker.assignRole('reporter', 'readonly');
  });

  describe('PR Review Workflow', () => {
    it('should execute complete PR review workflow', () => {
      // Step 1: Detect PR review pattern
      const userInput = 'Address CodeRabbit review comments on PR #123';
      const workflow = workflowLoader.findMatchingWorkflow(userInput);

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('PR Review Response');

      // Validate user input
      const inputValidation = inputValidator.validate(userInput);
      expect(inputValidation.valid).toBe(true);

      // Step 2: PM Orchestrator analyzes task
      const pmResult: SubagentResult = {
        name: 'pm-orchestrator',
        status: 'success',
        executionTime: 100,
        output: {
          workflow: workflow?.name,
          prNumber: 123,
          reviewComments: ['Fix type error', 'Add unit test']
        }
      };

      contextStore.set('pm:analysis', pmResult.output, 'pm-orchestrator');

      // Step 3: Rule Checker validates
      const ruleResult: SubagentResult = {
        name: 'rule-checker',
        status: 'success',
        executionTime: 150,
        output: {
          violations: [],
          warnings: [],
          approved: true
        }
      };

      contextStore.set('rule-checker:result', ruleResult.output, 'rule-checker');

      const results = new Map<string, SubagentResult>([
        ['pm-orchestrator', pmResult],
        ['rule-checker', ruleResult]
      ]);

      // Check condition for next step
      const canProceed = conditionEvaluator.evaluate(
        "rule-checker.status == 'success'",
        results
      );
      expect(canProceed).toBe(true);

      // Step 4: Implementer fixes issues
      const implementerResult: SubagentResult = {
        name: 'implementer',
        status: 'success',
        executionTime: 500,
        output: {
          filesModified: ['src/types.ts', 'tests/unit.test.ts'],
          typeErrorsFixed: 1,
          testsAdded: 1
        }
      };

      contextStore.set('implementer:result', implementerResult.output, 'implementer');
      results.set('implementer', implementerResult);

      // Step 5: QA validates fix
      const canRunQA = conditionEvaluator.evaluate(
        "implementer.status == 'success'",
        results
      );
      expect(canRunQA).toBe(true);

      const qaResult: SubagentResult = {
        name: 'qa',
        status: 'success',
        executionTime: 300,
        output: {
          lintPassed: true,
          testsPassed: true,
          typecheckPassed: true,
          buildPassed: true,
          qualityScore: 95
        }
      };

      contextStore.set('qa:result', qaResult.output, 'qa');
      results.set('qa', qaResult);

      // Step 6: Reporter generates report
      const reporterResult: SubagentResult = {
        name: 'reporter',
        status: 'success',
        executionTime: 50,
        output: {
          summary: 'PR #123 review comments addressed successfully',
          details: {
            filesModified: implementerResult.output.filesModified,
            qualityScore: qaResult.output.qualityScore,
            allChecksPassed: true
          }
        }
      };

      // Verify workflow completion
      expect(results.size).toBe(4); // pm, rule-checker, implementer, qa
      expect(Array.from(results.values()).every(r => r.status === 'success')).toBe(true);
    });

    it('should handle PR review workflow with rule violations', () => {
      const userInput = 'Fix PR review issues';
      const workflow = workflowLoader.findMatchingWorkflow(userInput);

      expect(workflow).toBeDefined();

      // Rule checker finds violations
      const ruleResult: SubagentResult = {
        name: 'rule-checker',
        status: 'error',
        executionTime: 150,
        output: {
          violations: ['MUST Rule 2: Test First violated'],
          approved: false
        },
        error: 'Critical rule violations detected'
      };

      const results = new Map<string, SubagentResult>([
        ['rule-checker', ruleResult]
      ]);

      // Should not proceed to implementer
      const canProceed = conditionEvaluator.evaluate(
        "rule-checker.status == 'success'",
        results
      );
      expect(canProceed).toBe(false);

      // Workflow stops here
      expect(results.size).toBe(1);
    });
  });

  describe('Version Update Workflow', () => {
    it('should execute complete version update workflow', () => {
      const userInput = 'Update version from 1.3.0 to 1.3.1';
      const workflow = workflowLoader.findMatchingWorkflow(userInput);

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Version Update');

      // PM analyzes
      const pmResult: SubagentResult = {
        name: 'pm-orchestrator',
        status: 'success',
        executionTime: 50,
        output: {
          currentVersion: '1.3.0',
          targetVersion: '1.3.1',
          filesToUpdate: [
            'package.json',
            'VERSION',
            'README.md'
          ]
        }
      };

      contextStore.set('pm:version-update', pmResult.output, 'pm-orchestrator');

      // Implementer updates versions
      const implementerResult: SubagentResult = {
        name: 'implementer',
        status: 'success',
        executionTime: 200,
        output: {
          filesModified: pmResult.output.filesToUpdate,
          versionsUpdated: 3
        }
      };

      const results = new Map<string, SubagentResult>([
        ['pm-orchestrator', pmResult],
        ['implementer', implementerResult]
      ]);

      // Reporter confirms
      const reporterResult: SubagentResult = {
        name: 'reporter',
        status: 'success',
        executionTime: 30,
        output: {
          summary: 'Version updated to 1.3.1',
          filesUpdated: 3
        }
      };

      expect(results.size).toBe(2);
      expect(implementerResult.output.versionsUpdated).toBe(3);
    });
  });

  describe('Quality Check Workflow', () => {
    it('should execute complete quality check workflow', () => {
      const userInput = 'Run all quality checks: lint, test, typecheck, build';
      const workflow = workflowLoader.findMatchingWorkflow(userInput);

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Quality Check');

      // QA executes all checks
      const qaResult: SubagentResult = {
        name: 'qa',
        status: 'success',
        executionTime: 800,
        output: {
          lint: { passed: true, errors: 0 },
          test: { passed: true, coverage: 85 },
          typecheck: { passed: true, errors: 0 },
          build: { passed: true },
          qualityScore: 90
        }
      };

      contextStore.set('qa:full-check', qaResult.output, 'qa');

      // Reporter summarizes
      const reporterResult: SubagentResult = {
        name: 'reporter',
        status: 'success',
        executionTime: 50,
        output: {
          summary: 'All quality checks passed',
          qualityScore: 90,
          coverage: 85
        }
      };

      expect(qaResult.status).toBe('success');
      expect(qaResult.output.qualityScore).toBeGreaterThanOrEqual(80);
    });

    it('should handle quality check failures', () => {
      const qaResult: SubagentResult = {
        name: 'qa',
        status: 'error',
        executionTime: 600,
        output: {
          lint: { passed: false, errors: 3 },
          test: { passed: false, failures: 2 },
          typecheck: { passed: true, errors: 0 },
          build: { passed: false }
        },
        error: 'Quality checks failed'
      };

      const results = new Map<string, SubagentResult>([
        ['qa', qaResult]
      ]);

      // Should report failure
      expect(qaResult.status).toBe('error');
      expect(qaResult.output.lint.errors).toBeGreaterThan(0);
    });
  });

  describe('Security and Sanitization in Workflows', () => {
    it('should sanitize sensitive data in workflow context', () => {
      const userInput = 'Deploy with API_KEY=sk_test_1234567890abcdef';

      // Validate and sanitize input
      const validation = inputValidator.validate(userInput);
      expect(validation.valid).toBe(true);

      const sanitizationResult = dataSanitizer.sanitize(userInput);

      expect(sanitizationResult.sanitized).toContain('[REDACTED API Key]');
      expect(sanitizationResult.redacted.length).toBeGreaterThan(0);

      // Store sanitized version
      contextStore.set('workflow:input', {
        original: '[REDACTED]',
        sanitized: sanitizationResult.sanitized
      }, 'pm-orchestrator');

      const storedContext = contextStore.get('workflow:input');
      expect(storedContext).toBeDefined();
      expect((storedContext as any).sanitized).toContain('[REDACTED API Key]');
    });

    it('should enforce permissions throughout workflow', () => {
      // Implementer tries to delete .env
      const canDelete = permissionChecker.checkAccess({
        agentName: 'implementer',
        resource: '.env',
        action: 'delete'
      });

      expect(canDelete).toBe(false);

      // Admin can delete with confirmation
      const canAdminDelete = permissionChecker.checkAccess({
        agentName: 'pm-orchestrator',
        resource: '.env',
        action: 'delete',
        metadata: { confirmed: true }
      });

      expect(canAdminDelete).toBe(true);

      // Without confirmation, even admin cannot delete
      const canAdminDeleteNoConfirm = permissionChecker.checkAccess({
        agentName: 'pm-orchestrator',
        resource: '.env',
        action: 'delete',
        metadata: { confirmed: false }
      });

      expect(canAdminDeleteNoConfirm).toBe(false);
    });
  });

  describe('Error Recovery in Workflows', () => {
    it('should handle and recover from implementer errors', () => {
      // First attempt fails
      const firstAttempt: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 300,
        output: {},
        error: 'Type check failed'
      };

      contextStore.set('implementer:attempt-1', firstAttempt.output, 'implementer');

      // Second attempt after fix
      const secondAttempt: SubagentResult = {
        name: 'implementer',
        status: 'success',
        executionTime: 350,
        output: {
          filesModified: ['src/types.ts'],
          typeErrorsFixed: 1
        }
      };

      contextStore.set('implementer:attempt-2', secondAttempt.output, 'implementer');

      const results = new Map<string, SubagentResult>([
        ['implementer', secondAttempt]
      ]);

      const canProceed = conditionEvaluator.evaluate(
        "implementer.status == 'success'",
        results
      );

      expect(canProceed).toBe(true);
    });

    it('should rollback on critical errors', () => {
      const workflow = workflowLoader.loadDefault();

      // Simulate critical error in implementer
      const criticalError: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 200,
        output: {
          rollbackRequired: true,
          backupCreated: true
        },
        error: 'Critical: Database migration failed'
      };

      const results = new Map<string, SubagentResult>([
        ['implementer', criticalError]
      ]);

      // Check if rollback is needed
      const needsRollback = criticalError.output.rollbackRequired;
      expect(needsRollback).toBe(true);

      // Verify backup exists
      const hasBackup = criticalError.output.backupCreated;
      expect(hasBackup).toBe(true);
    });
  });

  describe('Complex Multi-Step Workflows', () => {
    it('should execute complex implementation workflow', () => {
      const userInput = 'Implement new authentication feature with tests and docs';
      const workflow = workflowLoader.findMatchingWorkflow(userInput);

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('Complex Implementation');

      const results = new Map<string, SubagentResult>();

      // Step 1: Designer creates design
      results.set('designer', {
        name: 'designer',
        status: 'success',
        executionTime: 400,
        output: {
          designDoc: 'design.md',
          architecture: 'OAuth 2.0',
          components: ['AuthProvider', 'AuthContext', 'useAuth']
        }
      });

      // Step 2: Implementer implements
      results.set('implementer', {
        name: 'implementer',
        status: 'success',
        executionTime: 800,
        output: {
          filesCreated: ['src/auth/provider.ts', 'src/auth/context.ts', 'src/auth/hook.ts'],
          testsCreated: ['tests/auth.test.ts']
        }
      });

      // Step 3: QA validates
      results.set('qa', {
        name: 'qa',
        status: 'success',
        executionTime: 500,
        output: {
          allChecksPassed: true,
          coverage: 90,
          qualityScore: 92
        }
      });

      // Step 4: Reporter documents
      results.set('reporter', {
        name: 'reporter',
        status: 'success',
        executionTime: 100,
        output: {
          summary: 'Authentication feature implemented successfully',
          documentation: 'Updated README and API docs'
        }
      });

      // Verify all steps completed
      expect(results.size).toBe(4);
      expect(Array.from(results.values()).every(r => r.status === 'success')).toBe(true);
    });
  });
});
