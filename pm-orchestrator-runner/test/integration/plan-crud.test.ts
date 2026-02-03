/**
 * Integration Tests: Plan CRUD Operations
 *
 * Test-First: These tests define the expected behavior for Plan management.
 * Based on the self-driving loop requirements (Inspect -> Plan -> Dispatch -> Verify).
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NoDynamoDAL, resetNoDynamo } from '../../src/web/dal/no-dynamo';
import { Plan, PlanStatus, PlanTask, TaskState } from '../../src/web/dal/types';

describe('Integration: Plan CRUD Operations', () => {
  let dal: NoDynamoDAL;
  let tempDir: string;
  let stateDir: string;
  let testProjectId: string;

  before(async () => {
    // Create temporary state directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-plan-test-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Initialize DAL
    dal = new NoDynamoDAL({ stateDir, orgId: 'test-org' });

    // Create a test project
    const project = await dal.createProjectIndex({
      orgId: 'test-org',
      projectPath: '/test/plan-test-project',
      alias: 'Plan Test Project',
    });
    testProjectId = project.projectId;
  });

  after(() => {
    // Cleanup
    resetNoDynamo();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear plans before each test (but keep project)
    const plansDir = path.join(stateDir, 'plans');
    if (fs.existsSync(plansDir)) {
      const files = fs.readdirSync(plansDir);
      for (const file of files) {
        fs.unlinkSync(path.join(plansDir, file));
      }
    }
  });

  describe('createPlan', () => {
    it('should create a plan with DRAFT status', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [
          { description: 'Task 1: Setup environment' },
          { description: 'Task 2: Implement feature', priority: 1 },
          { description: 'Task 3: Write tests', dependencies: ['task_1'] },
        ],
      });

      assert.ok(plan.planId, 'Plan should have an ID');
      assert.ok(plan.planId.startsWith('plan_'), 'Plan ID should start with plan_');
      assert.equal(plan.projectId, testProjectId, 'Project ID should match');
      assert.equal(plan.status, 'DRAFT', 'Initial status should be DRAFT');
      assert.equal(plan.tasks.length, 3, 'Should have 3 tasks');
      assert.ok(plan.createdAt, 'Should have createdAt');
      assert.ok(plan.updatedAt, 'Should have updatedAt');
    });

    it('should assign taskIds to each task', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [
          { description: 'Task A' },
          { description: 'Task B' },
        ],
      });

      assert.ok(plan.tasks[0].taskId, 'Task 1 should have taskId');
      assert.ok(plan.tasks[1].taskId, 'Task 2 should have taskId');
      assert.notEqual(plan.tasks[0].taskId, plan.tasks[1].taskId, 'Task IDs should be unique');
    });

    it('should set default priority and dependencies', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [
          { description: 'Task without priority or deps' },
        ],
      });

      assert.equal(plan.tasks[0].priority, 0, 'Default priority should be 0');
      assert.deepEqual(plan.tasks[0].dependencies, [], 'Default dependencies should be empty array');
      assert.equal(plan.tasks[0].status, 'CREATED', 'Default task status should be CREATED');
    });

    it('should link to inspection packet if provided', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        runId: 'run_test_123',
        packetId: 'pkt_test_456',
        tasks: [{ description: 'Task from inspection' }],
      });

      assert.equal(plan.runId, 'run_test_123', 'Should store runId');
      assert.equal(plan.packetId, 'pkt_test_456', 'Should store packetId');
    });
  });

  describe('getPlan', () => {
    it('should retrieve a plan by ID', async () => {
      const created = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Test task' }],
      });

      const retrieved = await dal.getPlan(created.planId);

      assert.ok(retrieved, 'Should retrieve plan');
      assert.equal(retrieved!.planId, created.planId, 'Plan ID should match');
      assert.equal(retrieved!.status, 'DRAFT', 'Status should be DRAFT');
    });

    it('should return null for non-existent plan', async () => {
      const plan = await dal.getPlan('plan_non_existent');
      assert.equal(plan, null, 'Should return null for non-existent plan');
    });
  });

  describe('updatePlan', () => {
    it('should update plan status', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Task' }],
      });

      // Wait briefly to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await dal.updatePlan(plan.planId, {
        status: 'DISPATCHING',
      });

      assert.ok(updated, 'Should return updated plan');
      assert.equal(updated!.status, 'DISPATCHING', 'Status should be updated');
      assert.notEqual(updated!.updatedAt, plan.updatedAt, 'updatedAt should change');
    });

    it('should update plan tasks with runIds', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [
          { description: 'Task 1' },
          { description: 'Task 2' },
        ],
      });

      const tasksWithRuns: PlanTask[] = plan.tasks.map((t, i) => ({
        ...t,
        runId: `run_${i}`,
        status: 'RUNNING' as TaskState,
      }));

      const updated = await dal.updatePlan(plan.planId, {
        tasks: tasksWithRuns,
        status: 'RUNNING',
        executedAt: new Date().toISOString(),
      });

      assert.ok(updated, 'Should return updated plan');
      assert.equal(updated!.tasks[0].runId, 'run_0', 'Task 1 should have runId');
      assert.equal(updated!.tasks[1].runId, 'run_1', 'Task 2 should have runId');
      assert.equal(updated!.status, 'RUNNING', 'Status should be RUNNING');
      assert.ok(updated!.executedAt, 'Should have executedAt');
    });

    it('should update gate result', async () => {
      const plan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Task' }],
      });

      const updated = await dal.updatePlan(plan.planId, {
        status: 'VERIFIED',
        verifyRunId: 'run_verify_123',
        gateResult: {
          passed: true,
          checks: [
            { name: 'lint', passed: true, message: 'No errors' },
            { name: 'test', passed: true, message: 'All tests pass' },
          ],
        },
        verifiedAt: new Date().toISOString(),
      });

      assert.ok(updated, 'Should return updated plan');
      assert.equal(updated!.status, 'VERIFIED', 'Status should be VERIFIED');
      assert.equal(updated!.gateResult!.passed, true, 'Gate should pass');
      assert.equal(updated!.gateResult!.checks.length, 2, 'Should have 2 checks');
      assert.ok(updated!.verifiedAt, 'Should have verifiedAt');
    });

    it('should return null for non-existent plan', async () => {
      const result = await dal.updatePlan('plan_non_existent', { status: 'RUNNING' });
      assert.equal(result, null, 'Should return null');
    });
  });

  describe('listPlans', () => {
    it('should list all plans', async () => {
      await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Plan 1 Task' }],
      });
      await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Plan 2 Task' }],
      });

      const plans = await dal.listPlans();

      assert.equal(plans.length, 2, 'Should have 2 plans');
    });

    it('should filter plans by projectId', async () => {
      // Create another project
      const otherProject = await dal.createProjectIndex({
        orgId: 'test-org',
        projectPath: '/test/other-project',
      });

      await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Main project plan' }],
      });
      await dal.createPlan({
        orgId: 'test-org',
        projectId: otherProject.projectId,
        tasks: [{ description: 'Other project plan' }],
      });

      const mainPlans = await dal.listPlans(testProjectId);
      const otherPlans = await dal.listPlans(otherProject.projectId);

      assert.equal(mainPlans.length, 1, 'Main project should have 1 plan');
      assert.equal(otherPlans.length, 1, 'Other project should have 1 plan');
    });

    it('should sort plans by createdAt descending', async () => {
      const plan1 = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'First plan' }],
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const plan2 = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Second plan' }],
      });

      const plans = await dal.listPlans();

      assert.equal(plans[0].planId, plan2.planId, 'Most recent plan should be first');
      assert.equal(plans[1].planId, plan1.planId, 'Older plan should be second');
    });
  });

  describe('getLatestPlanForProject', () => {
    it('should return the latest plan for a project', async () => {
      await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Old plan' }],
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const latestPlan = await dal.createPlan({
        orgId: 'test-org',
        projectId: testProjectId,
        tasks: [{ description: 'Latest plan' }],
      });

      const retrieved = await dal.getLatestPlanForProject(testProjectId);

      assert.ok(retrieved, 'Should retrieve latest plan');
      assert.equal(retrieved!.planId, latestPlan.planId, 'Should be the most recent plan');
    });

    it('should return null if no plans exist for project', async () => {
      const otherProject = await dal.createProjectIndex({
        orgId: 'test-org',
        projectPath: '/test/no-plans-project',
      });

      const plan = await dal.getLatestPlanForProject(otherProject.projectId);
      assert.equal(plan, null, 'Should return null');
    });
  });
});
