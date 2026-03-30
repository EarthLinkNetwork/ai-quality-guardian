/**
 * Unit tests for Task Tracker DAL operations
 *
 * Tests CRUD operations for TaskTracker, TaskSnapshot, and TaskSummary
 * using the NoDynamo (file-based) implementation.
 *
 * TDD: Red phase — write tests first, then implement.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../../src/web/dal/dal-interface";
import type {
  TaskTracker,
  TaskPlan,
  TrackedTask,
  TaskSnapshot,
  TaskSummary,
  CreateTaskSnapshotInput,
  CreateTaskSummaryInput,
} from "../../../../src/web/dal/task-tracker-types";
import { OptimisticLockError } from "../../../../src/web/dal/task-tracker-types";

describe("Task Tracker DAL - NoDynamo Implementation", () => {
  let dal: IDataAccessLayer;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_abc123";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-tracker-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== TaskTracker CRUD ====================

  describe("getTaskTracker", () => {
    it("returns null when tracker does not exist", async () => {
      const result = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(result, null);
    });

    it("returns tracker after upsert", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const result = await dal.getTaskTracker(PROJECT_ID);
      assert.notEqual(result, null);
      assert.equal(result!.projectId, PROJECT_ID);
      assert.equal(result!.orgId, ORG_ID);
      assert.equal(result!.version, 1);
    });
  });

  describe("upsertTaskTracker", () => {
    it("creates a new tracker", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      const result = await dal.upsertTaskTracker(tracker);

      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.version, 1);
      assert.equal(result.currentPlan, null);
      assert.deepEqual(result.activeTasks, []);
      assert.deepEqual(result.completedTaskIds, []);
    });

    it("overwrites an existing tracker", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const updated: TaskTracker = {
        ...tracker,
        version: 2,
        lastContextSummary: "Updated context",
        updatedAt: new Date().toISOString(),
      };
      const result = await dal.upsertTaskTracker(updated);

      assert.equal(result.version, 2);
      assert.equal(result.lastContextSummary, "Updated context");
    });
  });

  describe("updateTaskTrackerPlan", () => {
    it("updates plan with correct version", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const plan: TaskPlan = {
        planId: "plan_test1",
        title: "Test Plan",
        originalPrompt: "Do something",
        subtasks: [
          {
            subtaskId: "st_1",
            description: "First subtask",
            status: "PENDING",
            order: 0,
            dependencies: [],
          },
        ],
        status: "EXECUTING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await dal.updateTaskTrackerPlan(PROJECT_ID, plan, 1);
      assert.notEqual(result.currentPlan, null);
      assert.equal(result.currentPlan!.planId, "plan_test1");
      assert.equal(result.version, 2);
    });

    it("throws OptimisticLockError on version mismatch", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const plan: TaskPlan = {
        planId: "plan_test1",
        title: "Test Plan",
        originalPrompt: "Do something",
        subtasks: [],
        status: "PLANNING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await assert.rejects(
        () => dal.updateTaskTrackerPlan(PROJECT_ID, plan, 99),
        OptimisticLockError
      );
    });

    it("throws when tracker does not exist", async () => {
      const plan: TaskPlan = {
        planId: "plan_test1",
        title: "Test",
        originalPrompt: "x",
        subtasks: [],
        status: "PLANNING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await assert.rejects(
        () => dal.updateTaskTrackerPlan("nonexistent", plan, 1),
        /not found/
      );
    });
  });

  describe("updateTaskTrackerTasks", () => {
    it("updates active tasks with correct version", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const tasks: TrackedTask[] = [
        {
          taskId: "task_1",
          title: "Test Task",
          status: "RUNNING",
          priority: 50,
          lastUpdate: new Date().toISOString(),
        },
      ];

      const result = await dal.updateTaskTrackerTasks(PROJECT_ID, tasks, 1);
      assert.equal(result.activeTasks.length, 1);
      assert.equal(result.activeTasks[0].taskId, "task_1");
      assert.equal(result.version, 2);
    });

    it("throws OptimisticLockError on version mismatch", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      await assert.rejects(
        () => dal.updateTaskTrackerTasks(PROJECT_ID, [], 99),
        OptimisticLockError
      );
    });
  });

  describe("updateTaskTrackerContext", () => {
    it("updates context summary and recovery hint", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const result = await dal.updateTaskTrackerContext(
        PROJECT_ID,
        "Working on feature X",
        "Next: implement Y",
        1
      );

      assert.equal(result.lastContextSummary, "Working on feature X");
      assert.equal(result.recoveryHint, "Next: implement Y");
      assert.equal(result.version, 2);
    });

    it("allows null recovery hint", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      const result = await dal.updateTaskTrackerContext(
        PROJECT_ID,
        "Context only",
        null,
        1
      );

      assert.equal(result.lastContextSummary, "Context only");
      assert.equal(result.recoveryHint, null);
    });
  });

  describe("deleteTaskTracker", () => {
    it("deletes an existing tracker", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      await dal.upsertTaskTracker(tracker);

      await dal.deleteTaskTracker(PROJECT_ID);

      const result = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(result, null);
    });

    it("does not throw when deleting non-existent tracker", async () => {
      await dal.deleteTaskTracker("nonexistent");
      // Should not throw
    });
  });

  // ==================== TaskSnapshot CRUD ====================

  describe("createTaskSnapshot", () => {
    it("creates a snapshot with generated ID", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      const input: CreateTaskSnapshotInput = {
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "PERIODIC",
        trackerState: tracker,
        contextSummary: "Test context",
        filesModified: ["src/index.ts"],
      };

      const result = await dal.createTaskSnapshot(input);

      assert.ok(result.snapshotId.startsWith("snap_"));
      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.trigger, "PERIODIC");
      assert.equal(result.contextSummary, "Test context");
      assert.deepEqual(result.filesModified, ["src/index.ts"]);
      assert.ok(result.ttl > 0);
    });

    it("stores git state when provided", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      const input: CreateTaskSnapshotInput = {
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "TASK_COMPLETE",
        trackerState: tracker,
        contextSummary: "Completed task",
        filesModified: [],
        gitState: {
          branch: "feature/test",
          commitHash: "abc123",
          uncommittedChanges: 2,
        },
      };

      const result = await dal.createTaskSnapshot(input);
      assert.deepEqual(result.gitState, {
        branch: "feature/test",
        commitHash: "abc123",
        uncommittedChanges: 2,
      });
    });
  });

  describe("getLatestTaskSnapshot", () => {
    it("returns null when no snapshots exist", async () => {
      const result = await dal.getLatestTaskSnapshot(PROJECT_ID);
      assert.equal(result, null);
    });

    it("returns the most recent snapshot", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);

      // Create two snapshots
      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "PERIODIC",
        trackerState: tracker,
        contextSummary: "First snapshot",
        filesModified: [],
      });

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));

      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "TASK_COMPLETE",
        trackerState: tracker,
        contextSummary: "Second snapshot",
        filesModified: [],
      });

      const result = await dal.getLatestTaskSnapshot(PROJECT_ID);
      assert.notEqual(result, null);
      assert.equal(result!.contextSummary, "Second snapshot");
    });
  });

  describe("listTaskSnapshots", () => {
    it("returns empty array when no snapshots exist", async () => {
      const result = await dal.listTaskSnapshots(PROJECT_ID);
      assert.deepEqual(result, []);
    });

    it("returns snapshots for a project sorted by date descending", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);

      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "PERIODIC",
        trackerState: tracker,
        contextSummary: "First",
        filesModified: [],
      });

      await new Promise((r) => setTimeout(r, 10));

      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "TASK_COMPLETE",
        trackerState: tracker,
        contextSummary: "Second",
        filesModified: [],
      });

      const result = await dal.listTaskSnapshots(PROJECT_ID);
      assert.equal(result.length, 2);
      // Most recent first
      assert.equal(result[0].contextSummary, "Second");
      assert.equal(result[1].contextSummary, "First");
    });

    it("respects limit parameter", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);

      for (let i = 0; i < 5; i++) {
        await dal.createTaskSnapshot({
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          trigger: "PERIODIC",
          trackerState: tracker,
          contextSummary: `Snapshot ${i}`,
          filesModified: [],
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      const result = await dal.listTaskSnapshots(PROJECT_ID, 3);
      assert.equal(result.length, 3);
    });

    it("does not return snapshots from other projects", async () => {
      const tracker = createMinimalTracker(ORG_ID, PROJECT_ID);
      const otherTracker = createMinimalTracker(ORG_ID, "proj_other");

      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "PERIODIC",
        trackerState: tracker,
        contextSummary: "My project",
        filesModified: [],
      });

      await dal.createTaskSnapshot({
        projectId: "proj_other",
        orgId: ORG_ID,
        trigger: "PERIODIC",
        trackerState: otherTracker,
        contextSummary: "Other project",
        filesModified: [],
      });

      const result = await dal.listTaskSnapshots(PROJECT_ID);
      assert.equal(result.length, 1);
      assert.equal(result[0].contextSummary, "My project");
    });
  });

  // ==================== TaskSummary CRUD ====================

  describe("createTaskSummary", () => {
    it("creates a task summary", async () => {
      const input: CreateTaskSummaryInput = {
        taskId: "task_abc",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "Add authentication",
        summary: "Implemented JWT-based auth with refresh tokens",
        keyDecisions: ["Used RS256 algorithm", "30-day refresh token expiry"],
        filesChanged: ["src/auth.ts", "src/middleware.ts"],
        testResults: { total: 12, passed: 12, failed: 0 },
        generatedBy: "claude-3-haiku",
      };

      const result = await dal.createTaskSummary(input);

      assert.equal(result.taskId, "task_abc");
      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.title, "Add authentication");
      assert.equal(result.summary, "Implemented JWT-based auth with refresh tokens");
      assert.deepEqual(result.keyDecisions, [
        "Used RS256 algorithm",
        "30-day refresh token expiry",
      ]);
      assert.deepEqual(result.filesChanged, ["src/auth.ts", "src/middleware.ts"]);
      assert.deepEqual(result.testResults, { total: 12, passed: 12, failed: 0 });
      assert.equal(result.generatedBy, "claude-3-haiku");
      assert.ok(result.ttl > 0);
    });
  });

  describe("getTaskSummary", () => {
    it("returns null when summary does not exist", async () => {
      const result = await dal.getTaskSummary(PROJECT_ID, "nonexistent");
      assert.equal(result, null);
    });

    it("returns summary after creation", async () => {
      await dal.createTaskSummary({
        taskId: "task_xyz",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "Fix bug",
        summary: "Fixed null pointer exception",
        keyDecisions: [],
        filesChanged: ["src/utils.ts"],
        generatedBy: "claude-3-haiku",
      });

      const result = await dal.getTaskSummary(PROJECT_ID, "task_xyz");
      assert.notEqual(result, null);
      assert.equal(result!.taskId, "task_xyz");
      assert.equal(result!.title, "Fix bug");
    });
  });

  describe("listTaskSummaries", () => {
    it("returns empty array when no summaries exist", async () => {
      const result = await dal.listTaskSummaries(PROJECT_ID);
      assert.deepEqual(result, []);
    });

    it("returns summaries for a project", async () => {
      await dal.createTaskSummary({
        taskId: "task_1",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "Task 1",
        summary: "Summary 1",
        keyDecisions: [],
        filesChanged: [],
        generatedBy: "claude-3-haiku",
      });

      await dal.createTaskSummary({
        taskId: "task_2",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "Task 2",
        summary: "Summary 2",
        keyDecisions: [],
        filesChanged: [],
        generatedBy: "claude-3-haiku",
      });

      const result = await dal.listTaskSummaries(PROJECT_ID);
      assert.equal(result.length, 2);
    });

    it("does not return summaries from other projects", async () => {
      await dal.createTaskSummary({
        taskId: "task_1",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "My task",
        summary: "My summary",
        keyDecisions: [],
        filesChanged: [],
        generatedBy: "claude-3-haiku",
      });

      await dal.createTaskSummary({
        taskId: "task_2",
        projectId: "proj_other",
        orgId: ORG_ID,
        title: "Other task",
        summary: "Other summary",
        keyDecisions: [],
        filesChanged: [],
        generatedBy: "claude-3-haiku",
      });

      const result = await dal.listTaskSummaries(PROJECT_ID);
      assert.equal(result.length, 1);
      assert.equal(result[0].title, "My task");
    });
  });
});

// ==================== Helpers ====================

function createMinimalTracker(orgId: string, projectId: string): TaskTracker {
  const now = new Date().toISOString();
  return {
    PK: `ORG#${orgId}`,
    SK: `TRACKER#${projectId}`,
    projectId,
    orgId,
    currentPlan: null,
    activeTasks: [],
    completedTaskIds: [],
    lastContextSummary: null,
    lastCheckpointAt: null,
    recoveryHint: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
