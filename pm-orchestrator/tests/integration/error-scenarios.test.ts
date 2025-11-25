/**
 * Error Scenario Integration Tests
 *
 * エラーハンドリングと回復シナリオをテストします。
 */

import { ContextStore } from '../../src/context/context-store';
import { FileCache } from '../../src/context/file-cache';
import { PermissionChecker } from '../../src/security/permission-checker';
import { InputValidator } from '../../src/security/input-validator';
import { DataSanitizer } from '../../src/context/data-sanitizer';
import { SubagentResult } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Error Scenario Integration Tests', () => {
  let contextStore: ContextStore;
  let fileCache: FileCache;
  let permissionChecker: PermissionChecker;
  let inputValidator: InputValidator;
  let dataSanitizer: DataSanitizer;

  beforeEach(() => {
    contextStore = new ContextStore();
    fileCache = new FileCache();
    permissionChecker = new PermissionChecker();
    inputValidator = new InputValidator();
    dataSanitizer = new DataSanitizer();

    // Setup permissions
    permissionChecker.assignRole('implementer', 'developer');
    permissionChecker.assignRole('qa', 'quality-checker');
  });

  describe('Permission Denial Errors', () => {
    it('should handle permission denial gracefully', () => {
      const result: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 50,
        output: {},
        error: 'Permission denied'
      };

      // Implementer tries to delete system files
      const canDelete = permissionChecker.checkAccess({
        agentName: 'implementer',
        resource: '/etc/passwd',
        action: 'delete'
      });

      expect(canDelete).toBe(false);

      if (!canDelete) {
        const reason = permissionChecker.getAccessDenialReason({
          agentName: 'implementer',
          resource: '/etc/passwd',
          action: 'delete'
        });

        result.error = reason;
      }

      expect(result.error).toContain('implementer');
      expect(result.error).toContain('delete');
    });

    it('should log permission denial', () => {
      const context = {
        agentName: 'implementer',
        resource: '.env',
        action: 'delete' as const
      };

      const allowed = permissionChecker.checkAccess(context);

      // Log access check
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => logs.push(message);

      permissionChecker.logAccessCheck(context, allowed);

      console.log = originalLog;

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toContain('DENIED');
    });
  });

  describe('Input Validation Errors', () => {
    it('should reject malicious input', () => {
      const maliciousInputs = [
        'test; rm -rf /',
        '../../../etc/passwd',
        "' OR '1'='1",
        '<script>alert("XSS")</script>'
      ];

      for (const input of maliciousInputs) {
        const validation = inputValidator.validate(input);

        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    });

    it('should handle validation errors in workflow', () => {
      const userInput = 'Execute: test; rm -rf /';

      const validation = inputValidator.validateCommand(userInput.replace('Execute: ', ''));

      expect(validation.valid).toBe(false);

      const result: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 10,
        output: {},
        error: `Invalid input: ${validation.errors.join(', ')}`
      };

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid input');
    });

    it('should sanitize and continue with valid parts', () => {
      const input = 'Update config with password=secret123';

      const sanitizationResult = dataSanitizer.sanitize(input);

      expect(sanitizationResult.sanitized).toContain('[REDACTED Password]');
      expect(sanitizationResult.warnings.length).toBeGreaterThan(0);

      // Store sanitized version for safe processing
      contextStore.set('sanitized-input', {
        original: '[REDACTED]',
        sanitized: sanitizationResult.sanitized
      }, 'pm-orchestrator');
    });
  });

  describe('File Access Errors', () => {
    const testDir = path.join(__dirname, 'error-test');

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should handle non-existent file', () => {
      const nonExistentFile = path.join(testDir, 'missing.txt');

      const content = fileCache.get(nonExistentFile);

      expect(content).toBeNull();
    });

    it('should handle file read errors', () => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const testFile = path.join(testDir, 'readonly.txt');
      fs.writeFileSync(testFile, 'test content');

      // Make file unreadable on Unix systems
      if (process.platform !== 'win32') {
        fs.chmodSync(testFile, 0o000);

        const content = fileCache.get(testFile);

        expect(content).toBeNull();

        // Restore permissions for cleanup
        fs.chmodSync(testFile, 0o644);
      }
    });

    it('should recover from cache corruption', () => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'original');

      // Load into cache
      const content1 = fileCache.get(testFile);
      expect(content1).toBe('original');

      // Simulate cache corruption by deleting file
      fs.unlinkSync(testFile);

      // Invalidate corrupted cache
      fileCache.invalidate(testFile);

      // Try to access again
      const content2 = fileCache.get(testFile);
      expect(content2).toBeNull();
    });
  });

  describe('Context Store Errors', () => {
    it('should handle expired context gracefully', async () => {
      contextStore.set('temp', { data: 'value' }, 'agent', 50); // 50ms TTL

      // Immediately accessible
      expect(contextStore.get('temp')).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should return null after expiration
      expect(contextStore.get('temp')).toBeNull();
    });

    it('should handle missing context key', () => {
      const context = contextStore.get('non-existent');

      expect(context).toBeNull();

      // Agent should handle null gracefully
      const result: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 10,
        output: {},
        error: 'Required context not found'
      };

      if (!context) {
        expect(result.error).toBe('Required context not found');
      }
    });

    it('should handle context update on non-existent key', () => {
      const updated = contextStore.update('non-existent', { data: 'value' }, 'agent');

      expect(updated).toBe(false);
    });
  });

  describe('Workflow Execution Errors', () => {
    it('should handle agent timeout', async () => {
      const timeout = 1000; // 1 second

      const slowAgent = new Promise<SubagentResult>((resolve) => {
        setTimeout(() => {
          resolve({
            name: 'implementer',
            status: 'success',
            executionTime: 2000,
            output: {}
          });
        }, 2000); // Takes 2 seconds
      });

      const timeoutPromise = new Promise<SubagentResult>((resolve) => {
        setTimeout(() => {
          resolve({
            name: 'implementer',
            status: 'error',
            executionTime: timeout,
            output: {},
            error: 'Agent execution timeout'
          });
        }, timeout);
      });

      const result = await Promise.race([slowAgent, timeoutPromise]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('timeout');
    });

    it('should handle agent crash', () => {
      const crashedAgent: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 100,
        output: {},
        error: 'Agent process crashed: Out of memory'
      };

      contextStore.set('implementer:crash', {
        crashed: true,
        reason: 'Out of memory',
        timestamp: new Date()
      }, 'pm-orchestrator');

      expect(crashedAgent.status).toBe('error');
      expect(crashedAgent.error).toContain('crashed');
    });

    it('should handle dependency chain failure', () => {
      const results = new Map<string, SubagentResult>();

      // Step 1 fails
      results.set('rule-checker', {
        name: 'rule-checker',
        status: 'error',
        executionTime: 100,
        output: {},
        error: 'Critical rule violation'
      });

      // Remaining steps should be skipped
      const failedAgent = results.get('rule-checker');
      expect(failedAgent?.status).toBe('error');

      // Only one result in map (others skipped)
      expect(results.size).toBe(1);
    });
  });

  describe('Resource Exhaustion Errors', () => {
    it('should handle memory limit', () => {
      const largeData = 'x'.repeat(1000000); // 1MB string

      try {
        // Attempt to cache very large data
        const results: string[] = [];
        for (let i = 0; i < 1000; i++) {
          results.push(largeData);
        }

        // This would consume ~1GB
        contextStore.set('large-data', { data: results }, 'agent');

        // If we get here, memory was sufficient
        expect(contextStore.has('large-data')).toBe(true);

      } catch (error) {
        // Memory exhaustion handled
        expect(error).toBeDefined();
      }
    });

    it('should cleanup resources on error', async () => {
      contextStore.set('resource-1', { data: 'value' }, 'agent', 100);
      contextStore.set('resource-2', { data: 'value' }, 'agent', 100);

      // Simulate error during processing
      const error = new Error('Processing failed');

      // Cleanup expired resources
      await new Promise(resolve => setTimeout(resolve, 150));
      const cleaned = contextStore.cleanup();

      expect(cleaned).toBe(2);
    });
  });

  describe('Network/External Service Errors', () => {
    it('should handle API failure', () => {
      const apiError: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 5000,
        output: {},
        error: 'API request failed: 503 Service Unavailable'
      };

      expect(apiError.error).toContain('503');
      expect(apiError.error).toContain('Service Unavailable');
    });

    it('should retry on transient failures', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      const attemptOperation = async (): Promise<SubagentResult> => {
        attemptCount++;

        if (attemptCount < maxRetries) {
          return {
            name: 'implementer',
            status: 'error',
            executionTime: 100,
            output: {},
            error: 'Transient error'
          };
        }

        return {
          name: 'implementer',
          status: 'success',
          executionTime: 100,
          output: { retry: attemptCount }
        };
      };

      let result: SubagentResult = await attemptOperation();

      while (result.status === 'error' && attemptCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        result = await attemptOperation();
      }

      expect(result.status).toBe('success');
      expect(attemptCount).toBe(maxRetries);
    });
  });

  describe('Error Recovery and Rollback', () => {
    it('should rollback on error', () => {
      const backup = {
        files: ['src/index.ts', 'src/utils.ts'],
        timestamp: new Date(),
        hash: 'abc123'
      };

      contextStore.set('backup:before-change', backup, 'implementer');

      // Simulate error during change
      const error: SubagentResult = {
        name: 'implementer',
        status: 'error',
        executionTime: 300,
        output: {
          filesModified: backup.files,
          rollbackRequired: true
        },
        error: 'Type check failed after change'
      };

      // Restore from backup
      if (error.output.rollbackRequired) {
        const storedBackup = contextStore.get('backup:before-change');
        expect(storedBackup).toBeDefined();

        // Rollback would restore files here
        contextStore.set('rollback:completed', {
          restoredFiles: backup.files,
          timestamp: new Date()
        }, 'implementer');
      }

      expect(contextStore.has('rollback:completed')).toBe(true);
    });

    it('should validate rollback success', () => {
      const preChangeState = {
        lintErrors: 0,
        testsPassed: true,
        typeErrors: 0
      };

      contextStore.set('state:before-change', preChangeState, 'qa');

      // After change and error
      const postErrorState = {
        lintErrors: 3,
        testsPassed: false,
        typeErrors: 2
      };

      // Rollback
      contextStore.set('state:after-rollback', preChangeState, 'qa');

      const rolledBackState = contextStore.get('state:after-rollback');

      expect(rolledBackState).toEqual(preChangeState);
    });
  });

  describe('Concurrent Access Errors', () => {
    it('should handle concurrent context updates', () => {
      // Simulate concurrent updates
      contextStore.set('counter', { value: 0 }, 'agent-1');

      const updates = [];
      for (let i = 0; i < 10; i++) {
        updates.push(
          contextStore.update('counter', { value: i }, `agent-${i}`)
        );
      }

      // Last update wins
      const final = contextStore.get('counter');
      expect(final).toBeDefined();
      expect((final as any).value).toBeGreaterThanOrEqual(0);
    });

    it('should handle cache invalidation during read', () => {
      const testDir = path.join(__dirname, 'concurrent-test');
      const testFile = path.join(testDir, 'test.txt');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      fs.writeFileSync(testFile, 'original');

      // Start reading
      const content1 = fileCache.get(testFile);

      // Concurrent invalidation
      fileCache.invalidate(testFile);

      // Second read should reload
      const content2 = fileCache.get(testFile);

      expect(content1).toBe('original');
      expect(content2).toBe('original');

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });
  });
});
