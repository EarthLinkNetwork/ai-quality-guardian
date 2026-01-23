/**
 * E2E Acceptance Criteria Tests
 *
 * Verifies the key acceptance criteria for stable/dev separation:
 *
 * 1. State Separation: stable and dev namespaces have isolated state
 * 2. Cross-namespace File Access: stable can edit dev's target files (path safety)
 * 3. QueueStore Namespace Separation: tasks don't mix between namespaces
 *
 * Based on spec/21_STABLE_DEV.md
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildNamespaceConfig,
  getTableName,
  getStateDir,
  validateNamespace,
  DEFAULT_NAMESPACE,
  NamespaceUtils,
} from '../../src/config/namespace';
import { SessionManager } from '../../src/session/session-manager';
import { QueueStore, QueueItem } from '../../src/queue/queue-store';

describe('E2E: Acceptance Criteria - Stable/Dev Separation', () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-acceptance-'));
    projectRoot = path.join(tempDir, 'test-project');
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('AC1: State Separation (stable and dev can run simultaneously)', () => {
    it('should generate different state directories for stable and dev namespaces', () => {
      const stableStateDir = getStateDir(projectRoot, 'stable');
      const devStateDir = getStateDir(projectRoot, 'dev');

      // State directories should be different
      assert.notEqual(stableStateDir, devStateDir);

      // Verify path structure
      assert.ok(stableStateDir.includes('state/stable'));
      assert.ok(devStateDir.includes('state/dev'));
    });

    it('should use same table name for all namespaces (v2: single-table design)', () => {
      const stableTableName = getTableName('stable');
      const devTableName = getTableName('dev');

      // v2: Table names are the same (single-table design)
      assert.equal(stableTableName, devTableName); // v2: same table, different namespace partition

      // Verify naming convention
      assert.equal(stableTableName, 'pm-runner-queue');
      assert.equal(devTableName, 'pm-runner-queue');
    });

    it('should build separate namespace configs for stable and dev', () => {
      const stableConfig = buildNamespaceConfig({
        namespace: 'stable',
        projectRoot,
      });

      const devConfig = buildNamespaceConfig({
        namespace: 'dev',
        projectRoot,
      });

      // v2: tableName is same (single-table), but namespace, stateDir, port are different
      assert.notEqual(stableConfig.namespace, devConfig.namespace);
      assert.equal(stableConfig.tableName, devConfig.tableName); // v2: same table
      assert.notEqual(stableConfig.stateDir, devConfig.stateDir);
      assert.notEqual(stableConfig.port, devConfig.port);

      // Verify specific values
      assert.equal(stableConfig.port, 5678);
      assert.equal(devConfig.port, 5679);
    });

    it('should create isolated session directories for each namespace', () => {
      // Create state directories
      const stableStateDir = getStateDir(projectRoot, 'stable');
      const devStateDir = getStateDir(projectRoot, 'dev');

      fs.mkdirSync(stableStateDir, { recursive: true });
      fs.mkdirSync(devStateDir, { recursive: true });

      // Create session managers
      const stableSessionManager = new SessionManager(stableStateDir);
      const devSessionManager = new SessionManager(devStateDir);

      // Initialize sessions in both namespaces
      const stableSession = stableSessionManager.initializeSession(projectRoot);
      const devSession = devSessionManager.initializeSession(projectRoot);

      // Sessions should have different IDs
      assert.notEqual(stableSession.session_id, devSession.session_id);

      // Session files should exist in separate directories
      const stableSessionFile = path.join(stableStateDir, stableSession.session_id, 'session.json');
      const devSessionFile = path.join(devStateDir, devSession.session_id, 'session.json');

      assert.ok(fs.existsSync(stableSessionFile), 'Stable session file should exist');
      assert.ok(fs.existsSync(devSessionFile), 'Dev session file should exist');

      // Verify isolation: stable cannot see dev's session and vice versa
      const stableSessions = stableSessionManager.listSessions();
      const devSessions = devSessionManager.listSessions();

      assert.equal(stableSessions.length, 1);
      assert.equal(devSessions.length, 1);
      assert.equal(stableSessions[0].session_id, stableSession.session_id);
      assert.equal(devSessions[0].session_id, devSession.session_id);
    });

    it('should allow simultaneous session creation without conflicts', async () => {
      const stableStateDir = getStateDir(projectRoot, 'stable');
      const devStateDir = getStateDir(projectRoot, 'dev');

      fs.mkdirSync(stableStateDir, { recursive: true });
      fs.mkdirSync(devStateDir, { recursive: true });

      const stableSessionManager = new SessionManager(stableStateDir);
      const devSessionManager = new SessionManager(devStateDir);

      // Create multiple sessions simultaneously
      const results = await Promise.all([
        Promise.resolve(stableSessionManager.initializeSession(projectRoot)),
        Promise.resolve(devSessionManager.initializeSession(projectRoot)),
        Promise.resolve(stableSessionManager.initializeSession(projectRoot)),
        Promise.resolve(devSessionManager.initializeSession(projectRoot)),
      ]);

      // All sessions should be unique
      const sessionIds = results.map(s => s.session_id);
      const uniqueIds = new Set(sessionIds);
      assert.equal(uniqueIds.size, 4, 'All 4 sessions should have unique IDs');
    });
  });

  describe('AC2: Cross-namespace File Access (stable can edit dev target files)', () => {
    it('should allow stable namespace to access files in dev namespace state directory', () => {
      const stableStateDir = getStateDir(projectRoot, 'stable');
      const devStateDir = getStateDir(projectRoot, 'dev');

      fs.mkdirSync(stableStateDir, { recursive: true });
      fs.mkdirSync(devStateDir, { recursive: true });

      // Create a target file in dev's directory
      const devTargetFile = path.join(devStateDir, 'target-config.json');
      const originalContent = { version: '1.0.0', environment: 'dev' };
      fs.writeFileSync(devTargetFile, JSON.stringify(originalContent, null, 2));

      // Stable namespace should be able to read dev's file
      const readContent = JSON.parse(fs.readFileSync(devTargetFile, 'utf-8'));
      assert.deepEqual(readContent, originalContent);

      // Stable namespace should be able to write to dev's file
      const newContent = { version: '2.0.0', environment: 'dev', updatedBy: 'stable' };
      fs.writeFileSync(devTargetFile, JSON.stringify(newContent, null, 2));

      // Verify the update
      const updatedContent = JSON.parse(fs.readFileSync(devTargetFile, 'utf-8'));
      assert.deepEqual(updatedContent, newContent);
    });

    it('should maintain path safety - no directory traversal attacks', () => {
      const stableStateDir = getStateDir(projectRoot, 'stable');
      const devStateDir = getStateDir(projectRoot, 'dev');

      // Verify paths are within project root
      assert.ok(stableStateDir.startsWith(projectRoot));
      assert.ok(devStateDir.startsWith(projectRoot));

      // Verify no path traversal in namespace names
      const maliciousNamespaces = [
        '../etc/passwd',
        '..\\windows\\system32',
        'valid/../../../etc',
        'valid/..%2f..%2fetc',
      ];

      for (const malicious of maliciousNamespaces) {
        const error = validateNamespace(malicious);
        assert.ok(error !== undefined, `Malicious namespace "${malicious}" should be rejected`);
      }
    });

    it('should allow both namespaces to access shared project files', () => {
      // Create a shared project file
      const sharedFile = path.join(projectRoot, 'shared-config.json');
      const initialContent = { shared: true, version: '1.0.0' };
      fs.writeFileSync(sharedFile, JSON.stringify(initialContent, null, 2));

      // Both stable and dev configs point to the same project root
      const stableConfig = buildNamespaceConfig({ namespace: 'stable', projectRoot });
      const devConfig = buildNamespaceConfig({ namespace: 'dev', projectRoot });

      // Both should be able to read the shared file
      const stableRead = JSON.parse(fs.readFileSync(sharedFile, 'utf-8'));
      const devRead = JSON.parse(fs.readFileSync(sharedFile, 'utf-8'));

      assert.deepEqual(stableRead, initialContent);
      assert.deepEqual(devRead, initialContent);

      // Simulate stable writing to shared file
      const stableUpdate = { shared: true, version: '2.0.0', updatedBy: 'stable' };
      fs.writeFileSync(sharedFile, JSON.stringify(stableUpdate, null, 2));

      // Dev should see the update
      const devReadAfterUpdate = JSON.parse(fs.readFileSync(sharedFile, 'utf-8'));
      assert.deepEqual(devReadAfterUpdate, stableUpdate);
    });
  });

  describe('AC3: QueueStore Namespace Separation (tasks do not mix)', () => {
    // Note: These tests require DynamoDB Local to be running
    // Skip if DynamoDB Local is not available
    let stableQueueStore: QueueStore | null = null;
    let devQueueStore: QueueStore | null = null;
    let dynamoDBAvailable = false;

    before(async function() {
      this.timeout(15000);

      // Check if DynamoDB Local is available and reset table with v2 schema
      try {
        const testStore = new QueueStore({
          endpoint: 'http://localhost:8000',
          namespace: 'test-connection-check',
        });
        
        // Delete existing table to ensure v2 schema is used
        console.log('    [INFO] Resetting DynamoDB tables for v2 schema...');
        await testStore.deleteTable();
        
        // Wait a bit for deletion to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Create table with v2 schema
        await testStore.ensureTable();
        
        testStore.destroy();
        dynamoDBAvailable = true;
        console.log('    [OK] DynamoDB tables ready with v2 schema');
      } catch (error) {
        console.log('    [SKIP] DynamoDB Local not available - skipping QueueStore tests');
        console.log('    Error:', error);
        dynamoDBAvailable = false;
      }
    });

    beforeEach(async function() {
      if (!dynamoDBAvailable) {
        this.skip();
        return;
      }

      // Create separate QueueStores for stable and dev
      stableQueueStore = new QueueStore({
        endpoint: 'http://localhost:8000',
        namespace: 'stable',
      });

      devQueueStore = new QueueStore({
        endpoint: 'http://localhost:8000',
        namespace: 'dev',
      });

      // Ensure tables exist
      await stableQueueStore.ensureTable();
      await devQueueStore.ensureTable();
    });

    afterEach(async function() {
      if (stableQueueStore) {
        stableQueueStore.destroy();
      }
      if (devQueueStore) {
        devQueueStore.destroy();
      }
    });

    it('should use same table for stable and dev (v2: single-table design)', function() {
      if (!dynamoDBAvailable) {
        this.skip();
        return;
      }

      assert.ok(stableQueueStore);
      assert.ok(devQueueStore);

      const stableTableName = stableQueueStore!.getTableName();
      const devTableName = devQueueStore!.getTableName();

      assert.equal(stableTableName, devTableName); // v2: same table, different namespace partition
      assert.equal(stableTableName, 'pm-runner-queue');
      assert.equal(devTableName, 'pm-runner-queue');
    });

    it('should isolate tasks between stable and dev queues', async function() {
      if (!dynamoDBAvailable) {
        this.skip();
        return;
      }

      this.timeout(10000);

      // Enqueue tasks in stable queue
      const stableTask1 = await stableQueueStore!.enqueue(
        'stable-session-1',
        'stable-group-1',
        'Stable task 1'
      );
      const stableTask2 = await stableQueueStore!.enqueue(
        'stable-session-1',
        'stable-group-1',
        'Stable task 2'
      );

      // Enqueue tasks in dev queue
      const devTask1 = await devQueueStore!.enqueue(
        'dev-session-1',
        'dev-group-1',
        'Dev task 1'
      );
      const devTask2 = await devQueueStore!.enqueue(
        'dev-session-1',
        'dev-group-1',
        'Dev task 2'
      );

      // Verify tasks are in separate queues
      const stableTasks = await stableQueueStore!.getByTaskGroup('stable-group-1');
      const devTasks = await devQueueStore!.getByTaskGroup('dev-group-1');

      // Stable queue should only have stable tasks
      assert.equal(stableTasks.length, 2);
      assert.ok(stableTasks.every(t => t.prompt.startsWith('Stable')));

      // Dev queue should only have dev tasks
      assert.equal(devTasks.length, 2);
      assert.ok(devTasks.every(t => t.prompt.startsWith('Dev')));

      // Verify no cross-contamination
      const stableDevTasks = await stableQueueStore!.getByTaskGroup('dev-group-1');
      const devStableTasks = await devQueueStore!.getByTaskGroup('stable-group-1');

      assert.equal(stableDevTasks.length, 0, 'Stable queue should not contain dev session');
      assert.equal(devStableTasks.length, 0, 'Dev queue should not contain stable session');

      // Cleanup
      await stableQueueStore!.deleteItem(stableTask1.task_id);
      await stableQueueStore!.deleteItem(stableTask2.task_id);
      await devQueueStore!.deleteItem(devTask1.task_id);
      await devQueueStore!.deleteItem(devTask2.task_id);
    });

    it('should allow claiming tasks only from own namespace queue', async function() {
      if (!dynamoDBAvailable) {
        this.skip();
        return;
      }

      this.timeout(10000);

      // Enqueue tasks in both queues
      const stableTask = await stableQueueStore!.enqueue(
        'stable-session-1',
        'stable-group-1',
        'Stable task to claim'
      );
      const devTask = await devQueueStore!.enqueue(
        'dev-session-1',
        'dev-group-1',
        'Dev task to claim'
      );

      // Claim from stable queue
      const stableClaim = await stableQueueStore!.claim();
      assert.ok(stableClaim.success);
      assert.equal(stableClaim.item?.prompt, 'Stable task to claim');
      assert.equal(stableClaim.item?.status, 'RUNNING');

      // Claim from dev queue
      const devClaim = await devQueueStore!.claim();
      assert.ok(devClaim.success);
      assert.equal(devClaim.item?.prompt, 'Dev task to claim');
      assert.equal(devClaim.item?.status, 'RUNNING');

      // Verify no more tasks in either queue (both claimed)
      const stableClaimAgain = await stableQueueStore!.claim();
      const devClaimAgain = await devQueueStore!.claim();

      assert.equal(stableClaimAgain.success, false);
      assert.equal(devClaimAgain.success, false);

      // Cleanup
      await stableQueueStore!.deleteItem(stableTask.task_id);
      await devQueueStore!.deleteItem(devTask.task_id);
    });

    it('should maintain task group isolation between namespaces', async function() {
      if (!dynamoDBAvailable) {
        this.skip();
        return;
      }

      this.timeout(10000);

      // Create tasks in same-named task groups in both namespaces
      const stableTask1 = await stableQueueStore!.enqueue(
        'stable-session-1',
        'shared-group-name',  // Same group name
        'Stable task in shared group'
      );
      const devTask1 = await devQueueStore!.enqueue(
        'dev-session-1',
        'shared-group-name',  // Same group name
        'Dev task in shared group'
      );

      // Get tasks by group name from each queue
      const stableGroupTasks = await stableQueueStore!.getByTaskGroup('shared-group-name');
      const devGroupTasks = await devQueueStore!.getByTaskGroup('shared-group-name');

      // Even with same group name, tasks should be isolated
      assert.equal(stableGroupTasks.length, 1);
      assert.equal(devGroupTasks.length, 1);
      assert.equal(stableGroupTasks[0].prompt, 'Stable task in shared group');
      assert.equal(devGroupTasks[0].prompt, 'Dev task in shared group');

      // Cleanup
      await stableQueueStore!.deleteItem(stableTask1.task_id);
      await devQueueStore!.deleteItem(devTask1.task_id);
    });
  });

  describe('Namespace Validation (fail-closed)', () => {
    it('should validate namespace names correctly', () => {
      // Valid namespaces
      assert.equal(validateNamespace('stable'), undefined);
      assert.equal(validateNamespace('dev'), undefined);
      assert.equal(validateNamespace('test-1'), undefined);
      assert.equal(validateNamespace('feature-branch-123'), undefined);
      assert.equal(validateNamespace('a'), undefined);
      assert.equal(validateNamespace('ab'), undefined);

      // Invalid namespaces
      assert.ok(validateNamespace('') !== undefined, 'Empty namespace should be invalid');
      assert.ok(validateNamespace('-start') !== undefined, 'Namespace starting with hyphen should be invalid');
      assert.ok(validateNamespace('end-') !== undefined, 'Namespace ending with hyphen should be invalid');
      assert.ok(validateNamespace('has space') !== undefined, 'Namespace with space should be invalid');
      assert.ok(validateNamespace('has_underscore') !== undefined, 'Namespace with underscore should be invalid');
      assert.ok(validateNamespace('has.dot') !== undefined, 'Namespace with dot should be invalid');
      assert.ok(validateNamespace('all') !== undefined, 'Reserved namespace "all" should be invalid');
      assert.ok(validateNamespace('none') !== undefined, 'Reserved namespace "none" should be invalid');
      assert.ok(validateNamespace('null') !== undefined, 'Reserved namespace "null" should be invalid');
      assert.ok(validateNamespace('undefined') !== undefined, 'Reserved namespace "undefined" should be invalid');
      assert.ok(validateNamespace('system') !== undefined, 'Reserved namespace "system" should be invalid');
    });

    it('should reject namespace names longer than 32 characters', () => {
      const longNamespace = 'a'.repeat(33);
      const error = validateNamespace(longNamespace);
      assert.ok(error !== undefined);
      assert.ok(error!.includes('too long'));
    });

    it('should throw on invalid namespace in buildNamespaceConfig (fail-closed)', () => {
      // Note: Empty string '' falls back to environment variable or DEFAULT_NAMESPACE,
      // so it does not throw. Only explicitly invalid namespaces throw.
      const invalidNamespaces = ['-invalid', 'invalid-', 'has space', 'all'];

      for (const invalid of invalidNamespaces) {
        assert.throws(
          () => buildNamespaceConfig({ namespace: invalid, projectRoot }),
          /Invalid namespace/,
          `buildNamespaceConfig should throw for namespace "${invalid}"`
        );
      }
    });
  });

  describe('NamespaceUtils', () => {
    it('should correctly identify stable namespace', () => {
      assert.ok(NamespaceUtils.isStable('stable'));
      assert.ok(NamespaceUtils.isStable('STABLE'));
      assert.ok(NamespaceUtils.isStable('Stable'));
      assert.ok(!NamespaceUtils.isStable('dev'));
      assert.ok(!NamespaceUtils.isStable('default'));
    });

    it('should correctly identify dev namespace', () => {
      assert.ok(NamespaceUtils.isDev('dev'));
      assert.ok(NamespaceUtils.isDev('DEV'));
      assert.ok(NamespaceUtils.isDev('Dev'));
      assert.ok(!NamespaceUtils.isDev('stable'));
      assert.ok(!NamespaceUtils.isDev('default'));
    });

    it('should correctly compare namespaces (case-insensitive)', () => {
      assert.ok(NamespaceUtils.isSameNamespace('stable', 'STABLE'));
      assert.ok(NamespaceUtils.isSameNamespace('dev', 'DEV'));
      assert.ok(!NamespaceUtils.isSameNamespace('stable', 'dev'));
    });

    it('should correctly identify default namespace', () => {
      assert.ok(NamespaceUtils.isDefaultNamespace('default'));
      assert.ok(NamespaceUtils.isDefaultNamespace('DEFAULT'));
      assert.ok(!NamespaceUtils.isDefaultNamespace('stable'));
      assert.ok(!NamespaceUtils.isDefaultNamespace('dev'));
    });
  });

  describe('Environment Variable Support', () => {
    const originalEnv = process.env.PM_RUNNER_NAMESPACE;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.PM_RUNNER_NAMESPACE = originalEnv;
      } else {
        delete process.env.PM_RUNNER_NAMESPACE;
      }
    });

    it('should use PM_RUNNER_NAMESPACE environment variable if set', () => {
      process.env.PM_RUNNER_NAMESPACE = 'test-env-namespace';

      const config = buildNamespaceConfig({ projectRoot });

      assert.equal(config.namespace, 'test-env-namespace');
      assert.equal(config.tableName, 'pm-runner-queue');
    });

    it('should prefer explicit namespace over environment variable', () => {
      process.env.PM_RUNNER_NAMESPACE = 'env-namespace';

      const config = buildNamespaceConfig({
        namespace: 'explicit-namespace',
        projectRoot,
      });

      assert.equal(config.namespace, 'explicit-namespace');
    });

    it('should use default namespace when no namespace specified and no env var', () => {
      delete process.env.PM_RUNNER_NAMESPACE;

      const config = buildNamespaceConfig({ projectRoot });

      assert.equal(config.namespace, DEFAULT_NAMESPACE);
    });
  });
});
